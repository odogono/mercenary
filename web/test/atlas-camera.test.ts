import { describe, expect, test } from 'bun:test';

import { layOutLabels } from '../src/atlas/system.ts';
import {
  bodyRadius,
  fitSystem,
  markerAt,
  markerLabels,
  markerView,
  projectSystemAt
} from '../src/atlas/systemCamera.ts';
import {
  clusterAll,
  fitView,
  project,
  zoomOf,
  zoomView
} from '../src/catalogue/mapView.ts';
import { readGammaSystem, type GammaBody } from '../src/flyover/documents.ts';

/// PROTOTYPE tests for the camera-driven System Range (`src/atlas/systemCamera.ts`). They pin
/// the two things the picture cannot be trusted without: that a fit really shows the whole
/// System in both axes, and that the marker partition is the one the recovered positions give.
/// The landed static Range keeps its own tests in `atlas-system.test.ts`.

const FRAME = { height: 600, width: 900 };
const ASPECT = FRAME.height / FRAME.width;

const gammaSystem = async () =>
  readGammaSystem(await Bun.file('../payload/damocles/system.json').json());

const pointsOf = (bodies: readonly GammaBody[]) =>
  bodies.map(body => ({ x: body.position.x, z: body.position.z }));

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

describe('the aspect-aware fit', () => {
  test('shows the whole recovered System in both axes', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    // The Gamma System is taller than it is wide (Z spans 4,737,600 against X's 4,150,000), so
    // a span measured across the width alone would cut MENTOR and JUNO off the map.
    expect(fit.span).toBeCloseTo(8_883_000, 0);
    for (const point of pointsOf(system.bodies)) {
      const { u, v } = project(fit, point, ASPECT);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test('leaves the square Catalogue fit exactly as it was', async () => {
    const system = await gammaSystem();
    const points = pointsOf(system.bodies);
    expect(fitView(points)).toEqual(fitView(points, 1));
    // The Catalogue's own framing: the widest axis padded to the middle 80%.
    expect(fitView(points).span).toBeCloseTo(4_737_600 * 1.25, 0);
  });
});

describe('the marker partition', () => {
  test('draws the ten recovered groups at the fit camera', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const { markers } = projectSystemAt(system.bodies, fit, FRAME);
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
      'TRITON:2'.replace('2', '3')
    ]);
    expect(markers.flatMap(marker => marker.bodyIds)).toHaveLength(30);
    expect(new Set(markers.flatMap(marker => marker.bodyIds)).size).toBe(30);
  });

  test('sits inside a wide plateau, so the pixel gap cannot drift silently', async () => {
    const system = await gammaSystem();
    const points = pointsOf(system.bodies);
    const fit = fitSystem(system.bodies, FRAME);
    const groupsAt = (pixels: number) =>
      clusterAll(points, (pixels * fit.span) / FRAME.width);
    // 6 px through 19 px all give the same ten groups; MARKER_GAP is 14, the middle of that.
    const ten = groupsAt(14);
    for (const pixels of [6, 8, 10, 14, 18, 19]) {
      expect(groupsAt(pixels)).toEqual(ten);
    }
    // Below the plateau DIALIS separates from ICARUS, 58,807 units or 5.96 px apart.
    expect(groupsAt(5)).toHaveLength(11);
    // Above it DAMOCLES chains into the GAEA group across 193,250 units.
    expect(groupsAt(20)).toHaveLength(9);
  });

  test('splits monotonically as the camera zooms in', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const counts = [1, 2, 8, 32, 64].map(
      factor =>
        projectSystemAt(system.bodies, zoomView(fit, fit, factor), FRAME)
          .markers.length
    );
    expect(counts).toEqual([10, 10, 16, 25, 30]);
    // At the deepest step every marker stands for exactly one Body: the tightest recovered
    // pair, SOLON and ERIS, is 2,332 units apart and separates at about 51x.
    expect(counts.at(-1)).toBe(system.bodies.length);
  });

  test('wears the widest recovered extent of its members, ties by source slot', () => {
    const { markers } = projectSystemAt(
      [
        body('small', 0, 0, 400_000, 1),
        body('widest', 200, 0, 900_000, 2),
        body('tied-late', 400, 0, 900_000, 3)
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
});

describe('the markers themselves', () => {
  test('carry a derived radius no pair of Bodies can overlap', async () => {
    const system = await gammaSystem();
    // The divisor is derived, so the bound it has to satisfy is the test: no two of the thirty
    // recovered Bodies may overlap at their derived radii. The tightest pair is ERIS and VESTA,
    // 2,400 units apart, which is what fixes the divisor's lower bound at 932.8.
    let tightest = Infinity;
    for (const [index, a] of system.bodies.entries()) {
      for (const b of system.bodies.slice(index + 1)) {
        const apart = Math.hypot(
          a.position.x - b.position.x,
          a.position.z - b.position.z
        );
        tightest = Math.min(tightest, apart - bodyRadius(a) - bodyRadius(b));
      }
    }
    expect(tightest).toBeGreaterThan(0);
    // 211 units between ERIS and SOLON. A divisor much smaller would put them through one
    // another, which is the evidence the comment on RADIUS_DIVISOR rests on.
    expect(Math.round(tightest)).toBe(211);
    expect(
      Math.round(bodyRadius(system.bodies.find(b => b.id === 'eris')!))
    ).toBe(1157);
  });

  test('become the Body once its derived radius covers more than its marker', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    // Far out every disc is a marker, because a Body really is well under a pixel across.
    const far = projectSystemAt(system.bodies, fit, FRAME);
    expect(far.markers.every(marker => !marker.toScale)).toBe(true);
    // Close in every disc is the Body, and the switch is monotone in between.
    const near = projectSystemAt(system.bodies, zoomView(fit, fit, 512), FRAME);
    expect(near.markers.every(marker => marker.toScale)).toBe(true);
    let previous = 0;
    for (const factor of [1, 4, 16, 64, 128, 512, 4096]) {
      const { markers } = projectSystemAt(
        system.bodies,
        zoomView(fit, fit, factor),
        FRAME
      );
      const scaled = markers.filter(marker => marker.toScale).length;
      expect(scaled / markers.length).toBeGreaterThanOrEqual(previous);
      previous = scaled / markers.length;
    }
  });

  test('draw a Body at its derived radius against the distance scale', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const camera = zoomView(fit, fit, 512);
    const projection = projectSystemAt(system.bodies, camera, FRAME);
    // The whole point of a derived radius: the disc measures the same on screen as the
    // distances beside it. ERIS and SOLON are 2,332 units apart and must nearly touch.
    const eris = projection.markers.find(marker => marker.id === 'eris')!;
    const solon = projection.markers.find(marker => marker.id === 'solon')!;
    const apart = Math.hypot(eris.x - solon.x, eris.y - solon.y);
    expect(eris.radius + solon.radius).toBeLessThan(apart);
    expect(eris.radius + solon.radius).toBeGreaterThan(apart * 0.8);
    expect(eris.radius).toBeCloseTo(
      bodyRadius(system.bodies.find(b => b.id === 'eris')!) /
        projection.unitsPerPixel,
      6
    );
  });

  test('keep one size at every camera when the derived scale is left off', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const radiusOf = (view: typeof fit, name: string) =>
      projectSystemAt(system.bodies, view, FRAME, false).markers.find(
        marker => marker.name === name
      )!.radius;
    // Deep enough that the derived radius would otherwise have taken over long before.
    expect(radiusOf(zoomView(fit, fit, 4096), 'ERIS')).toBe(
      radiusOf(fit, 'ERIS')
    );
    // JUNO holds the widest recovered extent in the System, so it draws at full size.
    const juno = system.bodies.find(value => value.name === 'JUNO')!;
    const eris = system.bodies.find(value => value.name === 'ERIS')!;
    expect(radiusOf(fit, 'ERIS') / radiusOf(fit, 'JUNO')).toBeCloseTo(
      eris.radiusExtent / juno.radiusExtent,
      10
    );
  });

  test('never overlap one another on screen, at any camera', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    // What the reader actually sees, in the two regimes the map has. Two discs both drawn at
    // their derived radius can never intersect, because that is the bound the divisor was
    // chosen to satisfy. Markers are only held apart by MARKER_GAP, so two of them may touch:
    // at 11 css pixels a disc is wider than half the gap, which is a judgement about symbols
    // and not a claim about Bodies. The band in between is where an invented growth curve
    // would have collided, and does not here.
    for (const factor of [1, 2, 4, 8, 16, 32, 64, 128, 512, 4096]) {
      const { markers } = projectSystemAt(
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

  test('open to their members when picked, and always split doing it', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const { markers } = projectSystemAt(system.bodies, fit, FRAME);
    for (const marker of markers.filter(value => value.bodyIds.length > 1)) {
      const opened = markerView(marker, system.bodies, fit, FRAME);
      const inside = projectSystemAt(system.bodies, opened, FRAME).markers;
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

  test('stay pickable when the recovered extent draws them tiny', () => {
    const projection = projectSystemAt(
      [body('tiny', 0, 0, 1), body('huge', 900_000, 0, 1_000_000, 1)],
      { cx: 0, cz: 0, span: 2_000_000 },
      FRAME
    );
    const tiny = projection.markers.find(marker => marker.id === 'tiny')!;
    expect(tiny.radius).toBe(1);
    expect(markerAt(projection, tiny.x, tiny.y)?.id).toBe('tiny');
    // A one-pixel disc is still a nine-pixel target, but not a thirteen-pixel one.
    expect(markerAt(projection, tiny.x + 8, tiny.y)?.id).toBe('tiny');
    expect(markerAt(projection, tiny.x + 13, tiny.y)).toBe(null);
  });

  test('survives an empty System and a frame with no area', () => {
    expect(
      projectSystemAt([], { cx: 0, cz: 0, span: 1 }, FRAME).markers
    ).toEqual([]);
    expect(fitSystem([], FRAME)).toEqual({ cx: 0, cz: 0, span: 1 });
    const collapsed = projectSystemAt(
      [body('a', 5, 0, 7)],
      fitSystem([body('a', 5, 0, 7)], { height: 0, width: 0 }),
      { height: 0, width: 0 }
    );
    expect(Number.isFinite(collapsed.markers[0]!.x)).toBe(true);
  });
});

describe('the marker labels', () => {
  const metrics = { charWidth: 7, lineHeight: 15 };

  test('name eight of the ten markers at the fit camera', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const projection = projectSystemAt(system.bodies, fit, FRAME);
    const labels = layOutLabels(markerLabels(projection), FRAME, metrics, true);
    // The payoff over the static Range, which can place only nine of thirty names. Eight of
    // the ten markers keep theirs; MIDAS and DAMOCLES fall inside the crowded inner System,
    // where DIALIS, DION, ERIS and GAEA are already within a label's width of each other, and
    // they take their names back as soon as the camera zooms into that knot.
    expect(labels.placed).toHaveLength(8);
    expect(labels.suppressed).toEqual(['midas', 'damocles']);
    expect(labels.offscreen).toEqual([]);
    expect(labels.placed.map(label => label.text)).toContain('ERIS +5');
    // A marker standing for one Body wears a bare name: there is nothing to count.
    expect(
      markerLabels(projection).find(label => label.id === 'damocles')!.text
    ).toBe('DAMOCLES');
  });

  test('counts a marker off the frame as off screen and not as withheld', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const deep = zoomView(fit, fit, 32);
    const projection = projectSystemAt(system.bodies, deep, FRAME);
    const labels = layOutLabels(markerLabels(projection), FRAME, metrics, true);
    expect(labels.offscreen.length).toBeGreaterThan(0);
    expect(
      labels.placed.length + labels.suppressed.length + labels.offscreen.length
    ).toBe(projection.markers.length);
  });
});
