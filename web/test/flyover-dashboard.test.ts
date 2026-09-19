import { describe, expect, test } from 'bun:test';

import { flyoverPanelViewModel } from '../src/flyover/dashboard.ts';
import type { FlyoverBody } from '../src/flyover/system.ts';

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
        range: 'orbital',
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
      range: 'orbital',
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
