import type { Vector3 } from '../orientation/index.ts';
import { Camera } from '../projection/index.ts';

export type Channels = readonly [number, number, number];

export interface FrameLighting {
  readonly ambientGround: Channels;
  readonly ambientSky: Channels;
  readonly sunColour: Channels;
  readonly sunView: Vector3;
  readonly sunWorld: Vector3;
}

/// How the frame's camera is turned: the Pose's heading, pitch and roll. The frame plan's
/// vertices are in this camera's view space (`planErisFrame`), so the sun and the shadow maps
/// must be turned by all three, or a pitched or banked view slides the shadows over the
/// geometry: Free Look on foot (ADR 0059), and the craft's attitude aboard.
export interface ViewOrientation {
  readonly heading: number;
  readonly pitch: number;
  readonly roll?: number;
}

export interface ShadowWindow {
  readonly depthHalfRange: number;
  readonly halfExtent: number;
  readonly resolution: number;
}

export const normalise = (value: Vector3): Vector3 => {
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

export const toViewDirection = (
  world: Vector3,
  view: ViewOrientation
): Vector3 => {
  const camera = new Camera({
    heading: -view.heading,
    pitch: view.pitch,
    position: { x: 0, y: 0, z: 0 },
    roll: view.roll ?? 0
  });
  return camera.viewSpace(toCameraSpace(world));
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
  lighting: FrameLighting,
  view: ViewOrientation,
  eyeWorld: Vector3,
  window: ShadowWindow
): Float32Array => {
  const lzWorld = lighting.sunWorld;
  const up: Vector3 =
    Math.abs(lzWorld.y) > 0.999 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const lxWorld = normalise(cross(up, lzWorld));
  const lyWorld = cross(lzWorld, lxWorld);
  const lx = toViewDirection(lxWorld, view);
  const ly = toViewDirection(lyWorld, view);
  const lz = toViewDirection(lzWorld, view);
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
