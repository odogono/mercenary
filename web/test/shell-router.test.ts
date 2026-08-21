import { describe, expect, test } from 'bun:test';

import {
  chromeHasKeyboard,
  routeKey,
  type RoutedKey,
  type RouterState
} from '../src/shell/router.ts';

const key = (code: string, fields: Partial<RoutedKey> = {}): RoutedKey => ({
  altKey: fields.altKey ?? false,
  code,
  ctrlKey: fields.ctrlKey ?? false,
  metaKey: fields.metaKey ?? false,
  repeat: fields.repeat ?? false,
  ...(fields.key === undefined ? {} : { key: fields.key })
});

const state = (fields: Partial<RouterState> = {}): RouterState => ({
  chromeFocus: fields.chromeFocus ?? false,
  console: fields.console ?? 'closed',
  layer: fields.layer ?? 'none'
});

describe('the shell key router', () => {
  test('gives plain keys to the Game Surface', () => {
    expect(routeKey(state(), key('ArrowLeft'))).toBe('game');
    expect(routeKey(state(), key('KeyB'))).toBe('game');
    expect(routeKey(state(), key('Space'))).toBe('game');
  });

  test('never claims a browser-reserved chord', () => {
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey'] as const) {
      expect(routeKey(state(), key('KeyR', { [modifier]: true }))).toBe(
        'browser'
      );
      // Even the shell's own keys stay out of the way while a chord is held.
      expect(routeKey(state(), key('Backquote', { [modifier]: true }))).toBe(
        'browser'
      );
      expect(routeKey(state(), key('Escape', { [modifier]: true }))).toBe(
        'browser'
      );
    }
  });

  test('claims the console key before the Control Profile can', () => {
    expect(routeKey(state(), key('Backquote'))).toBe('console-toggle');
    // Backquote is an ordinary Control Profile code, so routing order is what protects it.
    expect(routeKey(state(), key('Backquote'))).not.toBe('game');
  });

  test('honours the printed console glyph on other layouts', () => {
    expect(routeKey(state(), key('IntlBackslash', { key: '`' }))).toBe(
      'console-toggle'
    );
  });

  test('leaves other glyphs on a shared physical code alone', () => {
    expect(routeKey(state(), key('IntlBackslash', { key: '<' }))).toBe('game');
  });

  test('closes and reopens the console from either side', () => {
    expect(routeKey(state({ console: 'open' }), key('Backquote'))).toBe(
      'console-toggle'
    );
  });

  test('does not repeat the console or escape keys while held', () => {
    expect(routeKey(state(), key('Backquote', { repeat: true }))).toBe(
      'chrome'
    );
    expect(routeKey(state(), key('Escape', { repeat: true }))).toBe('chrome');
  });

  test('routes escape to the layer stack from anywhere', () => {
    expect(routeKey(state(), key('Escape'))).toBe('escape');
    expect(routeKey(state({ layer: 'menu' }), key('Escape'))).toBe('escape');
    expect(routeKey(state({ layer: 'saves' }), key('Escape'))).toBe('escape');
    expect(routeKey(state({ console: 'open' }), key('Escape'))).toBe('escape');
  });

  test('keeps arrows out of Movement Intent while an overlay is open', () => {
    for (const layer of ['menu', 'settings', 'saves'] as const) {
      expect(routeKey(state({ layer }), key('ArrowUp'))).toBe('chrome');
      expect(routeKey(state({ layer }), key('ArrowDown'))).toBe('chrome');
    }
  });

  test('keeps arrows out of Movement Intent while the console is open', () => {
    expect(routeKey(state({ console: 'open' }), key('ArrowUp'))).toBe('chrome');
  });

  test('keeps arrows out of Movement Intent while a form control has focus', () => {
    expect(routeKey(state({ chromeFocus: true }), key('ArrowLeft'))).toBe(
      'chrome'
    );
    expect(routeKey(state({ chromeFocus: true }), key('KeyB'))).toBe('chrome');
  });

  test('reports when chrome holds the keyboard', () => {
    expect(chromeHasKeyboard(state())).toBe(false);
    expect(chromeHasKeyboard(state({ chromeFocus: true }))).toBe(true);
    expect(chromeHasKeyboard(state({ console: 'open' }))).toBe(true);
    expect(chromeHasKeyboard(state({ layer: 'settings' }))).toBe(true);
  });
});
