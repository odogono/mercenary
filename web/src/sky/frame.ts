import { cos, sin } from '../math/index.ts';
import type { Vector3 } from '../orientation/index.ts';
import { Camera, type Size } from '../projection/index.ts';
import type { RGB8 } from '../scene/index.ts';
import type { SkyDisc, SkyState } from './index.ts';
import { dot, normalized } from './vector.ts';

const CELESTIAL_RADIUS = 1000;
const DISC_SEGMENTS = 32;
const VERTEX_FIELDS = 5;

export interface SkyPose {
  readonly heading: number;
  readonly mirrored: boolean;
  readonly pitch: number;
  readonly roll: number;
}

export type SkyBatchKind = 'stars' | 'sun' | 'outerMoon' | 'innerMoon';
export type SkyDrawMode = 'points' | 'triangleFan';

/// Interleaved fields are pixel X/Y, disc-local U/V, then opacity.
export interface SkyBatch {
  readonly darkColour?: RGB8;
  readonly kind: SkyBatchKind;
  readonly litColour: RGB8;
  readonly mode: SkyDrawMode;
  readonly phaseCosine: number;
  readonly vertices: Float32Array;
}

export interface SkyFrame {
  readonly batches: readonly SkyBatch[];
  readonly clear: RGB8;
}

const cross = (a: Vector3, b: Vector3): Vector3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});

const scaled = (value: Vector3, amount: number): Vector3 => ({
  x: value.x * amount,
  y: value.y * amount,
  z: value.z * amount
});

const discBasis = (
  centre: Vector3,
  toward: Vector3 | undefined
): readonly [Vector3, Vector3] => {
  let x: Vector3 | undefined;
  if (toward !== undefined) {
    const projected = {
      x: toward.x - centre.x * dot(toward, centre),
      y: toward.y - centre.y * dot(toward, centre),
      z: toward.z - centre.z * dot(toward, centre)
    };
    if (Math.hypot(projected.x, projected.y, projected.z) > 1e-9) {
      x = normalized(projected);
    }
  }
  if (x === undefined) {
    const reference =
      Math.abs(centre.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    x = normalized(cross(reference, centre));
  }
  return [x, normalized(cross(centre, x))];
};

const appendVertex = (
  into: number[],
  x: number,
  y: number,
  u: number,
  v: number,
  alpha: number
): void => {
  into.push(x, y, u, v, alpha);
};

const discBatch = (
  kind: Exclude<SkyBatchKind, 'stars'>,
  disc: SkyDisc,
  sunDirection: Vector3,
  camera: Camera,
  size: Size
): SkyBatch | undefined => {
  const centre = normalized(disc.direction);
  const projectedCentre = camera.projectPoint(
    scaled(centre, CELESTIAL_RADIUS),
    size
  );
  if (projectedCentre === undefined) {
    return undefined;
  }
  const [axisX, axisY] = discBasis(
    centre,
    kind === 'sun' ? undefined : normalized(sunDirection)
  );
  const angularRadius = disc.angularDiameterRadians / 2;
  const centreScale = cos(angularRadius);
  const rimScale = sin(angularRadius);
  const vertices: number[] = [];
  appendVertex(vertices, projectedCentre.x, projectedCentre.y, 0, 0, 1);
  for (let index = 0; index <= DISC_SEGMENTS; index += 1) {
    const angle = (index / DISC_SEGMENTS) * 2 * Math.PI;
    const u = cos(angle);
    const v = sin(angle);
    const direction = normalized({
      x: centre.x * centreScale + (axisX.x * u + axisY.x * v) * rimScale,
      y: centre.y * centreScale + (axisX.y * u + axisY.y * v) * rimScale,
      z: centre.z * centreScale + (axisX.z * u + axisY.z * v) * rimScale
    });
    const point = camera.projectPoint(
      scaled(direction, CELESTIAL_RADIUS),
      size
    );
    if (point === undefined) {
      return undefined;
    }
    appendVertex(vertices, point.x, point.y, u, v, 1);
  }
  return {
    ...(disc.darkColour === undefined ? {} : { darkColour: disc.darkColour }),
    kind,
    litColour: disc.litColour,
    mode: 'triangleFan',
    phaseCosine: disc.phaseCosine,
    vertices: new Float32Array(vertices)
  };
};

const starBatch = (
  state: SkyState,
  camera: Camera,
  size: Size
): SkyBatch | undefined => {
  if (state.starVisibility <= 0) {
    return undefined;
  }
  const vertices: number[] = [];
  for (const star of state.stars) {
    const point = camera.projectPoint(
      scaled(star.direction, CELESTIAL_RADIUS),
      size
    );
    if (point !== undefined) {
      appendVertex(
        vertices,
        point.x + 0.5,
        point.y + 0.5,
        0,
        0,
        star.alpha * state.starVisibility
      );
    }
  }
  if (vertices.length === 0) {
    return undefined;
  }
  return {
    kind: 'stars',
    litColour: state.starColour,
    mode: 'points',
    phaseCosine: 1,
    vertices: new Float32Array(vertices)
  };
};

export const buildSkyFrame = (
  state: SkyState,
  pose: SkyPose,
  size: Size
): SkyFrame => {
  const camera = new Camera({
    heading: pose.heading,
    mirrored: pose.mirrored,
    pitch: pose.pitch,
    position: { x: 0, y: 0, z: 0 },
    roll: pose.roll
  });
  const batches: SkyBatch[] = [];
  const stars = starBatch(state, camera, size);
  if (stars !== undefined) {
    batches.push(stars);
  }
  const bodies = [
    discBatch('sun', state.sun, state.sun.direction, camera, size),
    discBatch('outerMoon', state.moons[1], state.sun.direction, camera, size),
    discBatch('innerMoon', state.moons[0], state.sun.direction, camera, size)
  ];
  for (const body of bodies) {
    if (body !== undefined) {
      batches.push(body);
    }
  }
  return { batches, clear: state.clear };
};

export const SKY_VERTEX_FIELDS = VERTEX_FIELDS;
