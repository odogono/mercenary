import { describe, expect, test } from 'bun:test';

import type { IslandPresentation } from '../src/flyover/documents.ts';
import {
  bodyCoordinatesOf,
  bodyDirectionOf,
  surfacePositionOf,
  tangentFrameOf
} from '../src/flyover/surfaceFrame.ts';
import { SURFACE_AXIS_MODULUS } from '../src/world/surfaceCoordinates.ts';

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const LATITUDE = radians(34);
const RADIUS = 2 ** 24 / (2 * Math.PI);

const dot = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
) => a.x * b.x + a.y * b.y + a.z * b.z;

const cityIsland: IslandPresentation = {
  bodyId: 'targ',
  centreDegrees: { latitude: 34, longitude: 0 },
  id: 'city-island',
  polygonDegrees: [
    [-16, 18],
    [16, 18],
    [16, 50],
    [-16, 50]
  ],
  surfacePatch: {
    eastAxis: 'x',
    northAxis: 'z',
    sourceCentre: { x: 524_288, z: 524_288 },
    unitsPerRadian: RADIUS
  }
};

describe('body-fixed coordinates in the Flyover frame', () => {
  // The Flyover's Targ frame is the city's horizon: x east, y up, z north, turning with Targ.
  test('puts the city overhead at its own latitude on the prime meridian', () => {
    const city = bodyCoordinatesOf({ x: 0, y: 1, z: 0 }, LATITUDE);
    expect(city.longitude).toBeCloseTo(0, 15);
    expect(city.latitude).toBeCloseTo(LATITUDE, 15);
  });

  test('finds the north pole along the axis Targ turns about', () => {
    const pole = bodyCoordinatesOf(
      { x: 0, y: Math.sin(LATITUDE), z: Math.cos(LATITUDE) },
      LATITUDE
    );
    expect(pole.latitude).toBeCloseTo(Math.PI / 2, 15);
    expect(pole.longitude).toBe(0);
    const east = bodyCoordinatesOf({ x: 1, y: 0, z: 0 }, LATITUDE);
    expect(east.longitude).toBeCloseTo(Math.PI / 2, 15);
    expect(east.latitude).toBeCloseTo(0, 15);
  });

  test('round-trips longitude and latitude through a direction', () => {
    for (let lon = -179; lon <= 180; lon += 7) {
      for (let lat = -89; lat <= 89; lat += 4) {
        const direction = bodyDirectionOf(radians(lon), radians(lat), LATITUDE);
        expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(
          1,
          14
        );
        const back = bodyCoordinatesOf(direction, LATITUDE);
        expect(back.latitude).toBeCloseTo(radians(lat), 12);
        expect(back.longitude).toBeCloseTo(radians(lon), 12);
      }
    }
  });

  test('keeps longitude within one turn and continuous across the antimeridian', () => {
    const west = bodyCoordinatesOf(
      bodyDirectionOf(radians(-179.999), 0.3, LATITUDE),
      LATITUDE
    );
    const east = bodyCoordinatesOf(
      bodyDirectionOf(radians(179.999), 0.3, LATITUDE),
      LATITUDE
    );
    expect(west.longitude).toBeGreaterThanOrEqual(-Math.PI);
    expect(east.longitude).toBeLessThanOrEqual(Math.PI);
    const a = bodyDirectionOf(west.longitude, west.latitude, LATITUDE);
    const b = bodyDirectionOf(east.longitude, east.latitude, LATITUDE);
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(1e-4);
  });

  test('gives an orthonormal tangent frame, finite at both poles', () => {
    const city = tangentFrameOf(0, LATITUDE, LATITUDE);
    expect(city.east.x).toBeCloseTo(1, 15);
    expect(city.up.y).toBeCloseTo(1, 15);
    expect(city.north.z).toBeCloseTo(1, 15);
    for (const latitude of [-Math.PI / 2, -1, 0, 0.6, Math.PI / 2]) {
      for (const longitude of [-Math.PI, -2, 0, 1, Math.PI]) {
        const frame = tangentFrameOf(longitude, latitude, LATITUDE);
        for (const axis of [frame.east, frame.north, frame.up]) {
          expect(Math.hypot(axis.x, axis.y, axis.z)).toBeCloseTo(1, 14);
        }
        expect(dot(frame.east, frame.north)).toBeCloseTo(0, 14);
        expect(dot(frame.east, frame.up)).toBeCloseTo(0, 14);
        expect(dot(frame.north, frame.up)).toBeCloseTo(0, 14);
        const up = bodyDirectionOf(longitude, latitude, LATITUDE);
        expect(dot(frame.up, up)).toBeCloseTo(1, 14);
      }
    }
  });
});

describe('the Island patch mapping', () => {
  test('puts the Island centre on the patch source centre', () => {
    expect(surfacePositionOf(0, LATITUDE, cityIsland)).toEqual({
      x: 524_288,
      z: 524_288
    });
  });

  test('keeps true scale east and north at the Island centre', () => {
    const step = 1e-6;
    const centre = surfacePositionOf(0, LATITUDE, cityIsland);
    const east = surfacePositionOf(step, LATITUDE, cityIsland);
    const north = surfacePositionOf(0, LATITUDE + step, cityIsland);
    // One Surface Cell unit per System unit along the sphere at the centre's latitude.
    expect(
      (east.x - centre.x) / (RADIUS * Math.cos(LATITUDE) * step)
    ).toBeCloseTo(1, 6);
    expect(east.z).toBe(centre.z);
    expect((north.z - centre.z) / (RADIUS * step)).toBeCloseTo(1, 6);
    expect(north.x).toBe(centre.x);
  });

  test('places +X east and +Z north and wraps both onto the 24-bit axes', () => {
    const northEast = surfacePositionOf(radians(5), radians(40), cityIsland);
    expect(northEast.x).toBeGreaterThan(524_288);
    expect(northEast.z).toBeGreaterThan(524_288);
    for (let lon = -180; lon < 180; lon += 9) {
      for (let lat = -90; lat <= 90; lat += 10) {
        const { x, z } = surfacePositionOf(
          radians(lon),
          radians(lat),
          cityIsland
        );
        for (const axis of [x, z]) {
          expect(axis).toBeGreaterThanOrEqual(0);
          expect(axis).toBeLessThan(SURFACE_AXIS_MODULUS);
        }
      }
    }
  });

  test('maps the whole 16×16 city inside City Island', () => {
    const cell = 65_536;
    const scaleEast = RADIUS * Math.cos(LATITUDE);
    const halfWidthDegrees = ((8 * cell) / scaleEast) * (180 / Math.PI);
    const halfHeightDegrees = ((8 * cell) / RADIUS) * (180 / Math.PI);
    expect(halfWidthDegrees).toBeLessThan(16);
    expect(34 + halfHeightDegrees).toBeLessThan(50);
    expect(34 - halfHeightDegrees).toBeGreaterThan(18);
  });

  test('refuses an Island without a surface patch', () => {
    const { surfacePatch: _, ...bare } = cityIsland;
    expect(() => surfacePositionOf(0, 0, bare)).toThrow('surface patch');
  });
});
