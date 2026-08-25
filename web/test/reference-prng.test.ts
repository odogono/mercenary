import { describe, expect, test } from 'bun:test';

import { stepReferencePrng } from '../src/session/referencePrng.ts';
import fixture from './fixtures/referencePrng.json' with { type: 'json' };

/// The Reference Build's shared generator, checked against the laboratory's own
/// implementation rather than against this port's opinion of itself.
///
/// `fixtures/referencePrng.json` is regenerated with the laboratory venv:
///
///   research/c64-reference-build/.venv/bin/python -c "
///   import json, sys; sys.path.insert(0, 'research/c64-reference-build')
///   from c64lab.prng import step_reference_prng as s
///   ...independent probes over value/state/carry, then a 120-step chain...
///   "
///
/// The same fixture is re-derived on the laboratory side by
/// `research/c64-reference-build/tests/test_prng.py`, so either implementation
/// drifting from the other breaks its own suite rather than going unnoticed.

describe('the Reference Build shared generator, ported', () => {
  test('agrees with the laboratory on every independent probe', () => {
    expect(fixture.independent.length).toBeGreaterThan(0);
    for (const probe of fixture.independent) {
      expect(stepReferencePrng(probe.given)).toEqual(probe.then);
    }
  });

  test('agrees along a chain fed from its own state', () => {
    let carryIn = fixture.chain.from.carryIn;
    let state = fixture.chain.from.state;
    let value = fixture.chain.from.value;
    for (const expected of fixture.chain.steps) {
      const stepped = stepReferencePrng({ carryIn, state, value });
      expect(stepped).toEqual(expected);
      carryIn = stepped.carry;
      state = stepped.state;
      value = stepped.value;
    }
  });

  test('is carry-sensitive, which is why the caller provides one', () => {
    const clear = stepReferencePrng({ carryIn: 0, state: 0x9d, value: 0x2a });
    const set = stepReferencePrng({ carryIn: 1, state: 0x9d, value: 0x2a });
    expect(clear).not.toEqual(set);
  });

  test('stays inside one machine byte, and refuses anything that is not', () => {
    const stepped = stepReferencePrng({ carryIn: 1, state: 0xff, value: 0xff });
    for (const byte of [stepped.output, stepped.state, stepped.value]) {
      expect(byte).toBeGreaterThanOrEqual(0);
      expect(byte).toBeLessThanOrEqual(0xff);
    }
    expect([0, 1]).toContain(stepped.carry);

    for (const bad of [
      { carryIn: 0, state: 0, value: 256 },
      { carryIn: 0, state: -1, value: 0 },
      { carryIn: 2, state: 0, value: 0 },
      { carryIn: 0, state: 0, value: 1.5 }
    ]) {
      expect(() => stepReferencePrng(bad)).toThrow();
    }
  });
});
