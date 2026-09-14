import type { Mesh } from '../catalogue/data.ts';
import { triangulate } from '../catalogue/geometry.ts';
import type { Vector3 } from '../orientation/index.ts';
import { Camera } from '../projection/index.ts';
import type { ErisPresentationDocument } from './documents.ts';
import { structureMeshes } from './selection.ts';
import type {
  ErisGrid,
  ErisPlacement,
  ErisPose,
  ErisSurface
} from './world.ts';

/// One frame of Eris in Filled Presentation, planned without a graphics context.
///
/// Vertices are camera-relative view-space positions with a flat colour, six floats each, so
/// the GPU never sees a raw world coordinate: Eris positions run to nine million units and
/// would lose their low bits in binary32. The perspective divide is the renderer's; this plan
/// says only what the frustum is.
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
  order: readonly number[],
  colour: readonly [number, number, number]
): void => {
  for (let i = 0; i < order.length; i += 3) {
    indices.push(order[i]!, order[i + 1]!, order[i + 2]!);
    colours.push(colour);
  }
};

const trianglesOf = (mesh: Mesh): Triangles => {
  const cached = triangulated.get(mesh);
  if (cached !== undefined) {
    return cached;
  }
  const indices: number[] = [];
  const colours: (readonly [number, number, number])[] = [];
  let skipped = 0;
  let byFace = faceCorners.get(mesh.vertices);
  if (byFace === undefined) {
    byFace = new WeakMap();
    faceCorners.set(mesh.vertices, byFace);
  }
  for (const face of mesh.faces) {
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
    appendTriangles(indices, colours, corners, colour);
    if (face.doubleSided === true) {
      const reversed: number[] = [];
      for (let i = 0; i < corners.length; i += 3) {
        reversed.push(corners[i + 2]!, corners[i + 1]!, corners[i]!);
      }
      appendTriangles(indices, colours, reversed, colour);
    }
  }
  const result = { colours, indices, skipped };
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
/// A recovered ground record covers only the part of its cell the Damocles Catalogue decodes:
/// the spaceport apron is a strip of cell `$87`, and the `$7000` road templates and `$F0`/`$F4`
/// neighbour joins that would fill the rest are still undecoded. Filling whole cells left
/// those remainders as sky, and a fill in the next cell along is half a cell away, which a
/// 63-unit eye over 65536-unit cells compresses into a pixel at the horizon. So the fill runs
/// under everything and drops by the document's `fillDropUnits`, which orders depth against
/// the recovered faces at y = 0 without claiming Eris's ground sits lower (#221).
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
  pose: ErisPose,
  doc: ErisPresentationDocument,
  entrance: {
    readonly openUnits: number;
    readonly region: number | null;
  } = { openUnits: 0, region: null }
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
  const emit = (world: Vector3, colour: readonly [number, number, number]) => {
    const view = camera.viewSpace(toCameraSpace(world));
    values.push(view.x, view.y, view.z, colour[0], colour[1], colour[2]);
  };

  const ground = channels(doc.ground.colour);
  for (const triangle of groundFillTriangles(
    surface.grid,
    doc.ground.fillDropUnits,
    pose.position
  )) {
    for (const vertex of triangle) {
      emit(vertex, ground);
    }
    triangleCount += 1;
  }
  const fillTriangleCount = triangleCount;

  const emitPlacement = (placement: ErisPlacement): void => {
    const isEntrance = placement.id === doc.spaceportEntrance.instanceId;
    for (const mesh of structureMeshes(
      placement,
      pose,
      negateZ,
      isEntrance ? entrance.openUnits : 0,
      isEntrance ? entrance.region : undefined
    )) {
      const triangles = trianglesOf(mesh);
      skippedFaces += triangles.skipped;
      for (let i = 0; i < triangles.indices.length; i += 3) {
        const colour = triangles.colours[i / 3]!;
        for (let corner = 0; corner < 3; corner += 1) {
          emit(
            placed(
              mesh.vertices[triangles.indices[i + corner]!]!,
              placement,
              negateZ
            ),
            colour
          );
        }
        triangleCount += 1;
      }
    }
  };
  for (const placement of surface.placements) {
    if (placement.kind === 'ground') {
      emitPlacement(placement);
    }
  }
  const groundTriangleCount = triangleCount - fillTriangleCount;
  for (const placement of surface.placements) {
    if (placement.kind !== 'ground') {
      emitPlacement(placement);
    }
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
