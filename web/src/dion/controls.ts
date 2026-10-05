import type { HeadCommand } from '../interaction/index.ts';
import type { ControlProfileActions } from '../shell/input.ts';
import type { DionAction } from './session.ts';

/// The TAXICARD's actions on the keypad keys Damocles reads as Head Commands: the same ST
/// scancodes, keypad Enter `$72`, `*` `$66` and `+` `$4E` (ADR 0064).
const CARD_ACTIONS: Readonly<Record<HeadCommand, DionAction>> = {
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
  readonly passenger: () => boolean;
}): ControlProfileActions => ({
  drop: () => options.act('drop'),
  extendedControls: options.extendedControls,
  headCommand: command => options.act(CARD_ACTIONS[command]),
  keypadDigit: inert,
  launch: inert,
  leaveCraft: () => options.act('leave'),
  liftKey: () => false,
  // The shared profile reads only whether the player is aboard, and a passenger leaves by LEAVE
  // CRAFT; the session keeps its own passenger reference.
  occupancy: () =>
    options.passenger() ? { kind: 'aboard', slot: 0 } : { kind: 'onFoot' },
  reach: action => {
    if (action === 'board' || action === 'take') {
      options.act(action);
    }
  },
  recentreLook: inert,
  rotateStack: direction => options.act(direction),
  shutThrottle: inert,
  throttleNotchStep: inert,
  throttleNotchValue: inert,
  throttleReverseNotch: inert,
  throttleStep: inert
});
