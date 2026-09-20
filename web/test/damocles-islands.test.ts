import { describe, expect, test } from 'bun:test';

import { parseCatalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  classifyPosition,
  coastlineEdges,
  coastlineInBodyUnits,
  type LandSea
} from '../src/damocles/islands.ts';
import {
  SURFACE_CELLS,
  erisSurfaceFrom,
  islandOriginNear,
  surfaceOffset,
  type ErisSurface
} from '../src/damocles/world.ts';

const load = async (): Promise<ErisSurface> => {
  const [catalogue, presentation] = await Promise.all([
    Bun.file('../payload/damocles/catalogue.json').json(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json()
  ]);
  return erisSurfaceFrom(
    parseCatalogue(catalogue),
    readErisPresentation(presentation)
  );
};

/// The 115 probe points of #391, verbatim, as the laboratory asked the Working Authority for
/// them: whole Surface Cells on the Body.
const probePoints = async (): Promise<
  readonly { readonly id: string; readonly x: number; readonly z: number }[]
> =>
  (
    await Bun.file(
      new URL(
        '../../research/damocles-st/scenarios/eris-island-points.json',
        import.meta.url
      )
    ).json()
  ).points;

const answerAt = (surface: ErisSurface, x: number, z: number) =>
  classifyPosition(surface, {
    x: x * surface.grid.cellUnits,
    y: 63,
    z: z * surface.grid.cellUnits
  });

describe('the Damocles Island land and sea classifier', () => {
  /// The sweep table of docs/research/damocles-eris-islands.md, "Live classification sweep".
  ///
  /// Those are the answers the Working Authority itself published in `$78A6` over 115 restored
  /// captures, one per point, and they are what this transcription of `$0560F2` has to
  /// reproduce. The engine's answer and the note's transcription agreed on every point, so a
  /// row that this misses is this being wrong and not the note.
  const sweep = [
    {
      core: 2,
      island: 'CAPITAL CITY',
      land: 7,
      points: 20,
      prefix: 'capital-city',
      sea: 11
    },
    {
      core: 1,
      island: 'SNOW ISLAND',
      land: 6,
      points: 17,
      prefix: 'snow-island',
      sea: 10
    },
    {
      core: 2,
      island: 'VELOS CITY',
      land: 5,
      points: 17,
      prefix: 'velos-city',
      sea: 10
    },
    {
      core: 1,
      island: 'BARE ISLAND',
      land: 11,
      points: 27,
      prefix: 'bare-island',
      sea: 15
    },
    {
      core: 2,
      island: 'KEY WEST',
      land: 16,
      points: 34,
      prefix: 'key-west',
      sea: 16
    }
  ] as const;

  test('reproduces the #391 probe sweep, island by island', async () => {
    const surface = await load();
    const points = await probePoints();
    expect(points).toHaveLength(115);
    for (const row of sweep) {
      const mine = points.filter(point =>
        point.id.startsWith(`${row.prefix}-`)
      );
      expect(mine).toHaveLength(row.points);
      const tally: Record<LandSea, number> = { core: 0, land: 0, sea: 0 };
      for (const point of mine) {
        const answer = answerAt(surface, point.x, point.z);
        // Every point selected the record this note's table names, as the engine's own
        // `$7894` did at all 115.
        expect(answer.island?.areaName).toBe(row.island);
        tally[answer.kind] += 1;
      }
      expect(tally).toEqual({ core: row.core, land: row.land, sea: row.sea });
    }
  });

  test('answers the sweep as a whole the way the engine did', async () => {
    const surface = await load();
    const points = await probePoints();
    const tally: Record<LandSea, number> = { core: 0, land: 0, sea: 0 };
    for (const point of points) {
      tally[answerAt(surface, point.x, point.z).kind] += 1;
    }
    expect(tally).toEqual({ core: 8, land: 45, sea: 62 });
  });

  test('puts every offshore probe point at sea and every core point on a core', async () => {
    const surface = await load();
    const points = await probePoints();
    const offshore = points.filter(point => point.id.includes('-offshore-'));
    const cores = points.filter(point => point.id.endsWith('-core'));
    expect(offshore).toHaveLength(20);
    expect(cores).toHaveLength(5);
    for (const point of offshore) {
      expect(answerAt(surface, point.x, point.z).kind).toBe('sea');
    }
    for (const point of cores) {
      expect(answerAt(surface, point.x, point.z).kind).toBe('core');
    }
  });

  test('holds the coast on the three islands with no concave bay', async () => {
    const surface = await load();
    const points = await probePoints();
    // Three cells inside and three cells outside the midpoint of every coastline edge. On a
    // convex island the two answers are land and sea without exception; BARE ISLAND and
    // KEY WEST are excluded because their bays put a point three cells outside one edge
    // inside another lobe of the same island, which the sweep totals above already pin.
    for (const prefix of ['capital-city', 'snow-island', 'velos-city']) {
      const edges = points.filter(point =>
        point.id.startsWith(`${prefix}-edge`)
      );
      expect(edges.length).toBeGreaterThan(0);
      for (const point of edges) {
        const answer = answerAt(surface, point.x, point.z);
        if (point.id.endsWith('-in')) {
          // Inside, which on a cell that also falls in the authored core box reads core.
          expect(answer.kind).not.toBe('sea');
        } else {
          expect(answer.kind).toBe('sea');
        }
      }
    }
  });

  test('classifies across the coordinate seam, where SNOW ISLAND crosses it', async () => {
    const surface = await load();
    // The note's clearest single demonstration that the wrap is real. Asked for these three
    // body x, the engine republished 4082.5, 4095.45 and 4089.55 — the same positions 4096
    // cells along — and answered sea, land, sea.
    expect(answerAt(surface, -13.5, 1064.5).kind).toBe('sea');
    expect(answerAt(surface, -0.5494, 1067.958).kind).toBe('land');
    expect(answerAt(surface, -6.4506, 1066.442).kind).toBe('sea');
    // The same three positions named on the far side of the seam answer identically: they are
    // the same three positions.
    for (const [x, z] of [
      [-13.5, 1064.5],
      [-0.5494, 1067.958],
      [-6.4506, 1066.442]
    ] as const) {
      expect(answerAt(surface, x + SURFACE_CELLS, z).kind).toBe(
        answerAt(surface, x, z).kind
      );
    }
  });

  test('refuses the water damocles.key-west.sav was captured over', async () => {
    const surface = await load();
    // The strongest single capture of #391, and the only one taken over water: position
    // (2620.26, 3639.49), origin 2560,3584, group $15, `$78A6` = $FFFF.
    const answer = answerAt(surface, 2620.26, 3639.49);
    expect(answer.kind).toBe('sea');
    expect(answer.island?.areaName).toBe('KEY WEST');
    expect(answer.island?.origin).toEqual({ x: 2560, z: 3584 });
  });

  test('separates the two 09-08 cells, which are different locations', async () => {
    const surface = await load();
    const capital = answerAt(surface, 73, 136);
    const keyWest = answerAt(surface, 2569, 3592);
    expect(capital.kind).toBe('core');
    expect(keyWest.kind).toBe('core');
    expect(capital.island?.areaName).toBe('CAPITAL CITY');
    expect(keyWest.island?.areaName).toBe('KEY WEST');
    expect(capital.island?.id).not.toBe(keyWest.island?.id);
  });

  test('reads each coastline edge word as the closed cycle of its polygon', async () => {
    const surface = await load();
    for (const island of surface.islands) {
      const edges = coastlineEdges(island);
      expect(edges).toHaveLength(island.coastline.vertices.length);
      // Every vertex is left once and arrived at once: the words are a cycle, not a bag of
      // segments, which is what makes "first edge whose box holds the point" well defined.
      const from = new Set(edges.map(edge => edge.from.join()));
      const to = new Set(edges.map(edge => edge.to.join()));
      expect(from.size).toBe(edges.length);
      expect(to.size).toBe(edges.length);
      expect([...from].sort()).toEqual([...to].sort());
    }
  });
});

describe('the Body Coordinate wrap', () => {
  test('takes the shorter way round rather than the arithmetic difference', () => {
    expect(surfaceOffset(35, 32)).toBe(3);
    expect(surfaceOffset(32, 35)).toBe(-3);
    // Snow Island's west coast: body x 4088 is eight cells west of the origin, not 4056 east.
    expect(surfaceOffset(4088, 32)).toBe(-40);
    expect(surfaceOffset(0, SURFACE_CELLS - 1)).toBe(1);
  });

  test('places an island on the wrap image nearest the eye, whole', async () => {
    const surface = await load();
    const snow = surface.islands.find(
      island => island.areaName === 'SNOW ISLAND'
    )!;
    const cell = surface.grid.cellUnits;
    // Standing east of the island the origin is its own 32; standing at the seam west of it
    // the origin is 4128, the same cell one surface along, so the coastline stays one shape.
    const east = islandOriginNear(
      { x: 40 * cell, y: 63, z: 1060 * cell },
      surface.grid,
      snow
    );
    const seam = islandOriginNear(
      { x: -1 * cell, y: 63, z: 1060 * cell },
      surface.grid,
      snow
    );
    expect(east.x / cell).toBe(32);
    expect(seam.x / cell).toBe(32);
    const far = islandOriginNear(
      { x: 4090 * cell, y: 63, z: 1060 * cell },
      surface.grid,
      snow
    );
    expect(far.x / cell).toBe(SURFACE_CELLS + 32);

    // Whole either way: the span of the drawn coastline is the island's own, never a surface.
    for (const eye of [
      { x: 40 * cell, y: 63, z: 1060 * cell },
      { x: 4090 * cell, y: 63, z: 1060 * cell }
    ]) {
      const drawn = coastlineInBodyUnits(snow, surface.grid, eye);
      const xs = drawn.map(([x]) => x / cell);
      expect(Math.max(...xs) - Math.min(...xs)).toBe(64);
      expect(drawn).toHaveLength(snow.coastline.vertices.length);
    }
  });
});

type Outline = readonly (readonly [number, number])[];

const signedArea = (vertices: Outline): number =>
  vertices.reduce((sum, [x, z], index) => {
    const [nx, nz] = vertices[(index + 1) % vertices.length]!;
    return sum + (x * nz - nx * z);
  }, 0) / 2;

const isConvex = (vertices: Outline): boolean => {
  const signs = vertices.map((_, index) => {
    const [ax, az] = vertices[index]!;
    const [bx, bz] = vertices[(index + 1) % vertices.length]!;
    const [cx, cz] = vertices[(index + 2) % vertices.length]!;
    return Math.sign((bx - ax) * (cz - bz) - (bz - az) * (cx - bx));
  });
  return new Set(signs.filter(sign => sign !== 0)).size === 1;
};

describe('the recovered shape of each Eris island', () => {
  /// docs/research/damocles-eris-islands.md, "Eris": the five records, their origins, their
  /// coastline extents in Body Coordinates and their land colours. Shape, scale, orientation
  /// and relative placement are all readable from this table, and all four are what a drawn
  /// island has to get right.
  const recovered = [
    {
      area: 'CAPITAL CITY',
      colour: '#006600',
      origin: [64, 128],
      span: [66, 48],
      vertices: 7,
      x: [38, 104],
      z: [112, 160]
    },
    {
      area: 'SNOW ISLAND',
      colour: '#eeeeee',
      origin: [32, 1056],
      span: [64, 36],
      vertices: 6,
      x: [-8, 56],
      z: [1040, 1076]
    },
    {
      area: 'VELOS CITY',
      colour: '#884400',
      origin: [1536, 768],
      span: [56, 48],
      vertices: 6,
      x: [1520, 1576],
      z: [752, 800]
    },
    {
      area: 'BARE ISLAND',
      colour: '#664444',
      origin: [3072, 512],
      span: [84, 44],
      vertices: 11,
      x: [3052, 3136],
      z: [496, 540]
    },
    {
      area: 'KEY WEST',
      colour: '#006600',
      origin: [2560, 3584],
      span: [80, 108],
      vertices: 14,
      x: [2528, 2608],
      z: [3524, 3632]
    }
  ] as const;

  test('draws each island at its recovered placement, scale and orientation', async () => {
    const surface = await load();
    expect(surface.islands).toHaveLength(5);
    expect(surface.baseColour).toBe('#000066');
    const cell = surface.grid.cellUnits;
    for (const want of recovered) {
      const island = surface.islands.find(item => item.areaName === want.area)!;
      expect(island.origin).toEqual({ x: want.origin[0], z: want.origin[1] });
      expect(island.landColour).toBe(want.colour);
      expect(island.coastline.vertices).toHaveLength(want.vertices);
      // Drawn from an eye beside the island, which is where its own wrap image is.
      const eye = {
        x: want.origin[0] * cell,
        y: 63,
        z: want.origin[1] * cell
      };
      const drawn = coastlineInBodyUnits(island, surface.grid, eye);
      const xs = drawn.map(([x]) => x / cell);
      const zs = drawn.map(([, z]) => z / cell);
      // Placement and orientation: the outline sits at the recovered Body Coordinates, not
      // merely at the recovered size somewhere.
      expect([Math.min(...xs), Math.max(...xs)]).toEqual([...want.x]);
      expect([Math.min(...zs), Math.max(...zs)]).toEqual([...want.z]);
      // Scale: the span the table records, in whole Surface Cells.
      expect(Math.max(...xs) - Math.min(...xs)).toBe(want.span[0]);
      expect(Math.max(...zs) - Math.min(...zs)).toBe(want.span[1]);
    }
  });

  test('keeps the two islands the research names concave concave', async () => {
    const surface = await load();
    // A convex hull would swallow BARE ISLAND's central V and both of KEY WEST's bays, and
    // the classifier's answers at those points are what the sweep above pins.
    const byArea = Object.fromEntries(
      surface.islands.map(island => [
        island.areaName,
        island.coastline.vertices
      ])
    );
    expect(isConvex(byArea['BARE ISLAND']!)).toBe(false);
    expect(isConvex(byArea['KEY WEST']!)).toBe(false);
    for (const area of ['CAPITAL CITY', 'SNOW ISLAND', 'VELOS CITY']) {
      expect(isConvex(byArea[area]!)).toBe(true);
    }
    // All five wind the same way, which is what lets one side test serve every edge.
    for (const island of surface.islands) {
      expect(signedArea(island.coastline.vertices)).toBeLessThan(0);
    }
  });
});
