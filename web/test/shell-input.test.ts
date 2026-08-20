import { describe, expect, test } from 'bun:test';

import { BensonKey } from '../src/benson/index.ts';
import type { Occupancy } from '../src/session/index.ts';
import {
  BrowserControlProfile,
  type ControlProfileActions
} from '../src/shell/input.ts';

const input = (
  code: string,
  fields: Partial<{
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    repeat: boolean;
  }> = {}
) => ({
  altKey: fields.altKey ?? false,
  code,
  ctrlKey: fields.ctrlKey ?? false,
  metaKey: fields.metaKey ?? false,
  repeat: fields.repeat ?? false
});

const harness = () => {
  let occupancy: Occupancy = { kind: 'onFoot' };
  const calls: unknown[] = [];
  const actions: ControlProfileActions = {
    leaveCraft: () => calls.push('leaveCraft'),
    occupancy: () => occupancy,
    page: delta => calls.push({ page: delta }),
    press: key => calls.push({ press: key }),
    reach: action => calls.push({ reach: action }),
    rideLift: () => calls.push('rideLift'),
    shutThrottle: () => calls.push('shutThrottle'),
    skipMessage: () => calls.push('skipMessage'),
    throttleNotchValue: notch => calls.push({ notch }),
    throttleStep: delta => calls.push({ throttleStep: delta })
  };
  return {
    calls,
    profile: new BrowserControlProfile(actions),
    setOccupancy: (next: Occupancy) => {
      occupancy = next;
    }
  };
};

describe('the browser Control Profile', () => {
  test('arrows make held on-foot Movement Intent and opposite keys cancel', () => {
    const { calls, profile } = harness();

    expect(profile.keyDown(input('ArrowUp'))).toBeTrue();
    expect(profile.intent).toEqual({
      pitch: 0,
      running: false,
      turn: 0,
      walk: 1
    });
    profile.keyDown(input('ArrowDown'));
    expect(profile.intent.walk).toBe(0);
    profile.keyUp(input('ArrowUp'));
    expect(profile.intent.walk).toBe(-1);
    profile.keyDown(input('ArrowRight'));
    profile.keyDown(input('ArrowLeft'));
    expect(profile.intent.turn).toBe(0);
    expect(calls).toEqual([
      { press: undefined },
      { press: undefined },
      { press: undefined },
      { press: undefined }
    ]);
  });

  test('aboard, the vertical axis is inverted pitch and never walking', () => {
    const { profile, setOccupancy } = harness();
    setOccupancy({ kind: 'aboard', slot: 1 });

    profile.keyDown(input('ArrowUp'));
    expect(profile.intent).toEqual({
      pitch: -1,
      running: false,
      turn: 0,
      walk: 0
    });
    profile.keyUp(input('ArrowUp'));
    profile.keyDown(input('ArrowDown'));
    expect(profile.intent.pitch).toBe(1);
  });

  test('either Shift key supplies running without acknowledging a script', () => {
    const { calls, profile } = harness();

    profile.keyDown(input('ShiftLeft'));
    expect(profile.intent.running).toBeTrue();
    expect(calls).toEqual([]);
    profile.keyDown(input('ShiftRight'));
    profile.keyUp(input('ShiftLeft'));
    expect(profile.intent.running).toBeTrue();
    profile.keyUp(input('ShiftRight'));
    expect(profile.intent.running).toBeFalse();
  });

  test('space and leaving a craft follow Occupancy', () => {
    const { calls, profile, setOccupancy } = harness();

    profile.keyDown(input('Space'));
    profile.keyDown(input('KeyL'));
    setOccupancy({ kind: 'aboard', slot: 2 });
    profile.keyDown(input('Space'));
    profile.keyDown(input('KeyL'));
    expect(calls).toEqual([
      'skipMessage',
      { press: undefined },
      'shutThrottle',
      'leaveCraft'
    ]);
  });

  test('reach, lift, brackets and aboard throttle keys are discrete actions', () => {
    const { calls, profile, setOccupancy } = harness();

    profile.keyDown(input('KeyB'));
    profile.keyDown(input('KeyT'));
    profile.keyDown(input('KeyE'));
    profile.keyDown(input('BracketLeft'));
    profile.keyDown(input('BracketRight'));
    setOccupancy({ kind: 'aboard', slot: 4 });
    for (const code of ['Digit1', 'Digit2', 'Digit0']) {
      profile.keyDown(input(code));
    }
    profile.keyDown(input('Minus'));
    profile.keyDown(input('Equal'));
    expect(calls).toEqual([
      { reach: 'board' },
      { reach: 'take' },
      'rideLift',
      { page: -1 },
      { page: 1 },
      { notch: 1 },
      { notch: 2 },
      { notch: 10 },
      { throttleStep: -1 },
      { throttleStep: 1 }
    ]);
  });

  test('on foot, throttle-looking keys are ordinary script presses', () => {
    const { calls, profile } = harness();

    profile.keyDown(input('Digit1'));
    profile.keyDown(input('Minus'));
    profile.keyDown(input('Equal'));
    expect(calls).toEqual([
      { press: undefined },
      { press: undefined },
      { press: undefined }
    ]);
  });

  test('KeyY and unmatched ordinary keys acknowledge scripts only once per hold', () => {
    const { calls, profile } = harness();

    profile.keyDown(input('KeyY'));
    profile.keyDown(input('KeyY', { repeat: true }));
    profile.keyDown(input('KeyQ'));
    profile.keyDown(input('KeyQ', { repeat: true }));
    expect(calls).toEqual([{ press: BensonKey.y }, { press: undefined }]);
  });

  test('Meta, Control and Alt chords pass through without changing input', () => {
    const { calls, profile } = harness();

    expect(profile.keyDown(input('ArrowUp', { metaKey: true }))).toBeFalse();
    expect(profile.keyDown(input('KeyB', { ctrlKey: true }))).toBeFalse();
    expect(profile.keyDown(input('KeyY', { altKey: true }))).toBeFalse();
    expect(profile.intent).toEqual({
      pitch: 0,
      running: false,
      turn: 0,
      walk: 0
    });
    expect(calls).toEqual([]);
  });

  test('releasing all keys clears held movement and running', () => {
    const { profile } = harness();
    profile.keyDown(input('ArrowUp'));
    profile.keyDown(input('ShiftLeft'));

    profile.releaseAll();

    expect(profile.intent).toEqual({
      pitch: 0,
      running: false,
      turn: 0,
      walk: 0
    });
  });
});
