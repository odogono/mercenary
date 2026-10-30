import type { PanelViewModel } from './panel.ts';

/// The panel's compass and pitch readouts, taken from a Title's Pose.
///
/// Every panel adapter reads its attitude here rather than doing the sums itself, so they all
/// keep the same contract: the compass reads one turn, 0 up to 360, and rises as the heading
/// does; the pitch reads half a turn either side of level, nose up positive, so a craft looped
/// past the vertical reads its way back rather than past 180. Each Pose's pitch is already
/// radians nose up: Damocles's session turns its pitch word into that with `pitchFromWord`
/// (`pitchLevel − word`) before the panel sees it.
///
/// What differs between Titles is where the compass's nought is, which is the convention:
/// - `bearing`: the heading is already a bearing clockwise from north, as Damocles's and the
///   Flyover's are.
/// - `targ`: the Browser Shell keeps its displayed bearings while the simulation uses raw
///   Reference Build yaw. The original opening yaw is a half turn and is displayed as nought,
///   so the compass is offset half a turn. This full-turn numbering is presentation, not the C64's coloured half-turn tape.
///
/// Mercenary III's panel is not here: it draws its strips from the raw heading and pitch
/// words, so it has no degrees to read.
export type AttitudeConvention = 'bearing' | 'targ';

const COMPASS_OFFSET_DEGREES: Record<AttitudeConvention, number> = {
  bearing: 0,
  targ: 180
};

export type PanelAttitude = Pick<
  PanelViewModel,
  'compassDegrees' | 'elevationDegrees'
>;

const degrees = (radians: number): number => (radians * 180) / Math.PI;

const wrapTurn = (value: number): number => ((value % 360) + 360) % 360;

export const panelAttitude = (
  pose: { readonly heading: number; readonly pitch: number },
  convention: AttitudeConvention
): PanelAttitude => ({
  compassDegrees: wrapTurn(
    degrees(pose.heading) + COMPASS_OFFSET_DEGREES[convention]
  ),
  elevationDegrees: wrapTurn(degrees(pose.pitch) + 180) - 180
});
