import { describe, expect, test } from 'bun:test';

import { escapeFrom } from '../src/shell/menu.ts';

const layerAfter = (layer: 'none' | 'menu' | 'settings' | 'saves') => {
  const outcome = escapeFrom(layer, 'closed');
  return outcome.kind === 'layer' ? outcome.layer : undefined;
};

describe('what Escape does', () => {
  test('opens the menu from play and closes it again', () => {
    expect(layerAfter('none')).toBe('menu');
    expect(layerAfter('menu')).toBe('none');
  });

  test('steps back to the menu from a page rather than out to play', () => {
    // A player deep in the chrome expects one key to retreat, not to be dropped into the game.
    expect(layerAfter('settings')).toBe('menu');
    expect(layerAfter('saves')).toBe('menu');
  });

  test('always reaches play in at most two presses', () => {
    for (const layer of ['none', 'menu', 'settings', 'saves'] as const) {
      const once = layerAfter(layer);
      expect(once === 'none' || layerAfter(once!) === 'none').toBeTrue();
    }
  });

  test('closes the Shell Console before anything else', () => {
    // The console sits over whatever else is open, so it is what Escape reaches first.
    for (const layer of ['none', 'menu', 'settings', 'saves'] as const) {
      expect(escapeFrom(layer, 'open')).toEqual({ kind: 'closeConsole' });
    }
  });
});
