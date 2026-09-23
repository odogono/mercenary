import { describe, expect, test } from 'bun:test';

import { centreReadout } from '../src/atlas/readout.ts';
import {
  islandAtCell,
  islandLocalCell,
  readBodySurface
} from '../src/atlas/surface.ts';
import { SURFACE_CELLS } from '../src/damocles/world.ts';
import { readGammaSystem } from '../src/flyover/documents.ts';
import { loadCatalogue } from './fixtures/catalogue.ts';

const ERIS = 11;

const payloads = async () => ({
  catalogue: await loadCatalogue(),
  system: readGammaSystem(
    await Bun.file('../payload/damocles/system.json').json()
  )
});

describe('the centre readout', () => {
  test('names the System alone when nothing else can name the point', async () => {
    const { system } = await payloads();
    const rows = centreReadout(
      { cx: 705_800, cz: 1_143_200, span: 1000 },
      { kind: 'system' }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      authored: false,
      label: 'System',
      value: '705,800 / 1,143,200'
    });
    expect(system.bodies.length).toBe(30);
  });

  test('adds a Body Coordinate from a disc, marked authored', async () => {
    const { catalogue } = await payloads();
    const { system } = await payloads();
    const eris = system.bodies.find(body => body.id === 'eris')!;
    const rows = centreReadout(
      { cx: eris.position.x, cz: eris.position.z, span: 1600 },
      {
        authored: true,
        body: eris,
        cell: { x: 3472, z: 437 },
        kind: 'body',
        surface: readBodySurface(catalogue, ERIS)
      }
    );
    expect(rows.map(row => row.label)).toEqual(['System', 'Body Coordinate']);
    // The System row is the camera's own, so it is not authored; the Body Coordinate was reached
    // through the authored surface scale, so it is.
    expect(rows[0]!.authored).toBe(false);
    expect(rows[1]!.authored).toBe(true);
    expect(rows[1]!.value).toBe('ERIS · 3472 / 437 cells');
  });

  test('drops the System row inside a Body, where nothing recovered gives one', async () => {
    const { catalogue, system } = await payloads();
    const eris = system.bodies.find(body => body.id === 'eris')!;
    // The Body Range is in Body Coordinates. A System position for a point on a surface would
    // only come from the authored scale, so it is not offered as though it were known.
    const rows = centreReadout(
      { cx: 71, cz: 136, span: 120 },
      {
        authored: false,
        body: eris,
        cell: { x: 71, z: 136 },
        kind: 'body',
        surface: readBodySurface(catalogue, ERIS)
      }
    );
    expect(rows.map(row => row.label)).toEqual([
      'Body Coordinate',
      'Island-Local Cell'
    ]);
    expect(rows.every(row => !row.authored)).toBe(true);
    // CAPITAL CITY's origin is cell 64 / 128, so 71 / 136 is 7 / 8 local to it.
    expect(rows[1]!.value).toBe('CAPITAL CITY · 7 / 8');
  });

  test('wraps a Body Coordinate onto the surface', async () => {
    const { catalogue, system } = await payloads();
    const eris = system.bodies.find(body => body.id === 'eris')!;
    const rows = centreReadout(
      { cx: 0, cz: 0, span: 1 },
      {
        authored: false,
        body: eris,
        cell: { x: SURFACE_CELLS + 71, z: -SURFACE_CELLS + 136 },
        kind: 'body',
        surface: readBodySurface(catalogue, ERIS)
      }
    );
    // The same place as 71 / 136, so it must read as it.
    expect(rows[0]!.value).toBe('ERIS · 71 / 136 cells');
    expect(rows[1]!.value).toBe('CAPITAL CITY · 7 / 8');
  });

  test('says nothing island-local over open sea', async () => {
    const { catalogue, system } = await payloads();
    const eris = system.bodies.find(body => body.id === 'eris')!;
    const rows = centreReadout(
      { cx: 2048, cz: 2048, span: 400 },
      {
        authored: false,
        body: eris,
        cell: { x: 2048, z: 2048 },
        kind: 'body',
        surface: readBodySurface(catalogue, ERIS)
      }
    );
    expect(rows.map(row => row.label)).toEqual(['Body Coordinate']);
  });
});

describe('the Island-Local Cell', () => {
  test('counts from the record origin, across the seam', async () => {
    const { catalogue } = await payloads();
    const surface = readBodySurface(catalogue, ERIS);
    const snow = surface.islands.find(
      island => island.areaName === 'SNOW ISLAND'
    )!;
    // SNOW ISLAND's origin is cell 32 / 1056 and the record crosses x = 0, so a cell just west
    // of the seam is a small negative offset rather than four thousand.
    expect(islandLocalCell(snow, { x: SURFACE_CELLS - 8, z: 1056 })).toEqual({
      x: -40,
      z: 0
    });
    expect(islandLocalCell(snow, { x: 40, z: 1060 })).toEqual({ x: 8, z: 4 });
  });

  test('finds the record a Body Coordinate is inside, on either side of the seam', async () => {
    const { catalogue } = await payloads();
    const surface = readBodySurface(catalogue, ERIS);
    const snow = surface.islands.find(
      island => island.areaName === 'SNOW ISLAND'
    )!;
    const centre = {
      x:
        snow.outline.reduce((sum, point) => sum + point.x, 0) /
        snow.outline.length,
      z:
        snow.outline.reduce((sum, point) => sum + point.z, 0) /
        snow.outline.length
    };
    // Its centroid sits at a negative coordinate; wrapped onto the surface it is near 4096, and
    // both must find the same record.
    expect(islandAtCell(surface, centre)?.id).toBe(snow.id);
    expect(
      islandAtCell(surface, { x: centre.x + SURFACE_CELLS, z: centre.z })?.id
    ).toBe(snow.id);
    expect(islandAtCell(surface, { x: 2048, z: 2048 })).toBe(null);
  });
});
