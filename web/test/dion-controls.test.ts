import { describe, expect, test } from 'bun:test';

import { dionControlActions } from '../src/dion/controls.ts';
import type { DionAction } from '../src/dion/session.ts';
import {
  BrowserControlProfile,
  describeBindings,
  type ControlProfileActions
} from '../src/shell/input.ts';

const none = (): undefined => undefined;

/// Damocles's actions as its boot gives them, with nothing behind them.
const damocles = (
  aboard: boolean,
  extended: boolean
): ControlProfileActions => ({
  drop: none,
  extendedControls: () => extended,
  headCommand: none,
  keyMake: none,
  keypadDigit: none,
  launch: none,
  leaveCraft: none,
  liftKey: () => false,
  occupancy: () => (aboard ? { kind: 'aboard', slot: 3 } : { kind: 'onFoot' }),
  reach: none,
  recentreLook: none,
  rotateStack: none,
  shutThrottle: none,
  throttleNotchStep: none,
  throttleNotchValue: none,
  throttleReverseNotch: none,
  throttleStep: none
});

const dion = (passenger: boolean, extended: boolean) => {
  const acted: DionAction[] = [];
  const actions = dionControlActions({
    act: action => acted.push(action),
    extendedControls: () => extended,
    passenger: () => passenger
  });
  return { acted, actions };
};

const key = (code: string) => ({
  altKey: false,
  code,
  ctrlKey: false,
  metaKey: false,
  repeat: false
});

describe("Mercenary III's Control Profile (ADR 0064)", () => {
  test("lists Damocles's Bindings, group for group, on foot and aboard", () => {
    for (const aboard of [false, true]) {
      for (const extended of [false, true]) {
        const occupancy = aboard
          ? ({ kind: 'aboard', slot: 0 } as const)
          : ({ kind: 'onFoot' } as const);
        const state = { inLift: false, occupancy };
        expect(describeBindings(dion(aboard, extended).actions, state)).toEqual(
          describeBindings(damocles(aboard, extended), state)
        );
      }
    }
  });

  test('takes the TAXICARD on the Head Command keys, keypad and laptop alike', () => {
    const { acted, actions } = dion(false, false);
    const profile = new BrowserControlProfile(actions);
    for (const code of [
      'NumpadEnter',
      'NumpadMultiply',
      'NumpadAdd',
      'NumpadSubtract',
      'Enter',
      'KeyP',
      'Period',
      'Comma',
      'KeyB'
    ]) {
      expect(profile.keyDown(key(code))).toBeTrue();
    }
    expect(acted).toEqual([
      'activate',
      'star',
      'plus',
      'minus',
      'activate',
      'star',
      'plus',
      'minus',
      'board'
    ]);
  });

  test('leaves at dwell only as a passenger, and keeps - and = for the throttle', () => {
    const onFoot = dion(false, false);
    new BrowserControlProfile(onFoot.actions).keyDown(key('KeyL'));
    expect(onFoot.acted).toEqual([]);
    const riding = dion(true, false);
    const profile = new BrowserControlProfile(riding.actions);
    profile.keyDown(key('KeyL'));
    profile.keyDown(key('Minus'));
    profile.keyDown(key('Equal'));
    expect(riding.acted).toEqual(['leave']);
  });
});
