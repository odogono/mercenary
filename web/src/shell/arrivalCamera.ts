import { REFERENCE_OPENING_POSITION, playerState } from '../gameCore/index.ts';
import { REFERENCE_VERTICAL_FIELD_OF_VIEW } from '../projection/index.ts';
import type { SessionSnapshot } from '../session/index.ts';
import type { Script00Beat } from './arrivalScript.ts';

/// Where the Arrival's camera is, and what the panel reads while it is there.
///
/// The fall is one straight drop onto the pad at 8:8 from far out in Targ's space, ending exactly
/// where the game itself begins. It is not a Mover: nothing here is Session State, nothing here
/// affects play, and the session stays standing at its own opening Pose throughout while the
/// shell draws the world from somewhere else (ADR 0032, ADR 0086).
///
/// **Everything is measured from the Atari ST recording** (`mercenary.targ.mp4`, read frame by
/// frame for #943), and expressed as one curve: the height `s` seconds before impact. The
/// altimeter there falls as `dh/dt = -(h/τ + c)` — exponential far out, as a fixed fraction per
/// frame, and steady at the end — which is the shape of the decoded endgame ship descent
/// (`altitude -= (altitude >> 7) + 1`) too. While the height is beyond the altimeter's five digits
/// the ship is level, Targ is a disc growing ahead of it, and the panel reads asterisks. When the
/// disc fills the screen the view turns to look straight down (ELEVATION 270) at a screen of
/// ground, and the city's road plan appears as a dot in the middle, turning slowly as it grows.
///
/// Recording time and the Arrival's time are not the same clock. The port's opening script takes
/// longer between its lines than the original's, so the curve is followed in profile time and
/// the beats pin it: "CRASH IMMINENT," is always the same height, and the landing verdict is
/// always the impact.

export interface ArrivalCameraPose {
  /// Height above the pad in the altimeter's units, which is what the panel's ALTITUDE reads.
  readonly altitude: number;
  readonly heading: number;
  readonly pitch: number;
  readonly roll: number;
}

export const ARRIVAL_TUNING = {
  /// The fall's time constant, and the steady rate it finishes at. Fitted to the recording's
  /// altimeter from 92,127 to zero, which it covers in 7.0 seconds as the original does.
  fall: { floorRate: 900, timeConstantSeconds: 1.7 },
  /// Moments on the recording's own clock, in seconds before impact.
  profile: {
    /// "CRASH IMMINENT," starts, and the road plan is a dot in the middle of the screen.
    crashImminent: 11.5,
    /// Targ first appears, a dot in the middle of the star field.
    planetAppears: 24,
    /// The disc has filled the screen and the view turns to look straight down.
    surface: 15.25
  },
  /// How much of the view's height Targ's disc covers on the frame the view turns.
  planetAtSurface: 1.4,
  /// The port's own opening-script timing at the default pacing: seconds from the handover to
  /// "CRASH IMMINENT,", and from there to each later beat. Measured, and pinned by a test, so the
  /// curve runs through the beats without a jump; other pacings jump at the beat instead.
  script: {
    lead: 4,
    manualControl: 12.55,
    returningTo: 8.7,
    verdict: 17.4
  },
  /// How fast the road plan turns on screen while the view looks down: about 55 degrees a second,
  /// clockwise, with the compass steady, so it is roll rather than heading. Negative because a
  /// positive roll looking down turns the ground anticlockwise.
  spinRadiansPerSecond: -0.96,
  /// World units of camera height per unit the altimeter reads. Not the panel's own 256: fitted
  /// by laying the port's frames beside the recording's at the same altimeter readings, where 24
  /// has the road plan appear, fill the screen and give way to the pad on the original's beats.
  cameraHeightPerAltimeterUnit: 24,
  /// The altimeter's five digits. Above this the original's readouts are asterisks.
  measurableAltitude: 100_000
} as const;

/// Straight down, short of the vertical by a hair so the horizon stays a finite distance away.
const LOOKING_DOWN = -(Math.PI / 2 - 0.002);

/// The height `seconds` before impact.
export const fallAltitude = (seconds: number): number => {
  const { floorRate, timeConstantSeconds } = ARRIVAL_TUNING.fall;
  return (
    floorRate *
    timeConstantSeconds *
    Math.expm1(Math.max(0, seconds) / timeConstantSeconds)
  );
};

/// Where on the curve a beat of the opening script puts the fall, in profile seconds.
///
/// The port's script tail is mapped onto the recording's at one rate, so every beat after
/// "CRASH IMMINENT," lands where that rate carries it, and the verdict is the impact.
export const profileSecondsAt = (beat: Script00Beat): number | undefined => {
  const { crashImminent } = ARRIVAL_TUNING.profile;
  const { script } = ARRIVAL_TUNING;
  switch (beat) {
    case 'crashImminent':
      return crashImminent;
    case 'returningTo':
    case 'manualControl':
    case 'verdict':
      return crashImminent * (1 - script[beat] / script.verdict);
    default:
      return undefined;
  }
};

/// How fast profile time runs against the Arrival's own, after the handover.
///
/// Before "CRASH IMMINENT," the screen is all ground and nothing shows the rate, so the gap is
/// simply covered in the port's lead time. After it, the recording's tail is stretched over the
/// port's.
export const profileRate = (beat: Script00Beat | undefined): number => {
  const { crashImminent, surface } = ARRIVAL_TUNING.profile;
  const { script } = ARRIVAL_TUNING;
  return beat === undefined
    ? (surface - crashImminent) / script.lead
    : crashImminent / script.verdict;
};

/// The lowest profile time the fall may reach before the next beat arrives: a beat that is late
/// holds the fall rather than letting it run ahead of the commentary.
export const profileFloor = (beat: Script00Beat | undefined): number => {
  switch (beat) {
    case undefined:
      return ARRIVAL_TUNING.profile.crashImminent;
    case 'crashImminent':
      return profileSecondsAt('returningTo')!;
    case 'returningTo':
      return profileSecondsAt('manualControl')!;
    default:
      return 0;
  }
};

/// Targ's radius in altitude units, fixed by the join rather than by a scale: the disc has to
/// fill `planetAtSurface` of the view's height at the moment the view turns down. Space and the
/// surface keep separate units (ADR 0014, ADR 0086), and this is the one place they meet.
const planetRadius = (() => {
  const half = Math.atan(
    ARRIVAL_TUNING.planetAtSurface *
      Math.tan(REFERENCE_VERTICAL_FIELD_OF_VIEW / 2)
  );
  const height = fallAltitude(ARRIVAL_TUNING.profile.surface);
  return (height * Math.sin(half)) / (1 - Math.sin(half));
})();

/// How much of the view's height Targ's disc covers, seen from `altitude` above its surface.
///
/// A sphere's angular size rather than a scale on the screen, so the disc creeps at first and
/// then rushes, as it does in the recording.
export const planetCoverage = (altitude: number): number => {
  const half = Math.asin(planetRadius / (planetRadius + Math.max(0, altitude)));
  return Math.tan(half) / Math.tan(REFERENCE_VERTICAL_FIELD_OF_VIEW / 2);
};

/// Zero rather than negative zero.
const settled = (angle: number): number => (angle === 0 ? 0 : angle);

/// The pose while the ship is still in space: level, nose toward Targ. The original's
/// ELEVATION drum reads zero until the view turns.
export const arrivalCruisePose = (altitude: number): ArrivalCameraPose => ({
  altitude,
  heading: Math.PI,
  pitch: 0,
  roll: 0
});

/// The pose looking down, `spinning` seconds after the view turned.
export const arrivalPose = (
  altitude: number,
  spinning: number
): ArrivalCameraPose => {
  const turn = 2 * Math.PI;
  const roll =
    (((ARRIVAL_TUNING.spinRadiansPerSecond * Math.max(0, spinning)) % turn) +
      turn) %
    turn;
  // Wrapped into a half turn either side, which is how a Pose carries roll.
  return {
    altitude,
    heading: Math.PI,
    pitch: LOOKING_DOWN,
    roll: settled(roll > Math.PI ? roll - turn : roll)
  };
};

/// The craft the player arrives in: the payload stands it on the pad at 8:8, where the crash
/// leaves it. During the fall the player is still inside it, so the descent does not draw it;
/// it appears at impact, with the session's own view (#943).
export const ARRIVAL_CRAFT_SLOT = 10;

/// The same Session Snapshot, seen from the Arrival's camera instead of the player's own.
///
/// Only the Pose is replaced, and the arriving craft is taken out of the world. Everything the world renderer decides from — which objects are
/// where, whether this is a Room, how much time has passed, and so the Enhanced sky with it —
/// is the session's own, because the descent is the real world seen from somewhere else rather
/// than a scene of its own invention.
export const descentViewSnapshot = (
  snapshot: SessionSnapshot,
  pose: ArrivalCameraPose
): SessionSnapshot => ({
  ...snapshot,
  player: playerState({
    heading: pose.heading,
    pitch: pose.pitch,
    position: {
      x: REFERENCE_OPENING_POSITION.x,
      y:
        REFERENCE_OPENING_POSITION.y +
        pose.altitude * ARRIVAL_TUNING.cameraHeightPerAltimeterUnit,
      z: REFERENCE_OPENING_POSITION.z
    },
    roll: pose.roll
  }),
  residence: new Map(snapshot.residence).set(ARRIVAL_CRAFT_SLOT, {
    kind: 'gone'
  })
});
