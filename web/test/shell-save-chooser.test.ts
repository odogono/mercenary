import { describe, expect, test } from 'bun:test';

import { slotRowText } from '../src/shell/saveChooser.ts';

describe('a Save slot as one chooser row', () => {
  test('names the slot apart from what it holds', () => {
    const row = slotRowText({ slot: 2, state: 'empty' });

    expect(row.name).toBe('SLOT 2');
    expect(row.detail).toBe('EMPTY');
    expect(row.refused).toBeFalse();
  });

  test('reads a Save as where and when', () => {
    const row = slotRowText({
      savedAt: new Date('2026-08-21T09:05:00Z'),
      slot: 1,
      state: 'saved',
      where: 'ROOM 07'
    });

    expect(row.detail).toContain('ROOM 07');
    expect(row.detail).toContain('AUG');
    expect(row.refused).toBeFalse();
  });

  test('quotes the refusal rather than flattening it', () => {
    // ADR 0026 rejects without migration, so the reason is all a player has to go on.
    const invalid = slotRowText({
      reason: 'payload digest differs',
      slot: 3,
      state: 'invalid'
    });
    expect(invalid.detail).toContain('PAYLOAD DIGEST DIFFERS');
    expect(invalid.refused).toBeTrue();

    const unavailable = slotRowText({
      reason: 'browser storage is unavailable',
      slot: 1,
      state: 'unavailable'
    });
    expect(unavailable.detail).toContain('BROWSER STORAGE IS UNAVAILABLE');
    expect(unavailable.refused).toBeTrue();
  });
});
