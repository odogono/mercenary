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
    drop: () => calls.push('drop'),
    fire: () => calls.push('fire'),
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

  test('R latches running on and off without acknowledging a script', () => {
    const { calls, profile } = harness();

    expect(profile.keyDown(input('KeyR'))).toBeTrue();
    expect(profile.intent.running).toBeTrue();
    expect(calls).toEqual([]);
    // Running is a mode, so it outlasts the key that set it.
    profile.keyUp(input('KeyR'));
    expect(profile.intent.running).toBeTrue();
    profile.keyDown(input('KeyR'));
    expect(profile.intent.running).toBeFalse();
  });

  test('R does not retoggle while it is held down', () => {
    const { profile } = harness();

    profile.keyDown(input('KeyR'));
    expect(profile.keyDown(input('KeyR', { repeat: true }))).toBeTrue();
    expect(profile.keyDown(input('KeyR', { repeat: true }))).toBeTrue();
    expect(profile.intent.running).toBeTrue();
  });

  test('Shift no longer runs, and returns to the browser', () => {
    const { calls, profile } = harness();

    expect(profile.keyDown(input('ShiftLeft'))).toBeFalse();
    expect(profile.keyDown(input('ShiftRight'))).toBeFalse();
    expect(profile.intent.running).toBeFalse();
    expect(calls).toEqual([]);
  });

  test('F fires, and does not also answer a script', () => {
    const { calls, profile } = harness();

    profile.keyDown(input('KeyF'));

    // Firing is the joystick's button in the Reference Build, so it must not
    // arrive as a keypress the scripts can see.
    expect(calls).toEqual(['fire']);
  });

  test('F does not repeat while it is held', () => {
    const { calls, profile } = harness();

    profile.keyDown(input('KeyF'));
    profile.keyDown(input('KeyF', { repeat: true }));
    profile.keyDown(input('KeyF', { repeat: true }));

    expect(calls).toEqual(['fire']);
  });

  test('space keeps both its meanings and gains no third', () => {
    const { calls, profile, setOccupancy } = harness();

    profile.keyDown(input('Space'));
    setOccupancy({ kind: 'aboard', slot: 2 });
    profile.keyDown(input('Space'));

    // Space is throttle shutoff aboard and message skip on foot, and firing is
    // deliberately not a third thing it does.
    expect(calls).toEqual(['skipMessage', 'shutThrottle']);
    expect(calls).not.toContain('fire');
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
    profile.keyDown(input('KeyD'));
    profile.keyDown(input('BracketLeft'));
    profile.keyDown(input('BracketRight'));
    setOccupancy({ kind: 'aboard', slot: 4 });
    for (const code of [
      'Digit1',
      'Digit2',
      'Digit3',
      'Digit4',
      'Digit5',
      'Digit6',
      'Digit7',
      'Digit8',
      'Digit9',
      'Digit0'
    ]) {
      profile.keyDown(input(code));
    }
    profile.keyDown(input('Minus'));
    profile.keyDown(input('Equal'));
    expect(calls).toEqual([
      { reach: 'board' },
      { reach: 'take' },
      'rideLift',
      'drop',
      { page: -1 },
      { page: 1 },
      { notch: 1 },
      { notch: 2 },
      { notch: 3 },
      { notch: 4 },
      { notch: 5 },
      { notch: 6 },
      { notch: 7 },
      { notch: 8 },
      { notch: 9 },
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

  test('repeated keydowns do not repeat Semantic Actions', () => {
    const { calls, profile, setOccupancy } = harness();

    profile.keyDown(input('KeyB'));
    profile.keyDown(input('KeyB', { repeat: true }));
    profile.keyDown(input('KeyD'));
    profile.keyDown(input('KeyD', { repeat: true }));
    setOccupancy({ kind: 'aboard', slot: 1 });
    profile.keyDown(input('Digit4'));
    profile.keyDown(input('Digit4', { repeat: true }));
    expect(calls).toEqual([{ reach: 'board' }, 'drop', { notch: 4 }]);
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

  test('every key-up belonging to a browser chord passes through', () => {
    const { profile } = harness();

    expect(profile.keyDown(input('KeyB', { ctrlKey: true }))).toBeFalse();
    expect(profile.keyUp(input('ControlLeft'))).toBeFalse();
    expect(profile.keyUp(input('KeyB'))).toBeFalse();
  });

  test('browser-reserved unmodified keys pass through without reaching scripts', () => {
    const { calls, profile } = harness();

    for (const code of [
      'Tab',
      'Escape',
      'F5',
      'BrowserBack',
      'BrowserForward'
    ]) {
      expect(profile.keyDown(input(code))).toBeFalse();
      expect(profile.keyDown(input(code, { repeat: true }))).toBeFalse();
      expect(profile.keyUp(input(code))).toBeFalse();
    }
    expect(calls).toEqual([]);
  });

  test('a held Movement Intent key consumes its release', () => {
    const { profile } = harness();

    profile.keyDown(input('ArrowUp'));

    expect(profile.keyUp(input('ArrowUp'))).toBeTrue();
    expect(profile.intent.walk).toBe(0);
  });

  test('releasing all keys clears held movement but not the run toggle', () => {
    const { profile } = harness();
    profile.keyDown(input('ArrowUp'));
    profile.keyDown(input('ArrowRight'));
    profile.keyDown(input('KeyR'));

    profile.releaseAll();

    // Losing focus or opening the System Menu releases the keys the player is
    // holding; running is a mode they chose, so it is still on when they return.
    expect(profile.intent).toEqual({
      pitch: 0,
      running: true,
      turn: 0,
      walk: 0
    });
  });
});
