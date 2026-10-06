import type {
  BodySky,
  DetailBoxes,
  DetailExtent,
  DetailGroup,
  FloorLabelGlyph,
  Kind,
  Mesh,
  Recovery,
  StructureSelection
} from '../catalogue/data.ts';
import type { CoastIsland } from '../coast/islands.ts';
import type { Vector3 } from '../orientation/index.ts';
import type { FormTables, PlacementForms } from './forms.ts';

/// What the Enhanced planner draws a frame from, whichever Title supplies it: a Body's surface
/// of placements in raw engine units, the Pose the eye stands at, the bound structure, and the
/// camera the presentation gives. Damocles and Mercenary III run one engine, and each Title's
/// adapter fills these from its own recovered records (#803).

export interface SceneGrid {
  readonly cellsPerAxis: number;
  readonly cellUnits: number;
  readonly origin: { readonly x: number; readonly z: number };
}

export interface SceneCell {
  readonly x: number;
  readonly z: number;
}

/// Where the player stands and faces on one Body: raw engine units with north at +z and east
/// at +x, and a bearing in radians clockwise from north (#204).
///
/// The Body is part of the Pose rather than a peer of it, so a standing position can never be
/// applied to the wrong Body by losing track of which one it came from. It was `ErisPose`
/// until #344; the rename carries no behaviour change.
export interface Pose {
  readonly body: string; // Catalogue Body id
  readonly heading: number;
  /// Radians the view is tilted, negative looking down, level at zero. `$7AC0` on the Working
  /// Authority, where an overhead view is a pitch poke rather than a different capture. On foot
  /// nothing moves it, so it is level for all of play and the Save Snapshot does not carry it;
  /// the validation views of #394 are what tilt it.
  readonly pitch: number;
  readonly position: Vector3;
  /// Radians the view is banked about the direction of travel, positive banking right. Only a
  /// flying craft's roll word `$7ABE` sets it (#556); absent or nought otherwise.
  readonly roll?: number;
}

export interface ScenePlacement {
  readonly faceCount: number;
  /// Static geometry for ordinary placements; authored fallback for recovered selectors.
  /// The forms the model offers, for a planner given a frame's clock (#805). Absent where the
  /// model has one form, or for a planner drawing every placement in `mesh`.
  readonly forms?: PlacementForms;
  readonly heading: number;
  readonly id: string;
  /// The cell's `$7AFB` door-key base, or null where the entry byte installs none.
  readonly keyBase: number | null;
  readonly kind: Kind;
  readonly mesh: Mesh | undefined;
  readonly modelId: string;
  readonly name: string;
  readonly position: Vector3;
  readonly selection?: {
    /// The structure record's two scene colours (`$059DA2`–`$059DC6`): what the frame loop
    /// fills above and below the horizon while the player stands in one of its enclosed regions.
    /// `day` is the pair through the palette's day half, where that differs (#497). Absent where
    /// the Catalogue has not resolved both.
    readonly background?: SceneBackground;
    /// The Building detail's support and wall boxes, unbound (#556): the craft Mover binds
    /// them at the structure's scale about its intra-cell origin, as `$053AF0` does.
    readonly boxes: DetailBoxes;
    readonly detail: Mesh;
    /// The Building detail's extent rectangle in raw units, or null where it carries none
    /// (#356). A Floor keeps the instance's detail and scale, so this is the cell's rectangle
    /// on every Floor, as the bind that publishes `[$7910]` runs for the cell alone.
    readonly extent: DetailExtent | null;
    readonly groups: readonly DetailGroup[];
    readonly structure: StructureSelection;
  };
  readonly status: Recovery;
}

export interface SceneBackground {
  readonly ceiling: string;
  readonly day?: { readonly ceiling: string; readonly floor: string };
  readonly floor: string;
}

/// The local cell a raw-unit position falls in, counted from the bound workspace's origin.
export const cellOf = (position: Vector3, grid: SceneGrid): SceneCell => ({
  x: Math.floor(position.x / grid.cellUnits) - grid.origin.x,
  z: Math.floor(position.z / grid.cellUnits) - grid.origin.z
});

/// Whether the Working Authority draws this placement from where the player stands (#373).
///
/// Three families, three bounds. A Surface Structure is drawn only from its own Surface Cell:
/// the plan and detail renderers have five call sites between them and all five sit in the
/// bound-workspace dispatch at `$0533D4..$053418`, which is the Reference Build's Structure
/// Reach (ADR 0034). A ground record follows an altitude-indexed cell window whose entry for
/// the on-foot altitude is zero, so on foot it is the occupied cell as well — a Session that
/// ever flies needs the window itself, not this. An object has no distance test at all:
/// `$052C9C` keeps every resident of the Body however far away it stands.
export const withinDrawBound = (
  placement: ScenePlacement,
  position: Vector3,
  grid: SceneGrid
): boolean => {
  if (placement.kind === 'object') {
    return true;
  }
  const here = cellOf(position, grid);
  const there = cellOf(placement.position, grid);
  return here.x === there.x && here.z === there.z;
};

/** `$7AF6 >= 0`: both unsigned cell fractions are in `[0.25, 0.75)`. */
export const insideCentralCellHalf = (
  position: Vector3,
  grid: SceneGrid
): boolean => {
  const fraction = (value: number): number => {
    const cells = value / grid.cellUnits;
    return cells - Math.floor(cells);
  };
  const x = fraction(position.x);
  const z = fraction(position.z);
  return x >= 0.25 && x < 0.75 && z >= 0.25 && z < 0.75;
};

/// One island as the planner fills it: the coast query's record, the colour it is painted in,
/// and the roads its Settlement draws.
export interface SceneIsland extends CoastIsland {
  /// The colour this island is filled in, and the colour the ground plane itself takes while
  /// the player stands on its core.
  readonly landColour: string;
  readonly roads?:
    | {
        readonly corners: readonly number[];
        readonly roadColour: string;
      }
    | undefined;
}

/// A Floor Label's glyph strokes in one font, by character.
export type SceneFloorLabelGlyphs = Readonly<
  Record<string, Readonly<Record<string, FloorLabelGlyph>>>
>;

export interface EnhancedSurface<I extends SceneIsland = SceneIsland> {
  /// The colour the Body's surface is drawn in wherever no island is painted over it: its sea,
  /// on a Body that has one. Null where the Body is not a surface.
  readonly baseColour: string | null;
  /// Floor Label glyphs by font, which every Floor Label record draws from. Empty where the
  /// Title has none.
  readonly floorLabelGlyphs: SceneFloorLabelGlyphs;
  /// The tables per-frame forms are composed from; absent where no placement offers forms.
  readonly formTables?: FormTables;
  readonly grid: SceneGrid;
  /// The Body's island records, in list order.
  readonly islands: readonly I[];
  readonly placements: readonly ScenePlacement[];
  /// The Body's day and night sky words. Null where the Body is not a surface.
  readonly sky: BodySky | null;
}

/// The structure the Session has bound, as the planner reads it.
export interface BoundStructure {
  readonly attachments: readonly {
    readonly openUnits: number;
    readonly slot: number;
  }[];
  readonly floor?: number | undefined;
  readonly instanceId: string;
  /// The region the eye stands in, 0-based, or null outside every region.
  readonly regionIndex: number | null;
  readonly ride?: { readonly label: number } | null | undefined;
}

/// The camera and conventions a Title's presentation gives the planner.
export interface EnhancedPresentation {
  readonly camera: {
    readonly farPlane: number;
    readonly nearPlane: number;
    readonly verticalFieldOfViewDegrees: number;
  };
  readonly ground: { readonly fillDropUnits: number };
  readonly orientation: { readonly modelZ: 'keep' | 'negate' };
}
