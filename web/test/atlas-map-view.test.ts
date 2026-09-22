import { expect, it } from 'bun:test';

import {
  MAX_ZOOM,
  clampView,
  fitView,
  gridStep,
  panView,
  project,
  unproject,
  zoomOf,
  zoomView
} from '../src/atlas/mapView.ts';

it('fits points with a 20% margin and a one-unit floor', () => {
  expect(fitView([{ x: 10, z: 20 }])).toEqual({ cx: 10, cz: 20, span: 1.25 });
  const fit = fitView([
    { x: 0, z: 0 },
    { x: 80, z: 40 }
  ]);
  expect(fit).toEqual({ cx: 40, cz: 20, span: 100 });
  const low = project(fit, { x: 0, z: 0 }, 1),
    high = project(fit, { x: 80, z: 40 }, 1);
  expect(low.u).toBeCloseTo(0.1);
  expect(low.v).toBeCloseTo(0.7);
  expect(high.u).toBeCloseTo(0.9);
  expect(high.v).toBeCloseTo(0.3);
});

it('zooms about the anchor point and clamps to the fit and the maximum zoom', () => {
  const fit = fitView([
    { x: 0, z: 0 },
    { x: 80, z: 80 }
  ]);
  const anchor = { u: 0.25, v: 0.75 };
  const before = unproject(fit, anchor.u, anchor.v, 1);
  const zoomed = zoomView(fit, fit, 4, anchor.u, anchor.v, 1);
  expect(zoomOf(fit, zoomed)).toBeCloseTo(4);
  const after = unproject(zoomed, anchor.u, anchor.v, 1);
  expect(after.x).toBeCloseTo(before.x);
  expect(after.z).toBeCloseTo(before.z);
  expect(zoomView(fit, fit, 0.25)).toEqual(fit);
  expect(zoomOf(fit, zoomView(fit, fit, 1e12))).toBeCloseTo(MAX_ZOOM);
});

it('pans in map fractions and keeps a clamped centre inside the fit', () => {
  const fit = fitView([
    { x: 0, z: 0 },
    { x: 80, z: 80 }
  ]);
  const view = zoomView(fit, fit, 4);
  expect(panView(fit, view, 0.5, 0, 1)).toEqual({ ...view, cx: 40 - 12.5 });
  expect(panView(fit, view, 0, -0.5, 1)).toEqual({ ...view, cz: 40 - 12.5 });
  expect(clampView(fit, { ...view, cx: -1000, cz: 1000 })).toEqual({
    ...view,
    cx: -10,
    cz: 90
  });
});

it('steps the grid in 1, 2 and 5 at whatever magnitude the span asks for', () => {
  expect(gridStep(4327, 520)).toBe(500);
  expect(gridStep(20, 520)).toBe(2);
  expect(gridStep(0.53, 520)).toBe(0.05);
  expect(gridStep(4328, 520)).toBe(500);
  expect(gridStep(1.25, 520)).toBe(0.1);
});
