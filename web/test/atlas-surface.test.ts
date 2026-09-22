import { describe, expect, test } from 'bun:test';

import { fitBody } from '../src/atlas/bodyRange.ts';
import {
  catalogueBodyId,
  islandAt,
  layOutSurfaceLabels,
  nearestImage,
  readBodySurface,
  surfaceAnchor,
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
    expect(readBodySurface(data, 99)).toEqual({
      gaps: [],
      islands: [],
      labels: []
    });
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

describe('the surface anchor', () => {
  test('centres a ring about the coordinate origin instead of quartering it', async () => {
    const data = await catalogue();
    const lucan = readBodySurface(data, LUCAN);
    // LUCAN's twelve records ring the coordinate origin. Their arithmetic mean is the far side
    // of the surface, so cell 2048 drew the ring as four broken arcs in the four corners. The
    // circular mean is the ring's own centre.
    const anchor = surfaceAnchor(lucan);
    expect(anchor.x).toBeCloseTo(6, 0);
    expect(anchor.z).toBeCloseTo(6, 0);
    // And every record is then a couple of hundred cells from it, so the ring is one ring.
    for (const island of lucan.islands) {
      for (const cell of nearestImage(island.outline, anchor)) {
        expect(Math.abs(cell.x - anchor.x)).toBeLessThan(260);
        expect(Math.abs(cell.z - anchor.z)).toBeLessThan(260);
      }
    }
  });

  test('puts every Body\u2019s islands inside one square, with no copy needed', async () => {
    const data = await catalogue();
    const bodies = [...new Set(data.islands.map(island => island.body))].map(
      id => Number(id.replace('body-', ''))
    );
    // The property the single-image drawing rests on, and a property of the recovered data
    // rather than something the code can guarantee: after nearest-imaging, every vertex of
    // every Body lies within half a surface of its anchor. The worst is ERIS at 1,952 of the
    // 2,048 available, so a payload change could break this and should fail here if it does.
    let worst = 0;
    let withCoastlines = 0;
    for (const index of bodies) {
      const surface = readBodySurface(data, index);
      if (!surface.islands.length) {
        continue;
      }
      withCoastlines += 1;
      const anchor = surfaceAnchor(surface);
      for (const island of surface.islands) {
        for (const cell of nearestImage(island.outline, anchor)) {
          worst = Math.max(
            worst,
            Math.abs(cell.x - anchor.x),
            Math.abs(cell.z - anchor.z)
          );
        }
      }
    }
    expect(withCoastlines).toBe(9);
    expect(worst).toBeLessThan(SURFACE_CELLS / 2);
    expect(Math.round(worst)).toBe(1952);
  });

  test('shifts a seam-crossing record bodily, never per vertex', async () => {
    const data = await catalogue();
    const eris = readBodySurface(data, ERIS);
    const anchor = surfaceAnchor(eris);
    const snow = eris.islands.find(
      island => island.areaName === 'SNOW ISLAND'
    )!;
    const moved = nearestImage(snow.outline, anchor);
    // Same ring, translated by whole surfaces: every vertex moves by the same amount, so the
    // polygon cannot tear.
    expect(moved).toHaveLength(snow.outline.length);
    const dx = moved[0]!.x - snow.outline[0]!.x;
    const dz = moved[0]!.z - snow.outline[0]!.z;
    expect(dx % SURFACE_CELLS).toBe(0);
    expect(dz % SURFACE_CELLS).toBe(0);
    for (const [index, point] of moved.entries()) {
      expect(point.x - snow.outline[index]!.x).toBe(dx);
      expect(point.z - snow.outline[index]!.z).toBe(dz);
    }
    // ERIS's anchor is cell 3472, so SNOW ISLAND at -8..56 belongs on the far image.
    expect(dx).toBe(SURFACE_CELLS);
  });

  test('falls back to the middle for a Body with no coastline', async () => {
    const data = await catalogue();
    // 21 records carry only the coastline-less stub, and their Bodies have nothing to centre on.
    const stub = readBodySurface(data, 0);
    expect(stub.islands).toHaveLength(0);
    expect(surfaceAnchor(stub)).toEqual({
      x: SURFACE_CELLS / 2,
      z: SURFACE_CELLS / 2
    });
  });
});

describe('the names on a Body surface', () => {
  test('publishes every Settlement and Damocles Place Eris recovers', async () => {
    const data = await catalogue();
    const { labels } = readBodySurface(data, ERIS);
    // A Settlement is the area name a Damocles Island's bound workspace publishes, so the set is
    // exactly Eris's five named records and never an island without one.
    expect(
      labels
        .filter(label => label.kind === 'settlement')
        .map(label => label.name)
    ).toEqual([
      'CAPITAL CITY',
      'SNOW ISLAND',
      'VELOS CITY',
      'BARE ISLAND',
      'KEY WEST'
    ]);
    // And the Places are the Catalogue's own, in its order. PLAYTESTER STORES appears twice:
    // two records carrying one name, which is two Places and not a duplicate.
    expect(
      labels.filter(label => label.kind === 'place').map(label => label.name)
    ).toEqual(
      data.places
        .filter(place => place.body === catalogueBodyId(ERIS))
        .map(place => place.name)
    );
    expect(labels.filter(label => label.kind === 'place')).toHaveLength(11);
  });

  test('writes a Settlement at the origin its workspace is built at', async () => {
    const data = await catalogue();
    const { labels } = readBodySurface(data, ERIS);
    const capital = labels.find(label => label.name === 'CAPITAL CITY')!;
    const record = data.islands.find(island => island.id === capital.id)!;
    expect(capital.at).toEqual({ x: 64, z: 128 });
    expect([record.origin[0], record.origin[1]]).toEqual([64, 128]);
    // Every Place on the island falls inside that workspace's 16 cells, so the name lands on
    // what it names rather than out at sea.
    for (const place of labels.filter(label => label.kind === 'place')) {
      expect(place.at.x - capital.at.x).toBeGreaterThanOrEqual(0);
      expect(place.at.x - capital.at.x).toBeLessThan(16);
      expect(place.at.z - capital.at.z).toBeGreaterThanOrEqual(0);
      expect(place.at.z - capital.at.z).toBeLessThan(16);
    }
  });

  test('stands a Place where its own Instances are', async () => {
    const data = await catalogue();
    const { labels } = readBodySurface(data, ERIS);
    const state = labels.find(label => label.name === 'STATE OFFICE')!;
    const place = data.places.find(candidate => candidate.id === state.id)!;
    const positions = place.instances.map(
      id => data.instances.find(instance => instance.id === id)!.location!
    );
    expect(positions).toHaveLength(2);
    // The mean of the Instances and nothing else: the Catalogue publishes no position for a
    // Place, so there is no other number this could be.
    expect(state.at.x).toBeCloseTo(
      positions.reduce((sum, at) => sum + at.position[0], 0) / 2,
      9
    );
    expect(state.at.z).toBeCloseTo(
      positions.reduce((sum, at) => sum + at.position[2], 0) / 2,
      9
    );
  });

  test('names nothing on a Body whose records publish none', async () => {
    const data = await catalogue();
    // DIALIS carries only the coastline-less stub and no Place at all.
    expect(readBodySurface(data, 0).labels).toEqual([]);
  });
});

const METRICS = { charWidth: 6, lineHeight: 15 };
const eris = async () => readBodySurface(await catalogue(), ERIS);

describe('laying names out against a camera', () => {
  test('places a name below its own point', async () => {
    const { labels } = await eris();
    const capital = labels.find(label => label.name === 'CAPITAL CITY')!;
    const view = { cx: capital.at.x, cz: capital.at.z, span: 64 };
    const { placed } = layOutSurfaceLabels([capital], view, FRAME, METRICS);
    expect(placed).toHaveLength(1);
    // The camera is centred on the name, so its mark is the middle of the frame and its box
    // hangs under it, centred on the same pixel.
    expect(placed[0]!.x).toBeCloseTo(FRAME.width / 2, 6);
    expect(placed[0]!.y).toBeCloseTo(FRAME.height / 2, 6);
    expect(placed[0]!.box.x + placed[0]!.box.width / 2).toBeCloseTo(
      placed[0]!.x,
      6
    );
    expect(placed[0]!.box.y).toBeGreaterThan(placed[0]!.y);
  });

  test('withholds a name rather than writing it over another', async () => {
    const { labels } = await eris();
    const places = labels.filter(label => label.kind === 'place');
    // Eris's eleven Places share sixteen cells. At a camera showing the whole surface they are
    // a pixel apart, so all but the two the pile has room for are withheld, and every Place on
    // the frame is either written or counted: a name never simply disappears.
    const wide = layOutSurfaceLabels(places, fitBody(FRAME), FRAME, METRICS);
    const written = new Set(wide.placed.map(label => label.id));
    expect(written.size).toBeLessThan(places.length);
    expect(wide.suppressed + written.size).toBe(places.length);
    // Zooming into the workspace makes room for every one of them.
    const close = layOutSurfaceLabels(
      places,
      { cx: 72, cz: 136, span: 24 },
      FRAME,
      METRICS
    );
    expect(close.placed).toHaveLength(places.length);
    expect(close.suppressed).toBe(0);
  });

  test('keeps a Settlement name when Places crowd it', async () => {
    const { labels } = await eris();
    // Settlements are laid out first, so a name for a whole area is never crowded out by the
    // names inside it however many there are.
    const { placed } = layOutSurfaceLabels(
      labels,
      { cx: 72, cz: 136, span: 40 },
      FRAME,
      METRICS
    );
    expect(placed.map(label => label.name)).toContain('CAPITAL CITY');
  });

  test('writes a name on every wrap image the camera can see', async () => {
    const { labels } = await eris();
    const snow = labels.find(label => label.name === 'SNOW ISLAND')!;
    // A point crosses no seam of its own, but a camera wider than the surface sees the same
    // point several times over. SNOW ISLAND's origin is cell 32, and a camera two and a half
    // surfaces wide has three images of it on the frame.
    const images = layOutSurfaceLabels(
      [snow],
      {
        cx: snow.at.x + SURFACE_CELLS,
        cz: snow.at.z,
        span: 2.5 * SURFACE_CELLS
      },
      { height: 400, width: 1200 },
      METRICS
    ).placed;
    expect(images).toHaveLength(3);
    // Each one is a whole surface apart on screen, and they are all the same name.
    expect(new Set(images.map(label => label.id)).size).toBe(1);
    const across = images.map(label => label.x).sort((a, b) => a - b);
    expect(across[1]! - across[0]!).toBeCloseTo(across[2]! - across[1]!, 6);
  });

  test('withholds nothing for a name that is off screen', async () => {
    const { labels } = await eris();
    const capital = labels.find(label => label.name === 'CAPITAL CITY')!;
    const away = layOutSurfaceLabels(
      [capital],
      { cx: 2048, cz: 2048, span: 64 },
      FRAME,
      METRICS
    );
    // Off screen is not withheld: a camera leaves most of a surface behind it, and calling
    // those names suppressed would be untrue.
    expect(away.placed).toHaveLength(0);
    expect(away.suppressed).toBe(0);
  });
});
