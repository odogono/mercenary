import type { ArrivalCameraPose } from './arrivalCamera.ts';
import { compassDegrees, gridReference, type PanelViewModel } from './panel.ts';

/// What the Benson Panel shows while the Arrival is presenting.
///
/// The original's opening runs with the panel live below it, and the panel is the sequence's
/// clock: the title card sits in the message window, the readouts are rows of asterisks while
/// the ship is still in space, and the moment the view becomes Targ's surface they turn into
/// numbers and the altimeter starts counting down. That countdown is most of the descent's
/// tension, so it is reproduced rather than approximated.
///
/// Applied over the view model the Snapshot produced rather than folded into it, because none of
/// this is a fact about the session: the session is standing on the pad the whole time. Both
/// Panel Renditions get it for nothing, since both draw one view model (ADR 0027).

/// What the Arrival wants the panel to say.
export interface ArrivalPanelState {
  /// The line the Arrival is showing, or undefined once the opening script owns the window.
  readonly narration: string | undefined;
  readonly pose: ArrivalCameraPose;
  /// Whether the readouts are still asterisks.
  readonly unmeasured: boolean;
}

/// A field of asterisks the width of the value it stands in for.
const unmeasured = (width: number): string => '*'.repeat(width);

/// The location readout's own shape, asterisked either side of its separator.
const UNMEASURED_LOCATION = `${unmeasured(2)}-${unmeasured(2)}`;

/// The body-coordinate readout's own shape, three characters either side of its separator.
const UNMEASURED_BODY = `${unmeasured(3)}-${unmeasured(3)}`;

const digits = (value: number, width: number): string =>
  String(Math.abs(Math.trunc(value))).padStart(width, '0');

export const arrivalPanelViewModel = (
  base: PanelViewModel,
  state: ArrivalPanelState,
  cellSize: number
): PanelViewModel => ({
  ...base,
  // The gauges are live throughout, space included: they are the ship's own instruments, and
  // the original's drums move from the first frame.
  compassDegrees: compassDegrees(state.pose.heading),
  elevationDegrees: (state.pose.pitch * 180) / Math.PI,
  ...(state.narration === undefined ? {} : { message: state.narration }),
  ...(state.unmeasured
    ? {
        altitude: unmeasured(5),
        bodyCoordinates: UNMEASURED_BODY,
        locationLabel: UNMEASURED_LOCATION,
        speed: unmeasured(5)
      }
    : {
        // Height above the pad rather than the session's own altitude: the session is on the
        // ground, and the number the original counts down is the fall's.
        altitude: digits(state.pose.altitude, 5),
        locationLabel: gridReference(559_104, 559_104, cellSize),
        // The original's opening reads a standing speed all the way down. It is falling, not
        // flying, and nothing it shows is a decoded value.
        speed: '+0000'
      })
});

/// The Arrival's claim on the comms strip, for the composition that has no panel.
///
/// Marked as its own source rather than borrowed from the game: this text is the shell's, and
/// the strip records which of the three sources won.
export const arrivalStripText = (
  narration: string | undefined
): { readonly source: 'arrival'; readonly text: string } | undefined =>
  narration === undefined ? undefined : { source: 'arrival', text: narration };
