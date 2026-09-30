/// The gamepad Control Profile's edge (ADR 0059): what the Gamepad API reports, reduced to the
/// controls a pad holds down. The profile turns those into Movement Intent and Semantic Actions
/// exactly as it does keys, so this module knows nothing of either.

/// A button of the Gamepad API's standard mapping, by the name the Controls Page prints.
export type PadButton =
  | 'A'
  | 'B'
  | 'BACK'
  | 'D-PAD DOWN'
  | 'D-PAD LEFT'
  | 'D-PAD RIGHT'
  | 'D-PAD UP'
  | 'L3'
  | 'LB'
  | 'LT'
  | 'R3'
  | 'RB'
  | 'RT'
  | 'START'
  | 'X'
  | 'Y';

/// The standard mapping's button indices, in index order.
const STANDARD_BUTTONS: readonly PadButton[] = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'BACK',
  'START',
  'L3',
  'R3',
  'D-PAD UP',
  'D-PAD DOWN',
  'D-PAD LEFT',
  'D-PAD RIGHT'
];

/// A stick pushed one way along one axis. Up is negative, as the Gamepad API reports it.
export type PadStick =
  | 'LEFT DOWN'
  | 'LEFT LEFT'
  | 'LEFT RIGHT'
  | 'LEFT UP'
  | 'RIGHT DOWN'
  | 'RIGHT LEFT'
  | 'RIGHT RIGHT'
  | 'RIGHT UP';

export type PadControl = PadButton | PadStick;

/// The standard mapping's axes as the directions each gives: left X, left Y, right X, right Y.
const STANDARD_AXES: readonly (readonly [PadStick, PadStick])[] = [
  ['LEFT LEFT', 'LEFT RIGHT'],
  ['LEFT UP', 'LEFT DOWN'],
  ['RIGHT LEFT', 'RIGHT RIGHT'],
  ['RIGHT UP', 'RIGHT DOWN']
];

/// How far an axis, or an analogue trigger, must be pushed to count.
export const PAD_THRESHOLD = 0.5;

/// The part of a browser `Gamepad` the profile reads.
export interface PadReading {
  readonly axes: readonly number[];
  readonly buttons: readonly {
    readonly pressed: boolean;
    readonly value: number;
  }[];
  readonly mapping: string;
}

/// An axis quantised as the original joystick reads it: -1, 0 or +1 (ADR 0059 point 2).
export const quantiseAxis = (value: number): -1 | 0 | 1 =>
  value > PAD_THRESHOLD ? 1 : value < -PAD_THRESHOLD ? -1 : 0;

/// Every control held on any of `pads`, merged. A pad without the standard mapping is skipped:
/// its indices could mean anything, and a stray axis would walk the player.
export const heldPadControls = (
  pads: readonly (PadReading | null)[]
): ReadonlySet<PadControl> => {
  const held = new Set<PadControl>();
  for (const pad of pads) {
    if (pad?.mapping !== 'standard') {
      continue;
    }
    STANDARD_BUTTONS.forEach((name, index) => {
      const button = pad.buttons[index];
      if (
        button !== undefined &&
        (button.pressed || button.value > PAD_THRESHOLD)
      ) {
        held.add(name);
      }
    });
    STANDARD_AXES.forEach(([negative, positive], index) => {
      const direction = quantiseAxis(pad.axes[index] ?? 0);
      if (direction !== 0) {
        held.add(direction < 0 ? negative : positive);
      }
    });
  }
  return held;
};

/// The connected pads, or none where the browser has no Gamepad API.
export const connectedPads = (
  navigatorLike: Partial<Pick<Navigator, 'getGamepads'>>
): readonly (PadReading | null)[] => navigatorLike.getGamepads?.() ?? [];
