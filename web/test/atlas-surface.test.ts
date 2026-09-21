import { describe, expect, test } from 'bun:test';

import { fitBody } from '../src/atlas/bodyRange.ts';
import {
  catalogueBodyId,
  islandAt,
  readBodySurface,
  wrapImages
} from '../src/atlas/surface.ts';
import { parseCatalogue, type Catalogue } from '../src/catalogue/data.ts';
import { SURFACE_CELLS } from '../src/damocles/world.ts';
import { readGammaSystem } from '../src/flyover/documents.ts';

const FRAME = { height: 800, width: 1280 };
const ASPECT = FRAME.height / FRAME.width;
const ERIS = 11;
const LUCAN = 16;

let cached: Catalogue | undefined;
const catalogue = async () => {
  cached =
    cached ??
    parseCatalogue(await Bun.file('../payload/damocles/catalogue.json').json());
  return cached;
};

describe('the Atlas Body surface', () => {
  test('joins the two payloads by recovered source index', async () => {
    const [data, system] = [
      await catalogue(),
      readGammaSystem(await Bun.file('../payload/damocles/system.json').json())
    ];
    // `system.json` keys a Body by slug and `catalogue.json` by slot. Both derive from the same
    // recovered index, so every Body in one is reachable in the other, and the names agree.
    for (const body of system.bodies) {
      const twin = data.bodies.find(
        candidate => candidate.id === catalogueBodyId(body.sourceIndex)
      );
      expect(twin).toBeDefined();
      expect(twin?.name).toBe(body.name);
      // Both publish the surface colour. They must not disagree about a recovered value.
      expect(twin?.bodySurface?.baseColour).toBe(body.baseColour);
    }
  });

  test('places a coastline at its own origin in Surface Cells', async () => {
    const data = await catalogue();
    // The strongest available check on the composition: for every record that does not cross
    // the seam, origin plus island-local vertices reproduces the recovered extent box exactly.
    // 36 records qualify and none of them misses.
    let checked = 0;
    for (const island of data.islands) {
      if (
        !island.coastline.vertices.length ||
        island.extent.wrapsX ||
        island.extent.wrapsZ ||
        island.extent.coversSurface
      ) {
        continue;
      }
      const surface = readBodySurface(
        data,
        Number(island.body.replace('body-', ''))
      );
      const outline = surface.islands.find(
        candidate => candidate.id === island.id
      )!.outline;
      const xs = outline.map(point => point.x),
        zs = outline.map(point => point.z);
      expect([Math.min(...xs), Math.max(...xs)]).toEqual([...island.extent.x]);
      expect([Math.min(...zs), Math.max(...zs)]).toEqual([...island.extent.z]);
      checked += 1;
    }
    expect(checked).toBe(36);
  });

  test('keeps a record that crosses the seam whole', async () => {
    const data = await catalogue();
    const eris = readBodySurface(data, ERIS);
    const snow = eris.islands.find(
      island => island.areaName === 'SNOW ISLAND'
    )!;
    // Wrapping vertex by vertex would send one side of SNOW ISLAND to x = 4088 and the other to
    // x = 56, tearing it across the whole map. Left unwrapped it runs -8..56 and stays one ring.
    const xs = snow.outline.map(point => point.x);
    expect(Math.min(...xs)).toBe(-8);
    expect(Math.max(...xs)).toBe(56);
    // No edge spans anything like the surface, which is what a torn polygon would look like.
    for (const [index, point] of snow.outline.entries()) {
      const next = snow.outline[(index + 1) % snow.outline.length]!;
      expect(Math.abs(next.x - point.x)).toBeLessThan(SURFACE_CELLS / 2);
      expect(Math.abs(next.z - point.z)).toBeLessThan(SURFACE_CELLS / 2);
    }
  });

  test('finds every record that crosses the seam, on both axes', async () => {
    const data = await catalogue();
    const crossing: string[] = [];
    for (const index of [...new Set(data.islands.map(i => i.body))].map(id =>
      Number(id.replace('body-', ''))
    )) {
      for (const island of readBodySurface(data, index).islands) {
        const outside = island.outline.some(
          point =>
            point.x < 0 ||
            point.x >= SURFACE_CELLS ||
            point.z < 0 ||
            point.z >= SURFACE_CELLS
        );
        if (outside) {
          crossing.push(island.id);
        }
      }
    }
    // SNOW ISLAND on Eris, and four of Lucan's ring of twelve.
    expect(crossing).toHaveLength(5);
    expect(crossing).toContain('island-eris-06327c');
    expect(readBodySurface(data, LUCAN).islands).toHaveLength(12);
  });

  test('states a record with no coastline as a gap rather than drawing land', async () => {
    const data = await catalogue();
    let islands = 0,
      gaps = 0;
    for (const index of [...new Set(data.islands.map(i => i.body))].map(id =>
      Number(id.replace('body-', ''))
    )) {
      const surface = readBodySurface(data, index);
      islands += surface.islands.length;
      gaps += surface.gaps.length;
      // A record is one or the other, never both and never dropped.
      for (const gap of surface.gaps) {
        expect(gap.reason).toBeTruthy();
      }
    }
    // 41 of the 62 records carry a coastline; the other 21 share the coastline-less stub.
    expect(islands).toBe(41);
    expect(gaps).toBe(21);
  });

  test('is a pure function of the payload', async () => {
    const data = await catalogue();
    expect(readBodySurface(data, ERIS)).toEqual(readBodySurface(data, ERIS));
    expect(readBodySurface(data, 99)).toEqual({ gaps: [], islands: [] });
  });
});

describe('the wrap images of a coastline', () => {
  test('shows both sides of a record that crosses the seam', async () => {
    const data = await catalogue();
    const snow = readBodySurface(data, ERIS).islands.find(
      island => island.areaName === 'SNOW ISLAND'
    )!;
    // At the whole-surface camera both ends are on screen, so both images are drawn: the ring
    // at -8..56 and its copy at 4088..4152.
    const whole = wrapImages(snow.outline, fitBody(FRAME), ASPECT);
    expect(whole).toHaveLength(2);
    const offsets = whole
      .map(image => Math.min(...image.map(point => point.x)))
      .sort((a, b) => a - b);
    expect(offsets).toEqual([-8, SURFACE_CELLS - 8]);
    // Every image is a rigid translation of the same ring, so none of them is distorted.
    for (const image of whole) {
      expect(image).toHaveLength(snow.outline.length);
      const dx = image[0]!.x - snow.outline[0]!.x;
      for (const [index, point] of image.entries()) {
        expect(point.x - snow.outline[index]!.x).toBe(dx);
      }
    }
  });

  test('draws nothing for an island the camera cannot see', async () => {
    const data = await catalogue();
    const snow = readBodySurface(data, ERIS).islands.find(
      island => island.areaName === 'SNOW ISLAND'
    )!;
    expect(
      wrapImages(snow.outline, { cx: 2048, cz: 2048, span: 100 }, ASPECT)
    ).toEqual([]);
    // On the seam itself exactly one image covers the camera.
    expect(
      wrapImages(snow.outline, { cx: 0, cz: 1056, span: 200 }, ASPECT)
    ).toHaveLength(1);
  });

  test('covers a camera wider than the surface', async () => {
    const data = await catalogue();
    const island = readBodySurface(data, ERIS).islands[0]!;
    // A span of three surfaces must show three images across, or a frame wider than it is tall
    // would leave gaps where the surface visibly continues.
    const images = wrapImages(
      island.outline,
      { cx: SURFACE_CELLS / 2, cz: SURFACE_CELLS / 2, span: 3 * SURFACE_CELLS },
      1 / 3
    );
    expect(images.length).toBeGreaterThanOrEqual(3);
    expect(new Set(images.map(image => Math.round(image[0]!.x))).size).toBe(
      images.length
    );
  });

  test('gives an empty outline no images', () => {
    expect(wrapImages([], fitBody(FRAME), ASPECT)).toEqual([]);
  });
});

describe('picking a Damocles Island', () => {
  test('picks the record a Body Coordinate falls inside, and nothing in the sea', async () => {
    const data = await catalogue();
    const surface = readBodySurface(data, ERIS);
    const view = fitBody(FRAME);
    const capital = surface.islands.find(
      island => island.areaName === 'CAPITAL CITY'
    )!;
    // The centroid of a convex-enough ring is inside it, and every vertex neighbourhood is not
    // a safe bet, so the centroid is the honest probe.
    const centre = {
      x:
        capital.outline.reduce((sum, p) => sum + p.x, 0) /
        capital.outline.length,
      z:
        capital.outline.reduce((sum, p) => sum + p.z, 0) /
        capital.outline.length
    };
    expect(islandAt(surface, view, ASPECT, centre)?.id).toBe(capital.id);
    // Open sea, far from every Eris record.
    expect(islandAt(surface, view, ASPECT, { x: 2048, z: 2048 })).toBe(null);
  });

  test('picks the same record on either side of the seam', async () => {
    const data = await catalogue();
    const surface = readBodySurface(data, ERIS);
    const snow = surface.islands.find(
      island => island.areaName === 'SNOW ISLAND'
    )!;
    const view = fitBody(FRAME);
    const centre = {
      x: snow.outline.reduce((sum, p) => sum + p.x, 0) / snow.outline.length,
      z: snow.outline.reduce((sum, p) => sum + p.z, 0) / snow.outline.length
    };
    // The record runs -8..56, so its centroid sits at a negative coordinate and its wrap image
    // sits near 4096. Both must reach the same record, or a reader picking the half on the far
    // side of the seam would find nothing there.
    expect(islandAt(surface, view, ASPECT, centre)?.id).toBe(snow.id);
    expect(
      islandAt(surface, view, ASPECT, {
        x: centre.x + SURFACE_CELLS,
        z: centre.z
      })?.id
    ).toBe(snow.id);
  });

  test('picks every recovered island of a Body from its own centroid', async () => {
    const data = await catalogue();
    for (const index of [ERIS, LUCAN]) {
      const surface = readBodySurface(data, index);
      const view = fitBody(FRAME);
      for (const island of surface.islands) {
        const centre = {
          x:
            island.outline.reduce((sum, p) => sum + p.x, 0) /
            island.outline.length,
          z:
            island.outline.reduce((sum, p) => sum + p.z, 0) /
            island.outline.length
        };
        expect(islandAt(surface, view, ASPECT, centre)?.id).toBe(island.id);
      }
    }
  });
});
