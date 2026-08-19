import { describe, expect, test } from 'bun:test';

import { apply, parseTrace } from '../src/trace/index.ts';
import { readTraceText } from './replay/artifacts.ts';
import { firstDifference } from './replay/compare.ts';

/// The harness has to be right before anything it grades can be believed.
///
/// `apply` must undo the Oracle's `changes(to:)` exactly. A fold that drifted would report
/// divergences the simulation never had — a gate that fails for its own reasons is worse than
/// no gate, because it teaches the reader to disbelieve it.

describe('folding a recorded delta forward', () => {
  test('merges named members and recurses', () => {
    const state = { player: { x: 1, y: 2 }, room: 3 };
    expect(apply(state, { player: { y: 9 } })).toEqual({
      player: { x: 1, y: 9 },
      room: 3
    });
  });

  test('replaces anything that is not an object wholesale', () => {
    // A partial update only means something for a shape whose members are named.
    expect(apply({ legs: [1, 2, 3] }, { legs: [4] })).toEqual({ legs: [4] });
    expect(apply(5, 6)).toBe(6);
  });

  test('removes the members listed under the removal key', () => {
    const state = { residence: { '1': 10, '2': 20, '3': 30 } };
    expect(apply(state, { residence: { '-': ['2'] } })).toEqual({
      residence: { '1': 10, '3': 30 }
    });
  });

  test('adds a member the previous state did not have', () => {
    expect(apply({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  test('leaves the state alone when a record carries no change', () => {
    const state = { a: 1 };
    expect(apply(state, {})).toEqual({ a: 1 });
  });
});

describe('comparing values', () => {
  test('a signed zero is not the same value', () => {
    // `===` would call these equal, and a projection that put a line on the other side of the
    // origin would pass.
    expect(firstDifference(0, -0)).not.toBeNull();
    expect(firstDifference(0, 0)).toBeNull();
  });

  test('one ulp apart is a divergence', () => {
    expect(firstDifference(0.1, 0.100_000_000_000_000_02)).not.toBeNull();
  });

  test('reports the first differing path, depth first', () => {
    const difference = firstDifference(
      { a: { b: 1, c: 2 } },
      { a: { b: 1, c: 3 } }
    );
    expect(difference?.path).toBe('$.a.c');
  });

  test('a member present on one side only is reported rather than skipped', () => {
    expect(firstDifference({ a: 1 }, { a: 1, b: 2 })?.path).toBe('$.b');
  });
});

describe('missing evidence', () => {
  test('a missing Golden Trace fails, and says how to emit it', async () => {
    // The invariant this harness exists to keep: a module without a passing replay is not
    // ported. A skip here would convert that into a suggestion.
    const attempt = readTraceText('math', 'no-such-scenario');
    await expect(attempt).rejects.toThrow(/no Golden Trace at/);
    await expect(attempt).rejects.toThrow(/--emit-traces/);
  });

  test('a trace from an unknown schema is refused rather than half-read', () => {
    const line = JSON.stringify({
      emitter: 'math',
      id: 'x',
      schemaVersion: 99
    });
    expect(() => parseTrace(line, 'math', 'x')).toThrow(/trace schema 99/);
  });

  test('a trace that is not the one asked for is refused', () => {
    const line = JSON.stringify({
      emitter: 'flight',
      id: 'other',
      schemaVersion: 3
    });
    expect(() => parseTrace(line, 'math', 'x')).toThrow(
      /says it is flight\/other/
    );
  });
});
