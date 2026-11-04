import type { Mesh, Primitive } from '../catalogue/data.ts';
import type { Atmosphere } from '../enhanced/atmosphere.ts';
import {
  DEFAULT_ENHANCED_STROKES,
  planEnhancedFrame,
  type EnhancedFramePlan,
  type EnhancedStrokes
} from '../enhanced/frame.ts';
import { ENHANCED_PRESENTATION } from '../enhanced/presentation.ts';
import type {
  EnhancedPresentation,
  EnhancedSurface,
  Pose,
  SceneIsland,
  ScenePlacement
} from '../enhanced/scene.ts';
import { atan, tan } from '../math/index.ts';
import type { Vector3 } from '../orientation/index.ts';
import {
  REFERENCE_VERTICAL_FIELD_OF_VIEW,
  ReferenceViewport,
  isGroundInk,
  presentObjects,
  selectedCells,
  viewportScale,
  type Size
} from '../projection/index.ts';
import { ScenePalette, c64Colour, type RGB8 } from '../scene/index.ts';
import type { SessionSnapshot } from '../session/index.ts';
import type { StructureReach } from '../settings/index.ts';
import {
  Ink,
  SURFACE,
  isDetailed,
  objectSegments,
  room,
  type Polygon,
  type Segment,
  type World
} from '../world/index.ts';

/// Targ as the shared Enhanced planner draws it (ADR 0087).
///
/// Targ chooses what it draws by rules of its own, so this adapter keeps them and hands the
/// planner placements already selected: the Surface Cells its Structure Reach selects, and the
/// objects present where the player stands, each with its detail cube as its reach and its Far
/// Point, if it has one, eligible below the eye only within Horizon Distance. The planner draws
/// them: depth, layer order, strokes, Haze and the roads, which it selects from Targ's Map
/// Lines and Horizon Distance table as it does every Title's.
///
/// Ink and Line Colour become colours here. Black Ink resolves to black and is listed before
/// the white in each mesh, so a white line exactly over a black one wins its tie; an uncoloured
/// line or face takes the frame's Line Colour, and an authored colour passes through. A
/// structure's ground-level black Ink is drawn in the road layer rather than with the
/// structure.
///
/// The planner's camera is Damocles's, whose world is the mirror of Targ's. The Pose turns it
/// onto Targ's view seen in a mirror, and the plan is mirrored back across the view's vertical
/// (`mirrored`), which also gives the Room Targ draws mirrored for nothing.

export interface TargEnhancedScene {
  readonly placements: readonly ScenePlacement[];
  readonly pose: Pose;
  readonly surface: EnhancedSurface;
}

export interface TargSceneOptions {
  /// The Body's Atmosphere, which sets the surface's Haze. None indoors.
  readonly atmosphere: Atmosphere | null;
  /// The sky's colour at the horizon this frame: what Haze fades toward.
  readonly horizon: RGB8;
  readonly structureReach: StructureReach;
}

const hex = ({ blue, green, red }: RGB8): string =>
  `#${[red, green, blue].map(value => value.toString(16).padStart(2, '0')).join('')}`;

/// Targ's view as a Pose for the planner's camera, whose world is Targ's mirrored in z: half a
/// turn on the heading gives Targ's view mirrored across its vertical. Targ mirrors before it
/// banks, so the bank is reversed where the plan is mirrored back, and kept where the view is
/// meant to be mirrored.
export const targPose = (snapshot: SessionSnapshot): Pose => ({
  body: 'targ',
  heading: snapshot.player.heading - Math.PI,
  pitch: snapshot.player.pitch,
  position: snapshot.player.position,
  roll: (snapshot.worldFlipped ? 1 : -1) * (snapshot.player.roll ?? 0)
});

/// The vertical field of view Targ's projection gives a view of `size`, in degrees: the
/// Reference Viewport's frustum stretched to the view's height, as Authentic draws it.
export const targFieldOfView = (size: Size): number => {
  const focal =
    (ReferenceViewport.height / 2 / tan(REFERENCE_VERTICAL_FIELD_OF_VIEW / 2)) *
    viewportScale(size);
  return (2 * atan(size.height / 2 / focal) * 180) / Math.PI;
};

/// Targ's Horizon Distance table in 2048-unit steps: the road altitude lookup, held at its last
/// entry, then 64 from `$200000` up, where the whole surface is in reach.
const horizonDistances = new WeakMap<World, readonly number[]>();
const horizonDistancesOf = (world: World): readonly number[] => {
  let table = horizonDistances.get(world);
  if (table === undefined) {
    table = Array.from({ length: 0x20_00_00 / 2048 + 1 }, (_, index) =>
      world.horizonDistance(index * 2048)
    );
    horizonDistances.set(world, table);
  }
  return table;
};

const roadRuns = new WeakMap<
  World,
  { readonly corners: readonly number[]; readonly high: readonly number[] }
>();
const roadRunsOf = (world: World) => {
  let runs = roadRuns.get(world);
  if (runs === undefined) {
    runs = { corners: world.roadCorners(), high: world.highAltitudeRuns() };
    roadRuns.set(world, runs);
  }
  return runs;
};

const BLACK = hex(ScenePalette.blackInk);

/// Segments and faces about `origin` as a mesh: faces in their authored colour or Line Colour,
/// then black Ink, uncoloured white Ink in Line Colour, and authored line colours last.
export const targMesh = (
  origin: Vector3,
  segments: readonly Segment[],
  faces: readonly Polygon[],
  lineColour: RGB8
): Mesh => {
  const vertices: [number, number, number][] = [];
  const at = (point: Vector3): number => {
    vertices.push([point.x - origin.x, point.y - origin.y, point.z - origin.z]);
    return vertices.length - 1;
  };
  const line = hex(lineColour);
  const meshFaces: Primitive[] = faces.map(face => ({
    colour: face.colour === undefined ? line : hex(face.colour),
    ...(face.doubleSided ? { doubleSided: true } : {}),
    sourceColour: 0,
    vertices: face.vertices.map(at)
  }));
  const rank = (segment: Segment): number =>
    segment.colour !== undefined ? 2 : segment.ink === Ink.black ? 0 : 1;
  const lines: Primitive[] = [...segments]
    .sort((left, right) => rank(left) - rank(right))
    .map(segment => ({
      colour:
        segment.colour !== undefined
          ? hex(segment.colour)
          : segment.ink === Ink.black
            ? BLACK
            : line,
      sourceColour: segment.ink,
      vertices: [at(segment.a), at(segment.b)]
    }));
  return { faces: meshFaces, lines, vertices };
};

const placement = (
  id: string,
  kind: ScenePlacement['kind'],
  origin: Vector3,
  mesh: Mesh,
  reach?: ScenePlacement['reach']
): ScenePlacement => ({
  faceCount: mesh.faces.length,
  heading: 0,
  id,
  keyBase: null,
  kind,
  mesh,
  modelId: id,
  name: id,
  position: origin,
  ...(reach === undefined ? {} : { reach }),
  status: 'decoded'
});

/// One frame of Targ as the planner's scene: the structures and objects it draws, the ground,
/// the roads and the Haze.
export const targEnhancedScene = (
  world: World,
  snapshot: SessionSnapshot,
  options: TargSceneOptions
): TargEnhancedScene => {
  const position = snapshot.player.position;
  const indoor = snapshot.indoor;
  const roomId =
    snapshot.location.kind === 'room' ? snapshot.location.id : undefined;
  // Line Colour: white Ink on the surface, the Indoor Scene's wireframe colour in a Room.
  const lineColour =
    indoor === undefined
      ? ScenePalette.whiteInk
      : (c64Colour(indoor.lineColour) ?? ScenePalette.whiteInk);
  const placements: ScenePlacement[] = [];
  const groundInk: (readonly [Vector3, Vector3])[] = [];
  if (roomId === undefined) {
    for (const selected of selectedCells(
      world,
      position,
      options.structureReach,
      snapshot.elapsed
    )) {
      const own: Segment[] = [];
      for (const segment of selected.segments) {
        if (isGroundInk(segment)) {
          groundInk.push([segment.a, segment.b]);
        } else {
          own.push(segment);
        }
      }
      const origin = selected.cell.centre;
      placements.push(
        placement(
          `targ-cell-${selected.cell.index}`,
          'structure',
          origin,
          targMesh(origin, own, selected.faces, lineColour)
        )
      );
    }
  } else {
    const here = world.rooms.get(roomId);
    if (here !== undefined) {
      const origin = here.bounds.min;
      placements.push(
        placement(
          `targ-room-${roomId}`,
          'structure',
          origin,
          targMesh(origin, here.segments, [], lineColour)
        )
      );
    }
  }
  for (const { placed } of presentObjects(
    world,
    roomId === undefined ? SURFACE : room(roomId),
    snapshot.residence
  )) {
    placements.push(
      placement(
        `targ-object-${placed.slot}`,
        'object',
        placed.origin,
        targMesh(
          placed.origin,
          objectSegments(placed),
          placed.faces,
          lineColour
        ),
        {
          // The planner's reach is in 64 KiB cells, as Targ's detail cubes are.
          cells: placed.detailCube / 0x1_00_00,
          ...(placed.drawsFarAsPoint
            ? {
                point: {
                  belowEyeWithinHorizon: true,
                  colour: hex(ScenePalette.whiteInk)
                }
              }
            : {})
        }
      )
    );
  }
  const runs = roadRunsOf(world);
  const ground = hex(ScenePalette.ground);
  const city: SceneIsland = {
    // The whole city is land, with no coast: the ground underfoot everywhere.
    boxes: [
      { x: [0, world.cellsPerAxis - 1], z: [0, world.cellsPerAxis - 1] },
      { x: [0, world.cellsPerAxis - 1], z: [0, world.cellsPerAxis - 1] }
    ],
    coastline: { edges: [], vertices: [] },
    landColour: ground,
    origin: { x: 0, z: 0 },
    roads: {
      corners: runs.corners,
      highAltitude: { edges: runs.high, fromY: 0x20_00_00 },
      lines: groundInk,
      roadColour: BLACK
    }
  };
  const horizon = hex(options.horizon);
  const surface: EnhancedSurface = {
    atmosphere: roomId === undefined ? options.atmosphere : null,
    baseColour: roomId === undefined ? ground : null,
    floorLabelGlyphs: {},
    grid: {
      cellsPerAxis: world.cellsPerAxis,
      cellUnits: world.cellSize,
      origin: { x: 0, z: 0 }
    },
    horizonDistances: horizonDistancesOf(world),
    islands: roomId === undefined ? [city] : [],
    placements: [],
    // No sky indoors, and so no Haze.
    sky:
      roomId === undefined
        ? {
            day: { colour: horizon, sourceColour: 0 },
            night: { colour: horizon, sourceColour: 0 }
          }
        : null
  };
  return { placements, pose: targPose(snapshot), surface };
};

/// Whether a placement drawn from this scene was drawn whole rather than as its Far Point.
export const drawnWhole = (
  world: World,
  snapshot: SessionSnapshot,
  id: string
): boolean => {
  const slot = /^targ-object-(\d+)$/.exec(id)?.[1];
  if (slot === undefined) {
    return true;
  }
  const object = world.objects.find(item => item.slot === Number(slot));
  return object === undefined || isDetailed(object, snapshot.player.position);
};

/// Mirror a plan's ten-float triangles across the view's vertical, in place: x and the plane's
/// x turn over, and each triangle's second and third corners swap so its winding still faces
/// the way it did.
const mirrorTriangles = (vertices: Float32Array | undefined): void => {
  if (vertices === undefined) {
    return;
  }
  const stride = 10;
  for (let offset = 0; offset < vertices.length; offset += stride) {
    vertices[offset] = -vertices[offset]!;
    vertices[offset + 6] = -vertices[offset + 6]!;
  }
  for (
    let offset = 0;
    offset + 3 * stride <= vertices.length;
    offset += 3 * stride
  ) {
    const second = vertices.slice(offset + stride, offset + 2 * stride);
    vertices.copyWithin(
      offset + stride,
      offset + 2 * stride,
      offset + 3 * stride
    );
    vertices.set(second, offset + 2 * stride);
  }
};

/// Targ's camera for a view of `size`: the planner's, at Targ's own field of view.
export const targPresentation = (size: Size): EnhancedPresentation => ({
  ...ENHANCED_PRESENTATION,
  camera: {
    ...ENHANCED_PRESENTATION.camera,
    verticalFieldOfViewDegrees: targFieldOfView(size)
  }
});

/// The shared planner's frame of one Targ snapshot, in Targ's view.
export const planTargEnhancedFrame = (
  scene: TargEnhancedScene,
  snapshot: SessionSnapshot,
  size: Size,
  outputHeight: number,
  strokes: EnhancedStrokes = DEFAULT_ENHANCED_STROKES
): EnhancedFramePlan => {
  const plan = planEnhancedFrame(
    scene.surface,
    scene.pose,
    targPresentation(size),
    null,
    scene.placements,
    [],
    () => false,
    false,
    null,
    false,
    false,
    'whole',
    outputHeight,
    null,
    [],
    strokes
  );
  // The planner's view is Targ's mirrored; one Room is drawn mirrored on purpose.
  if (!snapshot.worldFlipped) {
    for (const vertices of [
      plan.vertices,
      plan.roadVertices,
      plan.glowVertices,
      plan.roadGlowVertices,
      plan.horizonVertices,
      plan.horizonIslandVertices,
      plan.skyVertices
    ]) {
      mirrorTriangles(vertices);
    }
  }
  return plan;
};
