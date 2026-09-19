import type { Mesh } from '../catalogue/data.ts';
import { triangulate } from '../catalogue/geometry.ts';
import type { Vector3 } from '../orientation/index.ts';
import { Camera } from '../projection/index.ts';
import type { ErisPresentationDocument } from './documents.ts';
import type { BoundStructureSnapshot } from './save.ts';
import { structureMeshes } from './selection.ts';
import {
  insideCentralCellHalf,
  withinDrawBound,
  type ErisGrid,
  type ErisPlacement,
  type ErisSurface,
  type Pose
} from './world.ts';

/// One frame of Eris in Filled Presentation, planned without a graphics context.
///
/// Vertices are camera-relative view-space positions with a flat colour and a face order,
/// seven floats each (`FLOATS_PER_VERTEX`), so
/// the GPU never sees a raw world coordinate: Eris positions run to nine million units and
/// would lose their low bits in binary32. The perspective divide is the renderer's; this plan
/// says only what the frustum is.
/// view xyz, colour rgb, then the face's order within its ground record (zero elsewhere):
/// later faces of a record draw over earlier ones where they share a plane, as a painter's
/// stream would leave them.
export const FLOATS_PER_VERTEX = 7;

export interface ErisFramePlan {
  readonly clear: readonly [number, number, number];
  readonly farPlane: number;
  /// Triangles of the authored ground fill, which lead the vertex list.
  readonly fillTriangleCount: number;
  /// Triangles of the recovered per-cell ground records (pads, aprons, roads), which follow
  /// the fill and precede every structure and object. Structure base planes share y = 0 with
  /// these, and Damocles's fill order for that tie is unrecovered; the renderer draws the
  /// ground records a hair behind so a building's pad lies over the cell's apron, as a
  /// painter's ground stream drawn before its structures would leave it.
  readonly groundTriangleCount: number;
  readonly nearPlane: number;
  /// Faces the triangulator refused, drawn as nothing and counted.
  readonly skippedFaces: number;
  readonly triangleCount: number;
  readonly verticalFieldOfViewDegrees: number;
  readonly vertices: Float32Array;
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
/// so the ear clipping is keyed by mesh and the frame reuses it.
const triangulated = new WeakMap<Mesh, Triangles>();
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

const trianglesOf = (mesh: Mesh): Triangles => {
  const cached = triangulated.get(mesh);
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
    const colour = channels(face.colour);
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
  triangulated.set(mesh, result);
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

const DISPLAY_STROKE_HALF_WIDTH = 0.75;
const DISPLAY_STROKE_SURFACE_OFFSET = 0.01;

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
    [start[0] + x, start[1] + y, start[2] - DISPLAY_STROKE_SURFACE_OFFSET],
    [end[0] + x, end[1] + y, end[2] - DISPLAY_STROKE_SURFACE_OFFSET],
    [end[0] - x, end[1] - y, end[2] - DISPLAY_STROKE_SURFACE_OFFSET],
    [start[0] - x, start[1] - y, start[2] - DISPLAY_STROKE_SURFACE_OFFSET]
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

/// The authored fill: axis-aligned rings of quads around the eye, clipped to the first-world
/// workspace.
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
/// It is rings rather than one workspace-sized quad because the rasteriser interpolates depth
/// across a triangle in screen space with limited precision, and a triangle a million units
/// across that is also clipped at the near plane lands its depth a few units off. That is
/// enough to lift the fill through the recovered pads and stripe them, so each ring is at most
/// twice the distance of the last, and the triangles under a structure are structure-sized.
///
/// The fill stands in for land and sea alike: Eris is an island, and where the ground gives
/// way to water is not yet recovered, so the same green runs to the workspace edge.
const FILL_INNER_HALF_UNITS = 256;

const degenerate = (triangle: WorldTriangle): boolean => {
  const [a, b, c] = triangle;
  const area = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  return area === 0;
};

interface FillBounds {
  readonly maxX: number;
  readonly maxZ: number;
  readonly minX: number;
  readonly minZ: number;
}

const workspaceBounds = (grid: ErisGrid): FillBounds => ({
  maxX: (grid.origin.x + grid.cellsPerAxis) * grid.cellUnits,
  maxZ: (grid.origin.z + grid.cellsPerAxis) * grid.cellUnits,
  minX: grid.origin.x * grid.cellUnits,
  minZ: grid.origin.z * grid.cellUnits
});

const groundFillTriangles = (
  grid: ErisGrid,
  dropUnits: number,
  eye: Vector3
): readonly WorldTriangle[] => {
  const bounds = workspaceBounds(grid);
  const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));
  const corner = (x: number, z: number): Vector3 => ({
    x: clamp(eye.x + x, bounds.minX, bounds.maxX),
    y: -dropUnits,
    z: clamp(eye.z + z, bounds.minZ, bounds.maxZ)
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
  const reach = Math.max(
    Math.abs(bounds.minX - eye.x),
    Math.abs(bounds.maxX - eye.x),
    Math.abs(bounds.minZ - eye.z),
    Math.abs(bounds.maxZ - eye.z)
  );
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

export const planErisFrame = (
  surface: ErisSurface,
  pose: Pose,
  doc: ErisPresentationDocument,
  structure: BoundStructureSnapshot | null = null,
  residents: readonly ErisPlacement[] = [],
  hiddenResidents: readonly string[] = []
): ErisFramePlan => {
  const camera = new Camera({
    farPlane: doc.camera.farPlane,
    heading: -pose.heading,
    nearPlane: doc.camera.nearPlane,
    pitch: 0,
    position: toCameraSpace(pose.position)
  });
  const negateZ = doc.orientation.modelZ === 'negate';
  const values: number[] = [];
  let triangleCount = 0;
  let skippedFaces = 0;
  const emit = (
    world: Vector3,
    colour: readonly [number, number, number],
    order: number
  ) => {
    const view = camera.viewSpace(toCameraSpace(world));
    values.push(view.x, view.y, view.z, colour[0], colour[1], colour[2], order);
  };

  const ground = channels(doc.ground.colour);
  for (const triangle of groundFillTriangles(
    surface.grid,
    doc.ground.fillDropUnits,
    pose.position
  )) {
    for (const vertex of triangle) {
      emit(vertex, ground, 0);
    }
    triangleCount += 1;
  }
  const fillTriangleCount = triangleCount;

  const active =
    structure !== null && insideCentralCellHalf(pose.position, surface.grid);
  const openUnits = new Map(
    structure?.attachments.map(item => [item.slot, item.openUnits]) ?? []
  );
  const emitPlacement = (placement: ErisPlacement): void => {
    const isBound = active && placement.id === structure?.instanceId;
    for (const mesh of structureMeshes(
      placement,
      pose,
      negateZ,
      slot => (isBound ? (openUnits.get(slot) ?? 0) : 0),
      isBound ? structure.regionIndex : null
    )) {
      const triangles = trianglesOf(mesh);
      skippedFaces += triangles.skipped;
      for (let i = 0; i < triangles.indices.length; i += 3) {
        const colour = triangles.colours[i / 3]!;
        const order = placement.kind === 'ground' ? triangles.faces[i / 3]! : 0;
        for (let corner = 0; corner < 3; corner += 1) {
          emit(
            placed(
              mesh.vertices[triangles.indices[i + corner]!]!,
              placement,
              negateZ
            ),
            colour,
            order
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
            const colour = channels(line.colour);
            for (const triangle of doubleSidedQuad(
              placed(quad[0], placement, negateZ),
              placed(quad[1], placement, negateZ),
              placed(quad[2], placement, negateZ),
              placed(quad[3], placement, negateZ)
            )) {
              for (const vertex of triangle) {
                emit(vertex, colour, 0);
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
  const drawn = surface.placements.filter(placement =>
    withinDrawBound(placement, pose.position, surface.grid)
  );
  for (const placement of drawn) {
    if (placement.kind === 'ground') {
      emitPlacement(placement);
    }
  }
  const groundTriangleCount = triangleCount - fillTriangleCount;
  const hidden = new Set([
    ...hiddenResidents,
    ...residents.map(resident => resident.id)
  ]);
  for (const placement of drawn) {
    if (hidden.has(placement.id)) {
      continue;
    }
    if (placement.kind !== 'ground') {
      emitPlacement(placement);
    }
  }
  for (const resident of residents) {
    emitPlacement(resident);
  }

  return {
    clear: channels(doc.sky.colour),
    farPlane: doc.camera.farPlane,
    fillTriangleCount,
    groundTriangleCount,
    nearPlane: doc.camera.nearPlane,
    skippedFaces,
    triangleCount,
    verticalFieldOfViewDegrees: doc.camera.verticalFieldOfViewDegrees,
    vertices: new Float32Array(values)
  };
};
