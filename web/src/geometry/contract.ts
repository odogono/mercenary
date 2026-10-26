/// The shared Geometry Asset and Asset Sidecar schema (ADR 0081).
///
/// Coordinates are the payload's own integer game units in the payload's own axes. Identities are
/// integers, unique within a part and per element kind; vertices and external endpoints share one
/// namespace because a line names either. A Blender edit that adds an element gives it an
/// identity above every one the part already uses.

export const CONTRACT_FORMAT = 'mercenary-geometry-asset';
export const CONTRACT_VERSION = 1;

export type Title = 'damocles' | 'targ';

/// What a part is for. Display geometry is what is drawn; walk geometry is what a structure's
/// walking rules read; plan, attachment and detail are the structure selector's own drawn lists;
/// distant is what a Targ Surface Structure draws as a Distant Structure instead of its wireframe.
export type PartRole =
  | 'attachment'
  | 'detail'
  | 'display'
  | 'distant'
  | 'glyph'
  | 'plan'
  | 'walk'
  | 'wireframe';

/// `palette` primitives carry a colour; `ink` lines carry a Targ Ink; `none` carries no colour
/// at all (Targ Rooms, drawn in Line Colour). On a Targ object's `palette` part a primitive may
/// leave its colour out and draw in Line Colour; every Damocles primitive carries one.
export type ColourModel = 'ink' | 'none' | 'palette';

/// `source` is the original's colour word, which a Floor palette may rebind and export writes
/// back. Without one the colour is fixed: nothing rebinds it, as with an authored Targ colour.
export interface PaletteColour {
  readonly colour: string;
  readonly day?: string;
  readonly source?: number;
}

export type Colour =
  | { readonly ink: number; readonly kind: 'ink' }
  | ({ readonly kind: 'palette' } & PaletteColour);

export type Point3 = readonly [number, number, number];

/// A Targ vertex whose drawn position the runtime computes. `co` is that position at elapsed
/// time zero, derived for display only; the input is what the record holds and what an edit may
/// change.
export interface RuntimeVertex {
  readonly input: Point3;
  readonly kind: 'rotated-input';
}

export interface Vertex {
  readonly co: Point3;
  readonly id: number;
  readonly runtime?: RuntimeVertex;
}

/// A line endpoint that lives outside the part's own vertex list: the occupied Surface Cell's
/// Road Workspace point slots 60–63. `display` is where the payload's road table puts it for this
/// cell, or null where the cell has no such road run.
export interface External {
  readonly display: Point3 | null;
  readonly id: number;
  readonly slot: number;
  readonly workspace: 'road';
}

export interface Face {
  /// The source loop closed on a repeat of its first vertex (`[a, b, c, a]`).
  readonly closingRepeat?: true;
  readonly colour?: Colour;
  readonly doubleSided?: true;
  readonly id: number;
  /// Vertex identities in source winding, starting where the source starts.
  readonly loop: readonly number[];
  /// The source primitive record (`sourceIndex`) the game's references bind to.
  readonly record?: number;
  readonly sceneSlots?: readonly number[];
}

export interface Line {
  readonly colour?: Colour;
  /// Vertex or external identities, in source direction.
  readonly ends: readonly [number, number];
  readonly id: number;
  readonly record?: number;
  readonly sceneSlots?: readonly number[];
}

export interface Part {
  readonly colourModel: ColourModel;
  readonly externals: readonly External[];
  readonly faces: readonly Face[];
  readonly id: string;
  readonly lines: readonly Line[];
  readonly role: PartRole;
  readonly vertices: readonly Vertex[];
}

export interface GeometryAsset {
  readonly asset: string;
  readonly format: typeof CONTRACT_FORMAT;
  readonly parts: readonly Part[];
  /// SHA-256 of the canonical sidecar this geometry is linked to.
  readonly sidecarSha256: string;
  readonly title: Title;
  readonly version: typeof CONTRACT_VERSION;
}

/// Record bindings stay inline; only positional face bindings need the sidecar table.
export type ReferenceTarget =
  | { readonly id: number; readonly kind: 'face'; readonly part: string }
  | { readonly kind: 'record'; readonly part: string; readonly record: number };

export interface Reference {
  /// Omitted for resolved targets. False preserves an already unresolved baseline position.
  readonly baselineResolved?: false;
  readonly target: Extract<ReferenceTarget, { kind: 'face' }>;
}

export interface Advisory {
  readonly kind: 'vertexWatch';
  readonly message: string;
  readonly part: string;
  readonly provenance: 'derived';
  readonly vertices: readonly number[];
}

/// Everything except geometry: meshes become placeholders, record references stay numbers,
/// and positional attachmentFace indices become `{ "$ref": tableIndex }`.
export interface Sidecar {
  /// Links the payload makes by coincidence of coordinates rather than by identity.
  readonly advisories?: readonly Advisory[];
  readonly asset: string;
  readonly family: Family;
  readonly format: 'mercenary-geometry-sidecar';
  /// Where an Authored Asset is placed: Targ object instances without their `model`, or the
  /// Surface Cells an authored structure occupies. Recovered assets are placed by the payload.
  readonly placements?: readonly unknown[];
  /// A Surface Structure's own Structure Reach: `cell` keeps it out of the Distant Structures
  /// even when the player's Structure Reach is `all`. Absent means `all`.
  readonly reach?: 'all' | 'cell';
  readonly record: unknown;
  readonly references: readonly Reference[];
  /// The payload document and JSON path the record was recovered from, and that document's hash.
  /// An Authored Asset has no Recovered Baseline and so no source.
  readonly source?: {
    readonly document: string;
    readonly path: string;
    readonly sha256: string;
  };
  readonly title: Title;
  /// Source records that never resolved at baseline, grouped by target part (no repeated sites).
  readonly unresolvedRecords?: Readonly<Record<string, readonly number[]>>;
  readonly version: 2;
}

export type Family =
  'damocles-model' | 'targ-object-model' | 'targ-room' | 'targ-surface-cell';

/// Deterministic JSON: sorted keys, two-space indent, trailing newline. The form every canonical
/// artifact is written in and every hash is taken over.
export const canonicalJson = (value: unknown): string =>
  `${JSON.stringify(sortKeys(value), null, 2)}\n`;

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, sortKeys((value as Record<string, unknown>)[key])])
    );
  }
  return value;
};
