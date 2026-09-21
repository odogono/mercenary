import { describe, expect, test } from 'bun:test';

import {
  SURFACE_SPAN,
  bodyBounds,
  fitBody,
  rangeOf
} from '../src/atlas/bodyRange.ts';
import {
  MAX_ZOOM,
  clampView,
  panView,
  zoomView,
  type MapBounds
} from '../src/catalogue/mapView.ts';
import { SURFACE_CELLS } from '../src/damocles/world.ts';

const FRAME = { height: 600, width: 900 };
const at = (span: number) => rangeOf({ cx: 0, cz: 0, span }, 900);
const WIDE = { height: 500, width: 1000 };

describe('the wrapping surface camera', () => {
  test('covers the whole surface however the frame is shaped', () => {
    // Nothing to fit to: the surface is exactly SURFACE_CELLS on a side whatever is on it, so
    // the widest view is the surface rather than a bounding box with padding. A span is
    // measured across the width and shows `span * aspect` of height, so a frame wider than it
    // is tall needs a larger span to cover the surface vertically.
    expect(fitBody({ height: 900, width: 900 })).toEqual({
      cx: SURFACE_CELLS / 2,
      cz: SURFACE_CELLS / 2,
      span: SURFACE_SPAN
    });
    expect(fitBody(WIDE).span).toBeCloseTo(SURFACE_SPAN * (1000 / 500), 6);
    expect(fitBody(FRAME).span).toBeCloseTo(SURFACE_SPAN * (900 / 600), 6);
    // Whatever the shape, the whole surface is covered in both axes.
    for (const frame of [FRAME, WIDE, { height: 1000, width: 500 }]) {
      const fit = fitBody(frame);
      expect(fit.span).toBeGreaterThanOrEqual(SURFACE_SPAN);
      expect(fit.span * (frame.height / frame.width)).toBeGreaterThanOrEqual(
        SURFACE_SPAN - 1e-6
      );
    }
    expect(SURFACE_SPAN).toBe(0x10_00);
  });

  test('carries a centre round the seam instead of stopping at it', () => {
    const bounds = bodyBounds(WIDE);
    // Panning off the right edge arrives at the left, which is what makes an island that
    // crosses x = 0 reachable from both sides.
    expect(
      clampView(bounds, { cx: SURFACE_CELLS + 10, cz: 5, span: 100 })
    ).toEqual({ cx: 10, cz: 5, span: 100 });
    expect(clampView(bounds, { cx: -10, cz: -10, span: 100 })).toEqual({
      cx: SURFACE_CELLS - 10,
      cz: SURFACE_CELLS - 10,
      span: 100
    });
    // A whole lap returns to where it started rather than drifting.
    const start = { cx: 1234, cz: 567, span: 256 };
    let looped = start;
    for (let step = 0; step < 4; step += 1) {
      looped = panView(bounds, looped, -1, 0, 0.5);
    }
    expect(looped.cx).toBeCloseTo(
      (((start.cx + 4 * 256) % SURFACE_CELLS) + SURFACE_CELLS) % SURFACE_CELLS,
      6
    );
  });

  test('bounds a span the same way a clamped world does', () => {
    const bounds = bodyBounds(WIDE);
    const fit = fitBody(WIDE);
    // The span bound is unconditional: a torus has no edge, but it still has a widest view and
    // a deepest one.
    expect(clampView(bounds, { cx: 0, cz: 0, span: 1e9 }).span).toBe(fit.span);
    expect(clampView(bounds, { cx: 0, cz: 0, span: 1e-9 }).span).toBe(
      fit.span / MAX_ZOOM
    );
  });

  test('leaves a clamped world exactly as it was', () => {
    const fit = { cx: 0, cz: 0, span: 100 };
    const asBounds: MapBounds = { centre: 'clamp', fit };
    // The System Range and the Catalogue pass a bare fit, which must mean what it always did.
    for (const view of [
      { cx: 1000, cz: -1000, span: 50 },
      { cx: -10, cz: 90, span: 200 },
      { cx: 5, cz: 5, span: 1 }
    ]) {
      expect(clampView(fit, view)).toEqual(clampView(asBounds, view));
      expect(clampView(fit, view).cx).toBeLessThanOrEqual(50);
      expect(clampView(fit, view).cx).toBeGreaterThanOrEqual(-50);
    }
    expect(zoomView(fit, { cx: 0, cz: 0, span: 100 }, 2)).toEqual(
      zoomView(asBounds, { cx: 0, cz: 0, span: 100 }, 2)
    );
    expect(panView(fit, { cx: 0, cz: 0, span: 100 }, 0.25, 0)).toEqual(
      panView(asBounds, { cx: 0, cz: 0, span: 100 }, 0.25, 0)
    );
  });

  test('zooms about a point without losing the wrap', () => {
    const bounds = bodyBounds(WIDE);
    const zoomed = zoomView(bounds, { cx: 5, cz: 5, span: 100 }, 4, 0, 0, 0.5);
    // Anchoring at the top-left corner pulls the centre below zero, which wraps rather than
    // being clamped back.
    expect(zoomed.span).toBe(25);
    expect(zoomed.cx).toBeGreaterThanOrEqual(0);
    expect(zoomed.cx).toBeLessThan(SURFACE_CELLS);
    expect(zoomed.cz).toBeGreaterThanOrEqual(0);
    expect(zoomed.cz).toBeLessThan(SURFACE_CELLS);
  });
});

describe('the Ranges inside a Body', () => {
  test('names a band from how much of a cell one pixel covers', () => {
    // The whole surface, and anything where a Surface Cell is under a pixel.
    expect(at(SURFACE_SPAN)).toBe('body');
    expect(at(900)).toBe('body');
    // A coastline is drawn in whole cells, so it needs no better than a cell to the pixel.
    expect(at(899)).toBe('coastal');
    expect(at(90)).toBe('coastal');
    // A Structure Workspace is 16 cells square, legible once a cell is about ten pixels.
    expect(at(89)).toBe('settlement');
    expect(at(9)).toBe('settlement');
    // A structure footprint is a fraction of a cell, so it needs a cell to be about a hundred.
    expect(at(8)).toBe('street');
    expect(at(0.5)).toBe('street');
  });

  test('names the same band whatever the window size', () => {
    // The thresholds are in cells per pixel rather than in span, so widening the window does
    // not silently change which Range the reader is in.
    for (const width of [400, 900, 1600, 2560]) {
      expect(rangeOf({ cx: 0, cz: 0, span: width * 0.5 }, width)).toBe(
        'coastal'
      );
      expect(rangeOf({ cx: 0, cz: 0, span: width * 0.05 }, width)).toBe(
        'settlement'
      );
      expect(rangeOf({ cx: 0, cz: 0, span: width * 0.005 }, width)).toBe(
        'street'
      );
    }
  });

  test('survives a frame with no width', () => {
    expect(rangeOf({ cx: 0, cz: 0, span: 1 }, 0)).toBe('body');
    expect(Number.isFinite(fitBody({ height: 0, width: 0 }).span)).toBe(true);
  });
});
