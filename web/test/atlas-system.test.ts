import { describe, expect, test } from 'bun:test';

import { bodyFacts, bodyProvenance } from '../src/atlas/panel.ts';
import { atlasHref, atlasSearch, readAtlasState } from '../src/atlas/state.ts';
import { bodyAt, layOutLabels, projectSystem } from '../src/atlas/system.ts';
import { readGammaSystem, type GammaBody } from '../src/flyover/documents.ts';

const FRAME = { height: 600, width: 900 };

const gammaSystem = async () =>
  readGammaSystem(await Bun.file('../payload/damocles/system.json').json());

const body = (
  id: string,
  x: number,
  z: number,
  radiusExtent: number
): GammaBody => ({
  baseColour: '#888888',
  id,
  name: id.toUpperCase(),
  position: { x, y: 0, z },
  radiusExtent,
  sourceColour: 0x7_77,
  sourceIndex: 0
});

describe('the Atlas System Range projection', () => {
  test('is a pure function of the recovered payload', async () => {
    const system = await gammaSystem();
    expect(projectSystem(system.bodies, FRAME)).toEqual(
      projectSystem(system.bodies, FRAME)
    );
    expect(projectSystem(system.bodies, FRAME).discs).toHaveLength(30);
  });

  test('places every recovered Body inside the frame', async () => {
    const system = await gammaSystem();
    const { discs } = projectSystem(system.bodies, FRAME);
    for (const disc of discs) {
      expect(disc.x).toBeGreaterThanOrEqual(disc.radius);
      expect(disc.y).toBeGreaterThanOrEqual(disc.radius);
      expect(disc.x).toBeLessThanOrEqual(FRAME.width - disc.radius);
      expect(disc.y).toBeLessThanOrEqual(FRAME.height - disc.radius);
    }
  });

  test('runs X right and Z up, and keeps the recovered relative extents', () => {
    const { discs } = projectSystem(
      [
        body('west', -1000, 0, 500_000),
        body('east', 1000, 0, 1_000_000),
        body('north', 0, 1000, 1_000_000)
      ],
      FRAME
    );
    const [west, east, north] = discs as [
      (typeof discs)[0],
      (typeof discs)[0],
      (typeof discs)[0]
    ];
    expect(east.x).toBeGreaterThan(west.x);
    // Screen y grows downwards, so a Body further north sits nearer the top.
    expect(north.y).toBeLessThan(west.y);
    expect(east.radius / west.radius).toBeCloseTo(2, 10);
  });

  test('scales to the wider axis so nothing is stretched', () => {
    const wide = projectSystem(
      [body('a', -1000, 0, 1), body('b', 1000, 0, 1)],
      FRAME
    );
    const tall = projectSystem(
      [body('a', 0, -1000, 1), body('b', 0, 1000, 1)],
      FRAME
    );
    expect(wide.unitsPerPixel).toBeLessThan(tall.unitsPerPixel);
  });

  test('survives a frame with no area and a System of one Body', () => {
    const collapsed = projectSystem([body('a', 5, 0, 7)], {
      height: 0,
      width: 0
    });
    expect(collapsed.discs).toHaveLength(1);
    expect(Number.isFinite(collapsed.discs[0]!.x)).toBe(true);
    expect(projectSystem([], FRAME).discs).toEqual([]);
  });
});

describe('the Atlas System Range hit test', () => {
  test('picks the nearest Body within its own radius', () => {
    // Two discs three pixels apart: the small one is inside the big one, and a point nearer
    // its centre must pick it rather than whichever happens to be drawn on top.
    const projection = projectSystem(
      [body('big', 0, 0, 1_000_000), body('small', 3000, 0, 400_000)],
      { height: 100, width: 100 }
    );
    const [big, small] = projection.discs as [
      (typeof projection.discs)[0],
      (typeof projection.discs)[0]
    ];
    expect(bodyAt(projection, big.x, big.y)).toBe('big');
    expect(bodyAt(projection, small.x, small.y)).toBe('small');
  });

  test('picks nothing outside every radius', async () => {
    const system = await gammaSystem();
    const projection = projectSystem(system.bodies, FRAME);
    expect(bodyAt(projection, -50, -50)).toBe(null);
    const disc = projection.discs[0]!;
    expect(bodyAt(projection, disc.x + disc.radius + 1, disc.y)).not.toBe(
      disc.id
    );
    expect(bodyAt(projection, disc.x, disc.y)).toBe(disc.id);
  });
});

describe('the Atlas System Range labels', () => {
  const metrics = { charWidth: 7, lineHeight: 15 };

  test('labels every Body that has room and withholds the rest', async () => {
    const system = await gammaSystem();
    const projection = projectSystem(system.bodies, FRAME);
    const labels = layOutLabels(projection, FRAME, metrics);
    expect(labels.placed.length + labels.suppressed.length).toBe(30);
    // The recovered positions put whole satellite groups within a pixel or two of each other,
    // so some labels must be withheld; the roster carries those Bodies instead.
    expect(labels.suppressed.length).toBeGreaterThan(0);
    expect(new Set(labels.placed.map(label => label.id)).size).toBe(
      labels.placed.length
    );
  });

  test('never overlaps two placed labels or leaves the frame', async () => {
    const system = await gammaSystem();
    const labels = layOutLabels(
      projectSystem(system.bodies, FRAME),
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

  test('never lays a label across another Body its disc', async () => {
    const system = await gammaSystem();
    const projection = projectSystem(system.bodies, FRAME);
    const labels = layOutLabels(projection, FRAME, metrics);
    for (const label of labels.placed) {
      const box = {
        height: metrics.lineHeight,
        width: label.text.length * metrics.charWidth,
        x: label.x,
        y: label.y
      };
      for (const disc of projection.discs) {
        if (disc.id === label.id) {
          continue;
        }
        const clear =
          box.x >= disc.x + disc.radius ||
          box.x + box.width <= disc.x - disc.radius ||
          box.y >= disc.y + disc.radius ||
          box.y + box.height <= disc.y - disc.radius;
        expect(clear).toBe(true);
      }
    }
  });

  test('gives the widest recovered extent in a pile the label', () => {
    // A distant Body sets the scale, so the other two project onto each other; the wider
    // recovered extent is the one that keeps its name.
    const frame = { height: 200, width: 400 };
    const projection = projectSystem(
      [
        body('far', -100_000, 0, 1_000_000),
        body('small', 0, 0, 400_000),
        body('large', 300, 0, 1_000_000)
      ],
      frame
    );
    const labels = layOutLabels(projection, frame, metrics);
    expect(labels.placed.map(label => label.id)).toEqual(['far', 'large']);
    expect(labels.suppressed).toEqual(['small']);
  });
});

describe('the Atlas state', () => {
  const ids = ['eris', 'dialis'];

  test('round-trips a Body through the URL', () => {
    for (const state of [
      { level: 'system' } as const,
      { bodyId: 'eris', level: 'body', view: null } as const
    ]) {
      expect(readAtlasState(atlasSearch(state), ids)).toEqual(state);
    }
    expect(atlasHref({ bodyId: 'eris', level: 'body', view: null })).toBe(
      '/damocles/atlas?body=eris'
    );
    expect(atlasHref({ level: 'system' })).toBe('/damocles/atlas');
  });

  test('falls back to the System Range for a Body it does not hold', () => {
    expect(readAtlasState('?body=void', ids)).toEqual({ level: 'system' });
    expect(readAtlasState('?body=', ids)).toEqual({ level: 'system' });
    expect(readAtlasState('', ids)).toEqual({ level: 'system' });
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
