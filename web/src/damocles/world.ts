import {
  fieldCopy,
  modelSummaryById,
  type BodySky,
  type Catalogue,
  type FloorPalette,
  type IslandBoxKind,
  type LocationEntry,
  type Mesh,
  type Model,
  type Primitive,
  type StructureSelection
} from '../catalogue/data.ts';
import type { ModelLookup } from '../catalogue/modelStore.ts';
import { nearestIsland } from '../coast/islands.ts';
import type { PlacementForms } from '../enhanced/forms.ts';
import {
  cellOf,
  type EnhancedSurface,
  type Pose,
  type SceneBackground,
  type SceneCell,
  type SceneGrid,
  type SceneIsland,
  type ScenePlacement
} from '../enhanced/scene.ts';
import type { Vector3 } from '../orientation/index.ts';
import type { ErisPresentationDocument } from './documents.ts';

export { nearestIsland, islandOriginNear } from '../coast/islands.ts';
export {
  cellOf,
  insideCentralCellHalf,
  withinDrawBound,
  type Pose,
  type SceneBackground
} from '../enhanced/scene.ts';

/// Eris's names for the shared scene's grid, cell and placement.
export type ErisGrid = SceneGrid;
export type ErisCell = SceneCell;
export type ErisPlacement = ScenePlacement;

/// The Eris surface as the Damocles Gameplay Session walks it: the Damocles Catalogue's
/// recovered placements on one Body, in raw engine units, with the authored document saying
/// how cells, headings and gaps are read (ADR 0043).

/// A Body's surface is this many Surface Cells an axis and wraps on both: `$058F64` masks the
/// body position's high word to twelve bits before anything is measured from it, so no Body
/// Coordinate is off the surface and two far apart in number may be neighbours (#397).
export const SURFACE_CELLS = 0x10_00;

/// One record of the Body's island list at `$7A16`, as the Session reads it: where a Damocles
/// Island sits on the surface, what shape it is, and what colour it is painted.
///
/// The origin is what an Island-Local Cell is counted from. The coastline and the boxes are
/// island-local and carried verbatim, because `classifyPosition` replays the staged test at
/// `$0560F2` over them rather than deriving one: the core box is authored and smaller than the
/// 16-cell workspace on three of Eris's five islands, so nothing recovers it from the polygon.
///
/// A record carries no name of its own; `areaName` is the name of the area the workspace it
/// binds publishes, and is null where it binds none (docs/research/damocles-eris-islands.md).
export interface ErisIsland extends SceneIsland {
  readonly areaName: string | null;
  /// The backwards box list `$0560F2` reads, in its own order: box 0 the extent, box 1 the
  /// core, the rest exclusions. Bounds are island-local and half-open.
  readonly boxes: readonly {
    readonly kind: IslandBoxKind;
    readonly x: readonly [number, number];
    readonly z: readonly [number, number];
  }[];
  /// The closed coastline, island-local, and the edge words `$0561CE` scans. Empty on the 21
  /// records that share the coastline-less stub, which is land everywhere.
  readonly coastline: {
    readonly edges: readonly number[];
    readonly vertices: readonly (readonly [number, number])[];
  };
  readonly id: string;
  /// The record's `+8`, which `$04EB46` publishes to `$7A1A`: the colour this island is filled
  /// in, and the colour the ground plane itself takes while the player stands on its core.
  readonly landColour: string;
  /// The bound group's location-trigger table `[$7A68]`, in table order.
  readonly locationTable: readonly LocationEntry[];
  readonly origin: ErisCell;
  /// The Settlement's corner grid and flat road ink, selected with this island.
  readonly roads?:
    | Pick<Catalogue['roadNetworks'][number], 'corners' | 'roadColour'>
    | undefined;
  /// The record's `+6`, the structure group whose workspace it binds, 0 for none.
  readonly structureGroup: number;
}

export interface ErisPlace {
  readonly cell: ErisCell;
  readonly id: string;
  readonly name: string;
}

/// A colour word's two halves: `colour` through the palette `$050562` binds while the Body is
/// dark, and `dayColour` through the one it binds in daylight where the two differ (#497).
interface Halves {
  readonly colour: string;
  readonly dayColour?: string;
}

/// The background two scene colours give, where both are resolved.
const sceneBackground = (
  ceiling: Halves | undefined,
  floor: Halves | undefined
): SceneBackground | undefined =>
  ceiling === undefined || floor === undefined
    ? undefined
    : {
        ceiling: ceiling.colour,
        ...(ceiling.dayColour === undefined && floor.dayColour === undefined
          ? {}
          : {
              day: {
                ceiling: ceiling.dayColour ?? ceiling.colour,
                floor: floor.dayColour ?? floor.colour
              }
            }),
        floor: floor.colour
      };

export interface ErisSurface extends EnhancedSurface<ErisIsland> {
  /// The colour `$7C88` draws this Body's surface in wherever no island is painted over it:
  /// its sea, on a Body that has one. Null on the VOID slot, which is not a surface.
  readonly baseColour: string | null;
  readonly body: { readonly id: string; readonly name: string };
  /// A uniform field's copies in one Surface Cell, by Body Coordinate, where the Body is one
  /// (#172). Absent on every other Body. Read it through `fieldCopiesAt`.
  readonly field?: (x: number, z: number) => readonly ErisPlacement[];
  /// The Catalogue's Floor Label glyphs by font, which every Floor Label record draws from.
  readonly floorLabelGlyphs: Catalogue['floorLabelGlyphs'];
  readonly grid: ErisGrid;
  /// This Body's island records, in list order. Empty where the Body carries none.
  readonly islands: readonly ErisIsland[];
  readonly placements: readonly ErisPlacement[];
  readonly places: readonly ErisPlace[];
  /// The Body's day and night sky words, which the terminator chooses between for `$7C86`.
  /// Null on the VOID slot, which is not a surface.
  readonly sky: BodySky | null;
  /// Placements whose model has no recovered faces: drawn as nothing, counted as a gap
  /// (ADR 0043).
  readonly unresolvedCount: number;
}

const wrapSurface = (cell: number): number =>
  ((cell % SURFACE_CELLS) + SURFACE_CELLS) % SURFACE_CELLS;

/// The same gap taken signed, which is what sign-extending to 28 bits leaves.
///
/// This is the helper a consumer needs before it may treat Body Coordinates as numbers at all.
/// The surface is a torus, so the arithmetic difference of two Body Coordinates is not the
/// distance between them: Snow Island reaches body x = −8, which is 4088, and anything that
/// subtracts a bounded rectangle's worth of cells tears the island in half at the seam.
export const surfaceOffset = (from: number, origin: number): number => {
  const gap = wrapSurface(from - origin);
  return gap >= SURFACE_CELLS / 2 ? gap - SURFACE_CELLS : gap;
};

/// The Body Coordinate a raw-unit position falls in: a Surface Cell from the Body's own origin,
/// wrapped onto the surface torus, which is the quantity `$7A92`/`$7A9A` keep.
export const bodyCellOf = (position: Vector3, grid: ErisGrid): ErisCell => ({
  x: wrapSurface(Math.floor(position.x / grid.cellUnits)),
  z: wrapSurface(Math.floor(position.z / grid.cellUnits))
});

/// The island record the Working Authority measures from: the one nearest the player's Body
/// Coordinate, which `$056490` keeps in `$7894` and `$056464` publishes the origin of.
///
/// The metric itself is unrecovered — `$056490` reads tables at `$60000`, `$64000` and `$4BD34`
/// that the islands note did not decode. Every observed selection matched a plain nearest-origin
/// reading, so that is what this measures, on the wrapping surface rather than on a plane. It
/// will matter where two records sit close together, as Lachesis's ten do
/// (docs/research/damocles-eris-islands.md, "Named gaps").
/// The Island-Local Cell of a position: its Body Coordinate less the island's origin, taken
/// signed across the wrap, which is the high word `$058F88`..`$058F96` publishes to `$7A2C`.
///
/// It is signed and unbounded, and it agrees with the bound workspace's own 0-15 cell only
/// while the position is inside that 16-cell window.
export const islandLocalCell = (
  position: Vector3,
  grid: ErisGrid,
  island: ErisIsland
): ErisCell => {
  const here = bodyCellOf(position, grid);
  return {
    x: surfaceOffset(here.x, island.origin.x),
    z: surfaceOffset(here.z, island.origin.z)
  };
};

/** The one structure workspace selected by the current surface cell. */
export const structureInCell = (
  surface: ErisSurface,
  position: Vector3
): ErisPlacement | undefined => {
  const current = cellOf(position, surface.grid);
  return [...surface.placements, ...fieldCopiesAt(surface, position)].find(
    placement =>
      placement.selection !== undefined &&
      placement.kind === 'structure' &&
      cellOf(placement.position, surface.grid).x === current.x &&
      cellOf(placement.position, surface.grid).z === current.z
  );
};

/// A uniform field's structure and ground in the Surface Cell `position` stands in (#172).
///
/// Every cell of the field holds them, and the Catalogue stores only the copies a resident
/// stands in, so the rest are built here, at the position's own cell and named by its Body
/// Coordinate. Empty off a field, and in a cell whose copies the surface already holds, so a
/// stored copy is never drawn twice.
export const fieldCopiesAt = (
  surface: ErisSurface,
  position: Vector3
): readonly ErisPlacement[] => {
  if (surface.field === undefined) {
    return [];
  }
  const here = bodyCellOf(position, surface.grid);
  const copies = surface.field(here.x, here.z);
  if (
    copies.some(copy => surface.placements.some(item => item.id === copy.id))
  ) {
    return [];
  }
  const shift = {
    x:
      (Math.floor(position.x / surface.grid.cellUnits) - here.x) *
      surface.grid.cellUnits,
    z:
      (Math.floor(position.z / surface.grid.cellUnits) - here.z) *
      surface.grid.cellUnits
  };
  return shift.x === 0 && shift.z === 0
    ? copies
    : copies.map(copy => ({
        ...copy,
        position: {
          ...copy.position,
          x: copy.position.x + shift.x,
          z: copy.position.z + shift.z
        }
      }));
};

/// The placement an id names on this surface: one it holds, or a uniform field's copy.
export const placementById = (
  surface: ErisSurface,
  id: string
): ErisPlacement | undefined => {
  const held = surface.placements.find(placement => placement.id === id);
  if (held !== undefined || surface.field === undefined) {
    return held;
  }
  const match = /-(\d+)-(\d+)$/.exec(id);
  return match === null
    ? undefined
    : surface
        .field(Number(match[1]), Number(match[2]))
        .find(placement => placement.id === id);
};

/// The surface as the frame draws it at `position`: with the field's copies in that cell.
export const withFieldAt = (
  surface: ErisSurface,
  position: Vector3
): ErisSurface => {
  const copies = fieldCopiesAt(surface, position);
  return copies.length === 0
    ? surface
    : { ...surface, placements: [...surface.placements, ...copies] };
};

const TURN = 2 * Math.PI;

const wrapBearing = (bearing: number): number => {
  const wrapped = bearing % TURN;
  return wrapped < 0 ? wrapped + TURN : wrapped;
};

/// The Damocles camera yaw word as a bearing clockwise from north, under the recovered
/// convention the document states: `yawUnitsPerTurn` per turn, `yawNorth` facing north,
/// rising to the right (#204).
export const bearingFromYaw = (
  yaw: number,
  orientation: ErisPresentationDocument['orientation']
): number =>
  wrapBearing(
    ((yaw - orientation.yawNorth) / orientation.yawUnitsPerTurn) * TURN
  );

/// The Damocles pitch word `$7AC0` as the Camera's tilt in radians.
///
/// It counts the same units a turn as the yaw word, reads `pitchLevel` looking at the horizon,
/// and rises putting the nose *down* — so the Camera, which pitches positive looking up, takes
/// the negated turn (docs/research/damocles-arrival-routes.md).
export const pitchFromWord = (
  pitch: number,
  orientation: ErisPresentationDocument['orientation']
): number =>
  ((orientation.pitchLevel - pitch) / orientation.yawUnitsPerTurn) * TURN;

/// A Damocles Instance angle byte as the mesh's turn about +Y, clockwise seen from above.
///
/// The byte is 256 steps per turn — a quarter of the camera yaw word, which is why the
/// document's `yawUnitsPerTurn` cancels out of this — and it turns the model as modelled:
/// byte 0 leaves the mesh alone. Boarding publishes it as camera yaw byte × 4 with no
/// offset ($054390), so a craft modelled nose-toward local −Z reads as facing south at
/// byte 0. That is a fact about the meshes, not about this turn. An Instance with no byte
/// is drawn as modelled (#204, #361).
export const headingFromByte = (byte: number | null): number =>
  byte === null ? 0 : wrapBearing((byte / 256) * TURN);

/// The turn the Working Authority draws one placed Instance with.
///
/// `$053548` sums the Instance's own angle byte with the model record's `$8001` bias byte,
/// and `$0536F6` only turns the record at all when that record asked for the single-Y path.
/// A model without `$8001` is drawn as modelled however the Instance's byte reads, so the
/// bias belongs to the model and the byte to the Instance (#361).
export const placementHeading = (model: Model, byte: number | null): number => {
  const instance = model.instanceOrientation;
  if (instance === undefined || instance.rotation !== 'yaw') {
    return 0;
  }
  return headingFromByte(((byte ?? 0) + instance.angleBiasByte) & 0xff);
};

export const startPose = (doc: ErisPresentationDocument): Pose => ({
  body: doc.body.id,
  heading: bearingFromYaw(doc.start.yaw, doc.orientation),
  pitch: pitchFromWord(doc.start.pitch, doc.orientation),
  position: doc.start.position
});

/// Authored fallback for an unavailable selector or an unmatched region. Inspection-only
/// residents are excluded via walkMesh; a missing named view remains a document error.
const structureMesh = (
  model: Model,
  structureFallback: ErisPresentationDocument['structureFallback']
): Mesh | undefined => {
  const withFaces = model.variants.filter(
    variant => variant.mesh.faces.length > 0
  );
  const tagged = withFaces.filter(variant => variant.view !== undefined);
  if (tagged.length === 0) {
    return withFaces[0]?.mesh;
  }
  const ofView = tagged.filter(
    variant => variant.view === structureFallback.view
  );
  const chosen =
    ofView.find(variant => variant.doorState === structureFallback.doorState) ??
    ofView[0];
  if (chosen === undefined) {
    throw new Error(
      `Damocles model ${model.id} has no ${structureFallback.view} variant to draw`
    );
  }
  return chosen.walkMesh ?? chosen.mesh;
};

/// The one surface the session walks, for a named Body anchored at a named workspace origin.
///
/// The Body and the origin are the only two things that vary between Bodies: the cell size,
/// the orientation convention and the structure fallback are payload-wide. A body switch
/// therefore rebuilds this rather than storing a second world (#347).
export interface SurfaceAnchor {
  readonly bodyId: string;
  readonly origin: { readonly x: number; readonly z: number };
}

/// The Models a Body's workspace draws, in the order a player standing at `position` needs
/// them: first the island they stand on, together with the few Instances that name no island;
/// then each other island in turn (ADR 0048). Each wave is read whole before it is drawn, so an
/// island's structures appear together rather than one by one.
export const modelWaves = (
  catalogue: Catalogue,
  surface: ErisSurface,
  position: Vector3
): readonly (readonly string[])[] => {
  const arrival = nearestIsland(surface, position)?.id ?? null;
  const byIsland = new Map<string | null, Set<string>>([[arrival, new Set()]]);
  for (const instance of catalogue.instances) {
    const location = instance.location;
    if (location === null || location.body !== surface.body.id) {
      continue;
    }
    const key = location.island ?? arrival;
    let wave = byIsland.get(key);
    if (wave === undefined) {
      wave = new Set();
      byIsland.set(key, wave);
    }
    wave.add(instance.model);
  }
  return [...byIsland.values()]
    .map(wave => [...wave])
    .filter(wave => wave.length > 0);
};

/// A structure Model's selector together with the interior detail it binds, or undefined where
/// it has none or the interior is not in hand.
const placementSelection = (
  model: Model,
  models: ModelLookup
): ErisPlacement['selection'] => {
  const selection = model.structureSelection;
  const detail =
    selection === undefined ? undefined : models.peek(selection.detailModel);
  const [ceiling, floor] = (model.sceneColours ?? []).map(entry =>
    entry.colour === undefined ? undefined : { ...entry, colour: entry.colour }
  );
  const background = sceneBackground(ceiling, floor);
  return selection === undefined || detail?.detailSelection === undefined
    ? undefined
    : {
        ...(background === undefined ? {} : { background }),
        boxes: detail.boxes ?? { supports: [], walls: [] },
        detail: detail.variants.find(v => v.id === selection.detailVariant)!
          .mesh,
        extent: detail.extent ?? null,
        groups: detail.detailSelection,
        structure: selection
      };
};

/// The Model a Floor is drawn and walked with: its form in the binding instance's frame where
/// the extractor publishes one, otherwise the structure its Floor Table entry binds (#531).
export const floorModelId = (
  entry: NonNullable<Model['levelBinding']>['floors'][number]
): string => entry.drawnStructureId ?? entry.structureId;

/// The Floors a structure placement's Floor Table binds, each with the structure Model it binds.
/// Empty where its Model has no Floor Table or is not in hand.
export const floorsOf = (
  placement: ErisPlacement,
  models: ModelLookup
): NonNullable<Model['levelBinding']>['floors'] =>
  models.peek(placement.modelId)?.levelBinding?.floors ?? [];

/// A colour word through the Floor's palette: `$80xx` with bit 7 set names entry
/// `(word & $7E) / 2` of the palette bound in `$7A0E`, in both its halves; any other word
/// keeps its own colours. The structure's own `dayColour` belongs to its own palette, so the
/// Floor's day half replaces it rather than falling back to it.
const paletteColours = (
  item: Halves & { readonly sourceColour: number },
  palette: FloorPalette
): Halves => {
  const entry = (item.sourceColour & 0x7e) >> 1;
  const colour =
    (item.sourceColour & 0x80_80) === 0x80_80
      ? palette.colours[entry]
      : undefined;
  if (colour === undefined || colour === null) {
    return item.dayColour === undefined
      ? { colour: item.colour }
      : { colour: item.colour, dayColour: item.dayColour };
  }
  const dayColour = palette.dayColours?.[entry] ?? colour;
  return dayColour === colour ? { colour } : { colour, dayColour };
};

/// `item` with its colours replaced by `halves`, dropping a `dayColour` the halves do not carry.
const withHalves = <T extends Halves>(item: T, halves: Halves): T => {
  const { dayColour: _, ...rest } = item;
  return { ...rest, ...halves } as T;
};

const recolourPrimitive = (
  primitive: Primitive,
  palette: FloorPalette
): Primitive => withHalves(primitive, paletteColours(primitive, palette));

const recolourMesh = (mesh: Mesh, palette: FloorPalette): Mesh => ({
  ...mesh,
  faces: mesh.faces.map(face => recolourPrimitive(face, palette)),
  lines: mesh.lines.map(line => recolourPrimitive(line, palette))
});

const recolourStructure = (
  structure: StructureSelection,
  palette: FloorPalette
): StructureSelection => ({
  ...structure,
  attachments: structure.attachments.map(attachment => ({
    ...attachment,
    mesh: recolourMesh(attachment.mesh, palette)
  })),
  ...(structure.floorLabels === undefined
    ? {}
    : {
        floorLabels: structure.floorLabels.map(label =>
          withHalves(label, paletteColours(label, palette))
        )
      }),
  plan: recolourMesh(structure.plan, palette),
  ...(structure.wallTexts === undefined
    ? {}
    : {
        wallTexts: structure.wallTexts.map(text => ({
          ...text,
          ...(text.fallback === undefined
            ? {}
            : {
                fallback: {
                  ...text.fallback,
                  mesh: recolourMesh(text.fallback.mesh, palette)
                }
              }),
          mesh: recolourMesh(text.mesh, palette)
        }))
      })
});

/// One recolouring per structure Model and palette, so a Floor's selector keeps its identity
/// however often it is bound: residence and draw caches compare it by reference.
const floorSelections = new WeakMap<
  Model,
  WeakMap<FloorPalette, NonNullable<ErisPlacement['selection']>>
>();

/// A Floor's selector drawn through the palette its alias record binds (`$054DB4`, `$055B2E`),
/// not the one the bound structure's own record names. Scene colours follow the same palette.
const floorSelection = (
  model: Model,
  models: ModelLookup,
  palette: FloorPalette | undefined
): ErisPlacement['selection'] => {
  const selection = placementSelection(model, models);
  if (selection === undefined || palette === undefined) {
    return selection;
  }
  let byPalette = floorSelections.get(model);
  if (byPalette === undefined) {
    byPalette = new WeakMap();
    floorSelections.set(model, byPalette);
  }
  let recoloured = byPalette.get(palette);
  if (recoloured === undefined) {
    const [ceiling, floor] = (model.sceneColours ?? []).map(entry =>
      entry.colour === undefined
        ? undefined
        : paletteColours({ ...entry, colour: entry.colour }, palette)
    );
    const background = sceneBackground(ceiling, floor);
    const { background: _, ...unbacked } = selection;
    recoloured = {
      ...unbacked,
      ...(background === undefined ? {} : { background }),
      detail: recolourMesh(selection.detail, palette),
      structure: recolourStructure(selection.structure, palette)
    };
    byPalette.set(palette, recoloured);
  }
  return recoloured;
};

/// A bound structure placement as it stands on one Floor. Floor 0 is the ground bind the
/// surface already holds; any other Floor takes its selector from the structure its Floor Table
/// entry binds (`$055BD8`), coloured through the palette the entry names. Undefined where the
/// table binds no structure at that Floor, or that structure's Model or interior is not in hand
/// yet. Nothing here derives a Floor from height.
export const floorPlacement = (
  placement: ErisPlacement,
  models: ModelLookup,
  floor: number
): ErisPlacement | undefined => {
  const entry = floorsOf(placement, models).find(item => item.level === floor);
  if (entry === undefined) {
    return undefined;
  }
  if (floor === 0) {
    return placement;
  }
  const model = models.peek(floorModelId(entry));
  const palette = models
    .peek(placement.modelId)
    ?.levelBinding?.palettes?.find(
      item => item.paletteIndex === entry.paletteIndex
    );
  const selection =
    model === undefined ? undefined : floorSelection(model, models, palette);
  return selection === undefined ? undefined : { ...placement, selection };
};

/// One located Instance as the surface places it, or undefined while its Model is not in hand.
/// The forms a model offers the Enhanced planner's per-frame chooser, or undefined where it
/// draws one form whatever the frame (#805). `own` is the form drawn with no clock; `slot` is
/// the resident slot a beacon's phase word is read for.
export const placementForms = (
  model: Model,
  own: string,
  slot: number | null
): PlacementForms | undefined => {
  const mesh =
    model.variants.find(variant => variant.id === own)?.mesh ??
    model.variants[0]?.mesh;
  const phase = slot === null ? undefined : model.flash?.phases[String(slot)];
  const offers =
    phase !== undefined ||
    model.variants.some(variant => /^frame-\d+$/.test(variant.id)) ||
    mesh?.viewGroups !== undefined ||
    mesh?.articulation !== undefined ||
    mesh?.textAnimations !== undefined;
  if (!offers) {
    return undefined;
  }
  return {
    ...(phase === undefined || model.flash === undefined
      ? {}
      : { flash: { gateSlot: model.flash.gateSlot, phase } }),
    own,
    variants: model.variants
  };
};

/// An object's reach (#817): one cell, or its `$800C` range, and the point it is drawn as past
/// it, where it has one.
export const objectReach = (
  model: Model
): NonNullable<ErisPlacement['reach']> => ({
  cells: model.drawRange ?? 1,
  ...(model.farPoint === undefined
    ? {}
    : { point: { colour: model.farPoint.colour } })
});

/// A resident instance's slot, `object-slot-<n>`, or null for any other instance.
export const residentSlot = (instance: string): number | null => {
  const match = /^object-slot-(\d+)$/.exec(instance);
  return match === null ? null : Number(match[1]);
};

const placementOf = (
  instance: Catalogue['instances'][number],
  models: ModelLookup,
  doc: ErisPresentationDocument,
  grid: ErisGrid
): ErisPlacement | undefined => {
  const location = instance.location!;
  const model = models.peek(instance.model);
  if (model === undefined) {
    return undefined;
  }
  const drawn = structureMesh(model, doc.structureFallback);
  const mesh =
    model.cellNumber === undefined || drawn === undefined
      ? drawn
      : withCellNumber(
          drawn,
          model.cellNumber,
          Math.floor(location.position[0]),
          Math.floor(location.position[2])
        );
  const selection = placementSelection(model, models);
  const own = model.variants.find(variant => variant.mesh === drawn)?.id;
  const forms =
    model.kind !== 'object' || own === undefined
      ? undefined
      : placementForms(model, own, residentSlot(instance.id));
  return {
    ...(selection === undefined ? {} : { selection }),
    ...(forms === undefined ? {} : { forms }),
    ...(model.kind === 'object' ? { reach: objectReach(model) } : {}),
    faceCount: mesh?.faces.length ?? 0,
    heading: placementHeading(model, location.heading),
    id: instance.id,
    keyBase: instance.keyBase,
    kind: model.kind,
    mesh,
    modelId: model.id,
    name: instance.name,
    position: {
      x: location.position[0] * grid.cellUnits,
      y: location.position[1] * grid.cellUnits,
      z: location.position[2] * grid.cellUnits
    },
    status: model.status
  };
};

/// The eight digits `$05504E` writes for Body Coordinate x, z: x shifted up twelve bits, ORed
/// with z, in decimal, most significant first.
export const fieldCellNumber = (x: number, z: number): string =>
  (((x << 12) | z) % 100_000_000).toString().padStart(8, '0');

const shiftedBy = (primitive: Primitive, offset: number): Primitive => ({
  ...primitive,
  vertices: primitive.vertices.map(index => index + offset)
});

/// A field ground's mesh with its cell's number painted on: each of the eight places takes the
/// glyph of its own digit (docs/research/damocles-midas-field.md).
const withCellNumber = (
  base: Mesh,
  cellNumber: NonNullable<Model['cellNumber']>,
  x: number,
  z: number
): Mesh => {
  const digits = fieldCellNumber(x, z);
  let vertices = [...base.vertices];
  const faces = [...base.faces];
  const lines = [...base.lines];
  for (const place of cellNumber.places) {
    const glyph = place.glyphs[digits[place.digit]!]!;
    const offset = vertices.length;
    vertices = [...vertices, ...glyph.vertices];
    faces.push(...glyph.faces.map(face => shiftedBy(face, offset)));
    lines.push(...glyph.lines.map(line => shiftedBy(line, offset)));
  }
  return { ...base, faces, lines, vertices };
};

/// The workspace of one Body, built from the Models in hand. An Instance whose Model has not
/// been read yet is left out entirely, drawn and collided with by nobody, until a later build
/// has it (ADR 0048); an Instance naming a Model the index does not know is a payload fault.
export const erisSurfaceFrom = (
  catalogue: Catalogue,
  models: ModelLookup,
  doc: ErisPresentationDocument,
  anchor: SurfaceAnchor = { bodyId: doc.body.id, origin: doc.grid.origin }
): ErisSurface => {
  const grid: ErisGrid = {
    cellsPerAxis: doc.grid.cellsPerAxis,
    cellUnits: doc.grid.cellUnits,
    origin: anchor.origin
  };
  const body = catalogue.bodies.find(entry => entry.id === anchor.bodyId);
  if (body === undefined) {
    throw new Error(
      `The Damocles Catalogue has no body ${anchor.bodyId} for ${doc.body.name}`
    );
  }
  const placements: ErisPlacement[] = [];
  for (const instance of catalogue.instances) {
    const location = instance.location;
    if (location === null || location.body !== body.id) {
      continue;
    }
    if (modelSummaryById(catalogue, instance.model) === undefined) {
      throw new Error(
        `Damocles Instance ${instance.id} names unknown model ${instance.model}`
      );
    }
    const placement = placementOf(instance, models, doc, grid);
    if (placement !== undefined) {
      placements.push(placement);
    }
  }
  const field = catalogue.islands.find(
    island => island.body === body.id && island.field !== null
  )?.field;
  const copies = new Map<string, readonly ErisPlacement[]>();
  const fieldAt =
    field == null
      ? undefined
      : (x: number, z: number): readonly ErisPlacement[] => {
          const key = `${x},${z}`;
          let held = copies.get(key);
          if (held === undefined) {
            held = (['surface', 'ground'] as const).flatMap(kind => {
              const instance = fieldCopy(
                catalogue,
                `${field.instancePrefix}-${kind}-${x}-${z}`
              );
              const placement =
                instance === undefined
                  ? undefined
                  : placementOf(instance, models, doc, grid);
              return placement === undefined ? [] : [placement];
            });
            // Only a complete copy is kept: one built before its Models landed is built again.
            if (held.length === 2) {
              copies.clear();
              copies.set(key, held);
            }
          }
          return held;
        };
  const byId = new Map(placements.map(placement => [placement.id, placement]));
  const places: ErisPlace[] = [];
  for (const place of catalogue.places) {
    if (place.body !== body.id) {
      continue;
    }
    const anchor = place.instances
      .map(id => byId.get(id))
      .find(placement => placement !== undefined);
    if (anchor !== undefined) {
      places.push({
        cell: cellOf(anchor.position, grid),
        id: place.id,
        name: place.name
      });
    }
  }
  return {
    baseColour: body.bodySurface?.baseColour ?? null,
    body: { id: body.id, name: body.name },
    ...(fieldAt === undefined ? {} : { field: fieldAt }),
    floorLabelGlyphs: catalogue.floorLabelGlyphs,
    formTables: {
      ...(catalogue.articulationTable === undefined
        ? {}
        : { articulation: catalogue.articulationTable }),
      glyphs: catalogue.textFrameGlyphs
    },
    grid,
    islands: catalogue.islands
      .filter(island => island.body === body.id)
      .map(island => ({
        areaName: island.areaName,
        boxes: island.boxes.map(box => ({
          kind: box.kind,
          x: box.x,
          z: box.z
        })),
        coastline: {
          edges: island.coastline.edges,
          vertices: island.coastline.vertices
        },
        id: island.id,
        landColour: island.landColour,
        locationTable: island.locationTable.entries,
        origin: { x: island.origin[0], z: island.origin[1] },
        roads: catalogue.roadNetworks.find(
          network => network.island === island.id
        ),
        structureGroup: island.structureGroup
      })),
    placements,
    places,
    sky: body.bodySurface?.sky ?? null,
    unresolvedCount: placements.filter(
      placement =>
        placement.mesh === undefined && placement.selection === undefined
    ).length
  };
};
