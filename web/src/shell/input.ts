import {
  BensonKey,
  type BensonKey as BensonKeyValue
} from '../benson/index.ts';
import { intent, type Intent } from '../gameCore/index.ts';
import type { HeadCommand, InteractionAction } from '../interaction/index.ts';
import type { Occupancy } from '../session/index.ts';
import {
  heldPadControls,
  type PadButton,
  type PadControl,
  type PadReading
} from './gamepad.ts';
import { US_KEY_NAMES, type KeyNames } from './keyNames.ts';

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
  /// Whether the player has turned Extended Controls on: the Strafe and Free Look Extensions
  /// (ADR 0059), a Browser Shell preference. A Title that offers neither leaves it out.
  readonly extendedControls?: () => boolean;
  /// Fire as a press. A Title whose fire is the joystick button's level, as Damocles's launcher
  /// `$050B96` reads it (#581), leaves it out and asks `firing` instead.
  readonly fire?: () => void;
  /// A Head Command. A Title with none leaves it out, and its keys keep their ordinary meaning.
  readonly headCommand?: (command: HeadCommand) => void;
  /// Every key press, as its physical code, before any Binding takes it: the key a script's
  /// prompt reads, as Damocles's input poll writes each key it reads to `$7B61` (#612). A Title
  /// whose scripts read no latch leaves it out.
  readonly keyMake?: (code: string) => void;
  /// A keypad digit, which the ST sends to the Head Commands' dispatch `$04D3D2` with the rest of
  /// the keypad: the Damocles AUTHORS COMPUTER's parameter (#628). A Title with none leaves it
  /// out.
  readonly keypadDigit?: (digit: number) => void;
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
  /// Level the view Free Look tilted. Offered only with Extended Controls on.
  readonly recentreLook?: () => void;
  /// Targ's single lift key, riding the Lift Journey.
  readonly rideLift?: () => void;
  /// Rotate the Carried Stack: forward is the ST's Left (`$04DC74`), which sends the head to the
  /// back. A Title that rotates takes the brackets from `page`.
  readonly rotateStack?: (direction: 'forward' | 'backward') => void;
  readonly shutThrottle: () => void;
  readonly skipMessage?: () => void;
  /// A notch down or up the throttle ladder: the pad's shoulder buttons, the same step in every
  /// Title (ADR 0059). From a stop up is the lowest notch; below it down is a stop.
  readonly throttleNotchStep: (direction: -1 | 1) => void;
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

/// What the pad's shoulder buttons stand in for aboard: a notch down or up, which no one key is.
const NOTCH_DOWN_CODE = 'PadNotchDown';
const NOTCH_UP_CODE = 'PadNotchUp';

/// The Control Profiles' names, as the Controls Page heads its Bindings: the keyboard's and the
/// gamepad's, which share the one table (ADR 0059).
export const CONTROL_PROFILE_NAME = 'Keyboard / Pad';

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

/// Whether the Title offers the Extensions and the player has turned them on.
const extended = (actions: ControlProfileActions): boolean =>
  actions.extendedControls?.() === true;

/// The keys only the Extensions answer: Free Look's and its recentre. None is a key the
/// original reads, so with Extended Controls off each keeps the browser's own meaning.
const LOOK_UP_CODE = 'PageUp';
const LOOK_DOWN_CODE = 'PageDown';
const RECENTRE_CODE = 'Home';
const EXTENSION_CODES: ReadonlySet<string> = new Set([
  LOOK_DOWN_CODE,
  LOOK_UP_CODE,
  RECENTRE_CODE
]);

/// Strafe's keys, beside each other on every layout's bottom row. They are ordinary keys, so
/// they answer a script exactly as they do with Extended Controls off.
const STRAFE_LEFT_CODE = 'KeyZ';
const STRAFE_RIGHT_CODE = 'KeyX';

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

/// A key the player's layout may print differently, named by its physical code (#606).
export interface LayoutKey {
  readonly code: string;
}

/// How the Controls Page names a key: fixed text, or text around keys the layout names. Digits
/// are fixed text, as every layout prints the digit on its key even where the key's own
/// character is another (AZERTY's `1` key gives `&`).
export type KeyLabel = string | readonly (LayoutKey | string)[];

const key = (code: string): LayoutKey => ({ code });

/// The US names of the codes a label leaves to the layout.
const US_NAMES: Readonly<Record<string, string>> = {
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Equal: '=',
  Minus: '-',
  Period: '.'
};

const usName = (code: string): string =>
  US_NAMES[code] ?? /^Key([A-Z])$/.exec(code)?.[1] ?? code;

/// A label as `names` prints it, each key falling back to its US name.
export const keyLabelText = (
  label: KeyLabel,
  names: KeyNames = US_KEY_NAMES
): string =>
  typeof label === 'string'
    ? label
    : label
        .map(part =>
          typeof part === 'string'
            ? part
            : (names.printed(part.code) ?? usName(part.code))
        )
        .join('');

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

/// A Binding's gamepad column (ADR 0059): the buttons that take it, each with the key it stands
/// in for (or a code of the profile's own, where no one key is the step), or the sticks that give
/// its Movement Intent. A button reaches the Binding through its
/// `press`, so it does exactly what the key does.
export interface PadBinding {
  readonly buttons?: readonly (readonly [PadButton, string])[];
  /// The buttons take the Binding on foot only, though its keys hold everywhere.
  readonly onFootOnly?: true;
  /// The sticks, as the Controls Page names them, which may depend on the Title's actions.
  readonly sticks?: string | ((actions: ControlProfileActions) => string);
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
  readonly keys: readonly KeyLabel[];
  readonly mode?: (actions: ControlProfileActions) => BindingMode | undefined;
  readonly pad?: PadBinding;
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

const HEAD_COMMAND_KEYS: Readonly<Record<HeadCommand, readonly KeyLabel[]>> = {
  next: [[key('Period')], 'NUMPAD +'],
  open: ['ENTER', 'NUMPAD ENTER'],
  previous: [[key('Comma')], 'NUMPAD -'],
  read: [[key('KeyP')], 'NUMPAD *']
};

/// The D-pad's Head Commands, each with a laptop key that gives it.
const HEAD_COMMAND_PAD: Readonly<
  Record<HeadCommand, readonly [PadButton, string]>
> = {
  next: ['D-PAD RIGHT', 'Period'],
  open: ['D-PAD UP', 'Enter'],
  previous: ['D-PAD LEFT', 'Comma'],
  read: ['D-PAD DOWN', 'KeyP']
};

const headCommandBinding = (command: HeadCommand): Binding => ({
  action: HEAD_COMMAND_LABELS[command],
  group: 'always',
  keys: HEAD_COMMAND_KEYS[command],
  pad: { buttons: [HEAD_COMMAND_PAD[command]] },
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
    pad: {
      buttons: [
        ['LB', NOTCH_DOWN_CODE],
        ['RB', NOTCH_UP_CODE]
      ]
    },
    press: (code, { actions }) => {
      if (code === NOTCH_DOWN_CODE || code === NOTCH_UP_CODE) {
        actions.throttleNotchStep(code === NOTCH_UP_CODE ? 1 : -1);
        return true;
      }
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
    keys: [[key('Minus'), ' / ', key('Equal')]],
    press: codes(['Minus', 'Equal'], (code, { actions }) =>
      actions.throttleStep(code === 'Equal' ? 1 : -1)
    ),
    provided: always
  },
  {
    action: 'LAUNCH',
    group: 'aboard',
    keys: ['BACKSPACE'],
    pad: { buttons: [['BACK', LAUNCH_CODE]] },
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
    keys: [['1-9, 0 / ', key('KeyB'), ', ', key('KeyG')]],
    press: (code, { actions }) => {
      const floor = liftFloor(code);
      return floor !== undefined && actions.liftKey?.(floor) === true;
    },
    provided: actions => actions.liftKey !== undefined
  },
  {
    // Only the keypad's own digits: the main row's are the throttle aboard, and the AUTHOR'S
    // CHAIR the computer opens from is aboard. A laptop picks the parameter by pointer (#628).
    action: 'PARAMETER 0-4',
    group: 'always',
    keys: ['NUMPAD 0-4'],
    press: (code, { actions }) => {
      const match = /^Numpad([0-4])$/.exec(code);
      if (match === null || actions.keypadDigit === undefined) {
        return false;
      }
      actions.keypadDigit(Number(match[1]));
      return true;
    },
    provided: actions => actions.keypadDigit !== undefined
  },
  headCommandBinding('open'),
  headCommandBinding('read'),
  headCommandBinding('next'),
  headCommandBinding('previous'),
  {
    action: 'PITCH',
    group: 'aboard',
    keys: ['UP / DOWN'],
    pad: { sticks: 'RIGHT STICK UP / DOWN' },
    press: codes(['ArrowUp', 'ArrowDown'], (code, target) =>
      target.holdAndPress(code)
    ),
    provided: always
  },
  {
    action: 'WALK',
    group: 'onFoot',
    keys: ['UP / DOWN'],
    pad: { sticks: 'LEFT STICK UP / DOWN' },
    press: codes(['ArrowUp', 'ArrowDown'], (code, target) =>
      target.holdAndPress(code)
    ),
    provided: always
  },
  // The Extensions (ADR 0059), listed and answered only while Extended Controls is on.
  {
    action: 'STRAFE',
    group: 'onFoot',
    keys: [[key(STRAFE_LEFT_CODE), ' / ', key(STRAFE_RIGHT_CODE)]],
    pad: { sticks: 'LEFT STICK LEFT / RIGHT' },
    press: (code, target) => {
      if (
        !extended(target.actions) ||
        (code !== STRAFE_LEFT_CODE && code !== STRAFE_RIGHT_CODE)
      ) {
        return false;
      }
      target.holdAndPress(code);
      return true;
    },
    provided: extended
  },
  {
    action: 'LOOK UP / DOWN',
    group: 'onFoot',
    keys: ['PAGE UP / PAGE DOWN'],
    pad: { sticks: 'RIGHT STICK UP / DOWN' },
    // Free Look is Movement Intent, so like running it holds without answering a script.
    press: (code, target) => {
      if (
        !extended(target.actions) ||
        (code !== LOOK_UP_CODE && code !== LOOK_DOWN_CODE)
      ) {
        return false;
      }
      target.hold(code);
      return true;
    },
    provided: extended
  },
  {
    action: 'RECENTRE VIEW',
    group: 'onFoot',
    keys: ['HOME'],
    pad: { buttons: [['R3', RECENTRE_CODE]] },
    press: (code, target) => {
      if (
        code !== RECENTRE_CODE ||
        !extended(target.actions) ||
        target.actions.recentreLook === undefined
      ) {
        return false;
      }
      target.actions.recentreLook();
      target.hold(code);
      return true;
    },
    provided: actions => extended(actions) && actions.recentreLook !== undefined
  },
  {
    action: 'TURN',
    group: 'always',
    keys: ['LEFT / RIGHT'],
    // With Strafe on, the left stick sidesteps on foot and only the right one turns there.
    pad: {
      sticks: actions =>
        extended(actions)
          ? 'RIGHT STICK LEFT / RIGHT, EITHER ABOARD'
          : 'STICKS LEFT / RIGHT'
    },
    press: codes(['ArrowLeft', 'ArrowRight'], (code, target) =>
      target.holdAndPress(code)
    ),
    provided: always
  },
  {
    action: 'ROTATE STACK',
    group: 'always',
    keys: [[key('BracketLeft'), ' / ', key('BracketRight')]],
    pad: {
      buttons: [
        ['LB', 'BracketLeft'],
        ['RB', 'BracketRight']
      ],
      onFootOnly: true
    },
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
    keys: [[key('BracketLeft'), ' / ', key('BracketRight')]],
    pad: {
      buttons: [
        ['LB', 'BracketLeft'],
        ['RB', 'BracketRight']
      ],
      onFootOnly: true
    },
    press: codes(['BracketLeft', 'BracketRight'], (code, { actions }) =>
      actions.page?.(code === 'BracketLeft' ? -1 : 1)
    ),
    provided: actions => actions.page !== undefined
  },
  {
    action: 'SHUT THROTTLE',
    group: 'aboard',
    keys: ['SPACE'],
    pad: { buttons: [['LT', SKIP_MESSAGE_CODE]] },
    press: codes([SKIP_MESSAGE_CODE], (_code, { actions }) =>
      actions.shutThrottle()
    ),
    provided: always
  },
  {
    action: 'SKIP MESSAGE',
    group: 'onFoot',
    keys: ['SPACE'],
    pad: { buttons: [['BACK', SKIP_MESSAGE_CODE]] },
    press: codes([SKIP_MESSAGE_CODE], (_code, { actions }) =>
      actions.skipMessage?.()
    ),
    provided: actions => actions.skipMessage !== undefined
  },
  {
    action: 'BOARD',
    group: 'always',
    keys: [[key('KeyB')]],
    pad: { buttons: [['A', 'KeyB']], onFootOnly: true },
    press: codes(['KeyB'], (_code, { actions }) => actions.reach('board')),
    provided: always
  },
  {
    action: 'TAKE',
    group: 'always',
    keys: [[key('KeyT')]],
    pad: { buttons: [['X', 'KeyT']] },
    press: codes(['KeyT'], (_code, { actions }) => actions.reach('take')),
    provided: always
  },
  {
    action: 'LEAVE CRAFT',
    group: 'aboard',
    keys: [[key('KeyL')]],
    pad: { buttons: [['A', 'KeyL']] },
    press: codes(['KeyL'], (_code, { actions }) => actions.leaveCraft()),
    provided: always
  },
  {
    action: 'RIDE LIFT',
    group: 'always',
    keys: [[key('KeyE')]],
    pad: { buttons: [['Y', 'KeyE']], onFootOnly: true },
    press: codes(['KeyE'], (_code, { actions }) => actions.rideLift?.()),
    provided: actions => actions.rideLift !== undefined
  },
  {
    action: 'DROP',
    group: 'always',
    keys: [[key('KeyD')]],
    pad: { buttons: [['B', 'KeyD']] },
    press: codes(['KeyD'], (_code, { actions }) => actions.drop()),
    provided: always
  },
  // The Reference Build's fire is the joystick's fire button, never a key the scripts poll, so
  // this deliberately does not also `press`: marking input as detected would let firing answer
  // a question a script asked. It is held either way, for the Title that reads it as a level.
  {
    action: 'FIRE',
    group: 'always',
    keys: [[key('KeyF')]],
    mode: actions => (actions.fire === undefined ? 'hold' : undefined),
    pad: { buttons: [['RT', 'KeyF']] },
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
    keys: [[key('KeyR')]],
    mode: () => 'toggle',
    pad: { buttons: [['L3', 'KeyR']], onFootOnly: true },
    press: codes(['KeyR'], (code, target) => {
      target.toggleRunning();
      target.hold(code);
    }),
    provided: always
  }
];

const inGroup = (group: BindingGroup, aboard: boolean): boolean =>
  group === 'always' || (group === 'aboard') === aboard;

/// The Head Command keys as the DAMOCLES FILE's notice names them: a laptop's key for each, as
/// the player's layout prints it.
export const headCommandKeysText = (names: KeyNames = US_KEY_NAMES): string =>
  (['open', 'read', 'next', 'previous'] as const)
    .map(
      command =>
        `${keyLabelText(HEAD_COMMAND_KEYS[command][0]!, names)} ${HEAD_COMMAND_LABELS[command]}`
    )
    .join(' · ');

export interface ControlsRow {
  readonly action: string;
  readonly keys: string;
  readonly mode?: BindingMode;
  /// The pad's buttons or sticks, where the pad has the Binding.
  readonly pad?: string;
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
  { action: 'SYSTEM MENU', keys: 'ESC', pad: 'START' },
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

/// How the Controls Page names a Binding's pad column.
const padLabel = (
  pad: PadBinding,
  actions: ControlProfileActions
): string | undefined => {
  if (pad.sticks !== undefined) {
    return typeof pad.sticks === 'string' ? pad.sticks : pad.sticks(actions);
  }
  if (pad.buttons === undefined) {
    return undefined;
  }
  const buttons = pad.buttons.map(([button]) => button).join(' / ');
  return pad.onFootOnly === true ? `${buttons} ON FOOT` : buttons;
};

/// Which of a pad's controls reach play, as the Browser Shell's router decides for keys: all of
/// them; only the one that hurries Benson, while the Arrival holds the rest (ADR 0032); none
/// while an opening holds the Game Surface; or none because chrome has the keyboard, which
/// releases the pad as opening a layer releases the keys. Start reaches the System Menu from
/// every route but the last.
export type PadRoute = 'chrome' | 'game' | 'held' | 'skip';

/// The Controls Page's groups for a Title: every Binding it has, grouped by where it holds, with
/// the groups the player is in marked current. A group with no Binding the Title has is left
/// out. Keys are named as `names` prints them.
export const describeBindings = (
  actions: ControlProfileActions,
  state: ControlsState,
  names: KeyNames = US_KEY_NAMES
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
      const pad =
        binding.pad === undefined ? undefined : padLabel(binding.pad, actions);
      return {
        action: binding.action,
        keys: binding.keys.map(label => keyLabelText(label, names)).join(' / '),
        ...(mode === undefined ? {} : { mode }),
        ...(pad === undefined ? {} : { pad })
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
  /// The pad's controls held this poll that reach play.
  private padHeld: ReadonlySet<PadControl> = new Set();
  /// The pad's controls that count, as last polled, whatever the route: a press is a control in
  /// the next poll that is not in this.
  private padLive: ReadonlySet<PadControl> = new Set();
  /// Controls held when the pad was released. Each is ignored until it comes to rest, as a key
  /// held through a release stays released until it is pressed again. `undefined` until the
  /// first poll after a release reads which they are.
  private padResting: Set<PadControl> | undefined = new Set();
  /// What a pad button does to the profile. The pad's levels are its own, read each poll, so a
  /// button holds no key: releasing it must not release a key the keyboard holds.
  private readonly padTarget: BindingTarget;
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
    this.padTarget = {
      actions,
      hold: () => {},
      holdAndPress: () => {},
      toggleRunning: () => this.mode.toggleRunning()
    };
  }

  /// The keyboard's and the pads' Intents merged and clamped. A stick pushed past the threshold
  /// is its matching arrow: on foot the left stick's Y walks, aboard the right stick's Y
  /// pitches, and either stick's X turns (ADR 0059 point 3). With Extended Controls on, on foot
  /// the left stick's X strafes instead of turning and the right stick's Y is Free Look, up
  /// looking up; with it off, neither Extension's keys nor sticks give anything.
  get intent(): Intent {
    const onFoot = this.actions.occupancy().kind === 'onFoot';
    const extensions = onFoot && extended(this.actions);
    const pad = this.padHeld;
    const vertical =
      axis(this.held, 'ArrowUp', 'ArrowDown') +
      (onFoot
        ? axis(pad, 'LEFT UP', 'LEFT DOWN')
        : axis(pad, 'RIGHT UP', 'RIGHT DOWN'));
    const padTurn = extensions
      ? axis(pad, 'RIGHT RIGHT', 'RIGHT LEFT')
      : Number(pad.has('LEFT RIGHT') || pad.has('RIGHT RIGHT')) -
        Number(pad.has('LEFT LEFT') || pad.has('RIGHT LEFT'));
    return intent({
      look: extensions
        ? axis(this.held, LOOK_UP_CODE, LOOK_DOWN_CODE) +
          axis(pad, 'RIGHT UP', 'RIGHT DOWN')
        : 0,
      pitch: onFoot ? 0 : -vertical,
      running: this.mode.running(),
      strafe: extensions
        ? axis(this.held, STRAFE_RIGHT_CODE, STRAFE_LEFT_CODE) +
          axis(pad, 'LEFT RIGHT', 'LEFT LEFT')
        : 0,
      turn: axis(this.held, 'ArrowRight', 'ArrowLeft') + padTurn,
      walk: onFoot ? vertical : 0
    });
  }

  /// The run key's toggle without the key: the panel's run lamp, which latches running as R does.
  toggleRunning(): void {
    this.mode.toggleRunning();
  }

  /// Whether fire is held, by key or by pad. A Title whose fire is the joystick button's level,
  /// as Damocles's launcher `$050B96` reads it (#581), asks this; one whose fire is a press takes
  /// `fire` alone.
  get firing(): boolean {
    return this.held.has('KeyF') || this.padHeld.has('RT');
  }

  /// The Controls Page's groups for this profile's Title, as the player stands now.
  describe(inLift: boolean, names?: KeyNames): readonly ControlsGroup[] {
    return describeBindings(
      this.actions,
      { inLift, occupancy: this.actions.occupancy() },
      names
    );
  }

  keyDown(key: BrowserKey): boolean {
    if (browserChord(key)) {
      return false;
    }
    if (key.repeat) {
      return (
        (this.actions.headCommand !== undefined &&
          HEAD_COMMANDS[key.code] !== undefined) ||
        (extended(this.actions) && EXTENSION_CODES.has(key.code)) ||
        handledCode(key.code)
      );
    }
    this.actions.keyMake?.(key.code);
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

  /// Read the pads, once before each frame's steps as a key event arrives before them. A button
  /// acts as it goes down, through the first Binding of the player's group that takes it; the
  /// sticks and held buttons stand until the next poll. Answers whether Start asked for the
  /// System Menu, which is the Browser Shell's to open.
  pollPads(
    pads: readonly (PadReading | null)[],
    route: PadRoute = 'game'
  ): boolean {
    if (route === 'chrome') {
      this.releasePads();
      return false;
    }
    const raw = heldPadControls(pads);
    const resting = (this.padResting ??= new Set(raw));
    for (const control of resting) {
      if (!raw.has(control)) {
        resting.delete(control);
      }
    }
    const live = new Set([...raw].filter(control => !resting.has(control)));
    const pressed = [...live].filter(control => !this.padLive.has(control));
    this.padLive = live;
    this.padHeld = route === 'game' ? live : new Set();
    let systemMenu = false;
    for (const control of pressed) {
      if (control === 'START') {
        systemMenu = true;
      } else if (route === 'game') {
        this.pressPadButton(control);
      } else if (route === 'skip') {
        this.pressPadButton(control, SKIP_MESSAGE_CODE);
      }
    }
    return systemMenu;
  }

  releaseAll(): void {
    this.held.clear();
    this.releasePads();
  }

  private releasePads(): void {
    this.padHeld = new Set();
    this.padLive = new Set();
    this.padResting = undefined;
  }

  /// Press a pad button through the first Binding that takes it, optionally only one that
  /// stands in for the key `only`. A stick direction is no button, and no Binding takes it.
  private pressPadButton(control: PadControl, only?: string): void {
    const aboard = this.actions.occupancy().kind === 'aboard';
    for (const binding of BINDINGS) {
      const pad = binding.pad;
      if (
        pad?.buttons === undefined ||
        !inGroup(binding.group, aboard) ||
        (aboard && pad.onFootOnly === true)
      ) {
        continue;
      }
      const code = pad.buttons.find(([button]) => button === control)?.[1];
      if (
        code !== undefined &&
        (only === undefined || code === only) &&
        binding.press(code, this.padTarget)
      ) {
        return;
      }
    }
  }

  private holdAndPress(code: string): void {
    this.held.add(code);
    this.actions.press?.(code === 'KeyY' ? BensonKey.y : undefined);
  }
}
