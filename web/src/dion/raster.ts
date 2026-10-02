import type { CameraPoint } from '../rendering/description.ts';
import {
  screenLine as lineShared,
  screenPolygon as polygonShared,
  project as projectShared
} from '../rendering/raster.ts';
import { DION_PROJECTION } from './projection.ts';

export type { CameraPoint } from '../rendering/description.ts';
export { integerArea } from '../rendering/raster.ts';

/// The level camera at a heading in 1024ths of a turn, with the half-step yaw of the
/// sine table (`$64000 + 4·a` is `sin(2π(a + ½)/1024)`).
export interface LevelCamera {
  readonly c: number;
  readonly eye: readonly [number, number, number];
  readonly matrix?: readonly (readonly [number, number, number])[];
  readonly s: number;
}

export const levelCamera = (
  eye: readonly [number, number, number],
  heading: number
): LevelCamera => {
  const angle = (2 * Math.PI * ((heading & 0x3_ff) + 0.5)) / 1024;
  return { c: Math.cos(angle), eye, s: Math.sin(angle) };
};

/// R7's own-title $45710 view matrix. The retained D1 path remains available for
/// its accepted level-camera comparisons; flight supplies copied presentation angles.
const sine = (a: number) => Math.sin((((a & 1023) + 0.5) * 2 * Math.PI) / 1024);
const cosine = (a: number) => sine(a + 256);

export const generalCamera = (
  eye: readonly [number, number, number],
  roll: number,
  pitch: number,
  yaw: number
): LevelCamera => {
  const [sr, cr, sp, cp, sy, cy] = [
    sine(roll),
    cosine(roll),
    sine(pitch),
    cosine(pitch),
    sine(yaw),
    cosine(yaw)
  ];
  return {
    ...levelCamera(eye, yaw),
    matrix: [
      [cp * sy, sp, cp * cy],
      [sr * sp * sy + cr * cy, -sr * cp, sr * sp * cy - cr * sy],
      [sr * cy - cr * sp * sy, cr * cp, -(cr * sp * cy + sr * sy)]
    ]
  };
};

/// A point relative to the eye, into camera space: `d = −(s·x + c·z)`,
/// `u = c·x − s·z`, `v = −y`.
export const toCamera = (
  camera: LevelCamera,
  x: number,
  y: number,
  z: number
): CameraPoint => {
  if (camera.matrix) {
    const dot = (r: readonly number[]) => r[0]! * x + r[1]! * y + r[2]! * z;
    return {
      d: dot(camera.matrix[0]!),
      u: dot(camera.matrix[1]!),
      v: dot(camera.matrix[2]!)
    };
  }
  return {
    d: -(camera.s * x + camera.c * z),
    u: camera.c * x - camera.s * z,
    v: -y
  };
};

export const project = (point: CameraPoint) =>
  projectShared(point, DION_PROJECTION);
export const screenPolygon = (points: readonly CameraPoint[], cull: boolean) =>
  polygonShared(points, cull, DION_PROJECTION);
export const screenLine = (a: CameraPoint, b: CameraPoint) =>
  lineShared(a, b, DION_PROJECTION);
