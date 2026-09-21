import { describe, expect, test } from 'bun:test';

import { bodyFacts, bodyProvenance } from '../src/atlas/panel.ts';
import { atlasHref, atlasSearch, readAtlasState } from '../src/atlas/state.ts';
import {
  bodyRadius,
  fitSystem,
  labelOf,
  layOutLabels,
  markerAt,
  markerView,
  projectSystem
} from '../src/atlas/system.ts';
import {
  clusterAll,
  fitView,
  project,
  zoomOf,
  zoomView
} from '../src/catalogue/mapView.ts';
import { readGammaSystem, type GammaBody } from '../src/flyover/documents.ts';

const FRAME = { height: 600, width: 900 };
const ASPECT = FRAME.height / FRAME.width;

const gammaSystem = async () =>
  readGammaSystem(await Bun.file('../payload/damocles/system.json').json());

const body = (
  id: string,
  x: number,
  z: number,
  radiusExtent: number,
  sourceIndex = 0
): GammaBody => ({
  baseColour: '#888888',
  id,
  name: id.toUpperCase(),
  position: { x, y: 0, z },
  radiusExtent,
  sourceColour: 0x7_77,
  sourceIndex
});

/// A packed extent (#424): mantissa normalised into $1000..$1FFF against a binary exponent.
const packed = (exponent: number, mantissa = 0x10_00) =>
  (exponent << 16) | mantissa;

describe('the Atlas System Range camera', () => {
  test('fits the whole recovered System in both axes', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    // The Gamma System is taller than it is wide, Z spanning 4,737,600 against X's 4,150,000,
    // so a span measured across the width alone would cut MENTOR and JUNO off the map.
    for (const value of system.bodies) {
      const { u, v } = project(
        fit,
        { x: value.position.x, z: value.position.z },
        ASPECT
      );
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test('leaves the square Catalogue fit exactly as it was', async () => {
    const system = await gammaSystem();
    const points = system.bodies.map(value => ({
      x: value.position.x,
      z: value.position.z
    }));
    expect(fitView(points)).toEqual(fitView(points, 1));
    // The Catalogue's own framing: the widest axis padded to the middle 80%.
    expect(fitView(points).span).toBeCloseTo(4_737_600 * 1.25, 0);
  });

  test('is a pure function of the payload and the camera', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    expect(projectSystem(system.bodies, fit, FRAME)).toEqual(
      projectSystem(system.bodies, fit, FRAME)
    );
  });

  test('survives an empty System and a frame with no area', () => {
    expect(fitSystem([], FRAME)).toEqual({ cx: 0, cz: 0, span: 1 });
    expect(projectSystem([], { cx: 0, cz: 0, span: 1 }, FRAME).markers).toEqual(
      []
    );
    const one = [body('a', 5, 0, packed(15))];
    const collapsed = projectSystem(
      one,
      fitSystem(one, { height: 0, width: 0 }),
      { height: 0, width: 0 }
    );
    expect(Number.isFinite(collapsed.markers[0]!.x)).toBe(true);
  });

  test('runs X right and Z up', () => {
    const { markers } = projectSystem(
      [
        body('west', -1_000_000, 0, packed(15), 0),
        body('east', 1_000_000, 0, packed(15), 1),
        body('north', 0, 1_000_000, packed(15), 2)
      ],
      { cx: 0, cz: 0, span: 4_000_000 },
      FRAME
    );
    const at = (id: string) => markers.find(marker => marker.id === id)!;
    expect(at('east').x).toBeGreaterThan(at('west').x);
    // Screen y grows downwards, so a Body further north sits nearer the top.
    expect(at('north').y).toBeLessThan(at('west').y);
  });
});

describe('the Atlas System Range markers', () => {
  test('draw the ten recovered groups at the fit camera', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const { markers } = projectSystem(system.bodies, fit, FRAME);
    // Purely geometric: no type and no Primary is recovered, and none is consulted here. That
    // this is also the star, the nine planets and the comet is what the coordinates say.
    expect(
      markers.map(marker => `${marker.name}:${marker.bodyIds.length}`).sort()
    ).toEqual([
      'DAMOCLES:1',
      'DIALIS:2',
      'DION:4',
      'ERIS:6',
      'GAEA:3',
      'JUNO:5',
      'LOGOS:2',
      'MENTOR:2',
      'MIDAS:2',
      'TRITON:3'
    ]);
    expect(markers.flatMap(marker => marker.bodyIds)).toHaveLength(30);
    expect(new Set(markers.flatMap(marker => marker.bodyIds)).size).toBe(30);
  });

  test('sit inside a wide plateau, so the pixel gap cannot drift silently', async () => {
    const system = await gammaSystem();
    const points = system.bodies.map(value => ({
      x: value.position.x,
      z: value.position.z
    }));
    const fit = fitSystem(system.bodies, FRAME);
    const groupsAt = (pixels: number) =>
      clusterAll(points, (pixels * fit.span) / FRAME.width);
    // Every gap from 6 to 19 px gives the same ten groups; MARKER_GAP is 14, the middle of it.
    const ten = groupsAt(14);
    for (const pixels of [6, 8, 10, 14, 18, 19]) {
      expect(groupsAt(pixels)).toEqual(ten);
    }
    // Below the plateau DIALIS separates from ICARUS, 58,807 units or 5.96 px apart.
    expect(groupsAt(5)).toHaveLength(11);
    // Above it DAMOCLES chains into the GAEA group across 193,250 units.
    expect(groupsAt(20)).toHaveLength(9);
  });

  test('split monotonically as the camera zooms in', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    let previous = 0;
    for (const factor of [1, 2, 8, 32, 64, 512, 4096]) {
      const { markers } = projectSystem(
        system.bodies,
        zoomView(fit, fit, factor),
        FRAME
      );
      expect(markers.length).toBeGreaterThanOrEqual(previous);
      previous = markers.length;
    }
    // Every marker stands for exactly one Body once the tightest recovered pair, SOLON and
    // ERIS at 2,332 units, is more than MARKER_GAP apart.
    expect(previous).toBe(system.bodies.length);
  });

  test('wear the largest decoded size of their members, ties by source slot', () => {
    const { markers } = projectSystem(
      [
        body('small', 0, 0, packed(14), 1),
        body('widest', 200, 0, packed(18), 2),
        body('tied-late', 400, 0, packed(18), 3)
      ],
      { cx: 0, cz: 0, span: 1_000_000 },
      FRAME
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]!.id).toBe('widest');
    expect(markers[0]!.bodyIds).toEqual(['small', 'widest', 'tied-late']);
    // The marker stands on the named Body's own recovered position, not on a centroid.
    expect(markers[0]!.world).toEqual({ x: 200, z: 0 });
  });

  test('open to their members when picked, and always split doing it', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const { markers } = projectSystem(system.bodies, fit, FRAME);
    for (const marker of markers.filter(value => value.bodyIds.length > 1)) {
      const opened = markerView(marker, system.bodies, fit, FRAME);
      const inside = projectSystem(system.bodies, opened, FRAME).markers;
      for (const id of marker.bodyIds) {
        const own = inside.find(value => value.bodyIds.includes(id))!;
        expect(own.bodyIds).toEqual([id]);
        expect(own.x).toBeGreaterThanOrEqual(0);
        expect(own.x).toBeLessThanOrEqual(FRAME.width);
        expect(own.y).toBeGreaterThanOrEqual(0);
        expect(own.y).toBeLessThanOrEqual(FRAME.height);
      }
      expect(zoomOf(fit, opened)).toBeGreaterThan(1);
    }
  });

  test('count a group as a count, never as a relationship', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const { markers } = projectSystem(system.bodies, fit, FRAME);
    const eris = markers.find(marker => marker.id === 'eris')!;
    expect(labelOf(eris)).toBe('ERIS +5');
    expect(labelOf(markers.find(marker => marker.id === 'damocles')!)).toBe(
      'DAMOCLES'
    );
  });
});

describe('the Atlas System Range sizes', () => {
  test('carry a derived radius no pair of Bodies can overlap', async () => {
    const system = await gammaSystem();
    // RADIUS_DIVISOR is derived, so the bound it satisfies is the test: no two of the thirty
    // recovered Bodies may overlap at their derived radii. The tightest pair is ERIS and VESTA,
    // 2,400 units apart, which fixes the divisor's lower bound at 166.4.
    let tightest = Infinity;
    for (const [index, a] of system.bodies.entries()) {
      for (const b of system.bodies.slice(index + 1)) {
        tightest = Math.min(
          tightest,
          Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) -
            bodyRadius(a) -
            bodyRadius(b)
        );
      }
    }
    expect(tightest).toBeGreaterThan(0);
    expect(Math.round(tightest)).toBe(840);
    expect(
      Math.round(bodyRadius(system.bodies.find(b => b.id === 'eris')!))
    ).toBe(1200);
  });

  test('become the Body once its derived radius covers more than its marker', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    // Far out every disc is a marker, because a Body really is well under a pixel across.
    expect(
      projectSystem(system.bodies, fit, FRAME).markers.every(
        marker => !marker.toScale
      )
    ).toBe(true);
    // Close in every disc is the Body. The smallest moons have a derived radius of 40 units, so
    // they are the last to cross their marker and that takes a deep camera.
    expect(
      projectSystem(
        system.bodies,
        zoomView(fit, fit, 4096),
        FRAME
      ).markers.every(marker => marker.toScale)
    ).toBe(true);
    let previous = 0;
    for (const factor of [1, 4, 16, 64, 128, 512, 4096]) {
      const { markers } = projectSystem(
        system.bodies,
        zoomView(fit, fit, factor),
        FRAME
      );
      const scaled = markers.filter(marker => marker.toScale).length;
      expect(scaled / markers.length).toBeGreaterThanOrEqual(previous);
      previous = scaled / markers.length;
    }
  });

  test('draw a Body against the distance scale once to scale', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const projection = projectSystem(
      system.bodies,
      zoomView(fit, fit, 512),
      FRAME
    );
    // The point of a derived radius: a disc measures the same on screen as the distances beside
    // it, so ERIS's 1,200-unit radius is drawn against the 2,332 units to SOLON.
    const eris = projection.markers.find(marker => marker.id === 'eris')!;
    const solon = projection.markers.find(marker => marker.id === 'solon')!;
    expect(eris.radius + solon.radius).toBeLessThan(
      Math.hypot(eris.x - solon.x, eris.y - solon.y)
    );
    expect(eris.radius).toBeGreaterThan(solon.radius * 5);
    expect(eris.radius).toBeCloseTo(
      bodyRadius(system.bodies.find(b => b.id === 'eris')!) /
        projection.unitsPerPixel,
      6
    );
  });

  test('never overlap one another on screen, at any camera', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    // The two regimes the map has. Two discs both drawn at their derived radius can never
    // intersect, because that is the bound RADIUS_DIVISOR satisfies. Markers are held apart by
    // MARKER_GAP only, so two of them may touch: at 11 css pixels a marker is wider than half
    // the gap, which is a judgement about symbols and not a claim about Bodies.
    for (const factor of [1, 2, 4, 8, 16, 32, 64, 128, 512, 4096]) {
      const { markers } = projectSystem(
        system.bodies,
        zoomView(fit, fit, factor),
        FRAME
      );
      for (const [index, a] of markers.entries()) {
        for (const b of markers.slice(index + 1)) {
          const apart = Math.hypot(a.x - b.x, a.y - b.y);
          expect(apart).toBeGreaterThanOrEqual(14);
          if (a.toScale && b.toScale) {
            expect(a.radius + b.radius).toBeLessThan(apart);
          }
        }
      }
    }
  });

  test('compress a marker by a cube root, keeping the order', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const { markers } = projectSystem(system.bodies, fit, FRAME);
    const at = (id: string) => markers.find(marker => marker.id === id)!.radius;
    // DIALIS holds the largest decoded size and draws at the widest marker. Markers are
    // deliberately compressed, so the ratio between two of them is not the ratio between two
    // Bodies; the order survives and nothing falls below the floor.
    expect(at('dialis')).toBeCloseTo(11, 10);
    expect(at('juno')).toBeLessThan(at('dialis'));
    expect(at('eris')).toBeLessThan(at('juno'));
    for (const marker of markers) {
      expect(marker.radius).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('the Atlas System Range hit test', () => {
  test('picks the nearest marker within its own radius', () => {
    const projection = projectSystem(
      [
        body('big', 0, 0, packed(20), 0),
        body('small', 300_000, 0, packed(14), 1)
      ],
      { cx: 150_000, cz: 0, span: 600_000 },
      FRAME
    );
    const at = (id: string) =>
      projection.markers.find(marker => marker.id === id)!;
    expect(markerAt(projection, at('big').x, at('big').y)?.id).toBe('big');
    expect(markerAt(projection, at('small').x, at('small').y)?.id).toBe(
      'small'
    );
  });

  test('keeps a tiny marker pickable, and picks nothing beyond', () => {
    const projection = projectSystem(
      [
        body('tiny', 0, 0, packed(13), 0),
        body('huge', 900_000, 0, packed(22), 1)
      ],
      { cx: 0, cz: 0, span: 2_000_000 },
      FRAME
    );
    const tiny = projection.markers.find(marker => marker.id === 'tiny')!;
    // NARROWEST_MARKER: a Body too small to draw is still a three-pixel symbol, and
    // PICK_RADIUS makes it a nine-pixel target.
    expect(tiny.radius).toBe(3);
    expect(markerAt(projection, tiny.x + 8, tiny.y)?.id).toBe('tiny');
    expect(markerAt(projection, tiny.x + 13, tiny.y)).toBe(null);
    expect(markerAt(projection, -50, -50)).toBe(null);
  });
});

describe('the Atlas System Range labels', () => {
  const metrics = { charWidth: 7, lineHeight: 15 };

  test('name eight of the ten markers at this fit camera', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const projection = projectSystem(system.bodies, fit, FRAME);
    const labels = layOutLabels(projection, FRAME, metrics);
    // The payoff over a static fit, which places only nine of *thirty* names. Two of the ten
    // markers fall inside the crowded inner System at this frame, where DIALIS, DION, ERIS and
    // GAEA are already within a label's width of each other, and they take their names back as
    // the camera zooms into that knot. A wider frame places more: the browser's 962 px stage
    // names nine. Pinned rather than bounded, so a regression in the fallback placements shows.
    expect(labels.placed).toHaveLength(8);
    expect(labels.offscreen).toEqual([]);
    expect(
      labels.placed.length + labels.suppressed.length + labels.offscreen.length
    ).toBe(projection.markers.length);
    expect(labels.placed.map(label => label.text)).toContain('ERIS +5');
    expect(new Set(labels.placed.map(label => label.id)).size).toBe(
      labels.placed.length
    );
  });

  test('counts a marker off the frame as off screen and not as withheld', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const projection = projectSystem(
      system.bodies,
      zoomView(fit, fit, 32),
      FRAME
    );
    const labels = layOutLabels(projection, FRAME, metrics);
    expect(labels.offscreen.length).toBeGreaterThan(0);
    expect(
      labels.placed.length + labels.suppressed.length + labels.offscreen.length
    ).toBe(projection.markers.length);
  });

  test('never overlaps two placed labels or leaves the frame', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const labels = layOutLabels(
      projectSystem(system.bodies, fit, FRAME),
      FRAME,
      metrics
    );
    const boxes = labels.placed.map(label => ({
      height: metrics.lineHeight,
      width: label.text.length * metrics.charWidth,
      x: label.x,
      y: label.y
    }));
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(FRAME.width);
      expect(box.y + box.height).toBeLessThanOrEqual(FRAME.height);
    }
    for (const [index, a] of boxes.entries()) {
      for (const b of boxes.slice(index + 1)) {
        const apart =
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  test('never lays a label across another marker', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const projection = projectSystem(system.bodies, fit, FRAME);
    const labels = layOutLabels(projection, FRAME, metrics);
    for (const label of labels.placed) {
      const box = {
        height: metrics.lineHeight,
        width: label.text.length * metrics.charWidth,
        x: label.x,
        y: label.y
      };
      for (const marker of projection.markers) {
        if (marker.id === label.id) {
          continue;
        }
        const clear =
          box.x >= marker.x + marker.radius ||
          box.x + box.width <= marker.x - marker.radius ||
          box.y >= marker.y + marker.radius ||
          box.y + box.height <= marker.y - marker.radius;
        expect(clear).toBe(true);
      }
    }
  });
});

describe('the Atlas state', () => {
  const ids = ['eris', 'dialis'];

  test('round-trips a Range and its camera through the URL', () => {
    for (const state of [
      { level: 'system', view: null } as const,
      {
        level: 'system',
        view: { span: 8_883_000, x: 1234.56, z: -78.9 }
      } as const,
      { bodyId: 'eris', level: 'body', view: null } as const,
      {
        bodyId: 'eris',
        level: 'body',
        view: { span: 4096, x: 12.34, z: 56.78 }
      } as const
    ]) {
      expect(readAtlasState(atlasSearch(state), ids)).toEqual(state);
    }
    expect(atlasHref({ level: 'system', view: null })).toBe('/damocles/atlas');
    expect(atlasHref({ bodyId: 'eris', level: 'body', view: null })).toBe(
      '/damocles/atlas?body=eris'
    );
    expect(
      atlasHref({ level: 'system', view: { span: 100, x: 1, z: 2 } })
    ).toBe('/damocles/atlas?x=1&z=2&span=100');
  });

  test('is idempotent through a second round trip', () => {
    const state = {
      level: 'system',
      view: { span: 1 / 3, x: Math.PI, z: -Math.E }
    } as const;
    const once = readAtlasState(atlasSearch(state), ids);
    expect(readAtlasState(atlasSearch(once), ids)).toEqual(once);
  });

  test('refits rather than trusting an unreadable camera', () => {
    for (const search of [
      '?x=1&z=2',
      '?x=1&z=2&span=NaN',
      '?x=1&z=2&span=0',
      '?x=1&z=2&span=-5',
      '?x=&z=&span=',
      '?x=nope&z=2&span=3'
    ]) {
      expect(readAtlasState(search, ids)).toEqual({
        level: 'system',
        view: null
      });
    }
  });

  test('falls back to the System Range for a Body it does not hold', () => {
    // The camera goes with it: those numbers were written in the missing Body's units.
    expect(readAtlasState('?body=void&x=1&z=2&span=3', ids)).toEqual({
      level: 'system',
      view: null
    });
    expect(readAtlasState('?body=', ids)).toEqual({
      level: 'system',
      view: null
    });
    expect(readAtlasState('', ids)).toEqual({ level: 'system', view: null });
  });
});

describe('the Atlas selection panel', () => {
  test('states only recovered numbers for a Body', async () => {
    const system = await gammaSystem();
    const eris = system.bodies.find(value => value.id === 'eris')!;
    expect(bodyFacts(eris).map(fact => fact.label)).toEqual([
      'Source slot',
      'Position X/Z',
      'Extent',
      'Base colour'
    ]);
    expect(bodyFacts(eris)[1]!.value).toContain('-630,000');
    expect(bodyProvenance(eris)).toHaveLength(1);
  });

  test('marks the capture-time sample and the recovered black', async () => {
    const system = await gammaSystem();
    const damocles = system.bodies.find(value => value.id === 'damocles')!;
    const notes = bodyProvenance(damocles).join(' ');
    expect(notes).toContain('capture-time sample');
    expect(notes).toContain('$000');
  });
});
