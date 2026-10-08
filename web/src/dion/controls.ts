import type { HeadCommand } from '../interaction/index.ts';
import type { ControlProfileActions } from '../shell/input.ts';
import type { DionAction } from './session.ts';

/// The TAXICARD's actions on the keypad keys Damocles reads as Head Commands: the same ST
/// scancodes, keypad Enter `$72`, `*` `$66` and `+` `$4E` (ADR 0064).
export const CARD_ACTIONS: Readonly<Record<HeadCommand, DionAction>> = {
  next: 'plus',
  open: 'activate',
  previous: 'minus',
  read: 'star'
};

const inert = (): void => {};

/// Mercenary III's side of Damocles's Control Profile, whole (ADR 0064). Every action its port
/// has not reached yet takes its key and does nothing, so the Controls Page lists the same
/// Bindings as Damocles's.
export const dionControlActions = (options: {
  readonly act: (action: DionAction) => void;
  readonly extendedControls: () => boolean;
  readonly launch?: () => void;
  /// A Floor key: whether the lift took it (#835). Outside a lift it keeps its other meaning.
  readonly liftKey?: (floor: number) => boolean;
  readonly passenger: () => boolean;
  readonly recentreLook?: () => void;
  readonly throttleKey?: (key: number) => void;
  readonly throttleNotchStep?: (direction: -1 | 1) => void;
  readonly throttleScale?: (direction: -1 | 1) => void;
}): ControlProfileActions => ({
  drop: () => options.act('drop'),
  extendedControls: options.extendedControls,
  headCommand: command => options.act(CARD_ACTIONS[command]),
  keypadDigit: inert,
  launch: options.launch ?? inert,
  leaveCraft: () => options.act('leave'),
  liftKey: options.liftKey ?? (() => false),
  // The shared profile reads only whether the player is aboard, and a passenger leaves by LEAVE
  // CRAFT; the session keeps its own passenger reference.
  occupancy: () =>
    options.passenger() ? { kind: 'aboard', slot: 0 } : { kind: 'onFoot' },
  reach: action => {
    if (action === 'board' || action === 'take') {
      options.act(action);
    }
  },
  recentreLook: options.recentreLook ?? inert,
  rotateStack: direction => options.act(direction),
  shutThrottle: () => options.throttleKey?.(57),
  throttleNotchStep: options.throttleNotchStep ?? inert,
  throttleNotchValue: notch => options.throttleKey?.(notch + 1),
  throttleReverseNotch: notch => options.throttleKey?.(notch + 58),
  throttleStep: delta => {
    if (delta !== 0) {
      options.throttleScale?.(delta < 0 ? -1 : 1);
    }
  }
});
