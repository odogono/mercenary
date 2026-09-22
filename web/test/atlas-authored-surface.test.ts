import { describe, expect, test } from 'bun:test';

import { fitBody } from '../src/atlas/bodyRange.ts';
import { MAX_ZOOM, zoomView } from '../src/atlas/mapView.ts';
import {
  nearestImage,
  readBodySurface,
  surfaceAnchor
} from '../src/atlas/surface.ts';
import {
  SYSTEM_MAX_ZOOM,
  fitSystem,
  insideSurface,
  projectSystem,
  showsSurface,
  surfacePoint,
  surfaceUnits,
  surfaceWindow,
  systemBounds,
  systemWindow,
  unitsPerCell
} from '../src/atlas/system.ts';
import { parseCatalogue } from '../src/catalogue/data.ts';
import { SURFACE_CELLS } from '../src/damocles/world.ts';
import { bodyRadius, readGammaSystem } from '../src/flyover/documents.ts';

const FRAME = { height: 773.5, width: 961.5 };
/// Any anchor serves for the conversion tests: they check the maths, not the choice of centre.
const ANCHOR = { x: SURFACE_CELLS / 2, z: SURFACE_CELLS / 2 };
const ERIS_SLOT = 11;

const gammaSystem = async () =>
  readGammaSystem(await Bun.file('../payload/damocles/system.json').json());

describe('the authored surface scale', () => {
  test('inscribes the surface in the disc, so no island falls outside it', async () => {
    const system = await gammaSystem();
    const data = parseCatalogue(
      await Bun.file('../payload/damocles/catalogue.json').json()
    );
    const fit = fitSystem(system.bodies, FRAME);
    const { markers } = projectSystem(system.bodies, fit, FRAME);
    // The authored rule is the square inscribed in the disc rather than one spanning its
    // diameter, so that a coastline near a surface corner is still on the Body and nothing has
    // to be clipped or hidden. Checked for every recovered island of every Body.
    let checked = 0;
    for (const body of system.bodies) {
      const marker = markers.find(value => value.bodyIds.includes(body.id))!;
      const radius = bodyRadius(body);
      const surface = readBodySurface(data, body.sourceIndex);
      const anchor = surfaceAnchor(surface);
      for (const island of surface.islands) {
        // Nearest-imaged first, as the drawing does: a record crossing the seam has raw
        // coordinates on the far side of the surface and is shifted bodily to the anchor.
        for (const cell of nearestImage(island.outline, anchor)) {
          const point = surfacePoint(body, anchor, cell);
          expect(
            Math.hypot(point.x - body.position.x, point.z - body.position.z)
          ).toBeLessThanOrEqual(radius);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(284);
  });

  test('is the diameter over the square root of two, and nothing recovered', async () => {
    const system = await gammaSystem();
    const eris = system.bodies.find(body => body.id === 'eris')!;
    // Stated so a change to the authored constant has to be deliberate. ERIS's drawn diameter
    // is 2,400 position units, so its 4096-cell surface is 1,697 units across.
    expect(unitsPerCell(eris)).toBeCloseTo(0.4143, 4);
    expect(surfaceUnits(eris)).toBeCloseTo(1697.06, 2);
    expect(surfaceUnits(eris)).toBeCloseTo(
      (2 * bodyRadius(eris)) / Math.SQRT2,
      6
    );
  });
});

describe('the hand-over between the Ranges', () => {
  test('hands over only once the frame is wholly inside the surface', async () => {
    const system = await gammaSystem();
    const eris = system.bodies.find(body => body.id === 'eris')!;
    const half = surfaceUnits(eris) / 2;
    const reach = Math.hypot(1, FRAME.height / FRAME.width);
    const centred = (span: number) => ({
      cx: eris.position.x,
      cz: eris.position.z,
      span
    });
    // Just too wide: a corner of the frame still reaches past the surface, so the rim and the
    // space beyond it are in view and handing over would pop.
    expect(
      insideSurface(eris, centred(((2 * half) / reach) * 1.01), FRAME)
    ).toBe(false);
    // Just inside.
    expect(
      insideSurface(eris, centred(((2 * half) / reach) * 0.99), FRAME)
    ).toBe(true);
  });

  test('waits longer for a reader sitting on the surface edge', async () => {
    const system = await gammaSystem();
    const eris = system.bodies.find(body => body.id === 'eris')!;
    const half = surfaceUnits(eris) / 2;
    const reach = Math.hypot(1, FRAME.height / FRAME.width);
    // The reported case: an island near the rim. A scale test alone would hand over here, with
    // the surface's edge mid-frame; the margin is measured from the camera's own centre, so it
    // does not.
    const onTheEdge = {
      cx: eris.position.x + half * 0.9,
      cz: eris.position.z,
      span: ((2 * half) / reach) * 0.99
    };
    expect(insideSurface(eris, onTheEdge, FRAME)).toBe(false);
    // Zooming further does reach it, so the edge is not a dead end.
    let span = onTheEdge.span;
    let steps = 0;
    while (!insideSurface(eris, { ...onTheEdge, span }, FRAME) && steps < 40) {
      span /= 1.35;
      steps += 1;
    }
    expect(insideSurface(eris, { ...onTheEdge, span }, FRAME)).toBe(true);
    // And it is a handful of wheel steps away rather than a hundred.
    expect(steps).toBeLessThan(12);
  });

  test('shows the Body Range the identical window it handed over', async () => {
    const system = await gammaSystem();
    const eris = system.bodies.find(body => body.id === 'eris')!;
    // The guarantee that makes the switch invisible: whatever camera hands over, the Body
    // window it converts to covers the same ground at the same scale on screen. Checked in
    // pixels a Surface Cell wide, which is what a reader actually sees.
    const view = {
      cx: eris.position.x + 40,
      cz: eris.position.z - 25,
      span: 900
    };
    const handed = surfaceWindow(eris, ANCHOR, view);
    const cellPixels = FRAME.width / handed.span;
    const unitPixels = FRAME.width / view.span;
    expect(cellPixels).toBeCloseTo(unitPixels * unitsPerCell(eris), 9);
    // And a cell's corner lands on the same pixel either way.
    const cell = { x: 1000, z: 1500 };
    const viaSystem = surfacePoint(eris, ANCHOR, cell);
    expect((viaSystem.x - view.cx) * unitPixels).toBeCloseTo(
      (cell.x - handed.cx) * cellPixels,
      9
    );
  });

  test('is reachable by zooming for every one of the thirty Bodies', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    // The regression this pins. The trigger is keyed to a Body's own size and the recovered
    // sizes span 500-fold, so a single ceiling suited to DIALIS strands the small moons: at the
    // kernel's MAX_ZOOM only 8 of the 30 could be entered at all, and VESTA simply stopped at
    // the ceiling. Every Body must be reachable, and by a margin.
    const deepest = fit.span / SYSTEM_MAX_ZOOM;
    let strandedAtKernelCeiling = 0;
    for (const body of system.bodies) {
      const handOverSpan = (surfaceUnits(body) / FRAME.height) * FRAME.width;
      expect(handOverSpan).toBeGreaterThan(deepest);
      if (handOverSpan < fit.span / MAX_ZOOM) {
        strandedAtKernelCeiling += 1;
      }
      // And the islands band opens before the hand-over, so a reader sees them on the disc
      // rather than crossing straight over.
      const islandsSpan = (surfaceUnits(body) / 320) * FRAME.width;
      expect(islandsSpan).toBeGreaterThan(handOverSpan);
    }
    expect(strandedAtKernelCeiling).toBe(22);
  });

  test('carries the deeper ceiling through the kernel, leaving other callers alone', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const bounds = systemBounds(fit);
    // A bare fit still means the kernel's own ceiling, which is what the Catalogue and the Body
    // Range pass.
    expect(zoomView(fit, fit, 1e9).span).toBeCloseTo(fit.span / MAX_ZOOM, 6);
    expect(zoomView(bounds, fit, 1e9).span).toBeCloseTo(
      fit.span / SYSTEM_MAX_ZOOM,
      6
    );
    // Deep enough for the smallest Body, THEON at a 40-unit derived radius.
    const theon = system.bodies.find(body => body.id === 'theon')!;
    expect((surfaceUnits(theon) / FRAME.height) * FRAME.width).toBeGreaterThan(
      fit.span / SYSTEM_MAX_ZOOM
    );
  });

  test('returns a reader to the Body they were on, not to its group', async () => {
    const system = await gammaSystem();
    // The regression this pins. A marker's `world` is the position of whichever Body it is
    // named for, and at a whole-System camera VESTA's marker is the six-Body ERIS group. Going
    // out through the marker sent a reader zooming out of VESTA to ERIS, 2,400 units away.
    const fit = fitSystem(system.bodies, FRAME);
    const { markers } = projectSystem(system.bodies, fit, FRAME);
    const grouped = markers.find(marker => marker.bodyIds.includes('vesta'))!;
    expect(grouped.id).toBe('eris');
    for (const id of ['vesta', 'solon', 'theon', 'metis', 'lucan']) {
      const body = system.bodies.find(value => value.id === id)!;
      const out = systemWindow(body, ANCHOR, fitBody(FRAME));
      // The camera comes back centred on that Body's own recovered position.
      expect(out.cx).toBeCloseTo(body.position.x, 6);
      expect(out.cz).toBeCloseTo(body.position.z, 6);
      // And not on the group's, which is a different place for every one of them.
      if (id !== 'eris') {
        expect(
          Math.hypot(out.cx - grouped.world.x, out.cz - grouped.world.z)
        ).toBeGreaterThan(0);
      }
    }
  });

  test('round-trips a Body in and back out of its own surface', async () => {
    const system = await gammaSystem();
    // Every Body, not the one that happened to work: in through `surfaceWindow` and back out
    // through `systemWindow` returns the camera it started from.
    for (const body of system.bodies) {
      const view = {
        cx: body.position.x + 17,
        cz: body.position.z - 23,
        span: surfaceUnits(body) / 4
      };
      const back = systemWindow(
        body,
        ANCHOR,
        surfaceWindow(body, ANCHOR, view)
      );
      expect(back.cx).toBeCloseTo(view.cx, 6);
      expect(back.cz).toBeCloseTo(view.cz, 6);
      expect(back.span).toBeCloseTo(view.span, 6);
    }
  });

  test('survives the Body camera wrapping its own centre', async () => {
    const system = await gammaSystem();
    const data = parseCatalogue(
      await Bun.file('../payload/damocles/catalogue.json').json()
    );
    const eris = system.bodies.find(body => body.id === 'eris')!;
    const anchor = surfaceAnchor(readBodySurface(data, ERIS_SLOT));
    // The reported bug. A Body camera takes its centre modulo the surface, so a reader who pans
    // across the seam has a centre on the far side of the anchor in raw numbers while standing
    // a few cells from it in fact. Taking the raw difference put the System camera a whole
    // surface out, on the opposite side of the disc, and only after crossing the seam — which
    // is why it came and went.
    const view = {
      cx: eris.position.x + 300,
      cz: eris.position.z,
      span: 200
    };
    const cell = surfaceWindow(eris, anchor, view);
    expect(cell.cx).toBeGreaterThan(SURFACE_CELLS);
    const wrapped = {
      ...cell,
      cx: ((cell.cx % SURFACE_CELLS) + SURFACE_CELLS) % SURFACE_CELLS
    };
    expect(systemWindow(eris, anchor, wrapped).cx).toBeCloseTo(view.cx, 6);

    // And in general: wherever the Body camera sits on the surface, the System camera it comes
    // back to is on the Body, never a surface away from it.
    const half = surfaceUnits(eris) / 2;
    for (let cx = 0; cx < SURFACE_CELLS; cx += 97) {
      for (let cz = 0; cz < SURFACE_CELLS; cz += 397) {
        const out = systemWindow(eris, anchor, { cx, cz, span: 100 });
        expect(Math.abs(out.cx - eris.position.x)).toBeLessThanOrEqual(half);
        expect(Math.abs(out.cz - eris.position.z)).toBeLessThanOrEqual(half);
      }
    }
  });

  test('converts a window both ways without drift', async () => {
    const system = await gammaSystem();
    const eris = system.bodies.find(body => body.id === 'eris')!;
    const fit = fitSystem(system.bodies, FRAME);
    const marker = projectSystem(system.bodies, fit, FRAME).markers.find(
      value => value.bodyIds.includes('eris')
    )!;
    // The outbound hop matches the picture the same way the inbound one does, so a reader who
    // zooms out and back in lands where they were.
    for (const view of [
      { cx: -630_000, cz: 390_000, span: 1778 },
      { cx: -630_200, cz: 390_400, span: 400 },
      { cx: -629_800, cz: 389_600, span: 40 }
    ]) {
      const there = surfaceWindow(eris, ANCHOR, view);
      const back = systemWindow(eris, ANCHOR, there);
      expect(back.cx).toBeCloseTo(view.cx, 6);
      expect(back.cz).toBeCloseTo(view.cz, 6);
      expect(back.span).toBeCloseTo(view.span, 6);
    }
  });

  test('will not let a distant Body claim the surface', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const { markers, unitsPerPixel } = projectSystem(system.bodies, fit, FRAME);
    const dialis = system.bodies.find(body => body.id === 'dialis')!;
    const eris = system.bodies.find(body => body.id === 'eris')!;
    // DIALIS's authored surface is 28,284 units across against ERIS's 1,697, so a size test on
    // its own lets DIALIS claim the surface from off screen while the reader looks at ERIS.
    // That really happened, and sent a hand-over to the wrong Body.
    expect(surfaceUnits(dialis) / surfaceUnits(eris)).toBeGreaterThan(16);
    const onEris = {
      cx: eris.position.x,
      cz: eris.position.z,
      span: (surfaceUnits(eris) / FRAME.height) * FRAME.width
    };
    const close = onEris.span / FRAME.width;
    // Taken from the deep camera, where every Body stands alone.
    const near = projectSystem(system.bodies, onEris, FRAME).markers;
    const erisMarker = near.find(value => value.id === 'eris')!;
    const dialisMarker = near.find(value => value.id === 'dialis')!;
    expect(showsSurface(erisMarker, eris, onEris, close)).toBe(true);
    expect(showsSurface(dialisMarker, dialis, onEris, close)).toBe(false);
    // And nothing claims a surface at the whole-System camera, where a disc is a marker.
    for (const body of system.bodies) {
      const marker = markers.find(value => value.bodyIds.includes(body.id))!;
      expect(showsSurface(marker, body, fit, unitsPerPixel)).toBe(false);
    }
  });

  test('refuses a marker standing for more than one Body', async () => {
    const system = await gammaSystem();
    const fit = fitSystem(system.bodies, FRAME);
    const grouped = projectSystem(system.bodies, fit, FRAME).markers.find(
      marker => marker.bodyIds.length > 1
    )!;
    const body = system.bodies.find(value => value.id === grouped.id)!;
    // There is no one surface a group could be showing, so a surface needs an unambiguous disc.
    const onIt = {
      cx: grouped.world.x,
      cz: grouped.world.z,
      span: (surfaceUnits(body) / FRAME.height) * FRAME.width
    };
    expect(showsSurface(grouped, body, onIt, onIt.span / FRAME.width)).toBe(
      false
    );
  });

  test('keeps the surface centred on the Body it belongs to', async () => {
    const system = await gammaSystem();
    const eris = system.bodies.find(body => body.id === 'eris')!;
    const fit = fitSystem(system.bodies, FRAME);
    const marker = projectSystem(system.bodies, fit, FRAME).markers.find(
      value => value.bodyIds.includes('eris')
    )!;
    // Cell 2048 is the middle of the surface and the middle of the disc, because the inscribed
    // square is centred on the Body.
    const middle = surfacePoint(eris, ANCHOR, ANCHOR);
    expect(middle.x).toBeCloseTo(eris.position.x, 6);
    expect(middle.z).toBeCloseTo(eris.position.z, 6);
  });
});
