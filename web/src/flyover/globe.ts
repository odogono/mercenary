import { cos } from '../math/index.ts';
import type { TargFlyoverSystem } from './system.ts';

/// Targ's Globe: TARG drawn as a sphere carrying its Islands (ADR 0094).
///
/// The Globe and the surface frame read one geography. Both place a longitude and latitude
/// through City Island's surface patch, so a coastline is the same shape in both passes. The
/// Globe works in the patch's mapped coordinates in radians, before they are scaled to surface
/// units: east is the longitude from City Island's centre times the cosine of its latitude,
/// north is the latitude from its centre.

/// The most Island vertices the Globe shader holds.
export const GLOBE_ISLAND_VERTICES = 64;
/// The most Islands the Globe shader holds.
export const GLOBE_ISLANDS = 8;

const TURN = 2 * Math.PI;

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/// An angle in [-π, π).
const wrappedAngle = (value: number): number =>
  value - TURN * Math.floor((value + Math.PI) / TURN);

export const globeMapped = (
  longitude: number,
  latitude: number,
  system: Pick<TargFlyoverSystem, 'surfaceFrame'>
): readonly [number, number] => {
  const centre = system.surfaceFrame.island.centreDegrees;
  const centreLatitude = radians(centre.latitude);
  return [
    wrappedAngle(longitude - radians(centre.longitude)) * cos(centreLatitude),
    latitude - centreLatitude
  ];
};

type Channels = readonly [number, number, number];

const channels = (colour: string): Channels => [
  Number.parseInt(colour.slice(1, 3), 16) / 255,
  Number.parseInt(colour.slice(3, 5), 16) / 255,
  Number.parseInt(colour.slice(5, 7), 16) / 255
];

export interface GlobeIslands {
  readonly bodyId: string;
  readonly centreLatitude: number;
  readonly centreLongitude: number;
  readonly colours: {
    readonly coastline: Channels;
    readonly ground: Channels;
    readonly ocean: Channels;
  };
  /// Each Island's vertex count, in document order.
  readonly counts: Int32Array;
  /// The latitude of the Flyover frame, which is the latitude the game's Targ sky is drawn
  /// from: it turns a direction from TARG's centre into longitude and latitude.
  readonly frameLatitude: number;
  /// Each Island's first vertex.
  readonly starts: Int32Array;
  /// Every Island's polygon in mapped coordinates, as east and north pairs.
  readonly vertices: Float32Array;
}

/// What the Globe shader needs to paint TARG's ocean, Islands and coastline.
export const globeIslandsOf = (
  system: Pick<TargFlyoverSystem, 'islands' | 'surfaceColours' | 'surfaceFrame'>
): GlobeIslands => {
  const vertexCount = system.islands.reduce(
    (sum, island) => sum + island.polygonDegrees.length,
    0
  );
  if (vertexCount > GLOBE_ISLAND_VERTICES) {
    throw new Error(
      `The Targ Globe holds at most ${GLOBE_ISLAND_VERTICES} Island vertices, not ${vertexCount}`
    );
  }
  if (system.islands.length > GLOBE_ISLANDS) {
    throw new Error(
      `The Targ Globe holds at most ${GLOBE_ISLANDS} Islands, not ${system.islands.length}`
    );
  }
  const vertices = new Float32Array(vertexCount * 2);
  const starts = new Int32Array(system.islands.length);
  const counts = new Int32Array(system.islands.length);
  let at = 0;
  system.islands.forEach((island, index) => {
    starts[index] = at;
    counts[index] = island.polygonDegrees.length;
    for (const [longitude, latitude] of island.polygonDegrees) {
      const [east, north] = globeMapped(
        radians(longitude),
        radians(latitude),
        system
      );
      vertices[at * 2] = east;
      vertices[at * 2 + 1] = north;
      at += 1;
    }
  });
  const centre = system.surfaceFrame.island.centreDegrees;
  return {
    bodyId: system.surfaceFrame.island.bodyId,
    centreLatitude: radians(centre.latitude),
    centreLongitude: radians(centre.longitude),
    colours: {
      coastline: channels(system.surfaceColours.coastline),
      ground: channels(system.surfaceColours.ground),
      ocean: channels(system.surfaceColours.ocean)
    },
    counts,
    frameLatitude: system.surfaceFrame.frameLatitude,
    starts,
    vertices
  };
};
