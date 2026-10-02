import {
  FLOOR_LABEL_CHARACTERS,
  type Mesh,
  type Primitive
} from '../catalogue/data.ts';
import { triangulate } from '../catalogue/geometry.ts';
import {
  horizonFillVertices,
  horizonIslandVertices
} from '../coast/horizon.ts';
import { islandFillTriangles } from '../coast/islands.ts';
import { roadEdges } from '../coast/roads.ts';
import { tan } from '../math/index.ts';
import type { Vector3 } from '../orientation/index.ts';
import { Camera } from '../projection/index.ts';
import { roadStroke } from '../rendering/roadStroke.ts';
import type { ErisPresentationDocument } from './documents.ts';
import { classifyPosition } from './islands.ts';
import type { BoundStructureSnapshot } from './save.ts';
import {
  regionIsEnclosed,
  structureMeshes,
  type CarriedSlot,
  type FloorLabelGlyphs
} from './selection.ts';
import type { SkyBody, SkyComet, SkyPass } from './sky.ts';
import { starTangent, type StarPixel } from './stars.ts';
import {
  insideCentralCellHalf,
  islandOriginNear,
  withinDrawBound,
  type ErisPlacement,
  type ErisSurface,
  type Pose
} from './world.ts';

export { FLOATS_PER_VERTEX } from '../rendering/triangles.ts';

/// One frame of Eris in Filled Presentation, planned without a graphics context.
///
/// Vertices are camera-relative view-space positions with a flat colour and their face's
/// plane, ten floats each (`FLOATS_PER_VERTEX`), so
/// the GPU never sees a raw world coordinate: Eris positions run to nine million units and
/// would lose their low bits in binary32. The perspective divide is the renderer's; this plan
/// says only what the frustum is.
/// view xyz, colour rgb, then the face's view-space plane `n·p + d = 0` as nx ny nz d. The
/// renderer takes each fragment's depth from that plane rather than from interpolated
/// corners, so faces that share a plane carry bit-identical planes (`modelPlane`) and tie
/// exactly, and the later one in draw order wins, as a painter's stream would leave it (#545).
/// A plane of all zeros is none, and the renderer falls back to the interpolated depth.

export interface ErisFramePlan {
  readonly clear: readonly [number, number, number];
  /// Every structure and object placement the plan emitted, once per emission, in draw order.
  /// Ground records are not listed. An id appearing twice is an object drawn twice.
  readonly drawnPlacements: readonly string[];
  /// Whether the eye is in an Enclosed Region, whose frame draws none of the outdoor world.
  readonly enclosed: boolean;
  readonly farPlane: number;
  /// Triangles of the Body's base plane, which lead the vertex list.
  readonly fillTriangleCount: number;
  /// Triangles of the recovered per-cell ground records (pads, aprons, roads), which follow
  /// the Body's surface and precede every structure and object. Structure base planes share y = 0 with
  /// these, and Damocles's fill order for that tie is unrecovered; the renderer draws the
  /// ground records a hair behind so a building's pad lies over the cell's apron, as a
  /// painter's ground stream drawn before its structures would leave it.
  readonly groundTriangleCount: number;
  /// Every island fill, flat, in record order and in the same vertices, painted over the ground
  /// to the horizon (#578). Past the far plane they are all there is of the islands.
  readonly horizonIslandVertices: Float32Array;
  /// The ground to the horizon, in the same ten-float vertices as `vertices`: one polygon
  /// below the horizon line in the base plane's colour, painted after the sky Bodies and
  /// before everything else (#573). Empty where there is no base plane.
  readonly horizonVertices: Float32Array;
  /// Triangles of the Damocles Island fills, which follow the base plane and precede the
  /// ground records. They are exactly coplanar with the base plane — the same surface painted
  /// a second colour, which is what land and sea are — so the renderer paints them over it in
  /// this order rather than asking the depth buffer to break a tie it cannot.
  readonly islandTriangleCount: number;
  readonly nearPlane: number;
  readonly roadEdges: readonly number[];
  /// Unlit one-reference-pixel strokes, painted after the surface and before
  /// ground records, structures and objects. Kept out of the shadow casters.
  readonly roadVertices: Float32Array;
  /// Faces the triangulator refused, drawn as nothing and counted.
  readonly skippedFaces: number;
  /// The sky Bodies (#530) and the comet (#538), in draw order, whether or not any of each is
  /// drawn.
  readonly skyBodies: readonly SkyBodyPlacement[];
  /// The stars (#578), then the sky Bodies' discs and the comet, in the same ten-float vertices
  /// as `vertices` and in draw order. They are painted over the sky fill before anything else,
  /// and everything else covers them.
  readonly skyVertices: Float32Array;
  /// How many star pixels open `skyVertices`, each one ST pixel square.
  readonly starCount: number;
  readonly triangleCount: number;
  readonly verticalFieldOfViewDegrees: number;
  readonly vertices: Float32Array;
}

/// Where a sky Body's disc lies in the view, as tangents: `x` right and `y` up from the view's
/// centre, and `radius` the disc's `size / depth` pixels over the projection scale. A Body at
/// `(x, y)` is where #528's closed form puts it at `160 + scale·x`, `68 − scale·y`. The comet's
/// is its head's, and all zero where the head is behind the eye.
export interface SkyBodyPlacement {
  /// Whether any of the disc is drawn: in front of the eye, at least one row wide, and above
  /// the horizon row somewhere. For the comet, whether any of its tail or head is.
  readonly drawn: boolean;
  readonly id: string;
  readonly radius: number;
  readonly x: number;
  readonly y: number;
}

const channels = (colour: string): readonly [number, number, number] => [
  Number.parseInt(colour.slice(1, 3), 16) / 255,
  Number.parseInt(colour.slice(3, 5), 16) / 255,
  Number.parseInt(colour.slice(5, 7), 16) / 255
];

interface Triangles {
  /// Vertex indices, three per triangle, with double-sided faces already reversed and
  /// appended.
  readonly colours: readonly (readonly [number, number, number])[];
  /// The source face's index in the mesh, one per triangle.
  readonly faces: readonly number[];
  readonly indices: readonly number[];
  readonly skipped: number;
}

/// Triangulate a Damocles Model once. The same eight models recur across Eris's placements,
/// so the ear clipping is keyed by mesh and the frame reuses it. The corners are shared by both
/// halves of the palette; the colours are kept per half.
const triangulated = {
  day: new WeakMap<Mesh, Triangles>(),
  night: new WeakMap<Mesh, Triangles>()
};
const faceCorners = new WeakMap<object, WeakMap<object, number[] | null>>();

const appendTriangles = (
  indices: number[],
  colours: (readonly [number, number, number])[],
  faces: number[],
  order: readonly number[],
  colour: readonly [number, number, number],
  face: number
): void => {
  for (let i = 0; i < order.length; i += 3) {
    indices.push(order[i]!, order[i + 1]!, order[i + 2]!);
    colours.push(colour);
    faces.push(face);
  }
};

/// A primitive's colour in the half of the palette the terminator binds (#497).
const litColour = (primitive: Primitive, daylight: boolean): string =>
  daylight ? (primitive.dayColour ?? primitive.colour) : primitive.colour;

const trianglesOf = (mesh: Mesh, daylight: boolean): Triangles => {
  const halves = daylight ? triangulated.day : triangulated.night;
  const cached = halves.get(mesh);
  if (cached !== undefined) {
    return cached;
  }
  const indices: number[] = [];
  const colours: (readonly [number, number, number])[] = [];
  const faces: number[] = [];
  let skipped = 0;
  let byFace = faceCorners.get(mesh.vertices);
  if (byFace === undefined) {
    byFace = new WeakMap();
    faceCorners.set(mesh.vertices, byFace);
  }
  for (const [faceIndex, face] of mesh.faces.entries()) {
    let corners = byFace.get(face);
    if (corners === undefined) {
      try {
        corners = triangulate(mesh.vertices, face.vertices);
      } catch {
        corners = null;
      }
      byFace.set(face, corners);
    }
    if (corners === null) {
      skipped += 1;
      continue;
    }
    const colour = channels(litColour(face, daylight));
    appendTriangles(indices, colours, faces, corners, colour, faceIndex);
    if (face.doubleSided === true) {
      const reversed: number[] = [];
      for (let i = 0; i < corners.length; i += 3) {
        reversed.push(corners[i + 2]!, corners[i + 1]!, corners[i]!);
      }
      appendTriangles(indices, colours, faces, reversed, colour, faceIndex);
    }
  }
  const result = { colours, faces, indices, skipped };
  halves.set(mesh, result);
  return result;
};

/// Eris in the Camera's hands. Eris has north at +z and east at +x, left-handed from above
/// with +y up; the Camera faces -z at heading zero with +x on its right and turns toward -x
/// as its heading rises. Mirroring z and negating the bearing maps one onto the other, so
/// north is straight ahead at a zero bearing and east is on the right (#204).
const toCameraSpace = (world: Vector3): Vector3 => ({
  x: world.x,
  y: world.y,
  z: -world.z
});

/// A model vertex in Eris: the document's Z convention, the placement's bearing about +Y
/// (clockwise from north seen from above), then the placement's position.
const placed = (
  vertex: readonly [number, number, number],
  placement: ErisPlacement,
  negateZ: boolean
): Vector3 => {
  const x = vertex[0];
  const y = vertex[1];
  const z = negateZ ? -vertex[2] : vertex[2];
  const sin = Math.sin(placement.heading);
  const cos = Math.cos(placement.heading);
  return {
    x: placement.position.x + x * cos + z * sin,
    y: placement.position.y + y,
    z: placement.position.z - x * sin + z * cos
  };
};

/// A face's plane `n·p + d = 0` with a unit normal: nx, ny, nz, d.
export type FacePlane = readonly [number, number, number, number];

/// No plane: the renderer uses the interpolated depth for a face it cannot place.
const NO_PLANE: FacePlane = [0, 0, 0, 0];

const greatestDivisor = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x;
};

/// A polygon's plane in its model's frame, the same bits for every face in that plane (#545).
///
/// The normal is Newell's, taken about the first corner so a coordinate the corners share
/// contributes exact zeros. Damocles model coordinates are integers, and then the normal is
/// an integer vector: divided by its greatest common divisor and given a canonical sign, it and
/// the offset `-n·v` are exact and identical whichever face of the plane they came from, and
/// only then made unit. Corners off the integers (a Floor Label's scaled glyph, a stroke quad)
/// take the unit normal first; an axis-aligned plane still comes out exact, which is every
/// wall text's and every stroke's.
export const modelPlane = (
  vertices: readonly (readonly [number, number, number])[],
  corners: readonly number[]
): FacePlane | null => {
  const origin = vertices[corners[0]!]!;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let integral = true;
  for (let index = 0; index < corners.length; index += 1) {
    const a = vertices[corners[index]!]!;
    const b = vertices[corners[(index + 1) % corners.length]!]!;
    integral &&= a.every(Number.isInteger);
    const [ax, ay, az] = [a[0] - origin[0], a[1] - origin[1], a[2] - origin[2]];
    const [bx, by, bz] = [b[0] - origin[0], b[1] - origin[1], b[2] - origin[2]];
    nx += (ay - by) * (az + bz);
    ny += (az - bz) * (ax + bx);
    nz += (ax - bx) * (ay + by);
  }
  if (integral) {
    const divisor = greatestDivisor(greatestDivisor(nx, ny), nz);
    if (divisor === 0) {
      return null;
    }
    [nx, ny, nz] = [nx / divisor, ny / divisor, nz / divisor];
  }
  const sign =
    nx > 0 || (nx === 0 && (ny > 0 || (ny === 0 && nz > 0))) ? 1 : -1;
  [nx, ny, nz] = [sign * nx, sign * ny, sign * nz];
  const length = Math.hypot(nx, ny, nz);
  if (length === 0 || !Number.isFinite(length)) {
    return null;
  }
  let d: number;
  if (integral) {
    d = -(nx * origin[0] + ny * origin[1] + nz * origin[2]) / length;
    [nx, ny, nz] = [nx / length, ny / length, nz / length];
  } else {
    [nx, ny, nz] = [nx / length, ny / length, nz / length];
    d = -(nx * origin[0] + ny * origin[1] + nz * origin[2]);
  }
  // Adding zero turns a negative zero positive, so a sign choice never splits a plane's bits.
  return [nx + 0, ny + 0, nz + 0, d + 0];
};

const modelPlanes = new WeakMap<object, WeakMap<object, FacePlane | null>>();

/// A mesh face's model plane, cached per vertex list and face as the triangulation is.
const facePlaneOf = (mesh: Mesh, face: Primitive): FacePlane | null => {
  let byFace = modelPlanes.get(mesh.vertices);
  if (byFace === undefined) {
    byFace = new WeakMap();
    modelPlanes.set(mesh.vertices, byFace);
  }
  let plane = byFace.get(face);
  if (plane === undefined) {
    plane = modelPlane(mesh.vertices, face.vertices);
    byFace.set(face, plane);
  }
  return plane;
};

/// A model plane placed as `placed` places its corners, with its offset taken from `eye`
/// rather than from Eris's origin, so it keeps its low bits nine million units out. A
/// horizontal plane comes out the same for every placement at one height: its turned normal
/// has exact zeros across, so a structure's base and the ground record under it tie exactly.
const placedPlane = (
  plane: FacePlane,
  placement: ErisPlacement,
  negateZ: boolean,
  eye: Vector3
): FacePlane => {
  const [x, y, modelZ, d] = plane;
  const z = negateZ ? -modelZ : modelZ;
  const sin = Math.sin(placement.heading);
  const cos = Math.cos(placement.heading);
  const nx = x * cos + z * sin;
  const nz = -x * sin + z * cos;
  return [
    nx,
    y,
    nz,
    d -
      (nx * (placement.position.x - eye.x) +
        y * (placement.position.y - eye.y) +
        nz * (placement.position.z - eye.z))
  ];
};

const DISPLAY_STROKE_HALF_WIDTH = 0.75;

const displayStrokeQuad = (
  start: readonly [number, number, number],
  end: readonly [number, number, number]
):
  | readonly [
      readonly [number, number, number],
      readonly [number, number, number],
      readonly [number, number, number],
      readonly [number, number, number]
    ]
  | null => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return null;
  }
  const x = (-dy / length) * DISPLAY_STROKE_HALF_WIDTH;
  const y = (dx / length) * DISPLAY_STROKE_HALF_WIDTH;
  return [
    [start[0] + x, start[1] + y, start[2]],
    [end[0] + x, end[1] + y, end[2]],
    [end[0] - x, end[1] - y, end[2]],
    [start[0] - x, start[1] - y, start[2]]
  ];
};

/// A glyph stroke as a quad in its wall text's own plane: XY (`plane` 0) or ZY (128).
const wallStrokeQuad = (
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  plane: 0 | 128
):
  | readonly [
      readonly [number, number, number],
      readonly [number, number, number],
      readonly [number, number, number],
      readonly [number, number, number]
    ]
  | null => {
  const along = plane === 0 ? 0 : 2;
  const da = end[along] - start[along];
  const dy = end[1] - start[1];
  const length = Math.hypot(da, dy);
  if (length === 0) {
    return null;
  }
  const a = (-dy / length) * DISPLAY_STROKE_HALF_WIDTH;
  const y = (da / length) * DISPLAY_STROKE_HALF_WIDTH;
  const shifted = (
    vertex: readonly [number, number, number],
    sign: number
  ): readonly [number, number, number] => {
    const result: [number, number, number] = [...vertex];
    result[along] += sign * a;
    result[1] += sign * y;
    return result;
  };
  return [
    shifted(start, 1),
    shifted(end, 1),
    shifted(end, -1),
    shifted(start, -1)
  ];
};

type WorldTriangle = readonly [Vector3, Vector3, Vector3];

const doubleSidedQuad = (
  southwest: Vector3,
  southeast: Vector3,
  northeast: Vector3,
  northwest: Vector3
): readonly WorldTriangle[] => [
  [southwest, southeast, northeast],
  [southwest, northeast, northwest],
  [northeast, southeast, southwest],
  [northwest, northeast, southwest]
];

/// The Body's base plane: axis-aligned rings of quads around the eye, out to the camera's far
/// plane.
///
/// A recovered ground record covers only its stored cell-local primitives: the spaceport apron
/// is a strip of cell `$87`, `$7000` placements are composed, and camera-dependent `$F0`/`$F4`
/// horizon slots stay outside static model geometry. Empty records contain no default quad;
/// their native renderer returns on the initial zero command. Filling whole cells left
/// uncovered areas as sky, and a fill in the
/// next cell along is half a cell away, which a 63-unit eye over 65536-unit cells compresses
/// into a pixel at the horizon. So this authored stand-in for the separate native
/// surface/background path runs under everything and drops by the document's `fillDropUnits`,
/// which orders depth against recovered faces at y = 0 without claiming Eris's ground sits
/// lower (#221).
///
/// It is rings rather than one far-plane-sized quad because the rasteriser interpolates depth
/// across a triangle in screen space with limited precision, and a triangle a million units
/// across that is also clipped at the near plane lands its depth a few units off. That is
/// enough to lift the fill through the recovered pads and stripe them, so each ring is at most
/// twice the distance of the last, and the triangles under a structure are structure-sized.
///
/// It is no longer clipped to the workspace, and it is no longer green. The plane is the Body's
/// own surface in its recovered base colour — Eris's `$0003` sea — and it runs to the far plane
/// because the surface does: a Body is a 4096-cell torus, not a 16-cell window with sky beyond
/// it. Where land begins is the island fills' business, not this one's (#394). Past the far
/// plane the ground to the horizon is `horizonFillVertices`'s (#573).
const FILL_INNER_HALF_UNITS = 256;

const degenerate = (triangle: WorldTriangle): boolean => {
  const [a, b, c] = triangle;
  const area = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  return area === 0;
};

const basePlaneTriangles = (
  reach: number,
  dropUnits: number,
  eye: Vector3
): readonly WorldTriangle[] => {
  const corner = (x: number, z: number): Vector3 => ({
    x: eye.x + x,
    y: -dropUnits,
    z: eye.z + z
  });
  const triangles: WorldTriangle[] = [];
  const rectangle = (x0: number, z0: number, x1: number, z1: number) => {
    const quad = doubleSidedQuad(
      corner(x0, z0),
      corner(x1, z0),
      corner(x1, z1),
      corner(x0, z1)
    );
    for (const triangle of quad) {
      if (!degenerate(triangle)) {
        triangles.push(triangle);
      }
    }
  };
  let inner = FILL_INNER_HALF_UNITS;
  rectangle(-inner, -inner, inner, inner);
  while (inner < reach) {
    const outer = inner * 2;
    rectangle(-outer, inner, outer, outer);
    rectangle(-outer, -outer, outer, -inner);
    rectangle(-outer, -inner, -inner, inner);
    rectangle(inner, -inner, outer, inner);
    inner = outer;
  }
  return triangles;
};

/// One Damocles Island filled over the base plane, in raw Body units at the base plane's own
/// height.
///
/// The coastline is triangulated island-local, where the numbers are whole cells and small,
/// and the corners are then read back in Body units: ear clipping a polygon whose coordinates
/// run to nine million would work, but there is no reason to ask it to. Three of Eris's five
/// islands are concave, so this must be a triangulation and not a fan.
/// `$0598CC`: the colour space is filled in, slot 8's `$001`.
const SPACE_SKY = '#000022';

/// The ST screen's centre column, about which `$05668A` places a Body at `160 − F·u/d`.
const SKY_CENTRE_COLUMN = 160;

/// Rows of a disc between the horizon and its top: the angles a circle is sampled at.
const SKY_DISC_SLABS = 32;

/// How far out along its direction a sky Body's disc is placed. The discs are painted with the
/// depth test off and write no depth, so this only has to lie inside the frustum.
const skyDepth = (doc: ErisPresentationDocument): number =>
  doc.camera.farPlane / 2;

/// Where the comet's polygons are cut short of the eye, in view depth. They are projected
/// before they are drawn, so this only has to keep the divide away from zero.
const SKY_NEAR_DEPTH = 1e-6;

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

/// The comet's polygons, `$04F8FE`'s, in view space: cut short of the eye, projected, cut at the
/// horizon row (the `$04FB1C` fill limit, patched to row 68 on foot), and fanned into
/// triangles at the sky's depth. Returns whether any of it is left.
///
/// From a surface the head is a few hundred units across at a quarter of a million away, so
/// the triangles are under a pixel wide. The ST's scan fill still paints every row they
/// cross, and #528's frames show the comet as a streak a pixel or more wide all the way to the
/// tip. The port's pixels are finer than the ST's, so it adds that floor as a quad one ST
/// pixel wide from the head to the tip.
const skyCometTriangles = (
  comet: SkyComet,
  view: readonly Vector3[],
  pixel: number,
  depth: number,
  emit: (view: Vector3, colour: readonly [number, number, number]) => void,
  horizonRow = 0
): boolean => {
  let drawn = false;
  const fill = (
    polygon: readonly Tangent[],
    colour: readonly [number, number, number]
  ): void => {
    const cut = Number.isFinite(horizonRow)
      ? clipPolygon(polygon, point => point.y - horizonRow, lerp2)
      : polygon;
    for (let index = 1; index + 1 < cut.length; index += 1) {
      for (const point of [cut[0]!, cut[index]!, cut[index + 1]!]) {
        emit({ x: point.x * depth, y: point.y * depth, z: depth }, colour);
      }
      drawn = true;
    }
  };
  const project = (point: Vector3): Tangent => ({
    x: point.x / point.z,
    y: point.y / point.z
  });
  for (const face of comet.faces) {
    const front = clipPolygon(
      face.points.map(index => view[index]!),
      point => point.z - SKY_NEAR_DEPTH,
      lerp3
    );
    fill(front.map(project), channels(face.colour));
  }
  const [tip, ...heads] = view;
  const colour = comet.faces[0]?.colour;
  if (tip === undefined || heads.length === 0 || colour === undefined) {
    return drawn;
  }
  const head = {
    x: heads.reduce((sum, point) => sum + point.x, 0) / heads.length,
    y: heads.reduce((sum, point) => sum + point.y, 0) / heads.length,
    z: heads.reduce((sum, point) => sum + point.z, 0) / heads.length
  };
  const segment = clipPolygon(
    [head, tip],
    point => point.z - SKY_NEAR_DEPTH,
    lerp3
  );
  if (segment.length >= 2) {
    const [from, to] = [project(segment[0]!), project(segment[1]!)];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length > 0) {
      const nx = (-(to.y - from.y) / length) * (pixel / 2);
      const ny = ((to.x - from.x) / length) * (pixel / 2);
      fill(
        [
          { x: from.x - nx, y: from.y - ny },
          { x: to.x - nx, y: to.y - ny },
          { x: to.x + nx, y: to.y + ny },
          { x: from.x + nx, y: from.y + ny }
        ],
        channels(colour)
      );
    }
  }
  return drawn;
};

/// The star pixels as squares one ST pixel on a side, at the sky's depth.
const skyStarTriangles = (
  stars: readonly StarPixel[],
  projectionScale: number,
  depth: number,
  emit: (view: Vector3, colour: readonly [number, number, number]) => void
): void => {
  const step = 1 / projectionScale;
  const at = (x: number, y: number): Vector3 => ({
    x: x * depth,
    y: y * depth,
    z: depth
  });
  for (const star of stars) {
    const corner = starTangent(star.column, star.row, projectionScale);
    const colour = channels(star.colour);
    const quad = [
      at(corner.x, corner.y),
      at(corner.x + step, corner.y),
      at(corner.x + step, corner.y - step),
      at(corner.x, corner.y - step)
    ];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      emit(quad[index]!, colour);
    }
  }
};

/// One sky Body as horizontal slabs, `$045916`'s rows made continuous: each row from `−w` to
/// `+w` about the centre, split at `split·w`, and cut at the horizon row. On foot this is the
/// view's centre row (`$042C74 = $44`, row 68 of 136), shifted by Free Look. The disc is round
/// here where the ST's is widened by `1/0.84375`: that widening makes it round on the ST's
/// non-square pixels, and the port's pixels are square. In flight and in space (`$042C74 = $88`,
/// the view's last row) nothing is cut.
const skyDiscTriangles = (
  body: Pick<SkyBody, 'colour' | 'first' | 'shadow' | 'split'>,
  placement: SkyBodyPlacement,
  depth: number,
  emit: (view: Vector3, colour: readonly [number, number, number]) => void,
  horizonRow = 0
): void => {
  const lit = channels(body.colour);
  const shadow = channels(body.shadow);
  const [first, second] = body.first === 'lit' ? [lit, shadow] : [shadow, lit];
  const { radius, x, y } = placement;
  const rows: {
    readonly left: number;
    readonly right: number;
    readonly split: number;
    readonly y: number;
  }[] = [];
  for (let slab = 0; slab <= SKY_DISC_SLABS; slab += 1) {
    const edge = y - radius * Math.cos((slab * Math.PI) / SKY_DISC_SLABS);
    const row = Math.max(horizonRow, edge);
    const dy = row - y;
    const w = Math.sqrt(Math.max(0, radius * radius - dy * dy));
    rows.push({ left: x - w, right: x + w, split: x + body.split * w, y: row });
  }
  const at = (u: number, v: number): Vector3 => ({
    x: u * depth,
    y: v * depth,
    z: depth
  });
  const quad = (
    corners: readonly [Vector3, Vector3, Vector3, Vector3],
    colour: readonly [number, number, number]
  ): void => {
    for (const index of [0, 1, 2, 0, 2, 3]) {
      emit(corners[index]!, colour);
    }
  };
  for (let index = 0; index < SKY_DISC_SLABS; index += 1) {
    const low = rows[index]!;
    const high = rows[index + 1]!;
    if (high.y <= low.y) {
      continue;
    }
    quad(
      [
        at(low.left, low.y),
        at(low.split, low.y),
        at(high.split, high.y),
        at(high.left, high.y)
      ],
      first
    );
    quad(
      [
        at(low.split, low.y),
        at(low.right, low.y),
        at(high.right, high.y),
        at(high.split, high.y)
      ],
      second
    );
  }
};

/// The glyphs every Floor Label draws this frame. `$CD04` is one byte for the whole workspace,
/// so each label shows the Floor the lift's label stands at: during a ride it steps through the
/// Floors passed, before the destination binds (#473). Floor 0 outside any structure.
export const floorLabelGlyphsOf = (
  surface: ErisSurface,
  structure: BoundStructureSnapshot | null
): FloorLabelGlyphs => {
  const character =
    FLOOR_LABEL_CHARACTERS[structure?.ride?.label ?? structure?.floor ?? 0]!;
  return font => surface.floorLabelGlyphs[String(font)]?.[character];
};

/// The vertical field of view at `$7964`'s scale exponent (#628): 8 is the port's own, and each
/// step above it doubles the picture, which halves the tangent of the half-angle.
export const zoomedFieldOfView = (degrees: number, exponent: number): number =>
  (Math.atan(
    Math.tan((degrees * Math.PI) / 360) / 2 ** (exponent - VIEW_EXPONENT)
  ) *
    360) /
  Math.PI;

/// `$7964`'s high word at the reset.
const VIEW_EXPONENT = 8;

export const planErisFrame = (
  surface: ErisSurface,
  pose: Pose,
  doc: ErisPresentationDocument,
  structure: BoundStructureSnapshot | null = null,
  residents: readonly ErisPlacement[] = [],
  hiddenResidents: readonly string[] = [],
  carriedSlot: CarriedSlot = () => false,
  /// The terminator's answer for the Pose (`$050562`): which half of the scene palette every
  /// `$80xx` word is read through, and which of the Body's two sky words fills the sky.
  daylight = false,
  /// The Bodies the current Body's draw list names (#530). None where the frame has no sky pass.
  sky: SkyPass | null = null,
  /// In space (#558) the frame draws the sky alone, over `$001`: no ground, island, structure
  /// or object stream.
  inSpace = false,
  /// Aboard a craft on a Body: structures are drawn from their `$C13C` detail group alone, and
  /// no region's plan queue or enclosed branch is drawn (`$0533D4`, `$53CC2`).
  aboard = false,
  /// How structures are drawn aboard: the ST's `$C13C` detail group, which saves it time, or
  /// `whole` under Enhanced presentation, which draws every part of every structure. Nothing is
  /// enclosed aboard either way.
  aboardStructures: 'aboard' | 'whole' = 'aboard',
  /// Road strokes stay one output pixel wide where they meet perspective road polygons.
  outputHeight = 136
): ErisFramePlan => {
  const camera = new Camera({
    farPlane: doc.camera.farPlane,
    heading: -pose.heading,
    nearPlane: doc.camera.nearPlane,
    pitch: pose.pitch,
    position: toCameraSpace(pose.position),
    roll: pose.roll ?? 0
  });
  const negateZ = doc.orientation.modelZ === 'negate';
  const values: number[] = [];
  let triangleCount = 0;
  let skippedFaces = 0;
  const emit = (
    world: Vector3,
    colour: readonly [number, number, number],
    plane: FacePlane
  ) => {
    const view = camera.viewSpace(toCameraSpace(world));
    values.push(
      view.x,
      view.y,
      view.z,
      colour[0],
      colour[1],
      colour[2],
      ...plane
    );
  };
  /// A plane in Eris, its offset already taken from the eye, as the view sees it.
  const viewPlane = (world: FacePlane): FacePlane => {
    const normal = camera.viewDirection(
      toCameraSpace({ x: world[0], y: world[1], z: world[2] })
    );
    return [normal.x, normal.y, normal.z, world[3]];
  };
  const placementPlane = (
    plane: FacePlane | null,
    placement: ErisPlacement
  ): FacePlane =>
    plane === null
      ? NO_PLANE
      : viewPlane(placedPlane(plane, placement, negateZ, pose.position));
  const quadPlane = (
    quad: readonly (readonly [number, number, number])[],
    placement: ErisPlacement
  ): FacePlane => placementPlane(modelPlane(quad, [0, 1, 2, 3]), placement);

  const active =
    structure !== null && insideCentralCellHalf(pose.position, surface.grid);
  const bound = active
    ? surface.placements.find(item => item.id === structure.instanceId)
    : undefined;
  const region =
    structure?.regionIndex === null || structure?.regionIndex === undefined
      ? undefined
      : bound?.selection?.structure.regions[structure.regionIndex];
  // An enclosed region is one whose flags have bit 15 clear. There the frame loop takes the
  // branch at `$0595FA` that fills above the horizon in the structure's first scene colour and
  // below it in the second (`$059600`, `$059606`), and draws nothing but the bound structure's
  // plan queue (`$0596F0` → `$05A730`). That queue carries its own wall texts and insertions.
  // No ground record, island fill, road edge or object stream is drawn (#491).
  // The flight branch `$05970E` never reads `$7B34`, so aboard nothing is enclosed.
  const enclosed = !aboard && region !== undefined && regionIsEnclosed(region);
  // The scene colours are resolved through `$7A0E` when the structure is assembled
  // (`$059DA2`), so the half they take is the one bound then. The port takes the current half,
  // which differs only while the terminator crosses a player standing in one structure.
  const enclosedBackground = enclosed
    ? bound?.selection?.background
    : undefined;
  const background =
    daylight && enclosedBackground?.day !== undefined
      ? enclosedBackground.day
      : enclosedBackground;

  // The sky passes (`$05309A`) run after the sky fill and before the ground, in list order
  // with no depth sort, so a later Body covers an earlier one and the ground and structures
  // cover them all. The enclosed branch runs no sky pass, as it runs no sky fill (#491).
  const skyValues: number[] = [];
  const skyPlacements: SkyBodyPlacement[] = [];
  const skyAt = skyDepth(doc);
  const skyBodies = enclosed || sky === null ? [] : sky.bodies;
  const projectionScale = sky?.projectionScale ?? 0;
  // The ST pixels a unit tangent spans at the view's scale exponent (#628).
  const pixelScale = projectionScale * (sky?.zoom ?? 1);
  const halfWidthDivisor = sky?.halfWidthDivisor ?? 0;
  const horizonCut = !inSpace && (sky?.horizonCut ?? true);
  // Free Look moves the on-foot horizon away from the centre row. The disc visibility test,
  // disc slabs and comet faces must share that cut. Aboard retains the ST's centre-row cut;
  // in flight or space the ground fill alone covers the sky below the horizon.
  const horizonRow = horizonCut ? (aboard ? 0 : -tan(pose.pitch)) : -Infinity;
  const skyView = (offset: Vector3): Vector3 =>
    camera.viewSpace(
      toCameraSpace({
        x: pose.position.x + offset.x,
        y: pose.position.y + offset.y,
        z: pose.position.z + offset.z
      })
    );
  const skyEmit = (
    vertex: Vector3,
    colour: readonly [number, number, number]
  ): void => {
    // The sky is drawn with depth off; its plane is the one its discs are laid out on.
    skyValues.push(
      vertex.x,
      vertex.y,
      vertex.z,
      colour[0],
      colour[1],
      colour[2],
      0,
      0,
      1,
      -skyAt
    );
  };
  // `$04FBAE` skips a Body whose screen x does not fit a signed word less its top bit
  // (`cmpi.w #$4000`), about the centre column 160.
  const onScreen = (x: number): boolean => {
    const column = SKY_CENTRE_COLUMN + x * pixelScale;
    return column >= -0x40_00 && column < 0x40_00;
  };
  // `$045928`'s rows are `⌊√(r² − dy²) / 0.84375⌋` wide, so a disc under that many pixels
  // across has no row at all.
  const discDrawn = (placement: Omit<SkyBodyPlacement, 'drawn'>): boolean =>
    placement.radius * pixelScale >= halfWidthDivisor &&
    placement.y + placement.radius > horizonRow;
  // `$0503FE`, `$0505B8` and `$05067C` plot the stars before the sky pass, so the Bodies cover
  // them (#578). Each is one ST pixel, which is 1/256 of a unit tangent either way.
  const stars = enclosed || sky === null ? [] : sky.stars;
  skyStarTriangles(stars, pixelScale, skyAt, skyEmit);
  for (const body of skyBodies) {
    const view = skyView(body.offset);
    const placement =
      view.z > 0
        ? {
            id: body.id,
            radius:
              (body.kind === 'disc' ? body.size : (body.head?.size ?? 0)) /
              (projectionScale * view.z),
            x: view.x / view.z,
            y: view.y / view.z
          }
        : { id: body.id, radius: 0, x: 0, y: 0 };
    if (body.kind === 'comet') {
      // Pass 2 lets the comet through with its centre behind the eye (`$05315A`), since its
      // tail may still be in front, and draws the head disc only where the centre is not.
      if (view.z > 0 && !onScreen(placement.x)) {
        skyPlacements.push({ ...placement, drawn: false });
        continue;
      }
      let drawn = skyCometTriangles(
        body,
        body.points.map(skyView),
        1 / pixelScale,
        skyAt,
        skyEmit,
        horizonRow
      );
      if (view.z > 0 && body.head !== null && discDrawn(placement)) {
        const { colour } = body.head;
        skyDiscTriangles(
          { colour, first: 'lit', shadow: colour, split: 1 },
          { ...placement, drawn: true },
          skyAt,
          skyEmit,
          horizonRow
        );
        drawn = true;
      }
      skyPlacements.push({ ...placement, drawn });
      continue;
    }
    if (view.z <= 0) {
      skyPlacements.push({ ...placement, drawn: false });
      continue;
    }
    const drawn = onScreen(placement.x) && discDrawn(placement);
    skyPlacements.push({ ...placement, drawn });
    if (drawn) {
      skyDiscTriangles(
        body,
        { ...placement, drawn },
        skyAt,
        skyEmit,
        horizonRow
      );
    }
  }

  // Land and sea, in the order the Working Authority paints them ($0597EC..$05983C). The base
  // plane is the Body's own colour and every island is filled over it — except while the
  // player stands on an island's core, where the engine draws the ground plane in that
  // island's colour instead and the fill would only draw the ground underfoot a second time
  // at one depth (#394). In an enclosed region the plane is the structure's floor colour: an
  // infinite plane below the eye meets the sky at eye level, as the raster split does.
  // Aboard, the flight branch takes the island's colour only while Y's high word `$7A30` is
  // zero, and the Body's `$7C88` above that (`$05982E`..`$05983C`): over LACHESIS at Y
  // `$1800000` the ST fills `$411`, not the land's `$211` (#573).
  const here = classifyPosition(surface, pose.position);
  const grounded = Math.floor(pose.position.y / 0x1_00_00) === 0;
  const underfoot = here.kind === 'core' && grounded ? here.island : undefined;
  const base = inSpace
    ? null
    : (background?.floor ?? underfoot?.landColour ?? surface.baseColour);
  // A Body with no recovered surface colour draws no plane at all rather than an invented one
  // (ADR 0043). No Body a Session stands on is in that state; the VOID slot is not a surface.
  // The base plane and the island fills are one plane, y = −drop.
  const surfacePlane = viewPlane([
    0,
    1,
    0,
    doc.ground.fillDropUnits + pose.position.y
  ]);
  const horizonValues =
    base === null
      ? []
      : horizonFillVertices(
          {
            x: surfacePlane[0],
            y: surfacePlane[1],
            z: surfacePlane[2]
          },
          skyAt,
          channels(base)
        );
  if (base !== null) {
    const colour = channels(base);
    for (const triangle of basePlaneTriangles(
      doc.camera.farPlane,
      doc.ground.fillDropUnits,
      pose.position
    )) {
      for (const vertex of triangle) {
        emit(vertex, colour, surfacePlane);
      }
      triangleCount += 1;
    }
  }
  const fillTriangleCount = triangleCount;

  // `$0560F2` returns before `$056516` draws any island while the eye is on the core with Y's
  // high word 0: the ground there is the island's colour to the horizon, and no other island
  // is drawn over it. Otherwise every island is, the one below included (#578).
  const islands =
    enclosed || inSpace || underfoot !== undefined ? [] : surface.islands;
  const toView = (world: Vector3): Vector3 =>
    camera.viewSpace(toCameraSpace(world));
  const horizonIslandValues: number[] = [];
  for (const island of islands) {
    const colour = channels(island.landColour);
    const triangles = islandFillTriangles(
      island,
      surface,
      doc.ground.fillDropUnits,
      pose.position
    );
    for (const triangle of triangles) {
      for (const vertex of triangle) {
        emit(vertex, colour, surfacePlane);
      }
      triangleCount += 1;
    }
    if (base !== null) {
      horizonIslandValues.push(
        ...horizonIslandVertices(
          triangles,
          toView,
          doc.camera.nearPlane,
          skyAt,
          colour
        )
      );
    }
  }
  const islandTriangleCount = triangleCount - fillTriangleCount;

  // `$056464` binds the nearest island's workspace. The admitted surface
  // anchor stays fixed during travel, so it cannot select this road pass.
  const island = here.island;
  const roads = island?.roads;
  const roadOrigin =
    island === undefined
      ? { x: 0, z: 0 }
      : islandOriginNear(pose.position, surface.grid, island);
  const cell = {
    x: Math.floor((pose.position.x - roadOrigin.x) / surface.grid.cellUnits),
    z: Math.floor((pose.position.z - roadOrigin.z) / surface.grid.cellUnits)
  };
  const edges =
    enclosed || inSpace || roads === undefined
      ? []
      : roadEdges(roads.corners, cell.x, cell.z, pose.position.y);
  const roadValues: number[] = [];
  const roadPoint = (corner: number): Vector3 =>
    toView({
      x: roadOrigin.x + ((corner & 15) + 0.5) * surface.grid.cellUnits,
      y: 0,
      z: roadOrigin.z + ((corner >> 4) + 0.5) * surface.grid.cellUnits
    });
  const roadColour = channels(roads?.roadColour ?? '#000000');
  for (const edge of edges) {
    const quad = roadStroke(
      roadPoint(edge >> 8),
      roadPoint(edge & 0xff),
      doc.camera.nearPlane,
      Math.tan((doc.camera.verticalFieldOfViewDegrees * Math.PI) / 360),
      outputHeight
    );
    if (quad === null) {
      continue;
    }
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const view = quad[index]!;
      roadValues.push(view.x, view.y, view.z, ...roadColour, ...NO_PLANE);
    }
  }

  const openUnits = new Map(
    structure?.attachments.map(item => [item.slot, item.openUnits]) ?? []
  );
  // Glyph fills and strokes both face either way: the game draws a wall text whenever its
  // face is drawn, from whichever side the player stands. They lie in their face's plane and
  // follow it in draw order, so they win it.
  const emitWallText = (
    mesh: Mesh,
    plane: 0 | 128,
    placement: ErisPlacement
  ): void => {
    const triangles = trianglesOf(mesh, daylight);
    skippedFaces += triangles.skipped;
    for (let i = 0; i < triangles.indices.length; i += 3) {
      const colour = triangles.colours[i / 3]!;
      const facePlane = placementPlane(
        facePlaneOf(mesh, mesh.faces[triangles.faces[i / 3]!]!),
        placement
      );
      const corners = [0, 1, 2].map(corner =>
        placed(
          mesh.vertices[triangles.indices[i + corner]!]!,
          placement,
          negateZ
        )
      );
      for (const vertex of [...corners, ...[...corners].reverse()]) {
        emit(vertex, colour, facePlane);
      }
      triangleCount += 2;
    }
    for (const line of mesh.lines) {
      for (let index = 0; index < line.vertices.length - 1; index += 1) {
        const quad = wallStrokeQuad(
          mesh.vertices[line.vertices[index]!]!,
          mesh.vertices[line.vertices[index + 1]!]!,
          plane
        );
        if (quad === null) {
          continue;
        }
        const colour = channels(litColour(line, daylight));
        const strokePlane = quadPlane(quad, placement);
        for (const triangle of doubleSidedQuad(
          placed(quad[0], placement, negateZ),
          placed(quad[1], placement, negateZ),
          placed(quad[2], placement, negateZ),
          placed(quad[3], placement, negateZ)
        )) {
          for (const vertex of triangle) {
            emit(vertex, colour, strokePlane);
          }
          triangleCount += 1;
        }
      }
    }
  };
  const floorLabelGlyph = floorLabelGlyphsOf(surface, structure);
  const emitPlacement = (placement: ErisPlacement): void => {
    const isBound = active && placement.id === structure?.instanceId;
    for (const mesh of structureMeshes(
      placement,
      pose,
      negateZ,
      slot => (isBound ? (openUnits.get(slot) ?? 0) : 0),
      isBound ? structure.regionIndex : null,
      carriedSlot,
      floorLabelGlyph,
      aboard ? aboardStructures : 'onFoot'
    )) {
      if (mesh.wallTextPlane !== undefined) {
        emitWallText(mesh, mesh.wallTextPlane, placement);
        continue;
      }
      const triangles = trianglesOf(mesh, daylight);
      skippedFaces += triangles.skipped;
      let planeFace = -1;
      let plane = NO_PLANE;
      for (let i = 0; i < triangles.indices.length; i += 3) {
        const colour = triangles.colours[i / 3]!;
        const face = triangles.faces[i / 3]!;
        if (face !== planeFace) {
          planeFace = face;
          plane = placementPlane(
            facePlaneOf(mesh, mesh.faces[face]!),
            placement
          );
        }
        for (let corner = 0; corner < 3; corner += 1) {
          emit(
            placed(
              mesh.vertices[triangles.indices[i + corner]!]!,
              placement,
              negateZ
            ),
            colour,
            plane
          );
        }
        triangleCount += 1;
      }
      if (mesh.displayCode !== undefined) {
        for (const line of mesh.lines) {
          for (let index = 0; index < line.vertices.length - 1; index += 1) {
            const quad = displayStrokeQuad(
              mesh.vertices[line.vertices[index]!]!,
              mesh.vertices[line.vertices[index + 1]!]!
            );
            if (quad === null) {
              continue;
            }
            const colour = channels(litColour(line, daylight));
            const strokePlane = quadPlane(quad, placement);
            for (const triangle of doubleSidedQuad(
              placed(quad[0], placement, negateZ),
              placed(quad[1], placement, negateZ),
              placed(quad[2], placement, negateZ),
              placed(quad[3], placement, negateZ)
            )) {
              for (const vertex of triangle) {
                emit(vertex, colour, strokePlane);
              }
              triangleCount += 1;
            }
          }
        }
      }
    }
  };
  // The recovered draw bound (#370, #373): the Working Authority draws a cell's ground
  // records and its Surface Structure from that cell alone, and its objects from anywhere on
  // the Body. At the Eris arrival Pose that is 4 of the workspace's 207 placements.
  const drawn = inSpace
    ? []
    : enclosed
      ? [bound!]
      : surface.placements.filter(placement =>
          withinDrawBound(placement, pose.position, surface.grid)
        );
  for (const placement of drawn) {
    if (placement.kind === 'ground') {
      emitPlacement(placement);
    }
  }
  const groundTriangleCount =
    triangleCount - fillTriangleCount - islandTriangleCount;
  const hidden = new Set([
    ...hiddenResidents,
    ...residents.map(resident => resident.id)
  ]);
  const drawnPlacements: string[] = [];
  for (const placement of drawn) {
    if (hidden.has(placement.id)) {
      continue;
    }
    if (placement.kind !== 'ground') {
      emitPlacement(placement);
      drawnPlacements.push(placement.id);
    }
  }
  for (const resident of inSpace ? [] : residents) {
    emitPlacement(resident);
    drawnPlacements.push(resident.id);
  }

  return {
    // Outside an enclosed region `$059638` fills the sky with `$7C86`, the Body's day or night
    // word (#494). In space `$0598CC` loads slot 8 with `$001` and `$059CE2` fills the view in
    // it, the dark blue behind the stars (#578). The VOID slot has no sky words and is not a
    // surface a Session stands on, so it clears to black rather than to an invented sky.
    clear: channels(
      background?.ceiling ??
        (inSpace
          ? SPACE_SKY
          : surface.sky === null
            ? '#000000'
            : daylight
              ? surface.sky.day.colour
              : surface.sky.night.colour)
    ),
    drawnPlacements,
    enclosed,
    farPlane: doc.camera.farPlane,
    fillTriangleCount,
    groundTriangleCount,
    horizonIslandVertices: new Float32Array(horizonIslandValues),
    horizonVertices: new Float32Array(horizonValues),
    islandTriangleCount,
    nearPlane: doc.camera.nearPlane,
    roadEdges: edges,
    roadVertices: new Float32Array(roadValues),
    skippedFaces,
    skyBodies: skyPlacements,
    skyVertices: new Float32Array(skyValues),
    starCount: stars.length,
    triangleCount,
    verticalFieldOfViewDegrees: doc.camera.verticalFieldOfViewDegrees,
    vertices: new Float32Array(values)
  };
};
