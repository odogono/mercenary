import type { Mesh, Primitive } from '../catalogue/data.ts';
import { triangulate } from '../catalogue/geometry.ts';
import type { Vector3 } from '../orientation/index.ts';
import { Camera } from '../projection/index.ts';
import type { ErisPresentationDocument } from './documents.ts';
import { classifyPosition, coastlineInBodyUnits } from './islands.ts';
import type { BoundStructureSnapshot } from './save.ts';
import { structureMeshes, type CarriedSlot } from './selection.ts';
import {
  insideCentralCellHalf,
  withinDrawBound,
  type ErisIsland,
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
  /// Every structure and object placement the plan emitted, once per emission, in draw order.
  /// Ground records are not listed. An id appearing twice is an object drawn twice.
  readonly drawnPlacements: readonly string[];
  readonly farPlane: number;
  /// Triangles of the Body's base plane, which lead the vertex list.
  readonly fillTriangleCount: number;
  /// Triangles of the recovered per-cell ground records (pads, aprons, roads), which follow
  /// the Body's surface and precede every structure and object. Structure base planes share y = 0 with
  /// these, and Damocles's fill order for that tie is unrecovered; the renderer draws the
  /// ground records a hair behind so a building's pad lies over the cell's apron, as a
  /// painter's ground stream drawn before its structures would leave it.
  readonly groundTriangleCount: number;
  /// Triangles of the Damocles Island fills, which follow the base plane and precede the
  /// ground records. They are exactly coplanar with the base plane — the same surface painted
  /// a second colour, which is what land and sea are — so the renderer paints them over it in
  /// this order rather than asking the depth buffer to break a tie it cannot.
  readonly islandTriangleCount: number;
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

/// A wall text shares its face's plane and the game draws it after that face, so its glyphs
/// take the smallest face-order pull, the one that settles a ground record's later face.
const WALL_TEXT_ORDER = 1;

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
/// it. Where land begins is the island fills' business, not this one's (#394).
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
const islandFillTriangles = (
  island: ErisIsland,
  surface: ErisSurface,
  dropUnits: number,
  eye: Vector3
): readonly WorldTriangle[] => {
  const local = island.coastline.vertices;
  if (local.length < 3) {
    return [];
  }
  const corners = triangulate(
    local.map(([x, z]) => [x, 0, z] as const),
    local.map((_, index) => index)
  );
  const body = coastlineInBodyUnits(island, surface.grid, eye);
  const at = (index: number): Vector3 => ({
    x: body[index]![0],
    y: -dropUnits,
    z: body[index]![1]
  });
  const triangles: WorldTriangle[] = [];
  for (let i = 0; i < corners.length; i += 3) {
    const triangle: WorldTriangle = [
      at(corners[i]!),
      at(corners[i + 1]!),
      at(corners[i + 2]!)
    ];
    if (!degenerate(triangle)) {
      // Both faces, as the base plane under it has: an island is drawn from above on foot and
      // from below by nothing, but the pair costs two triangles and removes a facing question.
      triangles.push(triangle, [triangle[2], triangle[1], triangle[0]]);
    }
  }
  return triangles;
};

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
  daylight = false
): ErisFramePlan => {
  const camera = new Camera({
    farPlane: doc.camera.farPlane,
    heading: -pose.heading,
    nearPlane: doc.camera.nearPlane,
    pitch: pose.pitch,
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
  const enclosed = region !== undefined && (region.flags & 0x80_00) === 0;
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

  // Land and sea, in the order the Working Authority paints them ($0597EC..$05983C). The base
  // plane is the Body's own colour and every island is filled over it — except while the
  // player stands on an island's core, where the engine draws the ground plane in that
  // island's colour instead and the fill would only draw the ground underfoot a second time
  // at one depth (#394). In an enclosed region the plane is the structure's floor colour: an
  // infinite plane below the eye meets the sky at eye level, as the raster split does.
  const here = classifyPosition(surface, pose.position);
  const underfoot = here.kind === 'core' ? here.island : undefined;
  const base = background?.floor ?? underfoot?.landColour ?? surface.baseColour;
  // A Body with no recovered surface colour draws no plane at all rather than an invented one
  // (ADR 0043). No Body a Session stands on is in that state; the VOID slot is not a surface.
  if (base !== null) {
    const colour = channels(base);
    for (const triangle of basePlaneTriangles(
      doc.camera.farPlane,
      doc.ground.fillDropUnits,
      pose.position
    )) {
      for (const vertex of triangle) {
        emit(vertex, colour, 0);
      }
      triangleCount += 1;
    }
  }
  const fillTriangleCount = triangleCount;

  for (const island of enclosed ? [] : surface.islands) {
    if (island.id === underfoot?.id) {
      continue;
    }
    const colour = channels(island.landColour);
    for (const triangle of islandFillTriangles(
      island,
      surface,
      doc.ground.fillDropUnits,
      pose.position
    )) {
      for (const vertex of triangle) {
        emit(vertex, colour, 0);
      }
      triangleCount += 1;
    }
  }
  const islandTriangleCount = triangleCount - fillTriangleCount;

  const openUnits = new Map(
    structure?.attachments.map(item => [item.slot, item.openUnits]) ?? []
  );
  // Glyph fills and strokes both face either way: the game draws a wall text whenever its
  // face is drawn, from whichever side the player stands.
  const emitWallText = (
    mesh: Mesh,
    plane: 0 | 128,
    placement: ErisPlacement
  ): void => {
    const triangles = trianglesOf(mesh, daylight);
    skippedFaces += triangles.skipped;
    for (let i = 0; i < triangles.indices.length; i += 3) {
      const colour = triangles.colours[i / 3]!;
      const corners = [0, 1, 2].map(corner =>
        placed(
          mesh.vertices[triangles.indices[i + corner]!]!,
          placement,
          negateZ
        )
      );
      for (const vertex of [...corners, ...[...corners].reverse()]) {
        emit(vertex, colour, WALL_TEXT_ORDER);
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
        for (const triangle of doubleSidedQuad(
          placed(quad[0], placement, negateZ),
          placed(quad[1], placement, negateZ),
          placed(quad[2], placement, negateZ),
          placed(quad[3], placement, negateZ)
        )) {
          for (const vertex of triangle) {
            emit(vertex, colour, WALL_TEXT_ORDER);
          }
          triangleCount += 1;
        }
      }
    }
  };
  const emitPlacement = (placement: ErisPlacement): void => {
    const isBound = active && placement.id === structure?.instanceId;
    for (const mesh of structureMeshes(
      placement,
      pose,
      negateZ,
      slot => (isBound ? (openUnits.get(slot) ?? 0) : 0),
      isBound ? structure.regionIndex : null,
      carriedSlot
    )) {
      if (mesh.wallTextPlane !== undefined) {
        emitWallText(mesh, mesh.wallTextPlane, placement);
        continue;
      }
      const triangles = trianglesOf(mesh, daylight);
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
            const colour = channels(litColour(line, daylight));
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
  const drawn = enclosed
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
  for (const resident of residents) {
    emitPlacement(resident);
    drawnPlacements.push(resident.id);
  }

  return {
    // Outside an enclosed region `$059638` fills the sky with `$7C86`, the Body's day or night
    // word (#494). The VOID slot has no sky words and is not a surface a Session stands on, so
    // it clears to black rather than to an invented sky.
    clear: channels(
      background?.ceiling ??
        (surface.sky === null
          ? '#000000'
          : daylight
            ? surface.sky.day.colour
            : surface.sky.night.colour)
    ),
    drawnPlacements,
    farPlane: doc.camera.farPlane,
    fillTriangleCount,
    groundTriangleCount,
    islandTriangleCount,
    nearPlane: doc.camera.nearPlane,
    skippedFaces,
    triangleCount,
    verticalFieldOfViewDegrees: doc.camera.verticalFieldOfViewDegrees,
    vertices: new Float32Array(values)
  };
};
