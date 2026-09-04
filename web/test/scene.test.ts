import { describe, expect, test } from 'bun:test';

import {
  ATARI_ST_PALETTE,
  C64_PALETTE,
  IndoorBackdrop,
  ScenePalette,
  atariSTColour
} from '../src/scene/index.ts';

describe('Atari ST scene colours', () => {
  test('resolves the solid light-blue Room colour without C64 striping', () => {
    expect(atariSTColour(14)).toEqual({
      blue: 0xe0,
      green: 0x80,
      red: 0x60
    });
    expect(atariSTColour(14)).toBe(ATARI_ST_PALETTE[14]);
    expect(atariSTColour(-1)).toBeUndefined();
    expect(atariSTColour(16)).toBeUndefined();
  });

  test('ScenePalette still names the airstrip colours', () => {
    expect(ScenePalette.sky).toEqual({ blue: 0xe0, green: 0xa0, red: 0x60 });
    expect(ScenePalette.ground).toEqual({ blue: 0x00, green: 0x80, red: 0x00 });
  });

  test('keeps the C64 table for recovered terminal presentation colours', () => {
    expect(C64_PALETTE).toHaveLength(16);
  });
});

describe('the Authentic indoor backdrop', () => {
  test('alternates C64 foreground then background for 320 columns', () => {
    const backdrop = new IndoorBackdrop(6, 14);
    expect(IndoorBackdrop.columnCount).toBe(320);
    expect(backdrop.colorAtColumn(0)).toEqual(C64_PALETTE[14]);
    expect(backdrop.colorAtColumn(1)).toEqual(C64_PALETTE[6]);
    expect(backdrop.colorAtColumn(319)).toEqual(C64_PALETTE[6]);
  });
});
