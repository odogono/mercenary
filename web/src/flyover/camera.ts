import { atan, cos, sin, tan } from '../math/index.ts';
import type { Vector3 } from '../orientation/index.ts';
import type { FlyoverCameraPresentation } from './documents.ts';
import type { FlyoverBody, FlyoverSystem } from './system.ts';

export interface FlyoverPose {
  readonly heading: number;
  readonly pitch: number;
  readonly position: Vector3;
  readonly roll: 0;
}

export interface FlyoverCameraState {
  readonly pose: FlyoverPose;
  readonly speedNotch: number;
}

export interface FlyoverControls {
  readonly pitch: -1 | 0 | 1;
  readonly yaw: -1 | 0 | 1;
}

export interface FlyoverViewport {
  readonly height: number;
  readonly width: number;
}

export type FlyoverSpeedBounds = FlyoverSystem['cameraSpeed'];

const TAU = 2 * Math.PI;
const ANGULAR_SPEED = Math.PI / 2;

const wrapped = (radians: number): number => ((radians % TAU) + TAU) % TAU;

export const speedForNotch = (
  bounds: FlyoverSpeedBounds,
  notch: number
): number => {
  if (notch === 0) {
    return 0;
  }
  if (!Number.isInteger(notch) || notch < 1 || notch > 10) {
    throw new Error('a Flyover speed notch should be between 0 and 10');
  }
  return (
    bounds.minimumUnitsPerSecond *
    (bounds.maximumUnitsPerSecond / bounds.minimumUnitsPerSecond) **
      ((notch - 1) / 9)
  );
};

export const stepSpeedNotch = (notch: number, step: -1 | 1): number =>
  Math.max(0, Math.min(10, notch + step));

export const flyoverSpeedKey = (
  key: string,
  currentNotch: number
): number | undefined => {
  if (/^[1-9]$/.test(key)) {
    return Number(key);
  }
  if (key === '0') {
    return 10;
  }
  if (key === '+') {
    return stepSpeedNotch(currentNotch, 1);
  }
  if (key === '-') {
    return stepSpeedNotch(currentNotch, -1);
  }
  return key === ' ' ? 0 : undefined;
};

export const cappedFrameSeconds = (seconds: number): number =>
  Math.max(0, Math.min(0.1, Number.isFinite(seconds) ? seconds : 0));

export const advanceFlyoverCamera = (
  state: FlyoverCameraState,
  controls: FlyoverControls,
  seconds: number,
  speedBounds: FlyoverSpeedBounds
): FlyoverCameraState => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error('a Flyover Camera step should be a nonnegative duration');
  }
  const heading = wrapped(
    state.pose.heading + controls.yaw * ANGULAR_SPEED * seconds
  );
  const pitch = wrapped(
    state.pose.pitch + controls.pitch * ANGULAR_SPEED * seconds
  );
  const distance = speedForNotch(speedBounds, state.speedNotch) * seconds;
  const horizontal = cos(pitch);
  const forward = {
    x: -sin(heading) * horizontal,
    y: sin(pitch),
    z: -cos(heading) * horizontal
  };
  return {
    pose: {
      heading,
      pitch,
      position: {
        x: state.pose.position.x + forward.x * distance,
        y: state.pose.position.y + forward.y * distance,
        z: state.pose.position.z + forward.z * distance
      },
      roll: 0
    },
    speedNotch: state.speedNotch
  };
};

const bodyBounds = (bodies: readonly FlyoverBody[]) => {
  if (bodies.length === 0) {
    throw new Error('a Flyover System should contain at least one Body');
  }
  const low = { x: Infinity, y: Infinity, z: Infinity };
  const high = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const body of bodies) {
    const radius = body.displayRadiusUnits;
    for (const axis of ['x', 'y', 'z'] as const) {
      low[axis] = Math.min(low[axis], body.position[axis] - radius);
      high[axis] = Math.max(high[axis], body.position[axis] + radius);
    }
  }
  const centre = {
    x: (low.x + high.x) / 2,
    y: (low.y + high.y) / 2,
    z: (low.z + high.z) / 2
  };
  const radius = Math.max(
    ...bodies.map(
      body =>
        Math.hypot(
          body.position.x - centre.x,
          body.position.y - centre.y,
          body.position.z - centre.z
        ) + body.displayRadiusUnits
    )
  );
  return { centre, radius };
};

export const overviewPose = (
  bodies: readonly FlyoverBody[],
  camera: FlyoverCameraPresentation,
  viewport: FlyoverViewport
): FlyoverPose => {
  if (!(viewport.height > 0 && viewport.width > 0)) {
    throw new Error('a Flyover viewport should have positive dimensions');
  }
  const { centre, radius } = bodyBounds(bodies);
  const verticalHalf = (camera.verticalFieldOfViewDegrees * Math.PI) / 360;
  const horizontalHalf = atan(
    tan(verticalHalf) * (viewport.width / viewport.height)
  );
  const limitingHalf = Math.min(verticalHalf, horizontalHalf);
  const coveredHalf = atan(camera.framingCoverage * tan(limitingHalf));
  const distance = radius / sin(coveredHalf);
  return {
    heading: 0,
    pitch: 0,
    position: { x: centre.x, y: centre.y, z: centre.z + distance },
    roll: 0
  };
};

export const bodyEntryPose = (body: FlyoverBody): FlyoverPose => ({
  heading: 0,
  pitch: 0,
  position: {
    x: body.position.x,
    y: body.position.y,
    z: body.position.z + 3 * body.displayRadiusUnits
  },
  roll: 0
});

export const resetFlyoverCamera = (
  bodies: readonly FlyoverBody[],
  camera: FlyoverCameraPresentation,
  viewport: FlyoverViewport
): FlyoverCameraState => ({
  pose: overviewPose(bodies, camera, viewport),
  speedNotch: 0
});

export type BodyQuery =
  | { readonly body: FlyoverBody }
  | { readonly notice: string }
  | { readonly body?: never; readonly notice?: never };

export const parseBodyQuery = (
  search: string,
  bodies: readonly FlyoverBody[]
): BodyQuery => {
  const values = new URLSearchParams(search).getAll('body');
  if (values.length === 0) {
    return {};
  }
  if (values.length !== 1) {
    return { notice: 'The body query must name exactly one Body.' };
  }
  const id = values[0]!;
  if (id.length === 0) {
    return { notice: 'The body query must name one non-empty Body ID.' };
  }
  const body = bodies.find(candidate => candidate.id === id);
  return body === undefined ? { notice: `Unknown Body ${id}.` } : { body };
};

export interface NearestFlyoverBody {
  readonly body: FlyoverBody;
  readonly normalizedSignedSurfaceDistance: number;
  readonly outwardDirection: Vector3;
  readonly outwardDirections: Readonly<Record<string, Vector3>>;
}

const positiveZ = { x: 0, y: 0, z: 1 } as const;

export const nearestFlyoverBody = (
  position: Vector3,
  bodies: readonly FlyoverBody[],
  previousDirections: Readonly<Record<string, Vector3>> = {}
): NearestFlyoverBody => {
  if (bodies.length === 0) {
    throw new Error('a Flyover System should contain at least one Body');
  }
  const outwardDirections: Record<string, Vector3> = {
    ...previousDirections
  };
  let nearest: NearestFlyoverBody | undefined;
  for (const body of bodies) {
    const relative = {
      x: position.x - body.position.x,
      y: position.y - body.position.y,
      z: position.z - body.position.z
    };
    const distance = Math.hypot(relative.x, relative.y, relative.z);
    const outwardDirection =
      distance === 0
        ? (previousDirections[body.id] ?? positiveZ)
        : {
            x: relative.x / distance,
            y: relative.y / distance,
            z: relative.z / distance
          };
    outwardDirections[body.id] = outwardDirection;
    const normalizedSignedSurfaceDistance =
      (distance - body.displayRadiusUnits) / body.displayRadiusUnits;
    if (
      nearest === undefined ||
      normalizedSignedSurfaceDistance < nearest.normalizedSignedSurfaceDistance
    ) {
      nearest = {
        body,
        normalizedSignedSurfaceDistance,
        outwardDirection,
        outwardDirections
      };
    }
  }
  return { ...nearest!, outwardDirections };
};
