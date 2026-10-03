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
