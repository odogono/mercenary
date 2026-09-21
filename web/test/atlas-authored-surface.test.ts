import { describe, expect, test } from 'bun:test';

import { fitBody } from '../src/atlas/bodyRange.ts';
import { readBodySurface } from '../src/atlas/surface.ts';
import {
  SYSTEM_MAX_ZOOM,
  fitSystem,
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
import { MAX_ZOOM, zoomView } from '../src/catalogue/mapView.ts';
import { SURFACE_CELLS } from '../src/damocles/world.ts';
import { bodyRadius, readGammaSystem } from '../src/flyover/documents.ts';

const FRAME = { height: 773.5, width: 961.5 };

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
      for (const island of readBodySurface(data, body.sourceIndex).islands) {
        for (const cell of island.outline) {
          const point = surfacePoint(
            { ...marker, world: { x: 0, z: 0 } },
            body,
            cell
          );
          expect(Math.hypot(point.x, point.z)).toBeLessThanOrEqual(radius);
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
  test('opens the Body Range on exactly the window the disc was showing', async () => {
    const system = await gammaSystem();
    const eris = system.bodies.find(body => body.id === 'eris')!;
    const fit = fitSystem(system.bodies, FRAME);
    const marker = projectSystem(system.bodies, fit, FRAME).markers.find(
      value => value.bodyIds.includes('eris')
    )!;
    // The trigger: the authored surface fills the frame's shorter side. At exactly that camera
    // the converted window must equal `fitBody`, or the islands would move across the switch.
    const unitsPerPixel = surfaceUnits(eris) / FRAME.height;
    const view = {
      cx: marker.world.x,
      cz: marker.world.z,
      span: unitsPerPixel * FRAME.width
    };
    const handed = surfaceWindow(marker, eris, view);
    const fitted = fitBody(FRAME);
    expect(handed.cx).toBeCloseTo(fitted.cx, 6);
    expect(handed.cz).toBeCloseTo(fitted.cz, 6);
    expect(handed.span).toBeCloseTo(fitted.span, 6);
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
      const there = surfaceWindow(marker, eris, view);
      const back = systemWindow(marker, eris, there);
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
    const middle = surfacePoint(marker, eris, {
      x: SURFACE_CELLS / 2,
      z: SURFACE_CELLS / 2
    });
    expect(middle.x).toBeCloseTo(marker.world.x, 6);
    expect(middle.z).toBeCloseTo(marker.world.z, 6);
  });
});
