import type { Mesh } from '../catalogue/data.ts';
import { triangulate } from '../catalogue/geometry.ts';
import type { Vector3 } from '../orientation/index.ts';
import { Camera } from '../projection/index.ts';
import type { ErisPresentationDocument } from './documents.ts';
import type { ErisPlacement, ErisPose, ErisSurface } from './world.ts';

/// One frame of Eris in Filled Presentation, planned without a graphics context.
///
/// Vertices are camera-relative view-space positions with a flat colour, six floats each, so
/// the GPU never sees a raw world coordinate: Eris positions run to nine million units and
/// would lose their low bits in binary32. The perspective divide is the renderer's; this plan
/// says only what the frustum is.
export interface ErisFramePlan {
  readonly clear: readonly [number, number, number];
  readonly farPlane: number;
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
  for (const face of mesh.faces) {
    let corners: number[];
    try {
      corners = triangulate(mesh.vertices, face.vertices);
    } catch {
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

export const planErisFrame = (
  surface: ErisSurface,
  pose: ErisPose,
  doc: ErisPresentationDocument
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

  // The authored ground: a flat plane at y = 0 under and around the camera, in the recovered
  // green. Both windings are emitted, so it shows whatever the front-face rule settles on and
  // from below should the camera ever get there.
  const extent = doc.ground.extentCells * surface.grid.cellUnits;
  const ground = channels(doc.ground.colour);
  const cx = pose.position.x;
  const cz = pose.position.z;
  const corner = (dx: number, dz: number): Vector3 => ({
    x: cx + dx * extent,
    y: 0,
    z: cz + dz * extent
  });
  for (const [a, b, c] of [
    [corner(-1, -1), corner(1, -1), corner(1, 1)],
    [corner(-1, -1), corner(1, 1), corner(-1, 1)],
    [corner(1, 1), corner(1, -1), corner(-1, -1)],
    [corner(-1, 1), corner(1, 1), corner(-1, -1)]
  ] as const) {
    emit(a, ground);
    emit(b, ground);
    emit(c, ground);
    triangleCount += 1;
  }

  for (const placement of surface.placements) {
    if (placement.mesh === undefined) {
      continue;
    }
    const mesh = placement.mesh;
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

  return {
    clear: channels(doc.sky.colour),
    farPlane: doc.camera.farPlane,
    nearPlane: doc.camera.nearPlane,
    skippedFaces,
    triangleCount,
    verticalFieldOfViewDegrees: doc.camera.verticalFieldOfViewDegrees,
    vertices: new Float32Array(values)
  };
};
