import type { Vector3 } from '../orientation/index.ts';
import { Camera } from '../projection/index.ts';
import type { ErisPresentationDocument } from './documents.ts';

export type Channels = readonly [number, number, number];

export interface ErisLighting {
  readonly ambientGround: Channels;
  readonly ambientSky: Channels;
  readonly sunColour: Channels;
  readonly sunView: Vector3;
  readonly sunWorld: Vector3;
}

export interface ShadowWindow {
  readonly depthHalfRange: number;
  readonly halfExtent: number;
  readonly resolution: number;
}

const channels = (colour: string): Channels => [
  Number.parseInt(colour.slice(1, 3), 16) / 255,
  Number.parseInt(colour.slice(3, 5), 16) / 255,
  Number.parseInt(colour.slice(5, 7), 16) / 255
];

const normalise = (value: Vector3): Vector3 => {
  const length = Math.hypot(value.x, value.y, value.z);
  return {
    x: value.x / length,
    y: value.y / length,
    z: value.z / length
  };
};

const toCameraSpace = (world: Vector3): Vector3 => ({
  x: world.x,
  y: world.y,
  z: -world.z
});

const toViewDirection = (world: Vector3, heading: number): Vector3 => {
  const camera = new Camera({
    heading: -heading,
    pitch: 0,
    position: { x: 0, y: 0, z: 0 }
  });
  return camera.viewSpace(toCameraSpace(world));
};

export const erisLighting = (
  doc: ErisPresentationDocument,
  heading: number
): ErisLighting => {
  const sunWorld = normalise(doc.lighting.sunDirection);
  return {
    ambientGround: channels(doc.lighting.ambientGround),
    ambientSky: channels(doc.lighting.ambientSky),
    sunColour: channels(doc.lighting.sunColour),
    sunView: toViewDirection(sunWorld, heading),
    sunWorld
  };
};

const cross = (a: Vector3, b: Vector3): Vector3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});

const dot = (a: Vector3, b: Vector3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;

/// A world-fixed, texel-snapped orthographic light projection expressed over the
/// camera-relative view-space vertices in an Eris frame plan.
export const lightMatrix = (
  lighting: ErisLighting,
  heading: number,
  eyeWorld: Vector3,
  window: ShadowWindow
): Float32Array => {
  const lzWorld = lighting.sunWorld;
  const up: Vector3 =
    Math.abs(lzWorld.y) > 0.999 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const lxWorld = normalise(cross(up, lzWorld));
  const lyWorld = cross(lzWorld, lxWorld);
  const lx = toViewDirection(lxWorld, heading);
  const ly = toViewDirection(lyWorld, heading);
  const lz = toViewDirection(lzWorld, heading);
  const radius = window.halfExtent;
  const depth = window.depthHalfRange;
  const texel = (2 * radius) / window.resolution;
  const snappedRemainder = (axis: Vector3): number => {
    const along = dot(eyeWorld, axis);
    return along - Math.floor(along / texel) * texel;
  };
  const sx = snappedRemainder(lxWorld);
  const sy = snappedRemainder(lyWorld);

  // Column-major for WebGL's uniformMatrix4fv.
  return new Float32Array([
    lx.x / radius,
    ly.x / radius,
    -lz.x / depth,
    0,
    lx.y / radius,
    ly.y / radius,
    -lz.y / depth,
    0,
    lx.z / radius,
    ly.z / radius,
    -lz.z / depth,
    0,
    sx / radius,
    sy / radius,
    0,
    1
  ]);
};
