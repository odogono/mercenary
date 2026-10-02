import type { Vector3 } from '../orientation/index.ts';

/// A one-reference-pixel stroke, expanded in the projection plane and kept in
/// camera space. Its width scales with the 136-row view under both DPR and
/// resolution scaling, as the shared Frame Description's line rendition does.
export const roadStroke = (
  start: Vector3,
  end: Vector3,
  near: number,
  tangent: number
): readonly [Vector3, Vector3, Vector3, Vector3] | null => {
  if (start.z < near && end.z < near) {
    return null;
  }
  const front = (a: Vector3, b: Vector3): Vector3 => {
    if (a.z >= near) {
      return a;
    }
    const t = (near - a.z) / (b.z - a.z);
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), z: near };
  };
  const a = front(start, end);
  const b = front(end, start);
  const dx = b.x / b.z - a.x / a.z;
  const dy = b.y / b.z - a.y / a.z;
  const length = Math.hypot(dx, dy);
  if (length < 1e-12) {
    return null;
  }
  const ox = ((dy / length) * tangent) / 136;
  const oy = ((-dx / length) * tangent) / 136;
  const offset = (v: Vector3, sign: number): Vector3 => ({
    x: v.x + sign * ox * v.z,
    y: v.y + sign * oy * v.z,
    z: v.z
  });
  return [offset(a, 1), offset(b, 1), offset(b, -1), offset(a, -1)];
};
