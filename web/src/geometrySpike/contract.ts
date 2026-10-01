/// The logical contract both #671 candidates carry: what a geometry asset must hold so that an
/// untouched round trip through Blender is exact and an edit stays reviewable.
///
/// Spike-only. Nothing in the live Gameplay Session, the Catalogue reader or the extractor imports
/// this module (#671 keeps the spike isolated from production loading).
///
/// Coordinates are the payload's own integer game units in the payload's own axes. Identities are
/// integers, unique within a part and per element kind; vertices and external endpoints share one
/// namespace because a line names either. A Blender edit that adds an element gives it an
/// identity above every one the part already uses.

export const CONTRACT_FORMAT = 'mercenary-geometry-asset';
export const CONTRACT_VERSION = 1;

export type Title = 'damocles' | 'targ';

/// What a part is for. Display geometry is what is drawn; walk geometry is what a structure's
/// walking rules read; plan, attachment and detail are the structure selector's own drawn lists.
export type PartRole =
  'attachment' | 'detail' | 'display' | 'glyph' | 'plan' | 'walk' | 'wireframe';

/// `palette` primitives carry a Damocles colour word; `ink` lines carry a Targ Ink; `none`
/// carries no colour at all (Targ objects and Rooms, whose colour is a Room-level palette).
export type ColourModel = 'ink' | 'none' | 'palette';

export interface PaletteColour {
  readonly colour: string;
  readonly day?: string;
  readonly source: number;
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

/// One game reference into geometry, kept in the sidecar. `record` binds whichever primitives
/// carry the source record; `face` binds one face by identity (positional references are
/// rewritten to identities on extraction and back to positions on composition); `external`
/// binds one Road Workspace endpoint.
export type ReferenceTarget =
  | { readonly id: number; readonly kind: 'external'; readonly part: string }
  | { readonly id: number; readonly kind: 'face'; readonly part: string }
  | { readonly kind: 'record'; readonly part: string; readonly record: number };

export interface Reference {
  /// Whether the target resolved in the recovered baseline. A reference that never resolved
  /// (a record the detail holds but draws nothing for) is a recovered fact, not a break.
  readonly baselineResolved: boolean;
  readonly id: number;
  /// Where in the record the reference sits, for diagnostics.
  readonly site: string;
  readonly target: ReferenceTarget;
}

/// Everything about an asset that is not geometry, in reviewable JSON: the payload record with
/// each part's geometry replaced by `{ "$part": id }` and each geometry reference replaced by
/// `{ "$ref": n }`.
export interface Advisory {
  readonly kind: 'vertexWatch';
  readonly message: string;
  readonly part: string;
  readonly provenance: 'derived';
  readonly vertices: readonly number[];
}

export interface Sidecar {
  /// Links the payload makes by coincidence of coordinates rather than by identity.
  readonly advisories?: readonly Advisory[];
  readonly asset: string;
  readonly family: Family;
  readonly format: 'mercenary-geometry-sidecar';
  readonly record: unknown;
  readonly references: readonly Reference[];
  /// The payload document and JSON path the record was recovered from, and that document's hash.
  readonly source: {
    readonly document: string;
    readonly path: string;
    readonly sha256: string;
  };
  readonly title: Title;
  readonly version: 1;
}

export type Family =
  'damocles-model' | 'targ-object-model' | 'targ-room' | 'targ-surface-cell';

/// Deterministic JSON: sorted keys, two-space indent, trailing newline. The form every spike
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

export const sha256 = (text: string | Uint8Array): string =>
  new Bun.CryptoHasher('sha256').update(text).digest('hex');
