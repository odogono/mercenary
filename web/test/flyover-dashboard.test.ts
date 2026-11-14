import { describe, expect, test } from 'bun:test';

import {
  flyoverInspectionLine,
  flyoverPanelViewModel,
  targFlyoverPanelViewModel
} from '../src/flyover/dashboard.ts';
import type { FlyoverRangeReading } from '../src/flyover/reading.ts';
import type { FlyoverBody } from '../src/flyover/system.ts';
import { targPanelReadouts } from '../src/shell/targPanelWriter.ts';

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
});

const RADIUS = 2 ** 24 / (2 * Math.PI);
const targ: FlyoverBody = {
  ...dialis,
  displayRadiusUnits: RADIUS,
  id: 'targ',
  position: { x: 0, y: 0, z: 0 },
  ranges: ['orbital', 'coastal', 'surface']
};
const SPEED = { maximumUnitsPerSecond: 262_144, minimumUnitsPerSecond: 256 };

const overTarg = (
  reading: FlyoverRangeReading,
  position = { x: 0, y: 3 * RADIUS, z: 0 },
  speedNotch = 0
) => ({
  camera: {
    pose: { heading: 0, pitch: 0, position, roll: 0 as const },
    speedNotch
  },
  nearestBody: targ,
  reading,
  speedBounds: SPEED
});

const surfaceReading = (
  range: 'coastal' | 'coastal-surface' | 'surface',
  normalizedAltitude: number,
  x = 524_288,
  z = 524_288
): FlyoverRangeReading => ({
  handoff: { globeWeight: 0.5, range, surfaceWeight: 0.5 },
  surface: {
    latitude: (34 * Math.PI) / 180,
    longitude: 0,
    normalizedAltitude,
    x,
    z
  }
});

describe('the Targ Flyover on the Targ panel', () => {
  test('reads Orbital with no grid reference and the height in the game scale', () => {
    const model = targFlyoverPanelViewModel(overTarg(ORBITAL));
    expect(model.message).toBe('ORBITAL');
    expect(model.locationLabel).toBe('**-**');
    expect(targPanelReadouts(model)).toMatchObject({
      altitude: String(Math.trunc((2 * RADIUS) / 256)).padStart(5, '0'),
      location: '**-**',
      message: 'ORBITAL'.padEnd(23, ' '),
      speed: '+0000'
    });
  });

  test('reads the city grid reference and Range in the dual band', () => {
    const model = targFlyoverPanelViewModel(
      overTarg(
        surfaceReading('coastal-surface', 0.07, 8.5 * 65_536, 3.2 * 65_536),
        { x: 0, y: 1.07 * RADIUS, z: 0 },
        1
      )
    );
    expect(targPanelReadouts(model)).toMatchObject({
      altitude: String(Math.trunc((0.07 * RADIUS) / 256)).padStart(5, '0'),
      location: '08-03',
      message: 'COASTAL / SURFACE'.padEnd(23, ' '),
      speed: '+0001'
    });
  });

  test('shows asterisks where a value outgrows its field, and nought below ground', () => {
    const far = targFlyoverPanelViewModel(
      overTarg(ORBITAL, { x: 0, y: 12 * RADIUS, z: 0 }, 10)
    );
    expect(targPanelReadouts(far)).toMatchObject({
      altitude: '*****',
      speed: '+1024'
    });
    const below = targFlyoverPanelViewModel(
      overTarg(surfaceReading('surface', -0.2), { x: 0, y: 0.8 * RADIUS, z: 0 })
    );
    expect(targPanelReadouts(below)).toMatchObject({
      altitude: '00000',
      message: 'SURFACE'.padEnd(23, ' ')
    });
    const offGrid = targFlyoverPanelViewModel(
      overTarg(surfaceReading('coastal', 0.5, 200 * 65_536, 2 * 65_536))
    );
    expect(targPanelReadouts(offGrid).location).toBe('**-02');
  });
});

describe('the Flyover inspection line', () => {
  test('prints Body-relative Cartesian coordinates in Orbital', () => {
    expect(
      flyoverInspectionLine(overTarg(ORBITAL, { x: 1, y: -2, z: 8e6 }))
    ).toBe('TARG  X+1.000E+0 Y-2.000E+0 Z+8.000E+6');
  });

  test('prints longitude, latitude, surface X/Z and signed altitude outside Orbital', () => {
    expect(
      flyoverInspectionLine(overTarg(surfaceReading('coastal-surface', 0.07)))
    ).toBe('TARG  E000.00 N34.00  X00524288 Z00524288  H+7.000E-2 R');
    const southWest: FlyoverRangeReading = {
      handoff: { globeWeight: 0, range: 'surface', surfaceWeight: 1 },
      surface: {
        latitude: (-5.5 * Math.PI) / 180,
        longitude: (-120.25 * Math.PI) / 180,
        normalizedAltitude: -0.25,
        x: 16_777_215,
        z: 0
      }
    };
    expect(flyoverInspectionLine(overTarg(southWest))).toBe(
      'TARG  W120.25 S05.50  X16777215 Z00000000  H-2.500E-1 R'
    );
  });
});
