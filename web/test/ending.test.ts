import { describe, expect, test } from 'bun:test';

import { endingStateOf, type EndingState } from '../src/session/ending.ts';

describe('an Ending projected from the Host Callout byte', () => {
  test('reads active play as no Ending at all', () => {
    expect(endingStateOf(0)).toEqual({ kind: 'activePlay' });
  });

  test('reads the scripted value as an Escape entering its presentation', () => {
    expect(endingStateOf(1)).toEqual({ kind: 'escape', phase: 1 });
  });

  test('reads the completed value as the same Escape, matured', () => {
    expect(endingStateOf(255)).toEqual({ kind: 'escape', phase: 255 });
  });

  test('keeps the two Escape phases apart', () => {
    expect(endingStateOf(1)).not.toEqual(endingStateOf(255));
  });

  test('refuses a byte the Reference Build never writes', () => {
    for (const byte of [2, 3, 128, 254]) {
      expect(() => endingStateOf(byte)).toThrow(/Ending Phase/);
    }
  });
});

// Type-level: Defeat is a member of the union the Reference Build recognises,
// and nothing in this implementation produces it. If a producer ever appears,
// it appears deliberately rather than by widening this type.
const _defeat: EndingState = { kind: 'defeat' };
void _defeat;
