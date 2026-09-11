import type { Catalogue, Mesh, Model, Recovery } from '../catalogue/data.ts';
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

/// Where the player stands and faces, in Eris's own terms: raw engine units with north at +z
/// and east at +x, and a bearing in radians clockwise from north (#204).
export interface ErisPose {
  readonly heading: number;
  readonly position: Vector3;
}

export interface ErisPlacement {
  readonly faceCount: number;
  readonly heading: number;
  readonly id: string;
  /// The variant drawn, or nothing when the model's geometry is unrecovered. Nothing is
  /// drawn in that case rather than a stand-in, and the gap is counted (ADR 0043).
  readonly mesh: Mesh | undefined;
  readonly modelId: string;
  readonly name: string;
  readonly position: Vector3;
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
  /// Placements whose model has no recovered faces.
  readonly unresolvedCount: number;
}

/// The local cell a raw-unit position falls in, as the panel's NAV readout counts them.
export const cellOf = (position: Vector3, grid: ErisGrid): ErisCell => ({
  x: Math.floor(position.x / grid.cellUnits) - grid.origin.x,
  z: Math.floor(position.z / grid.cellUnits) - grid.origin.z
});

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

/// A Damocles Instance heading byte as a bearing clockwise from north.
///
/// The byte is a quarter of the camera yaw word (256 steps per turn) but its
/// zero is north, not the yaw word's raw south: camera ≡ byte × (yawUnitsPerTurn / 256) +
/// yawNorth. Structures with no byte face north (#204).
export const headingFromByte = (
  byte: number | null,
  orientation: ErisPresentationDocument['orientation']
): number =>
  byte === null
    ? 0
    : bearingFromYaw(
        (byte * orientation.yawUnitsPerTurn) / 256 + orientation.yawNorth,
        orientation
      );

export const startPose = (doc: ErisPresentationDocument): ErisPose => ({
  heading: bearingFromYaw(doc.start.yaw, doc.orientation),
  position: doc.start.position
});

/// The variant an exterior walk sees.
///
/// Most recovered models have one variant. The spaceport has several: exterior and combined,
/// door open and closed. The exterior with its door closed is the one a fresh start shows; a
/// model with no exterior variant falls back to its first variant with faces.
const exteriorMesh = (model: Model): Mesh | undefined => {
  const withFaces = model.variants.filter(
    variant => variant.mesh.faces.length > 0
  );
  const exteriors = withFaces.filter(variant => variant.view === 'exterior');
  const chosen =
    exteriors.find(variant => variant.doorState === 'closed') ??
    exteriors[0] ??
    withFaces[0];
  return chosen?.mesh;
};

export const erisSurfaceFrom = (
  catalogue: Catalogue,
  doc: ErisPresentationDocument
): ErisSurface => {
  const grid: ErisGrid = {
    cellsPerAxis: doc.grid.cellsPerAxis,
    cellUnits: doc.grid.cellUnits,
    origin: doc.grid.origin
  };
  const body = catalogue.bodies.find(entry => entry.id === doc.body.id);
  if (body === undefined) {
    throw new Error(
      `The Damocles Catalogue has no body ${doc.body.id} for ${doc.body.name}`
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
    if (model.kind === 'ground') {
      // Recovered pad/road faces belong to the catalogue; /damocles still paints the authored cell fill (#206).
      continue;
    }
    const mesh = exteriorMesh(model);
    placements.push({
      faceCount: mesh?.faces.length ?? 0,
      heading: headingFromByte(location.heading, doc.orientation),
      id: instance.id,
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
      placement => placement.mesh === undefined
    ).length
  };
};
