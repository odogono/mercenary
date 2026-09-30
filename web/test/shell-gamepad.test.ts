import { describe, expect, test } from 'bun:test';

import type { Occupancy } from '../src/session/index.ts';
import { parseConsoleCommand } from '../src/shell/console.ts';
import {
  connectedPads,
  describePads,
  heldPadControls,
  quantiseAxis,
  type PadButton,
  type PadReading
} from '../src/shell/gamepad.ts';
import {
  BINDINGS,
  BrowserControlProfile,
  describeBindings,
  type ControlProfileActions
} from '../src/shell/input.ts';
import { routePad } from '../src/shell/router.ts';

const BUTTON_INDEX: Readonly<Record<PadButton, number>> = {
  A: 0,
  B: 1,
  BACK: 8,
  'D-PAD DOWN': 13,
  'D-PAD LEFT': 14,
  'D-PAD RIGHT': 15,
  'D-PAD UP': 12,
  L3: 10,
  LB: 4,
  LT: 6,
  R3: 11,
  RB: 5,
  RT: 7,
  START: 9,
  X: 2,
  Y: 3
};

/// A standard-mapping pad with `buttons` down and its sticks at `axes`.
const pad = (
  buttons: readonly PadButton[] = [],
  axes: readonly number[] = [0, 0, 0, 0],
  mapping = 'standard'
): PadReading => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, index) => {
    const down = buttons.some(button => BUTTON_INDEX[button] === index);
    return { pressed: down, value: down ? 1 : 0 };
  }),
  mapping
});

const input = (code: string) => ({
  altKey: false,
  code,
  ctrlKey: false,
  metaKey: false,
  repeat: false
});

const harness = ({ damocles = false } = {}) => {
  let occupancy: Occupancy = { kind: 'onFoot' };
  const calls: unknown[] = [];
  const actions: ControlProfileActions = {
    drop: () => calls.push('drop'),
    leaveCraft: () => calls.push('leaveCraft'),
    occupancy: () => occupancy,
    reach: action => calls.push({ reach: action }),
    shutThrottle: () => calls.push('shutThrottle'),
    throttleNotchValue: notch => calls.push({ notch }),
    throttleStep: delta => calls.push({ throttleStep: delta }),
    ...(damocles
      ? {
          headCommand: command => calls.push({ headCommand: command }),
          keyMake: code => calls.push({ keyMake: code }),
          launch: () => calls.push('launch'),
          liftKey: () => true,
          rotateStack: direction => calls.push({ rotateStack: direction })
        }
      : {
          fire: () => calls.push('fire'),
          press: key => calls.push({ press: key }),
          rideLift: () => calls.push('rideLift'),
          skipMessage: () => calls.push('skipMessage')
        })
  };
  const profile = new BrowserControlProfile(actions);
  return {
    calls,
    profile,
    /// Press `buttons` on a pad that was at rest, and let them go again.
    setOccupancy: (next: Occupancy) => {
      occupancy = next;
    },
    tap: (...buttons: PadButton[]) => {
      profile.pollPads([pad(buttons)]);
      profile.pollPads([pad()]);
    }
  };
};

describe('the gamepad edge (ADR 0059)', () => {
  test('an axis is quantised to -1, 0 or +1 past one half', () => {
    expect([-1, -0.51, -0.5, 0, 0.5, 0.51, 1].map(quantiseAxis)).toEqual([
      -1, -1, 0, 0, 0, 1, 1
    ]);
  });

  test('every standard pad is merged, and one without the mapping is skipped', () => {
    const held = heldPadControls([
      pad(['A'], [0, -0.9, 0, 0]),
      null,
      pad(['RT'], [0, 0, 0.7, 0]),
      pad(['B'], [1, 1, 1, 1], '')
    ]);
    expect([...held].sort()).toEqual(['A', 'LEFT UP', 'RIGHT RIGHT', 'RT']);
  });

  test('an analogue trigger counts past one half even when not reported pressed', () => {
    const reading = pad();
    const buttons = [...reading.buttons];
    buttons[BUTTON_INDEX.LT] = { pressed: false, value: 0.6 };
    expect(heldPadControls([{ ...reading, buttons }]).has('LT')).toBeTrue();
  });

  test('a browser without the Gamepad API has no pads', () => {
    expect(connectedPads({})).toEqual([]);
  });
});

describe('the pad as a Control Profile', () => {
  test('on foot a pushed stick gives exactly the matching keys’ Intent', () => {
    const cases: readonly (readonly [readonly number[], string])[] = [
      [[0, -1, 0, 0], 'ArrowUp'],
      [[0, 1, 0, 0], 'ArrowDown'],
      [[-1, 0, 0, 0], 'ArrowLeft'],
      [[1, 0, 0, 0], 'ArrowRight'],
      [[0, 0, -1, 0], 'ArrowLeft'],
      [[0, 0, 1, 0], 'ArrowRight']
    ];
    for (const [axes, code] of cases) {
      const byPad = harness().profile;
      byPad.pollPads([pad([], axes)]);
      const byKey = harness().profile;
      byKey.keyDown(input(code));
      expect(byPad.intent).toEqual(byKey.intent);
    }
    // The right stick's Y does nothing on foot.
    const { profile } = harness();
    profile.pollPads([pad([], [0, 0, 0, -1])]);
    expect(profile.intent).toEqual(harness().profile.intent);
  });

  test('aboard the right stick pitches as the arrows do, and the left Y is unused', () => {
    const cases: readonly (readonly [readonly number[], string])[] = [
      [[0, 0, 0, -1], 'ArrowUp'],
      [[0, 0, 0, 1], 'ArrowDown'],
      [[-1, 0, 0, 0], 'ArrowLeft'],
      [[0, 0, 1, 0], 'ArrowRight']
    ];
    for (const [axes, code] of cases) {
      const byPad = harness();
      byPad.setOccupancy({ kind: 'aboard', slot: 2 });
      byPad.profile.pollPads([pad([], axes)]);
      const byKey = harness();
      byKey.setOccupancy({ kind: 'aboard', slot: 2 });
      byKey.profile.keyDown(input(code));
      expect(byPad.profile.intent).toEqual(byKey.profile.intent);
    }
    const { profile, setOccupancy } = harness();
    setOccupancy({ kind: 'aboard', slot: 2 });
    profile.pollPads([pad([], [0, -1, 0, 0])]);
    const idle = harness();
    idle.setOccupancy({ kind: 'aboard', slot: 2 });
    expect(profile.intent).toEqual(idle.profile.intent);
  });

  test('keyboard and pads are merged and clamped, and opposites cancel', () => {
    const { profile } = harness();
    profile.keyDown(input('ArrowUp'));
    profile.pollPads([pad([], [1, -1, 0, 0]), pad([], [0, -1, 1, 0])]);
    expect(profile.intent.walk).toBe(1);
    expect(profile.intent.turn).toBe(1);

    profile.keyDown(input('ArrowLeft'));
    expect(profile.intent.turn).toBe(0);
    profile.pollPads([pad([], [-1, 1, 1, 0])]);
    // Pad sticks pushing both ways cancel each other, leaving the left key.
    expect(profile.intent.turn).toBe(-1);
    expect(profile.intent.walk).toBe(0);
  });

  test('a button acts once as it goes down, not while it is held', () => {
    const { calls, profile } = harness();
    profile.pollPads([pad(['X'])]);
    profile.pollPads([pad(['X'])]);
    profile.pollPads([pad(['X'])]);
    expect(calls).toEqual([{ reach: 'take' }]);
    profile.pollPads([pad()]);
    profile.pollPads([pad(['X'])]);
    expect(calls).toEqual([{ reach: 'take' }, { reach: 'take' }]);
  });

  test('a button held on a second pad is not pressed again', () => {
    const { calls, profile } = harness();
    profile.pollPads([pad(['B']), pad()]);
    profile.pollPads([pad(['B']), pad(['B'])]);
    expect(calls).toEqual(['drop']);
  });

  test('on foot the buttons follow the ADR 0059 table in Targ', () => {
    const { calls, tap } = harness();
    for (const button of ['RT', 'A', 'X', 'B', 'Y', 'BACK', 'LT'] as const) {
      tap(button);
    }
    // LT is aboard only, and aboard it is the throttle.
    expect(calls).toEqual([
      'fire',
      { reach: 'board' },
      { reach: 'take' },
      'drop',
      'rideLift',
      'skipMessage'
    ]);
  });

  test('aboard the buttons follow the ADR 0059 table in Damocles', () => {
    const { calls, setOccupancy, tap } = harness({ damocles: true });
    setOccupancy({ kind: 'aboard', slot: 4 });
    for (const button of [
      'A',
      'LT',
      'RB',
      'LB',
      'BACK',
      'Y',
      'L3',
      'D-PAD UP'
    ] as const) {
      tap(button);
    }
    expect(calls).toEqual([
      'leaveCraft',
      'shutThrottle',
      { throttleStep: 1 },
      { throttleStep: -1 },
      'launch',
      { headCommand: 'open' }
    ]);
  });

  test('on foot in Damocles the bumpers rotate the stack and the D-pad gives Head Commands', () => {
    const { calls, tap } = harness({ damocles: true });
    tap('LB');
    tap('RB');
    tap('D-PAD UP');
    tap('D-PAD DOWN');
    tap('D-PAD LEFT');
    tap('D-PAD RIGHT');
    // A: BOARD, even in a lift, where the B key asks for Floor 10. Pad buttons never write the
    // key latch a script reads.
    tap('A');
    expect(calls).toEqual([
      { rotateStack: 'forward' },
      { rotateStack: 'backward' },
      { headCommand: 'open' },
      { headCommand: 'read' },
      { headCommand: 'previous' },
      { headCommand: 'next' },
      { reach: 'board' }
    ]);
  });

  test('RT is the level fire reads, and L3 toggles running on foot', () => {
    const { profile } = harness({ damocles: true });
    profile.pollPads([pad(['RT'])]);
    expect(profile.firing).toBeTrue();
    profile.pollPads([pad()]);
    expect(profile.firing).toBeFalse();

    // Releasing RT must not release the key the keyboard holds.
    profile.keyDown(input('KeyF'));
    profile.pollPads([pad(['RT'])]);
    profile.pollPads([pad()]);
    expect(profile.firing).toBeTrue();

    profile.pollPads([pad(['L3'])]);
    expect(profile.intent.running).toBeTrue();
    profile.pollPads([pad()]);
    expect(profile.intent.running).toBeTrue();
  });

  test('Start asks the shell for the System Menu and is no Binding', () => {
    const { calls, profile } = harness();
    expect(profile.pollPads([pad(['START'])])).toBeTrue();
    expect(profile.pollPads([pad(['START'])])).toBeFalse();
    expect(calls).toEqual([]);
  });

  test('a release holds every pushed control until it comes to rest', () => {
    const { calls, profile } = harness();
    profile.pollPads([pad(['X'], [0, -1, 0, 0])]);
    expect(profile.intent.walk).toBe(1);
    profile.releaseAll();
    expect(profile.intent.walk).toBe(0);

    profile.pollPads([pad(['X'], [0, -1, 0, 0])]);
    profile.pollPads([pad(['X'], [0, -1, 0, 0])]);
    expect(profile.intent.walk).toBe(0);
    expect(calls).toEqual([{ reach: 'take' }]);

    // Once at rest, each counts again.
    profile.pollPads([pad()]);
    profile.pollPads([pad(['X'], [0, -1, 0, 0])]);
    expect(profile.intent.walk).toBe(1);
    expect(calls).toEqual([{ reach: 'take' }, { reach: 'take' }]);
  });

  test('chrome with the keyboard releases the pad', () => {
    const { calls, profile } = harness();
    profile.pollPads([pad([], [0, -1, 0, 0])]);
    expect(profile.pollPads([pad(['START', 'X'])], 'chrome')).toBeFalse();
    expect(profile.intent.walk).toBe(0);
    // Back in play, what was held through the chrome is at rest first.
    profile.pollPads([pad(['X'], [0, -1, 0, 0])]);
    expect(profile.intent.walk).toBe(0);
    expect(calls).toEqual([]);
  });

  test('while the Arrival holds the Surface only Back reaches play, and an opening holds all', () => {
    const { calls, profile } = harness();
    profile.pollPads([pad(['X'], [0, -1, 0, 0])], 'skip');
    expect(profile.intent.walk).toBe(0);
    profile.pollPads([pad(['X', 'BACK'])], 'skip');
    expect(calls).toEqual(['skipMessage']);

    expect(profile.pollPads([pad(['START'])], 'held')).toBeTrue();
    profile.pollPads([pad(['A'])], 'held');
    // A held from the opening into play is not a press there.
    profile.pollPads([pad(['A'])], 'game');
    expect(calls).toEqual(['skipMessage']);
  });

  test('the pad is routed as keys are', () => {
    const state = {
      chromeFocus: false,
      console: 'closed',
      layer: 'none',
      opening: 'none'
    } as const;
    expect(routePad(state)).toBe('game');
    expect(routePad({ ...state, layer: 'menu' })).toBe('chrome');
    expect(routePad({ ...state, console: 'open' })).toBe('chrome');
    expect(routePad({ ...state, chromeFocus: true })).toBe('chrome');
    expect(routePad({ ...state, opening: 'arrival' })).toBe('skip');
    expect(routePad({ ...state, opening: 'carousel' })).toBe('held');
    expect(routePad({ ...state, opening: 'journey' })).toBe('held');
  });
});

describe('the Controls Page’s pad column', () => {
  const actions: ControlProfileActions = {
    drop: () => undefined,
    fire: () => undefined,
    leaveCraft: () => undefined,
    occupancy: () => ({ kind: 'onFoot' }),
    reach: () => undefined,
    rideLift: () => undefined,
    shutThrottle: () => undefined,
    skipMessage: () => undefined,
    throttleNotchValue: () => undefined,
    throttleStep: () => undefined
  };
  const rows = describeBindings(actions, {
    inLift: false,
    occupancy: { kind: 'onFoot' }
  }).flatMap(group =>
    group.rows.map(row => [group.name, row.action, row.pad] as const)
  );

  test('names each Binding’s buttons or sticks', () => {
    expect(rows).toContainEqual(['shell', 'SYSTEM MENU', 'START']);
    expect(rows).toContainEqual(['always', 'FIRE', 'RT']);
    expect(rows).toContainEqual(['always', 'BOARD', 'A ON FOOT']);
    expect(rows).toContainEqual(['always', 'TURN', 'STICKS LEFT / RIGHT']);
    expect(rows).toContainEqual(['onFoot', 'WALK', 'LEFT STICK UP / DOWN']);
    expect(rows).toContainEqual(['aboard', 'THROTTLE DOWN / UP', 'LB / RB']);
    expect(rows).toContainEqual(['aboard', 'THROTTLE', undefined]);
  });

  test('no two Bindings a pad reaches in one Occupancy share a button, but for the pager', () => {
    for (const aboard of [false, true]) {
      const seen = new Map<string, string>();
      for (const binding of BINDINGS) {
        const reaches =
          binding.group === 'always' || (binding.group === 'aboard') === aboard;
        if (!reaches || (aboard && binding.pad?.onFootOnly === true)) {
          continue;
        }
        for (const [button] of binding.pad?.buttons ?? []) {
          const other = seen.get(button);
          // ROTATE STACK and PAGE share the brackets too: a Title has one or the other.
          expect(
            other === undefined ||
              (other === 'ROTATE STACK' && binding.action === 'PAGE')
          ).toBeTrue();
          seen.set(button, binding.action);
        }
      }
    }
  });
});

const described = (
  buttons: readonly PadButton[],
  axes: readonly number[],
  mapping = 'standard'
) => ({
  ...pad(buttons, axes, mapping),
  connected: true,
  id: '8BitDo Pro 2 (Vendor: 2dc8 Product: 6006)',
  index: 0
});

describe('the console’s pads report', () => {
  test('parses with no arguments', () => {
    expect(parseConsoleCommand('pads', 64)).toEqual({ kind: 'pads' });
    expect(() => parseConsoleCommand('pads all', 64)).toThrow(
      'pads takes no arguments'
    );
  });

  test('says when the browser lists no pad', () => {
    expect(describePads([null, null])[0]).toStartWith('no pads');
  });

  test('names each pad, what play reads from it, and its raw state', () => {
    expect(describePads([null, described(['A'], [0, -0.9, 0, 0.1])])).toEqual([
      'pad 0 · 8BitDo Pro 2 (Vendor: 2dc8 Product: 6006)',
      '  connected · mapping standard · 17 buttons · 4 axes',
      '  held: A, LEFT UP',
      '  raw buttons down: 0',
      '  raw axes: 0.00 -0.90 0.00 0.10'
    ]);
  });

  test('says a pad without the standard mapping is ignored in play', () => {
    expect(describePads([described(['B'], [0, 0, 0, 0], '')])).toContain(
      '  ignored in play: not the standard mapping'
    );
    expect(describePads([described(['B'], [0, 0, 0, 0], '')])[1]).toContain(
      'mapping (none)'
    );
  });
});
