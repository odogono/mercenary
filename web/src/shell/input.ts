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
  readonly leaveCraft: () => void;
  readonly occupancy: () => Occupancy;
  readonly page: (delta: number) => void;
  readonly press: (key: BensonKeyValue | undefined) => void;
  readonly reach: (action: InteractionAction) => void;
  readonly rideLift: () => void;
  readonly shutThrottle: () => void;
  readonly skipMessage: () => void;
  readonly throttleNotchValue: (notch: number) => void;
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
  'ArrowUp',
  'ShiftLeft',
  'ShiftRight'
]);

/// Codes the Browser Shell keeps for itself.
///
/// The module that classifies keys is the one that should say which are not its own: the Shell
/// Console's key would otherwise be an ordinary code the Control Profile presses, and the shell
/// would be relying on the order of a switch elsewhere to get it back.
export const RESERVED_CODES: ReadonlySet<string> = new Set(['Backquote']);

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

const throttleNotch = (code: string): number | undefined => {
  if (code === 'Digit0') {
    return 10;
  }
  const match = /^Digit([1-9])$/.exec(code);
  return match === null ? undefined : Number(match[1]);
};

/// The browser Control Profile: physical codes at the edge, Movement Intent and Semantic
/// Actions on the other side. The core sees neither a key code nor a browser event.
export class BrowserControlProfile {
  private readonly actions: ControlProfileActions;
  private readonly held = new Set<string>();

  constructor(actions: ControlProfileActions) {
    this.actions = actions;
  }

  get intent(): Intent {
    const vertical = axis(this.held, 'ArrowUp', 'ArrowDown');
    const onFoot = this.actions.occupancy().kind === 'onFoot';
    return intent({
      pitch: onFoot ? 0 : -vertical,
      running: this.held.has('ShiftLeft') || this.held.has('ShiftRight'),
      turn: axis(this.held, 'ArrowRight', 'ArrowLeft'),
      walk: onFoot ? vertical : 0
    });
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
      if (key.code === 'Minus' || key.code === 'Equal') {
        this.actions.throttleStep(key.code === 'Equal' ? 1 : -1);
        return true;
      }
    }

    switch (key.code) {
      case 'ShiftLeft':
      case 'ShiftRight':
        this.held.add(key.code);
        break;
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
