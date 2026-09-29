import { describe, expect, test } from 'bun:test';

import { createNewGameAction, escapeFrom } from '../src/shell/menu.ts';
import type { ShellLayer } from '../src/shell/router.ts';

const layerAfter = (layer: ShellLayer) => {
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
    expect(layerAfter('controls')).toBe('menu');
  });

  test('cannot dismiss a page that does not own the Gameplay Session', () => {
    expect(layerAfter('ownership')).toBe('ownership');
  });

  test('always reaches play in at most two presses', () => {
    for (const layer of [
      'none',
      'menu',
      'settings',
      'controls',
      'saves'
    ] as const) {
      const once = layerAfter(layer);
      expect(once === 'none' || layerAfter(once!) === 'none').toBeTrue();
    }
  });

  test('closes the Shell Console before anything else', () => {
    // The console sits over whatever else is open, so it is what Escape reaches first.
    for (const layer of [
      'none',
      'menu',
      'ownership',
      'settings',
      'controls',
      'saves'
    ] as const) {
      expect(escapeFrom(layer, 'open')).toEqual({ kind: 'closeConsole' });
    }
  });
});

describe('the New Game confirmation', () => {
  test('costs two presses and disarms when focus leaves', () => {
    let starts = 0;
    const action = createNewGameAction(() => {
      starts += 1;
    });

    expect(action.press()).toEqual({ kind: 'armed' });
    expect(action.armed()).toBeTrue();
    expect(starts).toBe(0);

    action.disarm();
    expect(action.press()).toEqual({ kind: 'armed' });
    expect(action.press()).toEqual({ kind: 'started' });
    expect(action.armed()).toBeFalse();
    expect(starts).toBe(1);
  });
});
