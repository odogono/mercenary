import { OUT_OF_THE_WORLD, SURFACE_ROOM } from '../interaction/index.ts';
import { cos, sin, toFloat32 } from '../math/index.ts';
import {
  IDENTITY,
  apply,
  fromBytes,
  type Orientation,
  type Vector3
} from '../orientation/index.ts';
import type * as Doc from '../payload/documents.ts';

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
  readonly ink: Ink;
}

/// Where the player is. The surface is a Location in its own right and not a Room.
export type Location =
  { readonly kind: 'surface' } | { readonly id: number; readonly kind: 'room' };

/// Where one object currently is, when something has moved it from where the payload put it.
///
/// On the surface a position displaces the object from where the payload put it, which is what
/// happens to a craft the player parks somewhere else; its absence means the object is still
/// where the payload placed it.
export type Residence =
  | { readonly at?: Vector3; readonly kind: 'surface' }
  | { readonly at?: Vector3; readonly id: number; readonly kind: 'room' }
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

const vector = (x: number, y: number, z: number): Vector3 => ({
  x: toFloat32(x),
  y: toFloat32(y),
  z: toFloat32(z)
});

const ZERO: Vector3 = { x: 0, y: 0, z: 0 };

const point = (raw: readonly number[]): Vector3 =>
  raw.length === 3 ? vector(raw[0]!, raw[1]!, raw[2]!) : ZERO;

/// One placed object, kept as a model rather than pre-flattened segments so the renderer can
/// choose lines-or-point per frame.
export interface ObjectPlacement {
  /// Beyond this per-axis distance the object collapses to a point.
  readonly detailCube: number;
  readonly drawsFarAsPoint: boolean;
  readonly edges: readonly (readonly [number, number])[];
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

/// The object's own line segments, for when it is inside the detail cube.
export const objectSegments = (object: ObjectPlacement): Segment[] => {
  const out: Segment[] = [];
  for (const [start, end] of object.edges) {
    const a = object.vertices[start];
    const b = object.vertices[end];
    if (a === undefined || b === undefined) {
      continue;
    }
    out.push({ a, b, ink: Ink.white });
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

/// This instance at a live full position rather than its immutable payload position.
export const movedTo = (
  object: ObjectPlacement,
  position: { x: number; y: number; z: number }
): ObjectPlacement => {
  const destination = vector(position.x, position.y, position.z);
  const dx = toFloat32(destination.x - object.origin.x);
  const dy = toFloat32(destination.y - object.origin.y);
  const dz = toFloat32(destination.z - object.origin.z);
  return {
    ...object,
    origin: destination,
    vertices: object.vertices.map(v => vector(v.x + dx, v.y + dy, v.z + dz))
  };
};

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

/// The Reference Build advances a structure's phase once per completed geometry frame, which at
/// cell 8:8 is approximately every ten PAL frames.
const REFERENCE_FRAMES_PER_SECOND = 5;
/// Its sine routine uses the low byte within a quadrant and the low two bits of the high byte to
/// select the four quadrants: one turn is therefore `$0400`.
const ANGLE_UNITS_PER_TURN = 1024;

const signedByte = (value: number): number =>
  (value & 0x80) === 0 ? value & 0xff : (value & 0xff) - 0x1_00;

interface SurfaceRotation {
  readonly centre: { readonly x: number; readonly y: number };
  readonly descriptor: number;
}

const resolveRotation = (
  rotation: SurfaceRotation,
  input: readonly [number, number, number],
  elapsed: number
): Vector3 => {
  const step = (rotation.descriptor & 0xf0) >> 1;
  // The original advanced the phase in whole steps once per geometry frame, about five times a
  // second, which at sixty frames a second reads as a stutter rather than a spin. The rate is
  // the decoded one; letting the phase run continuously between its steps is a presentation
  // adaptation, in the same spirit as drawing the one-cell ring of structures.
  const phase = Math.max(0, elapsed) * REFERENCE_FRAMES_PER_SECOND;
  const angle = ((phase * step) / ANGLE_UNITS_PER_TURN) * (2 * Math.PI);
  // SETUP_STRUCTURE_POINTERS passes the source byte to `BIT24_TO_FP` as the high byte of a
  // twenty-four bit value, so the float it gets back is the byte shifted left sixteen; it then
  // subtracts $28 from the exponent byte, which is ten powers of two. That leaves a signed ×64
  // displacement, a quarter of the middle-byte unit the surface's own points are placed in. Only
  // the independently stored Y byte is in that middle-byte (×256) unit itself.
  const localX = signedByte(input[0]) << 6;
  const localZ = signedByte(input[2]) << 6;
  const cosine = cos(angle);
  const sine = sin(angle);
  return vector(
    rotation.centre.x + localX * cosine - localZ * sine,
    input[1] << 8,
    rotation.centre.y + localX * sine + localZ * cosine
  );
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
  private readonly vertices: readonly SurfaceVertex[];
  private readonly edges: readonly SurfaceEdge[];
  private readonly rotation: SurfaceRotation | undefined;

  constructor(fields: {
    centre: Vector3;
    column: number;
    edges: readonly SurfaceEdge[];
    index: number;
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
    this.rotation = fields.rotation;
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

  /// Resolve runtime-rotated points and return the cell's complete wireframe.
  segments(elapsed: number): Segment[] {
    const points = this.vertices.map(vertex =>
      vertex.kind === 'world'
        ? vertex.point
        : this.rotation === undefined
          ? ZERO
          : resolveRotation(this.rotation, vertex.input, elapsed)
    );
    const out: Segment[] = [];
    for (const edge of this.edges) {
      const a = points[edge.start];
      const b = points[edge.end];
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
/// decoded fact.
///
/// Every instance is placed, including those in Rooms and those parked outside the grid, so the
/// inspector can see all sixty-four. The renderer filters by `isDrawable`.
const placements = (
  bundle: Doc.Bundle,
  groundExtent: number
): ObjectPlacement[] => {
  const models = new Map<string, Doc.Model>();
  for (const model of bundle.objects.models) {
    models.set(model.id, model);
  }

  const out: ObjectPlacement[] = [];
  for (const instance of bundle.objects.instances) {
    const model = models.get(instance.model);
    if (model === undefined || instance.position.length !== 3) {
      continue;
    }
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
    let lowest = local[0]!.y;
    for (const v of local) {
      lowest = Math.min(lowest, v.y);
    }
    const placed = local.map(v =>
      vector(v.x + origin.x, v.y - lowest + origin.y, v.z + origin.z)
    );
    const edges: [number, number][] = [];
    for (const edge of model.edges) {
      if (edge.length === 2) {
        edges.push([edge[0]!, edge[1]!]);
      }
    }

    out.push({
      detailCube: toFloat32(instance.visibility.detailCubePerAxis),
      drawsFarAsPoint: instance.visibility.farRepresentation === 'point',
      edges,
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
  readonly cellSize: number;
  readonly cellsPerAxis: number;
  readonly groundExtent: number;
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
    this.groundExtent = toFloat32(cellSize * cellsPerAxis);

    const cells: WorldCell[] = [];
    const byGrid = new Map<number, number>();
    for (const cell of bundle.surface.cells) {
      const column =
        cell.grid.length === 2 ? cell.grid[0]! : cell.cell % cellsPerAxis;
      const row =
        cell.grid.length === 2
          ? cell.grid[1]!
          : Math.floor(cell.cell / cellsPerAxis);
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
      const rotation =
        cell.rotation !== undefined && cell.rotation.center.length === 2
          ? {
              centre: {
                x: (column << 16) + (cell.rotation.center[0]! << 8),
                y: (row << 16) + (cell.rotation.center[1]! << 8)
              },
              descriptor: cell.rotation.descriptor
            }
          : undefined;
      byGrid.set(row * cellsPerAxis + column, cells.length);
      cells.push(
        new WorldCell({
          centre: vector((column + 0.5) * cellSize, 0, (row + 0.5) * cellSize),
          column,
          edges,
          index: cell.cell,
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
    if (this.roadAltitudeLookup.length === 0) {
      return [];
    }
    const altitudeIndex = Math.min(this.roadAltitudeLookup.length - 1, y >> 11);
    const extent = Math.max(0, this.roadAltitudeLookup[altitudeIndex]!);
    const currentCell = row * this.cellsPerAxis + column;
    const selected: SurfaceMapLine[] = [];
    const seen = new Set<number>();
    const key = (line: SurfaceMapLine): number => {
      const low = Math.min(line.startPacked, line.endPacked);
      const high = Math.max(line.startPacked, line.endPacked);
      return low * 65_536 + high;
    };

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
      for (const line of this.mapLinesByCell.get(currentCell) ?? []) {
        const k = key(line);
        if (!seen.has(k)) {
          seen.add(k);
          selected.push(line);
        }
      }
    }
    return selected.map(line => line.segment);
  }
}
