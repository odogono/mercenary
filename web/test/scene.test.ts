import { describe, expect, test } from 'bun:test';

import {
  C64_PALETTE,
  IndoorBackdrop,
  ScenePalette
} from '../src/scene/index.ts';

describe('IndoorBackdrop', () => {
  test('alternates foreground then background for 320 columns', () => {
    const backdrop = new IndoorBackdrop(6, 14);
    expect(IndoorBackdrop.columnCount).toBe(320);
    expect(backdrop.colorAtColumn(0)).toEqual(C64_PALETTE[14]);
    expect(backdrop.colorAtColumn(1)).toEqual(C64_PALETTE[6]);
    expect(backdrop.colorAtColumn(318)).toEqual(C64_PALETTE[14]);
    expect(backdrop.colorAtColumn(319)).toEqual(C64_PALETTE[6]);
    expect(backdrop.colorAtColumn(-1)).toBeUndefined();
    expect(backdrop.colorAtColumn(320)).toBeUndefined();
  });

  test('ScenePalette still names the airstrip colours', () => {
    expect(ScenePalette.sky).toEqual({ blue: 0xe0, green: 0xa0, red: 0x60 });
    expect(ScenePalette.ground).toEqual({ blue: 0x00, green: 0x80, red: 0x00 });
  });
});
