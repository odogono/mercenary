import type { Vector3 } from '../orientation/index.ts';
import type { Doorway } from '../payload/documents.ts';

/// The Doorway Transition (ADR 0091): the Atari ST's palette wipe across the
/// 3D view as the player takes a Doorway, and the freeze of play it runs in.
///
/// Recovered from the ST release (`docs/research/targ-st-doorway-wipe.md`):
/// the view's 136 rows split at a row that moves 4 rows per VBL, 33 steps a
/// sweep. One side of the row shows a Room's flat fill and no lines; the other
/// shows a whole frame. Nothing is redrawn while it runs.
///
/// - Upward: the old Room's flat fill covers the view, the edge rises from row
///   132 to row 4 with the new Room's frame below it, then a 21-VBL hold.
/// - Downward: the new Room's flat fill covers the view for a 25-VBL hold, then
///   the edge falls from row 2 to row 130 with the old Room's frame below it.
///
/// Counted in VBLs at the capture's 60 a second.

export type DoorwayWipeDirection = 'down' | 'up';

export const DOORWAY_VBLS_PER_SECOND = 60;
const ROWS_PER_STEP = 4;
const STEPS = 33;

/// Each wipe's VBLs, in order: before the first step, the sweep, after the last.
const TIMELINE: Readonly<
  Record<
    DoorwayWipeDirection,
    { readonly firstRow: number; readonly lead: number; readonly tail: number }
  >
> = {
  // The 25-VBL hold, then the sweep; play is back at 59 (`$41C64`).
  down: { firstRow: 2, lead: 26, tail: 0 },
  // The flattened old palette, the sweep, the hold; play is back at 55
  // (`$41AEE`).
  up: { firstRow: 132, lead: 1, tail: 21 }
};

/// Which way a crossing wipes: the ST's bit 7 of `$62448`, set at
/// `$45058..$45078`.
///
/// The word is `x` for a Doorway in the `zy` plane (record bit 7) and `z`
/// otherwise; the bit is (word < $80) XOR bit 1 of `(heading + $280) >> 8`,
/// set meaning downward. The formula is exact, but what the ST's position and
/// heading words are inside a Room is not established: this reads the host's
/// Room units (256 to a cell) and a heading word of $400 to a turn. A real
/// crossing in Hatari is to confirm it; correct it here.
export const doorwayWipeDirection = (
  doorway: Pick<Doorway, 'plane'>,
  position: Vector3,
  heading: number
): DoorwayWipeDirection => {
  const word = Math.floor(doorway.plane === 'zy' ? position.x : position.z);
  const near = word >= 0 && word < 0x80 ? 1 : 0;
  const turns = heading / (Math.PI * 2);
  const headingWord = ((Math.round(turns * 0x4_00) % 0x4_00) + 0x4_00) % 0x4_00;
  const bit = (((headingWord + 0x2_80) >> 8) >> 1) & 1;
  return (near ^ bit) === 1 ? 'down' : 'up';
};

/// A Doorway Transition under way: which way it wipes and how long it has run.
export interface DoorwayTransitionState {
  readonly direction: DoorwayWipeDirection;
  readonly elapsedSeconds: number;
}

/// The whole freeze, in VBLs: 55 upward, 59 downward.
export const doorwayTransitionVbls = (
  direction: DoorwayWipeDirection
): number => {
  const { lead, tail } = TIMELINE[direction];
  return lead + STEPS + tail;
};

export const doorwayTransitionSeconds = (
  direction: DoorwayWipeDirection
): number => doorwayTransitionVbls(direction) / DOORWAY_VBLS_PER_SECOND;

/// What the view shows at one VBL of a wipe.
export interface DoorwayWipeFrame {
  /// Whose fill covers them: the departed Room's (upward) or the arrived one's.
  readonly cover: 'arrived' | 'departed';
  /// Rows from the top of the 136-row view covered by a flat fill, 0 to 136.
  readonly coverRows: number;
  /// Whose frame shows below the cover.
  readonly shows: 'arrived' | 'departed';
}

export const DOORWAY_VIEW_ROWS = 136;

/// The view `vbl` VBLs into a wipe, or undefined once it has finished.
export const doorwayWipeAt = (
  direction: DoorwayWipeDirection,
  vbl: number
): DoorwayWipeFrame | undefined => {
  const { firstRow, lead } = TIMELINE[direction];
  if (vbl < 0 || vbl >= doorwayTransitionVbls(direction)) {
    return undefined;
  }
  const step = vbl - lead;
  const coverRows =
    step < 0
      ? DOORWAY_VIEW_ROWS
      : step >= STEPS
        ? 0
        : firstRow + (direction === 'up' ? -1 : 1) * ROWS_PER_STEP * step;
  return direction === 'up'
    ? { cover: 'departed', coverRows, shows: 'arrived' }
    : { cover: 'arrived', coverRows, shows: 'departed' };
};

/// The VBL a float sum of seconds falls in, a hair short counting as reached.
const vblAt = (seconds: number): number =>
  Math.floor(seconds * DOORWAY_VBLS_PER_SECOND + 1e-9);

export const doorwayWipeOf = (
  state: DoorwayTransitionState
): DoorwayWipeFrame | undefined =>
  doorwayWipeAt(state.direction, vblAt(state.elapsedSeconds));

/// How long until the freeze ends.
export const doorwayTransitionSecondsLeft = (
  state: DoorwayTransitionState
): number =>
  Math.max(0, doorwayTransitionSeconds(state.direction) - state.elapsedSeconds);

/// The transition `seconds` further on, or undefined once the freeze is over.
export const advanceDoorwayTransition = (
  state: DoorwayTransitionState,
  seconds: number
): DoorwayTransitionState | undefined => {
  const elapsedSeconds = state.elapsedSeconds + seconds;
  return vblAt(elapsedSeconds) >= doorwayTransitionVbls(state.direction)
    ? undefined
    : { direction: state.direction, elapsedSeconds };
};
