import type { Vector3 } from '../orientation/index.ts';

type WorldTriangle = readonly [Vector3, Vector3, Vector3];
type Tangent = { readonly x: number; readonly y: number };

/// Sutherland–Hodgman against one half-space: keep where `side` is not negative.
const clipPolygon = <T extends Tangent>(
  polygon: readonly T[],
  side: (point: T) => number,
  between: (from: T, to: T, t: number) => T
): T[] => {
  const result: T[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const from = polygon[index]!;
    const to = polygon[(index + 1) % polygon.length]!;
    const a = side(from);
    const b = side(to);
    if (a >= 0) {
      result.push(from);
    }
    if (a >= 0 !== b >= 0) {
      result.push(between(from, to, a / (a - b)));
    }
  }
  return result;
};

const lerp3 = (from: Vector3, to: Vector3, t: number): Vector3 => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
  z: from.z + (to.z - from.z) * t
});

const lerp2 = (from: Tangent, to: Tangent, t: number): Tangent => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t
});

/// How far the horizon fill's square runs either side of the view's centre, in tangents of the
/// view angle. Well past any frustum a canvas gives; the fill is painted with the depth test
/// off, so only its outline matters.
const HORIZON_REACH = 16;

/// The ground to the horizon, `$0599D6`'s fill (#573): a square across the view at the sky's
/// depth, cut to the half below the line where view directions turn horizontal, and fanned.
///
/// Aboard, the ST's flight branch (`$059822`) draws the stars and the sky pass, then
/// `$0599D6`, which fills the viewport below a horizon line in colour 15, the Body's base
/// colour `$7C88`. The line comes from the roll, the pitch and the projection scale alone, so
/// the fill reaches the horizon at any height. Hatari frames over LACHESIS at Y 25.6, 26.5
/// and 27.7 million show the same 30 rows of `$411` below a starfield. The base plane ends at
/// the far plane, so from much above it only this fill is there. Nearer the surface the base
/// plane covers it in the same colour.
export const horizonFillVertices = (
  up: Vector3,
  depth: number,
  colour: readonly [number, number, number]
): number[] => {
  const reach = depth * HORIZON_REACH;
  const square: Vector3[] = [
    { x: -reach, y: -reach, z: depth },
    { x: reach, y: -reach, z: depth },
    { x: reach, y: reach, z: depth },
    { x: -reach, y: reach, z: depth }
  ];
  const below = clipPolygon(
    square,
    point => -(point.x * up.x + point.y * up.y + point.z * up.z),
    lerp3
  );
  const values: number[] = [];
  for (let index = 1; index + 1 < below.length; index += 1) {
    for (const point of [below[0]!, below[index]!, below[index + 1]!]) {
      values.push(point.x, point.y, point.z, ...colour, 0, 0, 1, -depth);
    }
  }
  return values;
};

/// One island fill in the horizon layer (#578): its triangles in view space, cut at the near
/// plane, projected, cut to the horizon fill's square and fanned at the sky's depth.
///
/// `$056516` draws every island of the Body each frame, in record order, after the horizon
/// fill `$0599D6`. Each is its coastline projected through `$05668A` and filled flat by
/// `$04F8F2`, so nothing but the view limits how far off one is drawn. The #573 frames show
/// DION's islands from every captured height, Y 1.4 to 31 million. The port's island fills
/// end at the far plane, as the base plane does (#221), so this second copy paints the whole
/// island flat with the depth test off. Inside the far plane the base plane and the island
/// fill cover it again in the same pixels.
export const horizonIslandVertices = (
  triangles: readonly WorldTriangle[],
  toView: (world: Vector3) => Vector3,
  nearPlane: number,
  depth: number,
  colour: readonly [number, number, number]
): number[] => {
  const values: number[] = [];
  for (const triangle of triangles) {
    const front = clipPolygon(
      triangle.map(toView),
      point => point.z - nearPlane,
      lerp3
    );
    let flat: Tangent[] = front.map(point => ({
      x: point.x / point.z,
      y: point.y / point.z
    }));
    for (const side of [
      (point: Tangent) => HORIZON_REACH - point.x,
      (point: Tangent) => HORIZON_REACH + point.x,
      (point: Tangent) => HORIZON_REACH - point.y,
      (point: Tangent) => HORIZON_REACH + point.y
    ]) {
      flat = clipPolygon(flat, side, lerp2);
    }
    for (let index = 1; index + 1 < flat.length; index += 1) {
      for (const point of [flat[0]!, flat[index]!, flat[index + 1]!]) {
        values.push(
          point.x * depth,
          point.y * depth,
          depth,
          ...colour,
          0,
          0,
          1,
          -depth
        );
      }
    }
  }
  return values;
};
