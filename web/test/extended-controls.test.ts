import { describe, expect, test } from 'bun:test';

import {
  FREE_LOOK_LIMIT,
  FREE_LOOK_RATE,
  footAxes,
  freeLook,
  intent
} from '../src/gameCore/index.ts';
import type { Occupancy } from '../src/session/index.ts';
import { parseConsoleCommand } from '../src/shell/console.ts';
import type { PadButton, PadReading } from '../src/shell/gamepad.ts';
import {
  BrowserControlProfile,
  describeBindings,
  type ControlProfileActions
} from '../src/shell/input.ts';
import {
  DEFAULT_PREFERENCES,
  validatePreferences
} from '../src/shell/preferences.ts';

/// Strafe and Free Look, the Extensions Extended Controls turns on (ADR 0059, #655). With the
/// setting off, the profile gives exactly what it gave before them.

const BUTTON_INDEX: Partial<Record<PadButton, number>> = { R3: 11 };

/// A standard-mapping pad with `buttons` down and its sticks at `axes`.
const pad = (
  buttons: readonly PadButton[] = [],
  axes: readonly number[] = [0, 0, 0, 0]
): PadReading => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, index) => {
    const down = buttons.some(button => BUTTON_INDEX[button] === index);
    return { pressed: down, value: down ? 1 : 0 };
  }),
  mapping: 'standard'
});

const input = (code: string, repeat = false) => ({
  altKey: false,
  code,
  ctrlKey: false,
  metaKey: false,
  repeat
});

const ON_FOOT: Occupancy = { kind: 'onFoot' };
const ABOARD: Occupancy = { kind: 'aboard', slot: 1 };

const harness = (extended = false) => {
  let occupancy: Occupancy = ON_FOOT;
  let on = extended;
  const calls: unknown[] = [];
  const actions: ControlProfileActions = {
    drop: () => calls.push('drop'),
    extendedControls: () => on,
    leaveCraft: () => calls.push('leaveCraft'),
    occupancy: () => occupancy,
    press: key => calls.push({ press: key }),
    reach: action => calls.push({ reach: action }),
    recentreLook: () => calls.push('recentreLook'),
    shutThrottle: () => calls.push('shutThrottle'),
    throttleNotchStep: direction => calls.push({ notchStep: direction }),
    throttleNotchValue: notch => calls.push({ notch }),
    throttleStep: delta => calls.push({ throttleStep: delta })
  };
  return {
    actions,
    calls,
    profile: new BrowserControlProfile(actions),
    setExtended: (next: boolean) => {
      on = next;
    },
    setOccupancy: (next: Occupancy) => {
      occupancy = next;
    }
  };
};

describe('Strafe and Free Look in the core', () => {
  test('walking and strafing together go no faster than walking alone', () => {
    expect(footAxes(intent({ walk: 1 }))).toEqual({ strafe: 0, walk: 1 });
    expect(footAxes(intent({ strafe: -1 }))).toEqual({ strafe: -1, walk: 0 });
    const both = footAxes(intent({ strafe: 1, walk: -1 }));
    expect(Math.hypot(both.walk, both.strafe)).toBeCloseTo(1, 12);
    expect(both.walk).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(both.strafe).toBeCloseTo(Math.SQRT1_2, 12);
  });

  test('Free Look tilts at a fixed rate, stops at about 60° and stays where it is left', () => {
    expect(freeLook(0, 1, 0.25)).toBeCloseTo(FREE_LOOK_RATE / 4, 12);
    expect(freeLook(0, -1, 0.25)).toBeCloseTo(-FREE_LOOK_RATE / 4, 12);
    expect(freeLook(0, 1, 5)).toBe(FREE_LOOK_LIMIT);
    expect(freeLook(0, -1, 5)).toBe(-FREE_LOOK_LIMIT);
    expect(FREE_LOOK_LIMIT).toBeCloseTo((60 * Math.PI) / 180, 12);
    expect(freeLook(0.3, 0, 5)).toBe(0.3);
  });
});

describe('with Extended Controls off', () => {
  test('the Extension keys give no Intent, and Strafe’s keys stay ordinary keys', () => {
    const { calls, profile } = harness();
    expect(profile.keyDown(input('KeyX'))).toBeTrue();
    expect(profile.keyDown(input('PageUp'))).toBeFalse();
    expect(profile.keyDown(input('Home'))).toBeFalse();
    expect(profile.intent).toEqual(intent({}));
    // `X` answers a script as any ordinary key does, and nothing recentres.
    expect(calls).toEqual([{ press: undefined }]);
    expect(profile.keyDown(input('PageDown', true))).toBeFalse();
  });

  test('on foot the left stick’s X turns and the right stick’s Y does nothing', () => {
    const { profile } = harness();
    profile.pollPads([pad([], [1, 0, 0, -1])]);
    expect(profile.intent).toEqual(intent({ turn: 1 }));
  });

  test('R3 does nothing', () => {
    const { calls, profile } = harness();
    profile.pollPads([pad(['R3'])]);
    expect(calls).toEqual([]);
  });

  test('the Controls Page lists no Extension Binding', () => {
    const { actions } = harness();
    const onFoot = describeBindings(actions, {
      inLift: false,
      occupancy: ON_FOOT
    }).find(group => group.name === 'onFoot')!;
    const names = onFoot.rows.map(row => row.action);
    expect(names).not.toContain('STRAFE');
    expect(names).not.toContain('LOOK UP / DOWN');
    expect(names).not.toContain('RECENTRE VIEW');
    const always = describeBindings(actions, {
      inLift: false,
      occupancy: ON_FOOT
    }).find(group => group.name === 'always')!;
    expect(always.rows.find(row => row.action === 'TURN')?.pad).toBe(
      'STICKS LEFT / RIGHT'
    );
  });
});

describe('with Extended Controls on', () => {
  test('Z and X strafe and still answer a script, as they do with the setting off', () => {
    const { calls, profile } = harness(true);
    expect(profile.keyDown(input('KeyX'))).toBeTrue();
    expect(profile.intent).toEqual(intent({ strafe: 1 }));
    expect(profile.keyDown(input('KeyZ'))).toBeTrue();
    expect(profile.intent).toEqual(intent({}));
    expect(profile.keyUp(input('KeyX'))).toBeTrue();
    expect(profile.intent).toEqual(intent({ strafe: -1 }));
    expect(calls).toEqual([{ press: undefined }, { press: undefined }]);
  });

  test('Page Up and Page Down are Free Look, and their repeats are swallowed', () => {
    const { calls, profile } = harness(true);
    expect(profile.keyDown(input('PageUp'))).toBeTrue();
    expect(profile.intent).toEqual(intent({ look: 1 }));
    expect(profile.keyDown(input('PageUp', true))).toBeTrue();
    expect(profile.keyUp(input('PageUp'))).toBeTrue();
    expect(profile.keyDown(input('PageDown'))).toBeTrue();
    expect(profile.intent).toEqual(intent({ look: -1 }));
    // Free Look is Movement Intent: it answers no script.
    expect(calls).toEqual([]);
  });

  test('Home and R3 recentre the view', () => {
    const { calls, profile } = harness(true);
    expect(profile.keyDown(input('Home'))).toBeTrue();
    profile.pollPads([pad(['R3'])]);
    expect(calls).toEqual(['recentreLook', 'recentreLook']);
  });

  test('on foot the left stick’s X strafes, the right stick’s X turns and its Y looks, up being up', () => {
    const { profile } = harness(true);
    profile.pollPads([pad([], [1, -1, -1, -1])]);
    expect(profile.intent).toEqual(
      intent({ look: 1, strafe: 1, turn: -1, walk: 1 })
    );
    profile.pollPads([pad([], [-1, 0, 0, 1])]);
    expect(profile.intent).toEqual(intent({ look: -1, strafe: -1 }));
  });

  test('keyboard and pad are merged and clamped', () => {
    const { profile } = harness(true);
    profile.keyDown(input('KeyX'));
    profile.keyDown(input('PageUp'));
    profile.pollPads([pad([], [1, 0, 0, -1])]);
    expect(profile.intent).toEqual(intent({ look: 1, strafe: 1 }));
  });

  test('aboard neither Extension acts: both sticks’ X turn and the right Y pitches', () => {
    const { calls, profile, setOccupancy } = harness(true);
    setOccupancy(ABOARD);
    profile.keyDown(input('KeyX'));
    profile.keyDown(input('PageUp'));
    expect(profile.keyDown(input('Home'))).toBeFalse();
    profile.pollPads([pad(['R3'], [1, 0, 0, -1])]);
    // Up on the right stick noses down, as the Up arrow does aboard.
    expect(profile.intent).toEqual(intent({ pitch: -1, turn: 1 }));
    expect(calls).toEqual([{ press: undefined }]);
  });

  test('turning the setting off stops the held Extensions at once', () => {
    const { profile, setExtended } = harness(true);
    profile.keyDown(input('KeyX'));
    profile.pollPads([pad([], [0, 0, 0, -1])]);
    expect(profile.intent).toEqual(intent({ look: 1, strafe: 1 }));
    setExtended(false);
    expect(profile.intent).toEqual(intent({}));
  });

  test('the Controls Page lists the Extension Bindings on foot', () => {
    const { actions } = harness(true);
    const groups = describeBindings(actions, {
      inLift: false,
      occupancy: ON_FOOT
    });
    const onFoot = groups.find(group => group.name === 'onFoot')!;
    expect(onFoot.rows).toEqual(
      expect.arrayContaining([
        {
          action: 'STRAFE',
          keys: 'Z / X',
          pad: 'LEFT STICK LEFT / RIGHT'
        },
        {
          action: 'LOOK UP / DOWN',
          keys: 'PAGE UP / PAGE DOWN',
          pad: 'RIGHT STICK UP / DOWN'
        },
        { action: 'RECENTRE VIEW', keys: 'HOME', pad: 'R3' }
      ])
    );
    const always = groups.find(group => group.name === 'always')!;
    expect(always.rows.find(row => row.action === 'TURN')?.pad).toBe(
      'RIGHT STICK LEFT / RIGHT, EITHER ABOARD'
    );
  });

  test('a Title that offers no Extensions lists none, whatever the setting', () => {
    const { actions } = harness(true);
    const { extendedControls: _, recentreLook: __, ...without } = actions;
    const names = describeBindings(without, {
      inLift: false,
      occupancy: ON_FOOT
    }).flatMap(group => group.rows.map(row => row.action));
    expect(names).not.toContain('STRAFE');
    expect(names).not.toContain('RECENTRE VIEW');
  });
});

describe('the Extended Controls preference', () => {
  test('is off by default, and a stored document without it reads as off', () => {
    expect(DEFAULT_PREFERENCES.extendedControls).toBeFalse();
    expect(validatePreferences({ composition: 'strip' }).extendedControls).toBe(
      false
    );
    expect(
      validatePreferences({ extendedControls: 'yes' }).extendedControls
    ).toBe(false);
    expect(
      validatePreferences({ extendedControls: true }).extendedControls
    ).toBe(true);
  });

  test('the console sets it on and off', () => {
    expect(parseConsoleCommand('set extended on', 64)).toEqual({
      kind: 'set',
      setting: { name: 'extended', value: 'on' }
    });
    expect(parseConsoleCommand('set extended off', 64)).toEqual({
      kind: 'set',
      setting: { name: 'extended', value: 'off' }
    });
  });
});
