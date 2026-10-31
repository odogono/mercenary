import { describe, expect, test } from 'bun:test';

import type { RegionPlacement } from '../src/payload/documents.ts';
import {
  approachesAt,
  footprintsAt,
  surfaceRegions
} from '../src/session/surfaceRegions.ts';
import type { ObjectPlacement } from '../src/world/index.ts';

/// A building's Surface Region comes from its placement (ADR 0084): its
/// extent, and that grown by its approach.

const building = (
  id: string,
  region: RegionPlacement | undefined
): ObjectPlacement =>
  ({
    id,
    placement: 'surface',
    region,
    vertices: [
      { x: 1000, y: 0, z: 1000 },
      { x: 2000, y: 500, z: 2000 }
    ]
  }) as unknown as ObjectPlacement;

const SHRINE = { approach: 300, name: 'shrine', script: 'shrine' };

describe('Surface Regions', () => {
  test("are a building's extent, and its approach that grown but not below", () => {
    const regions = surfaceRegions([building('a', SHRINE)]);
    expect(footprintsAt(regions, { x: 1500, y: 63, z: 1500 })).toEqual([
      'shrine'
    ]);
    expect(footprintsAt(regions, { x: 900, y: 63, z: 1500 })).toEqual([]);
    expect(approachesAt(regions, { x: 900, y: 63, z: 1500 })).toEqual([
      'shrine'
    ]);
    expect(approachesAt(regions, { x: 600, y: 63, z: 1500 })).toEqual([]);
  });

  test('leave out whoever flies high over the building', () => {
    const regions = surfaceRegions([building('a', SHRINE)]);
    expect(approachesAt(regions, { x: 1500, y: 900, z: 1500 })).toEqual([]);
    expect(footprintsAt(regions, { x: 1500, y: 600, z: 1500 })).toEqual([]);
  });

  test('refuse a placement whose region is missing its Talk Script', () => {
    expect(() =>
      surfaceRegions([
        building('a', { name: 'shrine' } as unknown as RegionPlacement)
      ])
    ).toThrow('needs the Talk Script');
  });

  test('refuse two regions answered for by one Talk Script', () => {
    expect(() =>
      surfaceRegions([
        building('a', SHRINE),
        building('b', { ...SHRINE, name: 'temple' })
      ])
    ).toThrow('two Surface Regions name Talk Script shrine');
  });
});
