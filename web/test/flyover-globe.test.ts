import { describe, expect, test } from 'bun:test';

import { readFlyoverPresentation } from '../src/flyover/documents.ts';
import { globeIslandsOf, globeMapped } from '../src/flyover/globe.ts';
import { surfacePositionOf } from '../src/flyover/surfaceFrame.ts';
import { composeTargSystem } from '../src/flyover/system.ts';
import { defaultSettings } from '../src/settings/index.ts';
import { TARG_SYSTEM } from './fixtures/targSystem.ts';

const system = composeTargSystem(
  TARG_SYSTEM,
  readFlyoverPresentation(await Bun.file('flyover/targ.json').json(), 'targ', [
    'targ',
    'sun',
    'inner-moon',
    'outer-moon'
  ]),
  defaultSettings().presentation.sky
);
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const city = system.surfaceFrame.island;
const patch = city.surfacePatch!;
const wrap = (value: number) => ((value % 2 ** 24) + 2 ** 24) % 2 ** 24;

describe('the Targ Globe', () => {
  test('maps longitude and latitude exactly as the surface patch does', () => {
    for (const [lon, lat] of [
      [0, 34],
      [10, 40],
      [-15, 20],
      [120, 20],
      [-170, -60]
    ] as const) {
      const [u, v] = globeMapped(radians(lon), radians(lat), system);
      const surface = surfacePositionOf(radians(lon), radians(lat), city);
      expect(wrap(patch.sourceCentre.x + u * patch.unitsPerRadian)).toBeCloseTo(
        surface.x,
        3
      );
      expect(wrap(patch.sourceCentre.z + v * patch.unitsPerRadian)).toBeCloseTo(
        surface.z,
        3
      );
    }
  });

  test('carries every Targ Island polygon in mapped coordinates, in document order', () => {
    const islands = globeIslandsOf(system);
    expect(Array.from(islands.counts)).toEqual(
      system.islands.map(island => island.polygonDegrees.length)
    );
    expect(Array.from(islands.starts)).toEqual([0, 4]);
    const [u, v] = globeMapped(radians(16), radians(50), system);
    expect(islands.vertices[2 * 2]).toBeCloseTo(u, 6);
    expect(islands.vertices[2 * 2 + 1]).toBeCloseTo(v, 6);
    expect(islands.colours).toEqual({
      coastline: [0xd0 / 255, 0xb8 / 255, 0x78 / 255],
      ground: [0, 0x80 / 255, 0],
      ocean: [0x18 / 255, 0x38 / 255, 0x58 / 255]
    });
    expect(islands.frameLatitude).toBeCloseTo(radians(34), 15);
  });

  test('refuses more Island vertices than the Globe shader holds', () => {
    const crowded = {
      ...system,
      islands: [
        {
          ...city,
          polygonDegrees: Array.from(
            { length: 65 },
            (_, index) =>
              [
                16 * Math.cos((index / 65) * 2 * Math.PI),
                34 + 16 * Math.sin((index / 65) * 2 * Math.PI)
              ] as const
          )
        }
      ]
    };
    expect(() => globeIslandsOf(crowded)).toThrow('64 Island vertices');
  });
});
