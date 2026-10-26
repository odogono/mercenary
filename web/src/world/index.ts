import { triangulate } from '../catalogue/geometry.ts';
import type {
  Colour,
  Face,
  GeometryAsset,
  Vertex
} from '../geometry/contract.ts';
import {
  composeObjects,
  composeSurface,
  structurePresentation
} from '../geometry/targ.ts';
import { OUT_OF_THE_WORLD, SURFACE_ROOM } from '../interaction/index.ts';
import { cos, sin, toFloat32 } from '../math/index.ts';
import {
  IDENTITY,
  apply,
  fromBytes,
  type HeadingConvention,
  type Orientation,
  type Vector3
} from '../orientation/index.ts';
import type * as Doc from '../payload/documents.ts';
import type { RGB8 } from '../scene/index.ts';
import { wrapSurfaceAxis } from './surfaceCoordinates.ts';
import {
  cellGrid,
  resolveRotation,
  surfaceRotation,
  vector,
  type SurfaceRotation
} from './surfaceGeometry.ts';

/// The render-ready world, derived from a payload Bundle.
///
/// Geometry is stored in binary32 throughout, because the kit stores it in `SIMD3<Float>` and a
/// projection Golden Trace records what that rounding produced. Arithmetic that the kit widens
/// to `Double` is widened here too and narrowed at the same boundary — `toFloat32` marks every
/// one of those points. Carrying double precision through would produce a world that was
/// slightly more accurate and did not reproduce.

/// How a line should be drawn. The Reference Build's surface expansion splits a structure's
/// edges into two ink operations; they read as a bright and a dim pass over the same wireframe.
export const Ink = { black: 1, white: 0 } as const;
export type Ink = (typeof Ink)[keyof typeof Ink];

export interface Segment {
  readonly a: Vector3;
  readonly b: Vector3;
  /// An authored colour, drawn in place of the ink's; only Targ object lines carry one.
  readonly colour?: RGB8;
  readonly ink: Ink;
}

/// A Geometry Asset face in world space. Explicit lines remain a separate drawing pass.
///
/// Colour and triangulation are resolved once when the face is loaded: every later transform is
/// rigid, so the triangles stay valid as the face moves, turns or spins.
export interface Polygon {
  readonly colour: RGB8;
  readonly doubleSided: boolean;
  /// Indices into `vertices`, three per triangle, ear-clipped so concave outlines keep notches.
  readonly triangles: readonly number[];
  readonly vertices: readonly Vector3[];
}

const BLACK: RGB8 = { blue: 0, green: 0, red: 0 };
/// Line Colour, the colour uncoloured Targ primitives draw in: white ink, as the wireframe is.
const LINE_COLOUR: RGB8 = { blue: 255, green: 255, red: 255 };

const paletteRGB = (colour: string): RGB8 => {
  const rgb = Number.parseInt(colour.slice(1), 16);
  return { blue: rgb & 255, green: (rgb >> 8) & 255, red: rgb >> 16 };
};

const faceColour = (colour: Colour | undefined): RGB8 => {
  if (colour?.kind === 'palette') {
    return paletteRGB(colour.colour);
  }
  return colour?.kind === 'ink' && colour.ink === 1 ? BLACK : LINE_COLOUR;
};

/// A line's authored colour, or undefined for one that draws in its ink.
export const lineColour = (colour: Colour | undefined): RGB8 | undefined =>
  colour?.kind === 'palette' ? paletteRGB(colour.colour) : undefined;

/// Each drawable face's loop resolved to the part's vertices; walking geometry never enters
/// the view.
const assetFaces = <T>(
  asset: GeometryAsset,
  resolve: (vertex: Vertex) => T
): { readonly face: Face; readonly loop: readonly T[] }[] =>
  asset.parts
    .filter(part => part.role !== 'walk' && part.faces.length > 0)
    .flatMap(part => {
      const byId = new Map(
        part.vertices.map(vertex => [vertex.id, resolve(vertex)])
      );
      return part.faces.map(face => ({
        face,
        loop: face.loop.map(id => byId.get(id)!)
      }));
    });

/// A face ready to draw, from its source colour and sidedness and its world-space loop.
export const facePolygon = (
  face: Pick<Face, 'colour' | 'doubleSided'>,
  vertices: readonly Vector3[]
): Polygon => ({
  colour: faceColour(face.colour),
  doubleSided: face.doubleSided === true,
  triangles: triangulate(
    vertices.map(v => [v.x, v.y, v.z] as const),
    vertices.map((_, i) => i)
  ),
  vertices
});

/// The same faces with every vertex carried by a rigid transform.
export const mapFaces = (
  faces: readonly Polygon[],
  transform: (point: Vector3) => Vector3
): Polygon[] =>
  faces.map(face => ({ ...face, vertices: face.vertices.map(transform) }));

/// The occupied Surface Cell's two road runs in the four point slots the Reference Build
/// reserves for them: road 0's end and start, then road 1's end and start.
export type RoadWorkspace = readonly [
  Vector3 | undefined,
  Vector3 | undefined,
  Vector3 | undefined,
  Vector3 | undefined
];

const resolvedPoint = (
  points: readonly Vector3[],
  workspace: RoadWorkspace | undefined,
  index: number
): Vector3 | undefined =>
  index >= 60 && index < 64 ? workspace?.[index - 60] : points[index];

/// Where the player is. The surface is a Location in its own right and not a Room.
export type Location =
  { readonly kind: 'surface' } | { readonly id: number; readonly kind: 'room' };

/// Where one object currently is, when something has moved it from where the payload put it.
///
/// On the surface a position displaces the object from where the payload put it, which is what
/// happens to a craft the player parks somewhere else; its absence means the object is still
/// where the payload placed it.
export type Residence =
  | {
      readonly at?: Vector3;
      readonly heading?: number;
      readonly kind: 'surface';
    }
  | {
      readonly at?: Vector3;
      readonly heading?: number;
      readonly id: number;
      readonly kind: 'room';
    }
  | { readonly kind: 'carried' }
  | { readonly kind: 'gone' };

/// How the Host Callout's room-membership table names a Residence.
export const hostRoom = (residence: Residence): number => {
  switch (residence.kind) {
    case 'surface':
      return SURFACE_ROOM;
    case 'room':
      return residence.id;
    case 'carried':
    case 'gone':
      return OUT_OF_THE_WORLD;
  }
};

export const isCarried = (residence: Residence): boolean =>
  residence.kind === 'carried';

/// Where this object has been moved to, if it has been.
export const displacement = (residence: Residence): Vector3 | undefined =>
  residence.kind === 'surface' || residence.kind === 'room'
    ? residence.at
    : undefined;

export const SURFACE: Location = { kind: 'surface' };
export const room = (id: number): Location => ({ id, kind: 'room' });

/// How a Location reads in chrome: the surface, or a two-digit Room.
///
/// One spelling, so the status strip, the panel and the Save chooser cannot disagree about
/// where the player is.
export const locationText = (location: Location): string =>
  location.kind === 'surface'
    ? 'SURFACE'
    : `ROOM ${String(location.id).padStart(2, '0')}`;

export const locationHostValue = (location: Location): number =>
  location.kind === 'surface' ? SURFACE_ROOM : location.id;

export const locationFromHost = (value: number): Location =>
  value === SURFACE_ROOM ? SURFACE : room(value);

export const sameLocation = (a: Location, b: Location): boolean =>
  a.kind === b.kind &&
  (a.kind !== 'room' || b.kind !== 'room' || a.id === b.id);

const ZERO: Vector3 = { x: 0, y: 0, z: 0 };

const point = (raw: readonly number[]): Vector3 =>
  raw.length === 3 ? vector(raw[0]!, raw[1]!, raw[2]!) : ZERO;

/// One placed object, kept as a model rather than pre-flattened segments so the renderer can
/// choose lines-or-point per frame.
export interface ObjectPlacement {
  /// Beyond this per-axis distance the object collapses to a point.
  readonly detailCube: number;
  readonly drawsFarAsPoint: boolean;
  /// Each edge's authored colour, by edge index; absent or undefined draws in Line Colour.
  readonly edgeColours?: readonly (RGB8 | undefined)[];
  readonly edges: readonly (readonly [number, number])[];
  readonly faces: readonly Polygon[];
  readonly id: string;
  readonly model: string;
  readonly orientation: Orientation;
  /// Where the object sits, and the point its far representation is drawn at.
  readonly origin: Vector3;
  /// "surface" or "room". Room instances carry room-local coordinates, so they are inspectable
  /// but must not be drawn on the surface.
  readonly placement: string;
  readonly room: number;
  readonly slot: number;
  readonly stateFlags: number;
  /// World-space vertices, with orientation already applied.
  readonly vertices: readonly Vector3[];
  /// False when the position falls outside the world grid — several slots are parked far beyond
  /// it rather than placed.
  readonly withinWorld: boolean;
}

/// A craft's Mover heading, decoded from the orientation bytes its payload
/// placement carries. Model-local -Z and heading zero now name the same forward
/// direction. Object orientation uses six-bit turns, as `apply` does.
export const craftHeading = (
  craft: ObjectPlacement,
  convention: HeadingConvention = 'reference'
): number => {
  if (convention === 'traceOracle') {
    const turn = ((craft.orientation.y & 0xff) / 256) * 2 * Math.PI;
    return (turn + Math.PI) % (2 * Math.PI);
  }
  return ((craft.orientation.y & 0x3f) / 64) * 2 * Math.PI;
};

/// The object's own line segments, for when it is inside the detail cube.
export const objectSegments = (object: ObjectPlacement): Segment[] => {
  const out: Segment[] = [];
  for (const [index, [start, end]] of object.edges.entries()) {
    const a = object.vertices[start];
    const b = object.vertices[end];
    if (a === undefined || b === undefined) {
      continue;
    }
    const colour = object.edgeColours?.[index];
    out.push(
      colour === undefined
        ? { a, b, ink: Ink.white }
        : { a, b, colour, ink: Ink.white }
    );
  }
  return out;
};

/// Whether this instance belongs in the scene the player is looking at.
///
/// A room object is drawn when the player is in its room, by the same detail-cube and
/// point-collapse rules a surface object gets: the Reference Build has one object drawing path
/// and asks only which objects are present. `residence` is where the object has got to when
/// something has moved it; undefined means it is still where the payload put it.
export const isDrawable = (
  object: ObjectPlacement,
  location: Location,
  residence?: Residence
): boolean => {
  const where: Residence =
    residence ??
    (object.placement === 'surface'
      ? { kind: 'surface' }
      : { id: object.room, kind: 'room' });
  switch (where.kind) {
    case 'carried':
    case 'gone':
      // In the player's hands, or out of the world with the craft they are flying.
      return false;
    case 'surface':
      return (
        sameLocation(location, SURFACE) &&
        (where.at !== undefined || object.withinWorld)
      );
    case 'room':
      return sameLocation(location, room(where.id));
  }
};

/// True when every axis is within the detail cube, so the wireframe is drawn.
export const isDetailed = (
  object: ObjectPlacement,
  position: { x: number; y: number; z: number }
): boolean => {
  const cube = object.detailCube;
  return (
    Math.abs(object.origin.x - position.x) <= cube &&
    Math.abs(object.origin.y - position.y) <= cube &&
    Math.abs(object.origin.z - position.z) <= cube
  );
};

/// Carry everything an object draws, wireframe and faces alike, through one transform.
const transformed = (
  object: ObjectPlacement,
  origin: Vector3,
  transform: (point: Vector3) => Vector3
): ObjectPlacement => ({
  ...object,
  faces: mapFaces(object.faces, transform),
  origin,
  vertices: object.vertices.map(transform)
});

/// This instance at a live full position rather than its immutable payload position.
export const movedTo = (
  object: ObjectPlacement,
  position: { x: number; y: number; z: number }
): ObjectPlacement => {
  const destination = vector(position.x, position.y, position.z);
  const dx = toFloat32(destination.x - object.origin.x);
  const dy = toFloat32(destination.y - object.origin.y);
  const dz = toFloat32(destination.z - object.origin.z);
  return transformed(object, destination, v =>
    vector(v.x + dx, v.y + dy, v.z + dz)
  );
};

/// Turn an already placed craft from its payload heading to a live heading.
///
/// A model whose orientation byte is zero faces decreasing Z at heading zero.
/// Rotate about the placement origin so a
/// parked craft retains the direction in which the player landed it.
const turnedToHeading = (
  object: ObjectPlacement,
  heading: number | undefined
): ObjectPlacement => {
  if (heading === undefined) {
    return object;
  }
  const angle = heading - craftHeading(object);
  const sine = sin(angle);
  const cosine = cos(angle);
  const turn = (vertex: Vector3): Vector3 => {
    const x = vertex.x - object.origin.x;
    const z = vertex.z - object.origin.z;
    return vector(
      object.origin.x + z * sine + x * cosine,
      vertex.y,
      object.origin.z + z * cosine - x * sine
    );
  };
  return transformed(object, object.origin, turn);
};

/// Resolve a live Object Residence into the placement presentation draws.
///
/// A leave transition records a grounded craft at the walking eye altitude.
/// World geometry is grounded by its lowest vertex, so presentation removes
/// that low-byte eye offset from a player-parked craft. This works with both
/// decoded and configured eye heights; the Colony Craft deck has already
/// cleared its low byte, so it remains on the high-altitude deck plane.
/// Airborne craft positions and non-craft objects stay exact.
export const placedAtResidence = (
  world: World,
  object: ObjectPlacement,
  residence: Residence,
  location: Location
): ObjectPlacement => {
  const moved = displacement(residence);
  const turned =
    residence.kind === 'surface' || residence.kind === 'room'
      ? turnedToHeading(object, residence.heading)
      : object;
  if (moved === undefined) {
    return location.kind === 'surface'
      ? atUnsignedSurfacePosition(turned)
      : turned;
  }
  const lowByte = ((Math.trunc(moved.y) % 0x1_00) + 0x1_00) % 0x1_00;
  const playerParked =
    object.slot < world.craftSlotBound &&
    (residence.kind === 'surface' || residence.kind === 'room') &&
    residence.heading !== undefined;
  const legacySurfaceGrounding =
    residence.kind === 'surface' &&
    object.slot < world.craftSlotBound &&
    lowByte === world.groundAltitude;
  const groundingOffset = playerParked
    ? lowByte
    : legacySurfaceGrounding
      ? world.groundAltitude
      : 0;
  return movedTo(
    turned,
    groundingOffset === 0 ? moved : { ...moved, y: moved.y - groundingOffset }
  );
};

/// A surface object's stored coordinates are signed only because the extractor
/// needs one ordinary JSON number for a 24-bit bit-pattern. The live machine
/// reads the same bits as an unsigned surface position.
export const atUnsignedSurfacePosition = (
  object: ObjectPlacement
): ObjectPlacement =>
  movedTo(object, {
    x: wrapSurfaceAxis(object.origin.x),
    y: object.origin.y,
    z: wrapSurfaceAxis(object.origin.z)
  });

/// One full surface map line decoded from a road-table endpoint pair.
interface SurfaceMapLine {
  readonly endPacked: number;
  readonly segment: Segment;
  readonly slot: number;
  readonly startPacked: number;
}

type SurfaceVertex =
  | { readonly kind: 'world'; readonly point: Vector3 }
  | {
      readonly input: readonly [number, number, number];
      readonly kind: 'rotated';
    };

interface SurfaceEdge {
  readonly end: number;
  readonly ink: Ink;
  readonly start: number;
}

interface SurfaceShape {
  readonly edges: readonly SurfaceEdge[];
  readonly vertices: readonly SurfaceVertex[];
}

const surfaceShape = (cell: Doc.SurfaceCell): SurfaceShape => {
  const vertices: SurfaceVertex[] = cell.vertices.map(vertex => {
    if (vertex.kind === 'world-point' && vertex.position !== undefined) {
      return { kind: 'world', point: point(vertex.position) };
    }
    const raw = vertex.rotationInput ?? [];
    return {
      input: raw.length === 3 ? [raw[0]!, raw[1]!, raw[2]!] : [0, 0, 0],
      kind: 'rotated'
    };
  });
  const edges: SurfaceEdge[] = [];
  for (const edge of cell.edges) {
    if (edge.length !== 3) {
      continue;
    }
    const ink: Ink = edge[2] === Ink.black ? Ink.black : Ink.white;
    edges.push({ end: edge[1]!, ink, start: edge[0]! });
  }
  return { edges, vertices };
};

/// One grid cell's drawable content, kept together so the renderer can cull by cell before
/// touching individual segments.
export class WorldCell {
  readonly index: number;
  readonly column: number;
  readonly row: number;
  /// Stable identity of the shared surface-structure record used by this cell.
  readonly structure: string | undefined;
  /// Centre of the cell on the ground plane, for distance culling.
  readonly centre: Vector3;
  /// The structure's own Structure Reach: `cell` never draws it as a Distant Structure.
  readonly reach: 'all' | 'cell';
  private readonly vertices: readonly SurfaceVertex[];
  private readonly edges: readonly SurfaceEdge[];
  private readonly distant: SurfaceShape | undefined;
  private readonly rotation: SurfaceRotation | undefined;
  /// Each face's loop as surface vertices, beside its triangulation at rest.
  private readonly faceSources: readonly {
    readonly loop: readonly SurfaceVertex[];
    readonly polygon: Polygon;
  }[];
  /// The faces themselves when none of their vertices spin.
  private readonly restingFaces: readonly Polygon[] | undefined;

  constructor(fields: {
    asset?: GeometryAsset;
    centre: Vector3;
    column: number;
    distant?: SurfaceShape;
    edges: readonly SurfaceEdge[];
    index: number;
    reach?: 'all' | 'cell';
    rotation: SurfaceRotation | undefined;
    row: number;
    structure: string | undefined;
    vertices: readonly SurfaceVertex[];
  }) {
    this.index = fields.index;
    this.column = fields.column;
    this.row = fields.row;
    this.structure = fields.structure;
    this.centre = fields.centre;
    this.vertices = fields.vertices;
    this.edges = fields.edges;
    this.distant = fields.distant;
    this.reach = fields.reach ?? 'all';
    this.rotation = fields.rotation;
    this.faceSources =
      fields.asset === undefined
        ? []
        : assetFaces(fields.asset, (vertex): SurfaceVertex =>
            vertex.runtime === undefined
              ? { kind: 'world', point: point(vertex.co) }
              : { input: vertex.runtime.input, kind: 'rotated' }
          ).map(({ face, loop }) => ({
            loop,
            polygon: facePolygon(
              face,
              loop.map(vertex => this.resolve(vertex, 0))
            )
          }));
    this.restingFaces = this.faceSources.every(({ loop }) =>
      loop.every(vertex => vertex.kind === 'world')
    )
      ? this.faceSources.map(({ polygon }) => polygon)
      : undefined;
  }

  private resolve(vertex: SurfaceVertex, elapsed: number): Vector3 {
    return vertex.kind === 'world'
      ? vertex.point
      : this.rotation === undefined
        ? ZERO
        : resolveRotation(this.rotation, vertex.input, elapsed);
  }

  get vertexCount(): number {
    return this.vertices.length;
  }

  get edgeCount(): number {
    return this.edges.length;
  }

  /// Edges whose endpoint lives in the Reference Build's shared road-point workspace rather than
  /// this structure's local vertex list.
  get unresolvedEdgeCount(): number {
    return this.edges.filter(
      edge =>
        this.vertices[edge.start] === undefined ||
        this.vertices[edge.end] === undefined
    ).length;
  }

  /// Faces use the same live rotation as the cell's lines, with no Road Workspace index limit.
  faces(elapsed: number): readonly Polygon[] {
    return (
      this.restingFaces ??
      this.faceSources.map(({ loop, polygon }) => ({
        ...polygon,
        vertices: loop.map(vertex => this.resolve(vertex, elapsed))
      }))
    );
  }

  /// Resolve runtime-rotated and Road Workspace points and return the cell's wireframe.
  segments(elapsed: number, workspace?: RoadWorkspace): Segment[] {
    return this.resolveShape(this.wireframe, elapsed, workspace);
  }

  /// What the cell draws as a Distant Structure: its own distant part when its Geometry Asset
  /// has one, otherwise its wireframe. A Distant Structure has no Road Workspace.
  distantSegments(elapsed: number): Segment[] {
    return this.resolveShape(
      this.distant ?? this.wireframe,
      elapsed,
      undefined
    );
  }

  private get wireframe(): SurfaceShape {
    return { edges: this.edges, vertices: this.vertices };
  }

  private resolveShape(
    { edges, vertices }: SurfaceShape,
    elapsed: number,
    workspace: RoadWorkspace | undefined
  ): Segment[] {
    const points = vertices.map(vertex => this.resolve(vertex, elapsed));
    const out: Segment[] = [];
    for (const edge of edges) {
      const a = resolvedPoint(points, workspace, edge.start);
      const b = resolvedPoint(points, workspace, edge.end);
      if (a === undefined || b === undefined) {
        continue;
      }
      out.push({ a, b, ink: edge.ink });
    }
    return out;
  }
}

/// One underground Room's wireframe, ready to draw.
///
/// A Room is a world of its own: its coordinates are room-local, and the Reference Build draws
/// one Room at a time rather than a neighbourhood, so there is no cell ring and no distance
/// culling to do.
export interface Room {
  readonly bounds: { readonly max: Vector3; readonly min: Vector3 };
  /// Dark unless the photon emitter is carried or lying in this Room.
  readonly dark: boolean;
  /// This Room's own openings, each carrying the directed Room Link it leads along.
  readonly doorways: readonly Doc.Doorway[];
  readonly entry: Doc.Entry | undefined;
  readonly id: number;
  readonly palette: Doc.Palette;
  readonly segments: readonly Segment[];
  readonly specialSetup: Doc.SpecialSetup | undefined;
}

const buildRoom = (document: Doc.RoomDocument): Room => {
  const points = document.vertices.map(position =>
    position.length === 3
      ? vector(position[0]!, position[1]!, position[2]!)
      : ZERO
  );
  const segments: Segment[] = [];
  for (const edge of document.edges) {
    if (edge.length !== 2) {
      continue;
    }
    const a = points[edge[0]!];
    const b = points[edge[1]!];
    if (a === undefined || b === undefined) {
      continue;
    }
    segments.push({ a, b, ink: Ink.white });
  }
  return {
    bounds: {
      max: point(document.bounds.max),
      min: point(document.bounds.min)
    },
    dark: document.dark,
    doorways: document.doorways,
    entry: document.entry,
    id: document.room,
    palette: document.palette,
    segments,
    specialSetup: document.specialSetup
  };
};

const mapLine = (
  raw: Doc.RoadSegment,
  cellSize: number
): SurfaceMapLine | undefined => {
  if (raw.from.length !== 2 || raw.to.length !== 2) {
    return undefined;
  }
  return {
    endPacked: (raw.to[1]! << 4) | raw.to[0]!,
    segment: {
      a: vector(
        (raw.from[0]! + 0.5) * cellSize,
        0,
        (raw.from[1]! + 0.5) * cellSize
      ),
      b: vector(
        (raw.to[0]! + 0.5) * cellSize,
        0,
        (raw.to[1]! + 0.5) * cellSize
      ),
      ink: Ink.black
    },
    slot: raw.slot,
    startPacked: (raw.from[1]! << 4) | raw.from[0]!
  };
};

/// Place every surface instance's model in world space.
///
/// Model-local orientation is applied first, as the Reference Build does, and only for the
/// rotatable slots. Model vertices are centred on their own bounding cube, so an instance
/// position does not by itself say where the base sits; the model is grounded so its lowest
/// vertex lands on the instance's height. That grounding is a modernised-feel judgement, not a
/// decoded fact. The Colony Craft is the exception: its highest vertex belongs on the decoded
/// deck plane (the landing altitude with its eye-height low byte cleared), so grounding the model
/// would lift the rendered deck above the landed camera.
///
/// Every instance is placed, including those in Rooms and those parked outside the grid, so the
/// inspector can see all sixty-four. The renderer filters by `isDrawable`.
const placements = (
  bundle: Doc.Bundle,
  groundExtent: number
): ObjectPlacement[] => {
  // Composition maps each Geometry Asset to its model record in order, so the pair stays
  // together: the record draws the wireframe and the asset draws the faces.
  const models = new Map(
    composeObjects(bundle.objects).models.map((model, i) => [
      model.id,
      { asset: bundle.objects.models[i]!.asset, model }
    ])
  );

  const out: ObjectPlacement[] = [];
  for (const instance of bundle.objects.instances) {
    const source = models.get(instance.model);
    if (source === undefined || instance.position.length !== 3) {
      continue;
    }
    const { asset, model } = source;
    const origin = point(instance.position);
    const withinWorld =
      origin.x >= 0 &&
      origin.x <= groundExtent &&
      origin.z >= 0 &&
      origin.z <= groundExtent;

    const orientation = instance.rotatable
      ? (fromBytes(instance.orientation) ?? IDENTITY)
      : IDENTITY;
    const local = model.vertices.map(v => apply(orientation, point(v)));
    if (local.length === 0) {
      continue;
    }
    let highest = local[0]!.y;
    let lowest = local[0]!.y;
    for (const v of local) {
      highest = Math.max(highest, v.y);
      lowest = Math.min(lowest, v.y);
    }
    const colonyCraft = bundle.endgame.orbitalTransition;
    const deckPlane =
      (colonyCraft.entry.altitudeHighByte << 16) |
      (colonyCraft.entry.wrappedAltitudeMiddleByte << 8);
    const groundingOffset =
      instance.slot === bundle.rooms.doorwayRules.colonyCraftSlot
        ? origin.y + highest - deckPlane
        : lowest;
    const placed = local.map(v =>
      vector(v.x + origin.x, v.y - groundingOffset + origin.y, v.z + origin.z)
    );
    // The record's edges are the wireframe part's lines in order, so a line's colour is its edge's.
    const lines = asset.parts.find(part => part.role === 'wireframe')?.lines;
    const edges: [number, number][] = [];
    const edgeColours: (RGB8 | undefined)[] = [];
    for (const [index, edge] of model.edges.entries()) {
      if (edge.length === 2) {
        edges.push([edge[0]!, edge[1]!]);
        edgeColours.push(lineColour(lines?.[index]?.colour));
      }
    }

    const faces = assetFaces(asset, vertex => {
      const v = apply(orientation, point(vertex.co));
      return vector(
        v.x + origin.x,
        v.y - groundingOffset + origin.y,
        v.z + origin.z
      );
    }).map(({ face, loop }) => facePolygon(face, loop));
    out.push({
      detailCube: toFloat32(instance.visibility.detailCubePerAxis),
      drawsFarAsPoint: instance.visibility.farRepresentation === 'point',
      ...(edgeColours.some(colour => colour !== undefined)
        ? { edgeColours }
        : {}),
      edges,
      faces,
      id: instance.id,
      model: instance.model,
      orientation,
      origin,
      placement: instance.placement,
      room: instance.room,
      slot: instance.slot,
      stateFlags: instance.stateFlags,
      vertices: placed,
      withinWorld
    });
  }
  return out;
};

export class World {
  readonly cells: readonly WorldCell[];
  readonly objects: readonly ObjectPlacement[];
  /// Immutable fixed-screen effects decoded from the Data Payload. Whether an
  /// effect is active remains Session Snapshot state, not cached World state.
  readonly objectEffects: Doc.ObjectEffectsDocument;
  readonly cellSize: number;
  readonly cellsPerAxis: number;
  readonly craftSlotBound: number;
  readonly groundAltitude: number;
  readonly groundExtent: number;
  /// Raw structure-edge instances whose local endpoint is a Road Workspace point. Retained as
  /// the historical Trace Oracle diagnostic; the occupied cell resolves them when it draws.
  readonly deferredEdges: number;
  /// The underground Rooms, by their own identifiers.
  readonly rooms: ReadonlyMap<number, Room>;
  readonly doorwayRules: Doc.DoorwayRules;
  /// Altitude-indexed square extent used to select road-table cells.
  readonly roadAltitudeLookup: readonly number[];

  /// Cells indexed by `row * cellsPerAxis + column`, mirroring the payload's packed cell
  /// numbering, for constant-time neighbourhood lookup while culling.
  private readonly byGrid: ReadonlyMap<number, number>;
  private readonly mapLinesByCell: ReadonlyMap<
    number,
    readonly SurfaceMapLine[]
  >;
  private readonly highAltitudeMap: readonly SurfaceMapLine[];

  constructor(bundle: Doc.Bundle) {
    const cellSize = toFloat32(bundle.world.grid.cellSize);
    const cellsPerAxis = bundle.world.grid.cellsPerAxis;
    this.cellSize = cellSize;
    this.cellsPerAxis = cellsPerAxis;
    this.craftSlotBound = bundle.interaction?.craftSlotBound ?? 0;
    this.groundAltitude = bundle.flight?.rules.groundAltitude ?? 0;
    this.groundExtent = toFloat32(cellSize * cellsPerAxis);
    this.objectEffects = bundle.objectEffects;

    const cells: WorldCell[] = [];
    const byGrid = new Map<number, number>();
    const surface = composeSurface(bundle.surface);
    for (const [i, cell] of surface.cells.entries()) {
      const { column, row } = cellGrid(cell, cellsPerAxis);
      const { edges, vertices } = surfaceShape(cell);
      const presentation = structurePresentation(bundle.surface.cells[i]!);
      const rotation = surfaceRotation(cell, cellsPerAxis);
      byGrid.set(row * cellsPerAxis + column, cells.length);
      cells.push(
        new WorldCell({
          asset: bundle.surface.cells[i]!.asset,
          centre: vector((column + 0.5) * cellSize, 0, (row + 0.5) * cellSize),
          column,
          ...(presentation.distant === undefined
            ? {}
            : { distant: surfaceShape(presentation.distant) }),
          edges,
          index: cell.cell,
          reach: presentation.reach,
          rotation,
          row,
          structure: cell.structure,
          vertices
        })
      );
    }
    this.cells = cells;
    this.byGrid = byGrid;
    this.deferredEdges = cells.reduce(
      (total, cell) => total + cell.unresolvedEdgeCount,
      0
    );

    const rooms = new Map<number, Room>();
    for (const document of bundle.rooms.rooms) {
      rooms.set(document.room, buildRoom(document));
    }
    this.rooms = rooms;
    this.doorwayRules = bundle.rooms.doorwayRules;

    this.roadAltitudeLookup = bundle.world.roadAltitudeLookup;
    const mapLinesByCell = new Map<number, SurfaceMapLine[]>();
    for (const roadCell of bundle.world.roadCells) {
      const lines: SurfaceMapLine[] = [];
      for (const segment of roadCell.segments) {
        const line = mapLine(segment, cellSize);
        if (line !== undefined) {
          lines.push(line);
        }
      }
      mapLinesByCell.set(roadCell.cell, lines);
    }
    this.mapLinesByCell = mapLinesByCell;
    const high: SurfaceMapLine[] = [];
    for (const segment of bundle.world.highAltitudeMap) {
      const line = mapLine(segment, cellSize);
      if (line !== undefined) {
        high.push(line);
      }
    }
    this.highAltitudeMap = high;

    this.objects = placements(bundle, toFloat32(cellSize * cellsPerAxis));
  }

  cell(column: number, row: number): WorldCell | undefined {
    // Range-check before packing: a negative column would otherwise alias onto the previous row
    // and duplicate that cell's geometry at the world edges.
    if (
      column < 0 ||
      column >= this.cellsPerAxis ||
      row < 0 ||
      row >= this.cellsPerAxis
    ) {
      return undefined;
    }
    const index = this.byGrid.get(row * this.cellsPerAxis + column);
    return index === undefined ? undefined : this.cells[index];
  }

  /// The occupied Surface Cell's road endpoints as LOAD_MAP_LOD1 places them in point slots
  /// 60...63. A missing road run leaves both of its slots unresolved.
  roadWorkspace(cell: WorldCell): RoadWorkspace {
    const lines = this.mapLinesByCell.get(cell.index) ?? [];
    const road0 = lines.find(line => line.slot === 0);
    const road1 = lines.find(line => line.slot === 1);
    return [
      road0?.segment.b,
      road0?.segment.a,
      road1?.segment.b,
      road1?.segment.a
    ];
  }

  /// The Reference Build's altitude-derived surface reach, measured in Surface Cells.
  horizonDistance(y: number): number {
    const altitude = Math.max(0, Math.floor(y));
    if (altitude >> 16 >= 0x20) {
      return 64;
    }
    if (this.roadAltitudeLookup.length === 0) {
      return 0;
    }
    const index = Math.min(this.roadAltitudeLookup.length - 1, altitude >> 11);
    return Math.max(0, this.roadAltitudeLookup[index]!);
  }

  /// Select the Reference Build's map lines for one camera position.
  mapSegments(position: { x: number; y: number; z: number }): Segment[] {
    const column = Math.floor(position.x / this.cellSize);
    const row = Math.floor(position.z / this.cellSize);
    if (
      column < 0 ||
      column >= this.cellsPerAxis ||
      row < 0 ||
      row >= this.cellsPerAxis
    ) {
      return [];
    }

    const y = Math.max(0, Math.floor(position.y));
    if (y >> 16 >= 0x20) {
      return this.highAltitudeMap.map(line => line.segment);
    }
    const extent = this.horizonDistance(y);
    const currentCell = row * this.cellsPerAxis + column;
    const selected: SurfaceMapLine[] = [];
    const seen = new Set<number>();
    const key = (line: SurfaceMapLine): number => {
      const low = Math.min(line.startPacked, line.endPacked);
      const high = Math.max(line.startPacked, line.endPacked);
      return low * 65_536 + high;
    };
    const currentLines = this.mapLinesByCell.get(currentCell) ?? [];
    for (const line of currentLines) {
      seen.add(key(line));
    }

    // L8EC2 exits before scanning the road tables when the altitude lookup returns zero. It is a
    // no-roads sentinel, not a zero-radius selection.
    if (extent > 0) {
      for (
        let selectedRow = Math.max(0, row - extent);
        selectedRow <= Math.min(this.cellsPerAxis - 1, row + extent);
        selectedRow++
      ) {
        for (
          let selectedColumn = Math.max(0, column - extent);
          selectedColumn <= Math.min(this.cellsPerAxis - 1, column + extent);
          selectedColumn++
        ) {
          const lookupCell = selectedRow * this.cellsPerAxis + selectedColumn;
          for (const line of this.mapLinesByCell.get(lookupCell) ?? []) {
            if (
              currentCell !== 0 &&
              (line.startPacked === currentCell ||
                line.endPacked === currentCell)
            ) {
              continue;
            }
            const k = key(line);
            if (!seen.has(k)) {
              seen.add(k);
              selected.push(line);
            }
          }
        }
      }
    }

    // Above the first 64 KiB the Reference Build draws the current lookup cell's stored runs
    // separately, after suppressing structure endpoints.
    if (y >> 16 !== 0) {
      const added = new Set<number>();
      for (const line of currentLines) {
        const k = key(line);
        if (!added.has(k)) {
          added.add(k);
          selected.push(line);
        }
      }
    }
    return selected.map(line => line.segment);
  }
}
