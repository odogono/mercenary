import { describe, expect, test } from 'bun:test';

import {
  BINDINGS,
  describeBindings,
  keyLabelText
} from '../src/shell/input.ts';
import {
  US_KEY_NAMES,
  layoutKeyNames,
  readKeyNames
} from '../src/shell/keyNames.ts';

const none = (): undefined => undefined;

const ON_FOOT = { kind: 'onFoot' } as const;

const damocles = {
  drop: none,
  headCommand: none,
  launch: none,
  leaveCraft: none,
  liftKey: () => false,
  occupancy: () => ON_FOOT,
  reach: none,
  rotateStack: none,
  shutThrottle: none,
  throttleNotchValue: none,
  throttleReverseNotch: none,
  throttleStep: none
};

/// French AZERTY, as Chromium's `getLayoutMap` gives it for the keys the Bindings name.
const AZERTY = new Map([
  ['BracketLeft', '^'],
  ['BracketRight', '$'],
  ['Comma', ';'],
  ['Digit0', 'à'],
  ['Digit1', '&'],
  ['Equal', '='],
  ['KeyB', 'b'],
  ['KeyG', 'g'],
  ['KeyP', 'p'],
  ['Minus', ')'],
  ['Period', ':']
]);

/// German QWERTZ prints letters the panel's typefaces cannot draw.
const QWERTZ = new Map([
  ['BracketLeft', 'ü'],
  ['BracketRight', '+'],
  ['KeyP', 'p']
]);

const keysOf = (
  names: Parameters<typeof describeBindings>[2],
  action: string
): string | undefined =>
  describeBindings(damocles, { inLift: false, occupancy: ON_FOOT }, names)
    .flatMap(group => group.rows)
    .find(row => row.action === action)?.keys;

describe('key names on the Controls Page', () => {
  test('names keys by their US names without a layout', () => {
    expect(keysOf(US_KEY_NAMES, 'ROTATE STACK')).toBe('[ / ]');
    expect(keysOf(US_KEY_NAMES, 'THROTTLE DOWN / UP')).toBe('- / =');
    expect(keysOf(US_KEY_NAMES, 'NEXT')).toBe('. / NUMPAD +');
    expect(keysOf(US_KEY_NAMES, 'FLOOR 1-9, 10, 0')).toBe('1-9, 0 / B, G');
  });

  test('names keys as the layout prints them', () => {
    const azerty = layoutKeyNames(AZERTY);

    expect(keysOf(azerty, 'ROTATE STACK')).toBe('^ / $');
    expect(keysOf(azerty, 'THROTTLE DOWN / UP')).toBe(') / =');
    expect(keysOf(azerty, 'NEXT')).toBe(': / NUMPAD +');
    expect(keysOf(azerty, 'PREVIOUS')).toBe('; / NUMPAD -');
    expect(keysOf(azerty, 'READ')).toBe('P / NUMPAD *');
  });

  test('keeps the digits, which every layout prints on the key', () => {
    expect(keysOf(layoutKeyNames(AZERTY), 'FLOOR 1-9, 10, 0')).toBe(
      '1-9, 0 / B, G'
    );
  });

  test('falls back to the US name for a key the typefaces cannot draw', () => {
    expect(keysOf(layoutKeyNames(QWERTZ), 'ROTATE STACK')).toBe('[ / +');
  });

  test('falls back to the US name for a key the layout leaves out', () => {
    expect(keysOf(layoutKeyNames(new Map()), 'DROP')).toBe('D');
  });

  test('every layout-named key has a US name of its own', () => {
    for (const binding of BINDINGS) {
      for (const label of binding.keys) {
        expect(keyLabelText(label)).not.toMatch(/Key|Bracket|Comma|Period/);
      }
    }
  });
});

describe('reading the browser layout', () => {
  test('starts with US names and takes the layout once it answers', async () => {
    const names = readKeyNames({ getLayoutMap: async () => AZERTY });

    expect(names.printed('Comma')).toBeUndefined();
    await names.ready;
    expect(names.printed('Comma')).toBe(';');
  });

  test('keeps US names where the API is missing or refused', async () => {
    const missing = readKeyNames(undefined);
    const refused = readKeyNames({
      getLayoutMap: () => Promise.reject(new Error('keyboard-map denied'))
    });

    await Promise.all([missing.ready, refused.ready]);
    expect(missing.printed('Comma')).toBeUndefined();
    expect(refused.printed('Comma')).toBeUndefined();
  });
});
