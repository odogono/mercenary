import type {
  Catalogue,
  DetailGroup,
  Kind,
  Mesh,
  Model,
  Recovery,
  StructureSelection
} from '../catalogue/data.ts';
import type { Vector3 } from '../orientation/index.ts';
import type { ErisPresentationDocument } from './documents.ts';

/// The Eris surface as the Damocles Gameplay Session walks it: the Damocles Catalogue's
/// recovered placements on one Body, in raw engine units, with the authored document saying
/// how cells, headings and gaps are read (ADR 0043).

export interface ErisGrid {
  readonly cellsPerAxis: number;
  readonly cellUnits: number;
  readonly origin: { readonly x: number; readonly z: number };
}

export interface ErisCell {
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
  readonly position: Vector3;
}

export interface ErisPlacement {
  readonly faceCount: number;
  readonly heading: number;
  readonly id: string;
  /// The cell's `$7AFB` door-key base, or null where the entry byte installs none.
  readonly keyBase: number | null;
  readonly kind: Kind;
  /// Static geometry for ordinary placements; authored fallback for recovered selectors.
  readonly mesh: Mesh | undefined;
  readonly modelId: string;
  readonly name: string;
  readonly position: Vector3;
  readonly selection?: {
    readonly detail: Mesh;
    readonly groups: readonly DetailGroup[];
    readonly structure: StructureSelection;
  };
  readonly status: Recovery;
}

export interface ErisPlace {
  readonly cell: ErisCell;
  readonly id: string;
  readonly name: string;
}

export interface ErisSurface {
  readonly body: { readonly id: string; readonly name: string };
  readonly grid: ErisGrid;
  readonly placements: readonly ErisPlacement[];
  readonly places: readonly ErisPlace[];
  /// Placements whose model has no recovered faces: drawn as nothing, counted as a gap
  /// (ADR 0043).
  readonly unresolvedCount: number;
}

/// The local cell a raw-unit position falls in, as the panel's NAV readout counts them.
export const cellOf = (position: Vector3, grid: ErisGrid): ErisCell => ({
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
  placement: ErisPlacement,
  position: Vector3,
  grid: ErisGrid
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
  grid: ErisGrid
): boolean => {
  const fraction = (value: number): number => {
    const cells = value / grid.cellUnits;
    return cells - Math.floor(cells);
  };
  const x = fraction(position.x);
  const z = fraction(position.z);
  return x >= 0.25 && x < 0.75 && z >= 0.25 && z < 0.75;
};

/** The one structure workspace selected by the current surface cell. */
export const structureInCell = (
  surface: ErisSurface,
  position: Vector3
): ErisPlacement | undefined => {
  const current = cellOf(position, surface.grid);
  return surface.placements.find(
    placement =>
      placement.selection !== undefined &&
      placement.kind === 'structure' &&
      cellOf(placement.position, surface.grid).x === current.x &&
      cellOf(placement.position, surface.grid).z === current.z
  );
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

export const erisSurfaceFrom = (
  catalogue: Catalogue,
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
  const models = new Map(catalogue.models.map(model => [model.id, model]));
  const placements: ErisPlacement[] = [];
  for (const instance of catalogue.instances) {
    const location = instance.location;
    if (location === null || location.body !== body.id) {
      continue;
    }
    const model = models.get(instance.model);
    if (model === undefined) {
      throw new Error(
        `Damocles Instance ${instance.id} names unknown model ${instance.model}`
      );
    }
    const mesh = structureMesh(model, doc.structureFallback);
    const selection = model.structureSelection;
    const detail =
      selection === undefined ? undefined : models.get(selection.detailModel);
    placements.push({
      ...(selection === undefined || detail?.detailSelection === undefined
        ? {}
        : {
            selection: {
              detail: detail.variants.find(
                v => v.id === selection.detailVariant
              )!.mesh,
              groups: detail.detailSelection,
              structure: selection
            }
          }),
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
    });
  }
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
    body: { id: body.id, name: body.name },
    grid,
    placements,
    places,
    unresolvedCount: placements.filter(
      placement =>
        placement.mesh === undefined && placement.selection === undefined
    ).length
  };
};
