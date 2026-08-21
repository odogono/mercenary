import { describe, expect, test } from 'bun:test';

import { escapeFrom } from '../src/shell/menu.ts';

describe('where Escape takes the System Menu', () => {
  test('opens the menu from play and closes it again', () => {
    expect(escapeFrom('none')).toBe('menu');
    expect(escapeFrom('menu')).toBe('none');
  });

  test('steps back to the menu from a page rather than out to play', () => {
    // A player deep in the chrome expects one key to retreat, not to be dropped into the game.
    expect(escapeFrom('settings')).toBe('menu');
    expect(escapeFrom('saves')).toBe('menu');
  });

  test('always reaches play in at most two presses', () => {
    for (const layer of ['none', 'menu', 'settings', 'saves'] as const) {
      const once = escapeFrom(layer);
      expect(once === 'none' || escapeFrom(once) === 'none').toBeTrue();
    }
  });
});
