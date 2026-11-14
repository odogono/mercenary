import { describe, expect, test } from 'bun:test';

import { flyoverPanelViewModel } from '../src/flyover/dashboard.ts';
import type { FlyoverRangeReading } from '../src/flyover/reading.ts';
import type { FlyoverBody } from '../src/flyover/system.ts';

const ORBITAL: FlyoverRangeReading = {
  handoff: { globeWeight: 1, range: 'orbital', surfaceWeight: 0 }
};

const dialis: FlyoverBody = {
  colour: '#ffffff',
  displayRadiusUnits: 10,
  id: 'dialis',
  position: { x: 10, y: 20, z: 30 },
  provenance: {
    colour: 'authored',
    identity: 'recovered',
    position: 'recovered',
    radius: 'mechanically-derived',
    ranges: 'authored'
  },
  ranges: ['orbital']
};

const overCity = (
  range: 'coastal' | 'coastal-surface' | 'surface',
  surface: NonNullable<FlyoverRangeReading['surface']>
) =>
  flyoverPanelViewModel({
    camera: {
      pose: { heading: 0, pitch: 0, position: { x: 0, y: 0, z: 0 }, roll: 0 },
      speedNotch: 1
    },
    nearestBody: { ...dialis, id: 'targ' },
    reading: {
      handoff: { globeWeight: 0.5, range, surfaceWeight: 0.5 },
      surface
    },
    speedBounds: { maximumUnitsPerSecond: 512, minimumUnitsPerSecond: 1 },
    systemId: 'targ'
  });

describe('the trimmed Flyover navigation dashboard', () => {
  test('projects only System, navigation, speed and Body-relative values', () => {
    expect(
      flyoverPanelViewModel({
        camera: {
          pose: {
            heading: 0,
            pitch: 0,
            position: { x: 11, y: 18, z: 35 },
            roll: 0
          },
          speedNotch: 4
        },
        nearestBody: dialis,
        reading: ORBITAL,
        speedBounds: {
          maximumUnitsPerSecond: 512,
          minimumUnitsPerSecond: 1
        },
        systemId: 'gamma'
      })
    ).toMatchObject({
      altitude: 'Z+5.000E+0',
      bodyCoordinates: 'X+1.000E+0',
      compassDegrees: 0,
      elevationDegrees: 0,
      locationLabel: 'Y-2.000E+0',
      locationName: 'GAMMA · DIALIS',
      message: 'ORBITAL FLYOVER',
      speedLabel: 'N04 8.000E+0 U/S'
    });
  });

  test('reports a stopped Camera as zero scalar speed', () => {
    const reading = flyoverPanelViewModel({
      camera: {
        pose: {
          heading: 0,
          pitch: 0,
          position: { x: 10, y: 20, z: 30 },
          roll: 0
        },
        speedNotch: 0
      },
      nearestBody: dialis,
      reading: ORBITAL,
      speedBounds: {
        maximumUnitsPerSecond: 512,
        minimumUnitsPerSecond: 1
      },
      systemId: 'gamma'
    });
    expect(reading.speedLabel).toBe('N00 0.000E+0 U/S');
    expect(reading.inventory).toBe('');
    expect(reading.cash).toBe('');
    expect(reading.clock).toBe('');
  });

  test('reads longitude, latitude, altitude and surface X/Z outside Orbital', () => {
    expect(
      overCity('coastal-surface', {
        latitude: (34 * Math.PI) / 180,
        longitude: 0,
        normalizedAltitude: 0.07,
        x: 524_288.9,
        z: 524_288
      })
    ).toMatchObject({
      altitude: 'H+7.000E-2 R',
      bodyCoordinates: 'E000.00 N34.00',
      locationLabel: 'X00524288 Z00524288',
      locationName: 'TARG · TARG',
      message: 'COASTAL / SURFACE FLYOVER'
    });
  });

  test('marks west, south and negative altitude', () => {
    const reading = overCity('surface', {
      latitude: (-5.5 * Math.PI) / 180,
      longitude: (-120.25 * Math.PI) / 180,
      normalizedAltitude: -0.25,
      x: 16_777_215,
      z: 0
    });
    expect(reading.bodyCoordinates).toBe('W120.25 S05.50');
    expect(reading.altitude).toBe('H-2.500E-1 R');
    expect(reading.locationLabel).toBe('X16777215 Z00000000');
    expect(reading.message).toBe('SURFACE FLYOVER');
    expect(
      overCity('coastal', {
        latitude: 0,
        longitude: 0,
        normalizedAltitude: 0.5,
        x: 0,
        z: 0
      }).message
    ).toBe('COASTAL FLYOVER');
  });
});
