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

const harness = ({ damocles = false } = {}) => {
  let occupancy: Occupancy = { kind: 'onFoot' };
  let inLift = false;
  const calls: unknown[] = [];
  const actions: ControlProfileActions = {
    drop: () => calls.push('drop'),
    fire: () => calls.push('fire'),
    leaveCraft: () => calls.push('leaveCraft'),
    liftKey: floor => {
      if (!inLift) {
        return false;
      }
      calls.push({ liftKey: floor });
      return true;
    },
    occupancy: () => occupancy,
    page: delta => calls.push({ page: delta }),
    press: key => calls.push({ press: key }),
    reach: action => calls.push({ reach: action }),
    rideLift: () => calls.push('rideLift'),
    shutThrottle: () => calls.push('shutThrottle'),
    skipMessage: () => calls.push('skipMessage'),
    throttleNotchValue: notch => calls.push({ notch }),
    throttleStep: delta => calls.push({ throttleStep: delta }),
    ...(damocles
      ? {
          headCommand: command => calls.push({ headCommand: command }),
          rotateStack: direction => calls.push({ rotateStack: direction })
        }
      : {})
  };
  return {
    calls,
    profile: new BrowserControlProfile(actions),
    setInLift: (next: boolean) => {
      inLift = next;
    },
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

  test('aboard, F1-F10 are reverse notches where the Title has a reverse gear', () => {
    const { calls, profile, setOccupancy } = harness();
    // Without the action, a function key is not the profile's.
    setOccupancy({ kind: 'aboard', slot: 5 });
    expect(profile.keyDown(input('F4'))).toBeFalse();
    const reversing = new BrowserControlProfile({
      drop: () => undefined,
      fire: () => undefined,
      leaveCraft: () => undefined,
      liftKey: () => false,
      occupancy: () => ({ kind: 'aboard', slot: 5 }),
      page: () => undefined,
      press: () => undefined,
      reach: () => undefined,
      rideLift: () => undefined,
      shutThrottle: () => undefined,
      skipMessage: () => undefined,
      throttleNotchValue: () => undefined,
      throttleReverseNotch: notch => calls.push({ reverse: notch }),
      throttleStep: () => undefined
    });
    expect(reversing.keyDown(input('F4'))).toBeTrue();
    expect(reversing.keyDown(input('F10'))).toBeTrue();
    expect(reversing.keyDown(input('F11'))).toBeFalse();
    expect(calls).toEqual([{ reverse: 4 }, { reverse: 10 }]);
  });

  test('aboard, Backspace launches where the Title has a launch', () => {
    const { calls, profile, setOccupancy } = harness();
    // Without the action, Backspace is the browser's.
    setOccupancy({ kind: 'aboard', slot: 3 });
    expect(profile.keyDown(input('Backspace'))).toBeFalse();
    let occupancy: Occupancy = { kind: 'onFoot' };
    const launching = new BrowserControlProfile({
      drop: () => undefined,
      fire: () => undefined,
      launch: () => calls.push('launch'),
      leaveCraft: () => undefined,
      liftKey: () => false,
      occupancy: () => occupancy,
      page: () => undefined,
      press: () => undefined,
      reach: () => undefined,
      rideLift: () => undefined,
      shutThrottle: () => undefined,
      skipMessage: () => undefined,
      throttleNotchValue: () => undefined,
      throttleStep: () => undefined
    });
    // On foot it launches nothing.
    expect(launching.keyDown(input('Backspace'))).toBeFalse();
    occupancy = { kind: 'aboard', slot: 3 };
    expect(launching.keyDown(input('Backspace'))).toBeTrue();
    expect(calls).toEqual(['launch']);
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

  test('F is held until it is released, for a fire read as a level', () => {
    const { profile } = harness();

    expect(profile.firing).toBeFalse();
    profile.keyDown(input('KeyF'));
    expect(profile.firing).toBeTrue();
    expect(profile.keyUp(input('KeyF'))).toBeTrue();
    expect(profile.firing).toBeFalse();
    profile.keyDown(input('KeyF'));
    profile.releaseAll();
    expect(profile.firing).toBeFalse();
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

  test('a Title with Head Commands takes the keypad keys and their laptop stand-ins', () => {
    const { calls, profile, setOccupancy } = harness({ damocles: true });

    const codes = [
      'Enter',
      'KeyP',
      'Period',
      'Comma',
      'NumpadEnter',
      'NumpadMultiply',
      'NumpadAdd',
      'NumpadSubtract'
    ];
    for (const code of codes) {
      expect(profile.keyDown(input(code))).toBeTrue();
      expect(profile.keyDown(input(code, { repeat: true }))).toBeTrue();
    }
    // Aboard they mean the same, and `-` and `=` stay the throttle.
    setOccupancy({ kind: 'aboard', slot: 4 });
    profile.keyDown(input('Enter'));
    profile.keyDown(input('Minus'));
    profile.keyDown(input('Equal'));
    expect(calls).toEqual([
      { headCommand: 'open' },
      { headCommand: 'read' },
      { headCommand: 'next' },
      { headCommand: 'previous' },
      { headCommand: 'open' },
      { headCommand: 'read' },
      { headCommand: 'next' },
      { headCommand: 'previous' },
      { headCommand: 'open' },
      { throttleStep: -1 },
      { throttleStep: 1 }
    ]);
  });

  test('a Title that rotates the Carried Stack takes the brackets from paging', () => {
    const { calls, profile } = harness({ damocles: true });

    profile.keyDown(input('BracketLeft'));
    profile.keyDown(input('BracketRight'));
    expect(calls).toEqual([
      { rotateStack: 'forward' },
      { rotateStack: 'backward' }
    ]);
  });

  test('a Title without Head Commands keeps Enter for the browser and P, . and , for scripts', () => {
    const { calls, profile } = harness();

    expect(profile.keyDown(input('Enter'))).toBeFalse();
    profile.keyDown(input('KeyP'));
    profile.keyDown(input('Period'));
    profile.keyDown(input('Comma'));
    expect(calls).toEqual([
      { press: undefined },
      { press: undefined },
      { press: undefined }
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

  test('in a Damocles Lift, the Floor keys ask for Floors before their ordinary meaning', () => {
    const { calls, profile, setInLift } = harness();
    setInLift(true);

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
      'Digit0',
      'KeyB',
      'KeyG'
    ]) {
      expect(profile.keyDown(input(code))).toBeTrue();
    }
    // The ST keypad is not a lift key, and neither is anything else.
    profile.keyDown(input('Numpad1'));
    profile.keyDown(input('KeyT'));
    expect(calls).toEqual([
      { liftKey: 1 },
      { liftKey: 2 },
      { liftKey: 3 },
      { liftKey: 4 },
      { liftKey: 5 },
      { liftKey: 6 },
      { liftKey: 7 },
      { liftKey: 8 },
      { liftKey: 9 },
      { liftKey: 10 },
      { liftKey: 10 },
      { liftKey: 0 },
      { press: undefined },
      { reach: 'take' }
    ]);
  });

  test('outside a lift, and aboard, the Floor keys keep their ordinary meaning', () => {
    const { calls, profile, setInLift, setOccupancy } = harness();

    profile.keyDown(input('Digit1'));
    profile.keyDown(input('KeyB'));
    profile.keyDown(input('KeyG'));
    setInLift(true);
    setOccupancy({ kind: 'aboard', slot: 4 });
    profile.keyDown(input('Digit2'));
    profile.keyDown(input('KeyB'));
    expect(calls).toEqual([
      { press: undefined },
      { reach: 'board' },
      { press: undefined },
      { notch: 2 },
      { reach: 'board' }
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
