import {
  BensonKey,
  type BensonKey as BensonKeyValue
} from '../benson/index.ts';
import { intent, type Intent } from '../gameCore/index.ts';
import type { InteractionAction } from '../interaction/index.ts';
import type { Occupancy } from '../session/index.ts';

export interface BrowserKey {
  readonly altKey: boolean;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly repeat: boolean;
}

export interface ControlProfileActions {
  readonly drop: () => void;
  readonly fire: () => void;
  /// Launch into space aboard: the ST's Esc (`$055822`), which the Browser Shell keeps for the
  /// System Menu, so `Backspace` stands in for it (#566). A Title with no launch leaves it out.
  readonly launch?: () => void;
  readonly leaveCraft: () => void;
  /// A Damocles Lift key asking for a Floor. Answers whether the player is in a lift: where they
  /// are not, the key keeps its ordinary meaning.
  readonly liftKey: (floor: number) => boolean;
  readonly occupancy: () => Occupancy;
  readonly page: (delta: number) => void;
  readonly press: (key: BensonKeyValue | undefined) => void;
  readonly reach: (action: InteractionAction) => void;
  readonly rideLift: () => void;
  readonly shutThrottle: () => void;
  readonly skipMessage: () => void;
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

/// The browser Control Profile: physical codes at the edge, Movement Intent and Semantic
/// Actions on the other side. The core sees neither a key code nor a browser event.
export class BrowserControlProfile {
  private readonly actions: ControlProfileActions;
  private readonly held = new Set<string>();
  /// Running latches rather than following a held key, as the run key does on the Working
  /// Authority. A mode is not a held key, so `releaseAll` leaves it alone: losing focus or
  /// opening the System Menu must not silently cancel it. It is Control Profile state and not
  /// Session State, so no Save, Session Resume or trace carries it.
  private running = false;

  constructor(actions: ControlProfileActions) {
    this.actions = actions;
  }

  get intent(): Intent {
    const vertical = axis(this.held, 'ArrowUp', 'ArrowDown');
    const onFoot = this.actions.occupancy().kind === 'onFoot';
    return intent({
      pitch: onFoot ? 0 : -vertical,
      running: this.running,
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

  keyDown(key: BrowserKey): boolean {
    if (browserChord(key)) {
      return false;
    }
    const aboard = this.actions.occupancy().kind === 'aboard';
    if (key.repeat) {
      return handledCode(key.code);
    }
    if (aboard) {
      const notch = throttleNotch(key.code);
      if (notch !== undefined) {
        this.actions.throttleNotchValue(notch);
        return true;
      }
      const reverse = reverseNotch(key.code);
      if (reverse !== undefined && this.actions.throttleReverseNotch) {
        this.actions.throttleReverseNotch(reverse);
        return true;
      }
      if (key.code === 'Minus' || key.code === 'Equal') {
        this.actions.throttleStep(key.code === 'Equal' ? 1 : -1);
        return true;
      }
      if (key.code === LAUNCH_CODE && this.actions.launch) {
        this.actions.launch();
        return true;
      }
    } else {
      // The lift takes its keys before their ordinary meaning, as `$0555DC` does before the
      // rest of the dispatch: in a lift, `B` asks for Floor 10 and never boards.
      const floor = liftFloor(key.code);
      if (floor !== undefined && this.actions.liftKey(floor)) {
        return true;
      }
    }

    switch (key.code) {
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
        this.holdAndPress(key.code);
        break;
      case 'BracketLeft':
        this.actions.page(-1);
        break;
      case 'BracketRight':
        this.actions.page(1);
        break;
      case 'Space':
        if (aboard) {
          this.actions.shutThrottle();
        } else {
          this.actions.skipMessage();
        }
        break;
      case 'KeyB':
        this.actions.reach('board');
        break;
      case 'KeyT':
        this.actions.reach('take');
        break;
      case 'KeyL':
        if (aboard) {
          this.actions.leaveCraft();
          break;
        }
        this.holdAndPress(key.code);
        break;
      case 'KeyE':
        this.actions.rideLift();
        break;
      case 'KeyD':
        this.actions.drop();
        break;
      // The Reference Build's fire is the joystick's fire button, never a key
      // the scripts poll, so this deliberately does not also `press`: marking
      // input as detected would let firing answer a question a script asked.
      case 'KeyF':
        this.actions.fire();
        this.held.add(key.code);
        break;
      // Running is Movement Intent, so R does not `press` either, for the same
      // reason firing does not. The key is still held so that its release is
      // the profile's to swallow.
      case 'KeyR':
        this.running = !this.running;
        this.held.add(key.code);
        break;
      default:
        if (!ordinaryCode(key.code)) {
          return false;
        }
        this.holdAndPress(key.code);
        break;
    }
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
    this.actions.press(code === 'KeyY' ? BensonKey.y : undefined);
  }
}
