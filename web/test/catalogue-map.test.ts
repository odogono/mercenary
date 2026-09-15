import { expect, it } from 'bun:test';

import { parseCatalogue } from '../src/catalogue/data.ts';
import {
  MAX_ZOOM,
  clampView,
  clusterOf,
  clusterView,
  describeView,
  fitView,
  gridStep,
  panView,
  project,
  unproject,
  zoomOf,
  zoomView,
  type MapPoint
} from '../src/catalogue/mapView.ts';

const erisPoints = async () => {
  const data = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const located = data.instances.filter(
    instance => instance.location?.body === 'body-11'
  );
  return {
    located,
    points: located.map(instance => ({
      x: instance.location!.position[0],
      z: instance.location!.position[2]
    }))
  };
};

it('fits all placements with the previous 80% framing and a one-unit floor', () => {
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

it('pans in map fractions and keeps the centre inside the full-body extent', () => {
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

it('opens the Eris capital as one 16-unit cluster and the outliers alone at 8×', async () => {
  const { located, points } = await erisPoints();
  const fit = fitView(points);
  expect(zoomOf(fit, fit)).toBe(1);
  const spaceport = located.findIndex(i => i.id === 'eris-surface-87');
  const cluster = clusterOf(points, spaceport, fit);
  expect(cluster).toHaveLength(205);
  const view = clusterView(points, spaceport, fit);
  expect(view.span).toBeGreaterThan(16);
  expect(view.span).toBeLessThan(25);
  expect(zoomOf(fit, view)).toBeGreaterThan(150);
  // Neighbouring cells one unit apart are separated by more than a marker.
  const office = points[located.findIndex(i => i.id === 'eris-surface-89')]!;
  const a = project(view, points[spaceport]!, 1),
    b = project(view, office, 1);
  expect(Math.abs(a.u - b.u) * 520).toBeGreaterThan(40);
  const dart = located.findIndex(i => i.id === 'object-slot-1');
  expect(clusterOf(points, dart, fit)).toEqual([dart]);
  const lone = clusterView(points, dart, fit);
  expect(zoomOf(fit, lone)).toBeCloseTo(8);
  expect(lone.cx).toBeCloseTo(points[dart]!.x);
  expect(lone.cz).toBeCloseTo(points[dart]!.z);
});

it('never merges coincident placements and can still separate near-coincident ones', async () => {
  const { located, points } = await erisPoints();
  const fit = fitView(points);
  const office = points[located.findIndex(i => i.id === 'eris-surface-89')]!;
  const ground = points[located.findIndex(i => i.id === 'eris-ground-89')]!;
  expect(office).not.toEqual(ground);
  const view = zoomView(fit, fit, MAX_ZOOM, 0.5, 0.5, 1);
  const a = project(view, office, 1),
    b = project(view, ground, 1);
  expect(Math.hypot(a.u - b.u, a.v - b.v) * 520).toBeGreaterThan(12);
  const coincident = located.filter(
    i => i.id === 'eris-surface-29' || i.id === 'eris-ground-29'
  );
  expect(coincident).toHaveLength(2);
  expect(
    new Set(coincident.map(i => i.location!.position.join(','))).size
  ).toBe(1);
});

it('reports zoom, span and a 1-2-5 grid in surface units', () => {
  expect(gridStep(4327, 520)).toBe(500);
  expect(gridStep(20, 520)).toBe(2);
  expect(gridStep(0.53, 520)).toBe(0.05);
  const fit = fitView([
    { x: 0, z: 0 },
    { x: 3462, z: 3462 }
  ]);
  expect(describeView(fit, fit, 520)).toBe(
    'Zoom 1× · view spans 4,328 units · grid 500 units'
  );
  expect(describeView(fit, zoomView(fit, fit, 8), 520)).toBe(
    'Zoom 8× · view spans 541 units · grid 50 units'
  );
  const points: MapPoint[] = [{ x: 1, z: 1 }];
  expect(describeView(fitView(points), fitView(points), 520)).toBe(
    'Zoom 1× · view spans 1.25 units · grid 0.1 units'
  );
});
