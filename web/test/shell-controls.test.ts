import { describe, expect, test } from 'bun:test';

import type { Occupancy } from '../src/session/index.ts';
import {
  BINDINGS,
  BrowserControlProfile,
  describeBindings,
  type ControlProfileActions,
  type ControlsGroup
} from '../src/shell/input.ts';

const none = (): undefined => undefined;

/// Each Title's actions as its boot gives them, with nothing behind them.
const targ = (occupancy: Occupancy): ControlProfileActions => ({
  drop: none,
  fire: none,
  leaveCraft: none,
  occupancy: () => occupancy,
  press: none,
  reach: none,
  rideLift: none,
  shutThrottle: none,
  skipMessage: none,
  throttleNotchValue: none,
  throttleStep: none
});

const damocles = (occupancy: Occupancy): ControlProfileActions => ({
  drop: none,
  headCommand: none,
  launch: none,
  leaveCraft: none,
  liftKey: () => false,
  occupancy: () => occupancy,
  reach: none,
  rotateStack: none,
  shutThrottle: none,
  throttleNotchValue: none,
  throttleReverseNotch: none,
  throttleStep: none
});

const ON_FOOT: Occupancy = { kind: 'onFoot' };
const ABOARD: Occupancy = { kind: 'aboard', slot: 3 };

const actionsIn = (groups: readonly ControlsGroup[]): readonly string[] =>
  groups.flatMap(group => group.rows.map(row => row.action));

const groupNamed = (
  groups: readonly ControlsGroup[],
  name: ControlsGroup['name']
): ControlsGroup | undefined => groups.find(group => group.name === name);

const currentGroups = (
  actions: ControlProfileActions,
  occupancy: Occupancy,
  inLift: boolean
) =>
  describeBindings(actions, { inLift, occupancy })
    .filter(group => group.current)
    .map(group => group.name);

describe('the Controls Page', () => {
  test('lists only the Bindings Targ has', () => {
    const groups = describeBindings(targ(ON_FOOT), {
      inLift: false,
      occupancy: ON_FOOT
    });
    const actions = actionsIn(groups);

    expect(actions).toContain('RIDE LIFT');
    expect(actions).toContain('SKIP MESSAGE');
    for (const hidden of [
      'ROTATE STACK',
      'PAGE',
      'OPEN',
      'READ',
      'NEXT',
      'PREVIOUS',
      'LAUNCH',
      'REVERSE'
    ]) {
      expect(actions).not.toContain(hidden);
    }
    // Targ has no Damocles Lift, so it has no lift group at all.
    expect(groupNamed(groups, 'lift')).toBeUndefined();
    expect(
      groupNamed(groups, 'always')?.rows.find(row => row.action === 'FIRE')
    ).toEqual({ action: 'FIRE', keys: 'F', pad: 'RT' });
  });

  test('lists only the Bindings Damocles has', () => {
    const groups = describeBindings(damocles(ON_FOOT), {
      inLift: false,
      occupancy: ON_FOOT
    });
    const actions = actionsIn(groups);

    for (const shown of [
      'ROTATE STACK',
      'OPEN',
      'READ',
      'NEXT',
      'PREVIOUS',
      'LAUNCH',
      'REVERSE'
    ]) {
      expect(actions).toContain(shown);
    }
    for (const hidden of ['SKIP MESSAGE', 'RIDE LIFT', 'PAGE']) {
      expect(actions).not.toContain(hidden);
    }
    const always = groupNamed(groups, 'always')!;
    expect(always.rows.find(row => row.action === 'FIRE')).toEqual({
      action: 'FIRE',
      keys: 'F',
      mode: 'hold',
      pad: 'RT'
    });
    expect(always.rows.find(row => row.action === 'OPEN')?.keys).toBe(
      'ENTER / NUMPAD ENTER'
    );
  });

  test('marks the Occupancy the player is in, and the lift', () => {
    expect(currentGroups(damocles(ON_FOOT), ON_FOOT, false)).toEqual([
      'onFoot'
    ]);
    expect(currentGroups(damocles(ON_FOOT), ON_FOOT, true)).toEqual([
      'onFoot',
      'lift'
    ]);
    expect(currentGroups(damocles(ABOARD), ABOARD, false)).toEqual(['aboard']);
  });

  test('groups the shell, the pointer and every Occupancy in order', () => {
    const groups = describeBindings(damocles(ABOARD), {
      inLift: false,
      occupancy: ABOARD
    });

    expect(groups.map(group => group.title)).toEqual([
      'SHELL',
      'POINTER',
      'ALWAYS',
      'ON FOOT',
      'IN A LIFT',
      'ABOARD'
    ]);
    expect(
      groupNamed(groups, 'always')?.rows.find(row => row.action === 'RUN')?.mode
    ).toBe('toggle');
  });

  test('the profile describes its own Title as the player stands', () => {
    const profile = new BrowserControlProfile(damocles(ABOARD));

    expect(profile.describe(false)).toEqual(
      describeBindings(damocles(ABOARD), { inLift: false, occupancy: ABOARD })
    );
  });

  test('every Binding names its keys and its action', () => {
    for (const binding of BINDINGS) {
      expect(binding.action).not.toBe('');
      expect(binding.keys.length).toBeGreaterThan(0);
      for (const key of binding.keys) {
        expect(key).not.toBe('');
      }
    }
  });
});
