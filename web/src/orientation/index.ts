import { cos, sin, toFloat32 } from '../math/index.ts';

/// Model-local orientation for the Reference Build's rotatable object slots.
///
/// Slots below `$10` carry three orientation bytes and the original applies three plane
/// rotations in sequence — about Z, then X, then Y — to the model's local vertices *before*
/// they are placed in the world. Slots at or above `$10` are emitted without model-local
/// rotation.
///
/// Only one slot carries a non-zero orientation in the initial world state, so this changes
/// little on a fresh load; it matters once the simulation starts moving craft around.

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Orientation {
  readonly x: number;
  readonly y: number;
  /// Rotation about the Z axis, in bytes where 256 is a full turn.
  readonly z: number;
}

export const IDENTITY: Orientation = { x: 0, y: 0, z: 0 };

export const isIdentity = (o: Orientation): boolean =>
  o.z % 256 === 0 && o.x % 256 === 0 && o.y % 256 === 0;

/// Build from the payload's three orientation bytes, in the order the dataset records them:
/// `$800A`, `$801A`, `$802A` — rotations about Z, X and Y.
export const fromBytes = (
  bytes: readonly number[] | undefined
): Orientation | undefined => {
  if (bytes === undefined || bytes.length !== 3) {
    return undefined;
  }
  return { x: bytes[1]!, y: bytes[2]!, z: bytes[0]! };
};

const radians = (byte: number): number => ((byte & 0xff) / 256) * 2 * Math.PI;

/// Rotate within one coordinate plane, leaving the third axis untouched.
///
/// Held as a triple of doubles rather than the binary32 the vertices are stored in, because the
/// kit widens to `Double` for the arithmetic and narrows once at the end. Rotating in binary32
/// throughout would round three times instead of once.
const rotate = (
  point: readonly [number, number, number],
  angle: number,
  first: number,
  second: number
): [number, number, number] => {
  if (angle === 0) {
    return [...point];
  }
  const sine = sin(angle);
  const cosine = cos(angle);
  const result: [number, number, number] = [...point];
  result[first] = point[first]! * cosine - point[second]! * sine;
  result[second] = point[first]! * sine + point[second]! * cosine;
  return result;
};

/// Apply the three plane rotations in the original's order.
export const apply = (o: Orientation, vertex: Vector3): Vector3 => {
  let point: [number, number, number] = [vertex.x, vertex.y, vertex.z];
  point = rotate(point, radians(o.z), 0, 1);
  point = rotate(point, radians(o.x), 1, 2);
  point = rotate(point, radians(o.y), 2, 0);
  // Narrow where the kit narrows: the vertices are `SIMD3<Float>`.
  return {
    x: toFloat32(point[0]),
    y: toFloat32(point[1]),
    z: toFloat32(point[2])
  };
};
