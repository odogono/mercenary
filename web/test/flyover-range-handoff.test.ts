import { describe, expect, test } from 'bun:test';

import { rangeHandoff } from '../src/flyover/rangeHandoff.ts';

const targ = { coastalBelow: 1, handoffBelow: 0.1, surfaceBelow: 0.05 };
const range = (altitude: number) => rangeHandoff(altitude, targ).range;
const weight = (altitude: number) => rangeHandoff(altitude, targ).surfaceWeight;

describe('the Range Handoff', () => {
  test('classifies normalized altitude against the authored thresholds', () => {
    expect(range(4)).toBe('orbital');
    expect(range(1)).toBe('orbital');
    expect(range(0.999)).toBe('coastal');
    expect(range(0.100_000_1)).toBe('coastal');
    expect(range(0.1)).toBe('coastal-surface');
    expect(range(0.075)).toBe('coastal-surface');
    expect(range(0.05)).toBe('coastal-surface');
    expect(range(0.0499)).toBe('surface');
    expect(range(0)).toBe('surface');
    expect(range(-1)).toBe('surface');
  });

  test('keeps a Body without surface support Orbital at every altitude', () => {
    for (const altitude of [10, 0.5, 0.07, 0, -1]) {
      expect(rangeHandoff(altitude, undefined)).toEqual({
        globeWeight: 1,
        range: 'orbital',
        surfaceWeight: 0
      });
    }
  });

  test('fades the surface in across the dual band with a smoothstep', () => {
    expect(weight(1)).toBe(0);
    expect(weight(0.1)).toBe(0);
    expect(weight(0.075)).toBeCloseTo(0.5, 15);
    expect(weight(0.05)).toBe(1);
    expect(weight(-0.5)).toBe(1);
    // Smoothstep: a quarter of the way down the band is 5/32 of the fade.
    expect(weight(0.0875)).toBeCloseTo(5 / 32, 15);
    let previous = -1;
    for (let altitude = 0.11; altitude >= 0.04; altitude -= 0.0005) {
      const current = weight(altitude);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  test('gives globe and surface weights that always sum to exactly one', () => {
    for (let index = 0; index <= 10_000; index += 1) {
      const altitude = -0.1 + (index / 10_000) * 1.3;
      const { globeWeight, surfaceWeight } = rangeHandoff(altitude, targ);
      expect(globeWeight + surfaceWeight).toBe(1);
      expect(globeWeight).toBeGreaterThanOrEqual(0);
      expect(surfaceWeight).toBeGreaterThanOrEqual(0);
    }
  });
});
