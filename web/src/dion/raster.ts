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
  readonly s: number;
}

export const levelCamera = (
  eye: readonly [number, number, number],
  heading: number
): LevelCamera => {
  const angle = (2 * Math.PI * ((heading & 0x3_ff) + 0.5)) / 1024;
  return { c: Math.cos(angle), eye, s: Math.sin(angle) };
};

/// A point relative to the eye, into camera space: `d = −(s·x + c·z)`,
/// `u = c·x − s·z`, `v = −y`.
export const toCamera = (
  camera: LevelCamera,
  x: number,
  y: number,
  z: number
): CameraPoint => ({
  d: -(camera.s * x + camera.c * z),
  u: camera.c * x - camera.s * z,
  v: -y
});

export const project = (point: CameraPoint) =>
  projectShared(point, DION_PROJECTION);
export const screenPolygon = (points: readonly CameraPoint[], cull: boolean) =>
  polygonShared(points, cull, DION_PROJECTION);
export const screenLine = (a: CameraPoint, b: CameraPoint) =>
  lineShared(a, b, DION_PROJECTION);
