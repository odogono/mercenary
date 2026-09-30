import { describe, expect, test } from 'bun:test';

import {
  FLOATS_PER_VERTEX,
  type ErisFramePlan
} from '../src/damocles/frame.ts';
import {
  NOISE_BANDS,
  NOISE_ROWS,
  noiseBands,
  presentScreen
} from '../src/damocles/screen.ts';

/// The TOLOSA encounter's screen effects (#581, ADR 0055) on a planned frame.

const st = (level: number): number => Math.round((level * 255) / 7) / 255;

/// A plan with one vertex in each colour list, coloured the ST word `r g b`.
const planOf = (r: number, g: number, b: number): ErisFramePlan => {
  const vertex = (): Float32Array => {
    const out = new Float32Array(FLOATS_PER_VERTEX);
    out.set([st(r), st(g), st(b)], 3);
    return out;
  };
  return {
    clear: [st(r), st(g), st(b)],
    drawnPlacements: [],
    farPlane: 1,
    fillTriangleCount: 0,
    groundTriangleCount: 0,
    horizonIslandVertices: vertex(),
    horizonVertices: vertex(),
    islandTriangleCount: 0,
    nearPlane: 1,
    skippedFaces: 0,
    skyBodies: [],
    skyVertices: vertex(),
    starCount: 0,
    triangleCount: 0,
    verticalFieldOfViewDegrees: 45,
    vertices: vertex()
  };
};

const colours = (plan: ErisFramePlan) =>
  [
    plan.vertices,
    plan.skyVertices,
    plan.horizonVertices,
    plan.horizonIslandVertices
  ].map(list => Array.from(list.slice(3, 6)));

const clear = { dead: false, fade: 0, mask: 0, noise: false, white: false };

describe('the zap and death screen', () => {
  test('a clear screen leaves the plan alone', () => {
    const plan = planOf(6, 5, 4);
    expect(presentScreen(plan, clear)).toBe(plan);
  });

  test('each fade step takes one level off every component, stopping at 0', () => {
    const faded = presentScreen(planOf(6, 5, 1), { ...clear, fade: 2 });
    const expected = [st(4), st(3), st(0)].map(v => Math.fround(v));
    for (const colour of colours(faded)) {
      expect(colour).toEqual(expected);
    }
    expect(faded.clear).toEqual([st(4), st(3), st(0)]);
    const black = presentScreen(planOf(7, 7, 7), { ...clear, fade: 8 });
    expect(
      colours(black)
        .flat()
        .every(value => value === 0)
    ).toBe(true);
  });

  test('a flash paints every colour white and the clear, colour 0, black', () => {
    const flashed = presentScreen(planOf(1, 2, 3), { ...clear, white: true });
    expect(
      colours(flashed)
        .flat()
        .every(value => value === 1)
    ).toBe(true);
    expect(flashed.clear).toEqual([0, 0, 0]);
  });

  test('the noise paints ST colours from the table, fresh each tick', () => {
    const words = Uint16Array.from({ length: 64 }, (_, k) => k * 0x1_11);
    const first = noiseBands(words, 1);
    expect(first).toHaveLength(NOISE_ROWS);
    expect(first[0]).toHaveLength(NOISE_BANDS);
    expect(
      first
        .flat()
        .every(colour => /^#(00|24|49|6d|92|b6|db|ff){3}$/.test(colour))
    ).toBe(true);
    expect(noiseBands(words, 2)).not.toEqual(first);
    expect(noiseBands(new Uint16Array(), 1)).toEqual([]);
  });
});
