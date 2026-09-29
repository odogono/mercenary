import {
  BensonKey,
  type BensonKey as BensonKeyValue
} from '../benson/index.ts';
import { intent, type Intent } from '../gameCore/index.ts';
import type { HeadCommand, InteractionAction } from '../interaction/index.ts';
import type { Occupancy } from '../session/index.ts';

export interface BrowserKey {
  readonly altKey: boolean;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly repeat: boolean;
}

/// What a Title does with each Binding. An optional action a Title leaves out is one it does not
/// have: its Binding is hidden from the Controls Page, and its keys either keep their ordinary
/// meaning or, where the table says so, are swallowed.
export interface ControlProfileActions {
  readonly drop: () => void;
  /// Fire as a press. A Title whose fire is the joystick button's level, as Damocles's launcher
  /// `$050B96` reads it (#581), leaves it out and asks `firing` instead.
  readonly fire?: () => void;
  /// A Head Command. A Title with none leaves it out, and its keys keep their ordinary meaning.
  readonly headCommand?: (command: HeadCommand) => void;
  /// Launch into space aboard: the ST's Esc (`$055822`), which the Browser Shell keeps for the
  /// System Menu, so `Backspace` stands in for it (#566). A Title with no launch leaves it out.
  readonly launch?: () => void;
  readonly leaveCraft: () => void;
  /// A Damocles Lift key asking for a Floor. Answers whether the player is in a lift: where they
  /// are not, the key keeps its ordinary meaning. A Title with no Damocles Lift leaves it out.
  readonly liftKey?: (floor: number) => boolean;
  readonly occupancy: () => Occupancy;
  /// Page the message line, for a Title with a pager and no Carried Stack to rotate.
  readonly page?: (delta: number) => void;
  /// Answer a script. A Title whose scripts never ask leaves it out.
  readonly press?: (key: BensonKeyValue | undefined) => void;
  readonly reach: (action: InteractionAction) => void;
  /// Targ's single lift key, riding the Lift Journey.
  readonly rideLift?: () => void;
  /// Rotate the Carried Stack: forward is the ST's Left (`$04DC74`), which sends the head to the
  /// back. A Title that rotates takes the brackets from `page`.
  readonly rotateStack?: (direction: 'forward' | 'backward') => void;
  readonly shutThrottle: () => void;
  readonly skipMessage?: () => void;
  readonly throttleNotchValue: (notch: number) => void;
  /// A reverse gear aboard: the ST's `F1`–`F10`, which Damocles's throttle table reads as the
  /// digits' notches in reverse (#556). A Title with no reverse gear leaves it out.
  readonly throttleReverseNotch?: (notch: number) => void;
  readonly throttleStep: (delta: number) => void;
}

/// Whether the browser owns this key press.
///
/// Exported so the shell's key router states the same rule by calling it rather than by
/// re-deriving it: the two must agree, or a reserved chord could be swallowed.
export const browserChord = (key: BrowserKey): boolean =>
  key.altKey || key.ctrlKey || key.metaKey;

const HELD_CONTROLS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp'
]);

/// Codes the Browser Shell keeps for itself.
///
/// The module that classifies keys is the one that should say which are not its own: the Shell
/// Console's key would otherwise be an ordinary code the Control Profile presses, and the shell
/// would be relying on the order of a switch elsewhere to get it back.
export const RESERVED_CODES: ReadonlySet<string> = new Set(['Backquote']);

/// The key that launches aboard, standing in for the ST's Esc.
export const LAUNCH_CODE = 'Backspace';

/// The key that hurries Benson along.
///
/// Named here, by the module that decides what it does, so the router can let exactly this key
/// through while the Arrival holds the rest (ADR 0032) rather than restating a code the profile
/// might later move.
export const SKIP_MESSAGE_CODE = 'Space';

/// The Control Profile's name, as the Controls Page heads its Bindings.
export const CONTROL_PROFILE_NAME = 'Keyboard';

const PUNCTUATION_CODES = new Set([
  'Backquote',
  'Backslash',
  'BracketLeft',
  'BracketRight',
  'Comma',
  'Equal',
  'IntlBackslash',
  'IntlRo',
  'IntlYen',
  'Minus',
  'Period',
  'Quote',
  'Semicolon',
  'Slash'
]);

const ordinaryCode = (code: string): boolean =>
  /^Key[A-Z]$/.test(code) ||
  /^Digit\d$/.test(code) ||
  /^Numpad(?:\d|Add|Comma|Decimal|Divide|Equal|Multiply|Subtract)$/.test(
    code
  ) ||
  PUNCTUATION_CODES.has(code);

const handledCode = (code: string): boolean =>
  !RESERVED_CODES.has(code) &&
  (code === 'Space' || HELD_CONTROLS.has(code) || ordinaryCode(code));

const axis = (
  held: ReadonlySet<string>,
  positive: string,
  negative: string
): number => (held.has(positive) ? 1 : 0) - (held.has(negative) ? 1 : 0);

/// The Head Command a key gives. The keypad's own keys stay for players who have one; a laptop
/// has none, so Enter, `P`, `.` and `,` stand in for them (#595). `-` and `=` are the throttle
/// aboard, which is why Next and Previous are not those.
const HEAD_COMMANDS: Readonly<Record<string, HeadCommand>> = {
  Comma: 'previous',
  Enter: 'open',
  KeyP: 'read',
  NumpadAdd: 'next',
  NumpadEnter: 'open',
  NumpadMultiply: 'read',
  NumpadSubtract: 'previous',
  Period: 'next'
};

/// `F1`–`F10` as the notch each reverses.
const reverseNotch = (code: string): number | undefined => {
  const match = /^F([1-9]|10)$/.exec(code);
  return match === null ? undefined : Number(match[1]);
};

const throttleNotch = (code: string): number | undefined => {
  if (code === 'Digit0') {
    return 10;
  }
  const match = /^Digit([1-9])$/.exec(code);
  return match === null ? undefined : Number(match[1]);
};

/// The Floor a Damocles Lift key asks for, as the Working Authority's dispatcher maps its make
/// codes (docs/research/damocles-lift-control.md): `1`–`9` for Floors 1–9, `0` and `B` for Floor
/// 10, `G` for Floor 0. Its `Esc` also asks for Floor 0, but the Browser Shell keeps Escape for
/// the System Menu, and `G` reaches the same Floor. The ST keypad's digits are other make codes,
/// so the numpad is not a lift key.
const liftFloor = (code: string): number | undefined => {
  if (code === 'Digit0' || code === 'KeyB') {
    return 10;
  }
  if (code === 'KeyG') {
    return 0;
  }
  const match = /^Digit([1-9])$/.exec(code);
  return match === null ? undefined : Number(match[1]);
};

// Key names are plain ASCII: the panel's typefaces have no arrows or en dash.

/// Where a Binding holds: in every Occupancy, on foot, on foot in a Damocles Lift, or aboard.
export type BindingGroup = 'aboard' | 'always' | 'lift' | 'onFoot';

export type BindingMode = 'hold' | 'toggle';

/// What a Binding may do to the profile that dispatched it.
interface BindingTarget {
  readonly actions: ControlProfileActions;
  /// Hold the key, so its release is the profile's to swallow.
  readonly hold: (code: string) => void;
  /// Hold the key and answer a script with it.
  readonly holdAndPress: (code: string) => void;
  readonly toggleRunning: () => void;
}

/// One physical control mapped to a Movement Intent or Semantic Action (ADR 0056).
///
/// The same row dispatches the key and names it on the Controls Page, so the page cannot name a
/// key the profile does not honour.
export interface Binding {
  readonly action: string;
  readonly group: BindingGroup;
  /// The keys as the Controls Page names them, a laptop's first. The first is also what the
  /// Head Command notice names.
  readonly keys: readonly string[];
  readonly mode?: (actions: ControlProfileActions) => BindingMode | undefined;
  /// Handle `code` if it is this Binding's, answering whether it was.
  readonly press: (code: string, target: BindingTarget) => boolean;
  /// Whether the Title has this Binding's action. The Controls Page lists only those it has.
  readonly provided: (actions: ControlProfileActions) => boolean;
}

const always = (): boolean => true;

const codes =
  (
    matching: readonly string[],
    run: (code: string, target: BindingTarget) => void
  ): Binding['press'] =>
  (code, target) => {
    if (!matching.includes(code)) {
      return false;
    }
    run(code, target);
    return true;
  };

const HEAD_COMMAND_LABELS: Readonly<Record<HeadCommand, string>> = {
  next: 'NEXT',
  open: 'OPEN',
  previous: 'PREVIOUS',
  read: 'READ'
};

const HEAD_COMMAND_KEYS: Readonly<Record<HeadCommand, readonly string[]>> = {
  next: ['.', 'NUMPAD +'],
  open: ['ENTER', 'NUMPAD ENTER'],
  previous: [',', 'NUMPAD -'],
  read: ['P', 'NUMPAD *']
};

const headCommandBinding = (command: HeadCommand): Binding => ({
  action: HEAD_COMMAND_LABELS[command],
  group: 'always',
  keys: HEAD_COMMAND_KEYS[command],
  // The ST sends every keypad key to `$04D3D2` before its occupancy test (`$055690`), so the
  // Head Commands mean the same on foot, aboard and in space.
  press: (code, { actions }) => {
    if (actions.headCommand === undefined || HEAD_COMMANDS[code] !== command) {
      return false;
    }
    actions.headCommand(command);
    return true;
  },
  provided: actions => actions.headCommand !== undefined
});

/// Every Binding, in the order the profile tries them: the first to take a key wins. Aboard, the
/// throttle takes the digits; on foot, the lift takes its keys before their ordinary meaning, as
/// `$0555DC` does before the rest of the dispatch, so in a lift `B` asks for Floor 10 and never
/// boards. A key no Binding takes falls through to answering a script.
export const BINDINGS: readonly Binding[] = [
  {
    action: 'THROTTLE',
    group: 'aboard',
    keys: ['1-9, 0'],
    press: (code, { actions }) => {
      const notch = throttleNotch(code);
      if (notch === undefined) {
        return false;
      }
      actions.throttleNotchValue(notch);
      return true;
    },
    provided: always
  },
  {
    action: 'REVERSE',
    group: 'aboard',
    keys: ['F1-F10'],
    press: (code, { actions }) => {
      const notch = reverseNotch(code);
      if (notch === undefined || actions.throttleReverseNotch === undefined) {
        return false;
      }
      actions.throttleReverseNotch(notch);
      return true;
    },
    provided: actions => actions.throttleReverseNotch !== undefined
  },
  {
    action: 'THROTTLE DOWN / UP',
    group: 'aboard',
    keys: ['- / ='],
    press: codes(['Minus', 'Equal'], (code, { actions }) =>
      actions.throttleStep(code === 'Equal' ? 1 : -1)
    ),
    provided: always
  },
  {
    action: 'LAUNCH',
    group: 'aboard',
    keys: ['BACKSPACE'],
    press: (code, { actions }) => {
      if (code !== LAUNCH_CODE || actions.launch === undefined) {
        return false;
      }
      actions.launch();
      return true;
    },
    provided: actions => actions.launch !== undefined
  },
  {
    action: 'FLOOR 1-9, 10, 0',
    group: 'lift',
    keys: ['1-9, 0 / B, G'],
    press: (code, { actions }) => {
      const floor = liftFloor(code);
      return floor !== undefined && actions.liftKey?.(floor) === true;
    },
    provided: actions => actions.liftKey !== undefined
  },
  headCommandBinding('open'),
  headCommandBinding('read'),
  headCommandBinding('next'),
  headCommandBinding('previous'),
  {
    action: 'PITCH',
    group: 'aboard',
    keys: ['UP / DOWN'],
    press: codes(['ArrowUp', 'ArrowDown'], (code, target) =>
      target.holdAndPress(code)
    ),
    provided: always
  },
  {
    action: 'WALK',
    group: 'onFoot',
    keys: ['UP / DOWN'],
    press: codes(['ArrowUp', 'ArrowDown'], (code, target) =>
      target.holdAndPress(code)
    ),
    provided: always
  },
  {
    action: 'TURN',
    group: 'always',
    keys: ['LEFT / RIGHT'],
    press: codes(['ArrowLeft', 'ArrowRight'], (code, target) =>
      target.holdAndPress(code)
    ),
    provided: always
  },
  {
    action: 'ROTATE STACK',
    group: 'always',
    keys: ['[ / ]'],
    press: (code, { actions }) => {
      if (
        actions.rotateStack === undefined ||
        (code !== 'BracketLeft' && code !== 'BracketRight')
      ) {
        return false;
      }
      actions.rotateStack(code === 'BracketLeft' ? 'forward' : 'backward');
      return true;
    },
    provided: actions => actions.rotateStack !== undefined
  },
  {
    action: 'PAGE',
    group: 'always',
    keys: ['[ / ]'],
    press: codes(['BracketLeft', 'BracketRight'], (code, { actions }) =>
      actions.page?.(code === 'BracketLeft' ? -1 : 1)
    ),
    provided: actions => actions.page !== undefined
  },
  {
    action: 'SHUT THROTTLE',
    group: 'aboard',
    keys: ['SPACE'],
    press: codes([SKIP_MESSAGE_CODE], (_code, { actions }) =>
      actions.shutThrottle()
    ),
    provided: always
  },
  {
    action: 'SKIP MESSAGE',
    group: 'onFoot',
    keys: ['SPACE'],
    press: codes([SKIP_MESSAGE_CODE], (_code, { actions }) =>
      actions.skipMessage?.()
    ),
    provided: actions => actions.skipMessage !== undefined
  },
  {
    action: 'BOARD',
    group: 'always',
    keys: ['B'],
    press: codes(['KeyB'], (_code, { actions }) => actions.reach('board')),
    provided: always
  },
  {
    action: 'TAKE',
    group: 'always',
    keys: ['T'],
    press: codes(['KeyT'], (_code, { actions }) => actions.reach('take')),
    provided: always
  },
  {
    action: 'LEAVE CRAFT',
    group: 'aboard',
    keys: ['L'],
    press: codes(['KeyL'], (_code, { actions }) => actions.leaveCraft()),
    provided: always
  },
  {
    action: 'RIDE LIFT',
    group: 'always',
    keys: ['E'],
    press: codes(['KeyE'], (_code, { actions }) => actions.rideLift?.()),
    provided: actions => actions.rideLift !== undefined
  },
  {
    action: 'DROP',
    group: 'always',
    keys: ['D'],
    press: codes(['KeyD'], (_code, { actions }) => actions.drop()),
    provided: always
  },
  // The Reference Build's fire is the joystick's fire button, never a key the scripts poll, so
  // this deliberately does not also `press`: marking input as detected would let firing answer
  // a question a script asked. It is held either way, for the Title that reads it as a level.
  {
    action: 'FIRE',
    group: 'always',
    keys: ['F'],
    mode: actions => (actions.fire === undefined ? 'hold' : undefined),
    press: codes(['KeyF'], (code, target) => {
      target.actions.fire?.();
      target.hold(code);
    }),
    provided: always
  },
  // Running is Movement Intent, so R does not `press` either, for the same reason firing does
  // not. The key is still held so that its release is the profile's to swallow.
  {
    action: 'RUN',
    group: 'always',
    keys: ['R'],
    mode: () => 'toggle',
    press: codes(['KeyR'], (code, target) => {
      target.toggleRunning();
      target.hold(code);
    }),
    provided: always
  }
];

const inGroup = (group: BindingGroup, aboard: boolean): boolean =>
  group === 'always' || (group === 'aboard') === aboard;

/// The Head Command keys as the DAMOCLES FILE's notice names them: a laptop's key for each.
export const headCommandKeysText = (): string =>
  (['open', 'read', 'next', 'previous'] as const)
    .map(
      command =>
        `${HEAD_COMMAND_KEYS[command][0]} ${HEAD_COMMAND_LABELS[command]}`
    )
    .join(' · ');

export interface ControlsRow {
  readonly action: string;
  readonly keys: string;
  readonly mode?: BindingMode;
}

export type ControlsGroupName = BindingGroup | 'pointer' | 'shell';

export interface ControlsGroup {
  /// Whether this is the Occupancy, or the lift, the player is in. The groups that hold
  /// everywhere are never marked.
  readonly current: boolean;
  readonly name: ControlsGroupName;
  readonly rows: readonly ControlsRow[];
  readonly title: string;
}

export interface ControlsState {
  readonly inLift: boolean;
  readonly occupancy: Occupancy;
}

/// Keys the Browser Shell routes before the Control Profile sees them.
const SHELL_ROWS: readonly ControlsRow[] = [
  { action: 'SYSTEM MENU', keys: 'ESC' },
  { action: 'SHELL CONSOLE', keys: 'BACKTICK' }
];

const POINTER_ROWS: readonly ControlsRow[] = [
  { action: 'TAKE', keys: 'CLICK' }
];

const GROUP_TITLES: Readonly<Record<ControlsGroupName, string>> = {
  aboard: 'ABOARD',
  always: 'ALWAYS',
  lift: 'IN A LIFT',
  onFoot: 'ON FOOT',
  pointer: 'POINTER',
  shell: 'SHELL'
};

/// The Controls Page's groups for a Title: every Binding it has, grouped by where it holds, with
/// the groups the player is in marked current. A group with no Binding the Title has is left
/// out.
export const describeBindings = (
  actions: ControlProfileActions,
  state: ControlsState
): readonly ControlsGroup[] => {
  const aboard = state.occupancy.kind === 'aboard';
  const current: Readonly<Record<BindingGroup, boolean>> = {
    aboard,
    always: false,
    lift: !aboard && state.inLift,
    onFoot: !aboard
  };
  const rows = (group: BindingGroup): readonly ControlsRow[] =>
    BINDINGS.filter(
      binding => binding.group === group && binding.provided(actions)
    ).map(binding => {
      const mode = binding.mode?.(actions);
      return {
        action: binding.action,
        keys: binding.keys.join(' / '),
        ...(mode === undefined ? {} : { mode })
      };
    });
  const group = (
    name: ControlsGroupName,
    groupRows: readonly ControlsRow[],
    isCurrent: boolean
  ): ControlsGroup => ({
    current: isCurrent,
    name,
    rows: groupRows,
    title: GROUP_TITLES[name]
  });
  return [
    group('shell', SHELL_ROWS, false),
    group('pointer', POINTER_ROWS, false),
    ...(['always', 'onFoot', 'lift', 'aboard'] as const).map(name =>
      group(name, rows(name), current[name])
    )
  ].filter(entry => entry.rows.length > 0);
};

/// Where the run mode lives, when a Title's Session State owns it rather than the profile.
export interface RunningMode {
  readonly running: () => boolean;
  readonly toggleRunning: () => void;
}

/// The browser Control Profile: physical codes at the edge, Movement Intent and Semantic
/// Actions on the other side. The core sees neither a key code nor a browser event.
export class BrowserControlProfile {
  private readonly actions: ControlProfileActions;
  private readonly held = new Set<string>();
  /// Running latches rather than following a held key, as the run key does on the Working
  /// Authority. A mode is not a held key, so `releaseAll` leaves it alone: losing focus or
  /// opening the System Menu must not silently cancel it. By default it is Control Profile state,
  /// which no Save, Session Resume or trace carries. A Title whose Session State owns it, as
  /// Damocles's does, passes `mode`, and the profile reads and toggles it there.
  private readonly mode: RunningMode;
  private readonly target: BindingTarget;

  constructor(actions: ControlProfileActions, mode?: RunningMode) {
    this.actions = actions;
    let running = false;
    this.mode = mode ?? {
      running: () => running,
      toggleRunning: () => {
        running = !running;
      }
    };
    this.target = {
      actions,
      hold: code => this.held.add(code),
      holdAndPress: code => this.holdAndPress(code),
      toggleRunning: () => this.mode.toggleRunning()
    };
  }

  get intent(): Intent {
    const vertical = axis(this.held, 'ArrowUp', 'ArrowDown');
    const onFoot = this.actions.occupancy().kind === 'onFoot';
    return intent({
      pitch: onFoot ? 0 : -vertical,
      running: this.mode.running(),
      turn: axis(this.held, 'ArrowRight', 'ArrowLeft'),
      walk: onFoot ? vertical : 0
    });
  }

  /// Whether the fire key is held. A Title whose fire is the joystick button's level, as
  /// Damocles's launcher `$050B96` reads it (#581), asks this; one whose fire is a press takes
  /// `fire` alone.
  get firing(): boolean {
    return this.held.has('KeyF');
  }

  /// The Controls Page's groups for this profile's Title, as the player stands now.
  describe(inLift: boolean): readonly ControlsGroup[] {
    return describeBindings(this.actions, {
      inLift,
      occupancy: this.actions.occupancy()
    });
  }

  keyDown(key: BrowserKey): boolean {
    if (browserChord(key)) {
      return false;
    }
    if (key.repeat) {
      return (
        (this.actions.headCommand !== undefined &&
          HEAD_COMMANDS[key.code] !== undefined) ||
        handledCode(key.code)
      );
    }
    const aboard = this.actions.occupancy().kind === 'aboard';
    for (const binding of BINDINGS) {
      if (
        inGroup(binding.group, aboard) &&
        binding.press(key.code, this.target)
      ) {
        return true;
      }
    }
    if (!ordinaryCode(key.code)) {
      return false;
    }
    this.holdAndPress(key.code);
    return true;
  }

  keyUp(key: BrowserKey): boolean {
    const wasHeld = this.held.delete(key.code);
    return wasHeld && !browserChord(key);
  }

  releaseAll(): void {
    this.held.clear();
  }

  private holdAndPress(code: string): void {
    this.held.add(code);
    this.actions.press?.(code === 'KeyY' ? BensonKey.y : undefined);
  }
}
