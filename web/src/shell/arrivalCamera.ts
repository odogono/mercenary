import { REFERENCE_OPENING_POSITION, playerState } from '../gameCore/index.ts';
import type { SessionSnapshot } from '../session/index.ts';
import type { Script00Beat } from './arrivalScript.ts';

/// Where the Arrival's camera is, and what the panel reads while it is there.
///
/// The descent is a fall onto the pad at 8:8, straight down, ending exactly where the game
/// itself begins. It is not a Mover: nothing here is Session State, nothing here affects play,
/// and the session stays standing at its own opening Pose throughout while the shell draws the
/// world from somewhere else (ADR 0032).
///
/// **Altitude is the spine, and it is anchored to what Benson is saying rather than to a
/// stopwatch.** The original counts down through eighty-two thousand as the city grid grows;
/// each of its commentary lines lands at a particular height. So each beat carries a height, the
/// camera chases the next one continuously, and the beat's arrival sets it exactly. That way
/// touchdown coincides with the landing verdict however the Arrival's pacing is tuned — a
/// slower reveal makes a slower fall rather than a fall that finishes early and waits.

export interface ArrivalCameraPose {
  /// Height above the pad, which is what the panel's ALTITUDE reads.
  readonly altitude: number;
  readonly heading: number;
  readonly pitch: number;
  readonly roll: number;
}

export const ARRIVAL_TUNING = {
  /// Where the descent view opens, and the number the altimeter starts counting down from.
  entryAltitude: 82_000,
  /// How steeply the camera looks down during the plunge.
  ///
  /// The original's 8-bit stills look very nearly straight down. This does not, and the reason is
  /// the projection rather than the taste: the ground fill is a rectangle hung off the horizon,
  /// and past about sixty degrees the horizon is so far above the frame that the rectangle no
  /// longer reaches it — the fall would be a plunge through an empty blue screen. Kept inside the
  /// range the decoded projection was built for, the city grid is where it should be: ahead and
  /// below, growing.
  plungePitch: -0.62,
  /// Below this height the camera levels out and the tumble dies: the last of the fall is an
  /// approach rather than a plunge.
  levelAltitude: 3250,
  /// The tumble, in radians and turns per second. The original's grid rotates as the ship falls.
  rollAmplitude: 0.55,
  rollTurnsPerSecond: 0.11,
  /// Heights the commentary lands at, from the decode notes and the original's own altimeter.
  altitudes: {
    crashImminent: 13_000,
    manualControl: 3250,
    returningTo: 6500,
    verdict: 0
  },
  /// How quickly the camera closes on the height the next beat will set. One time constant per
  /// segment: the final one is shorter because there is much less height left to lose.
  chaseSeconds: {
    approach: 2.5,
    final: 1.2
  }
} as const;

/// The height the camera is heading for, given the last beat it heard.
const targetFor = (beat: Script00Beat | undefined): number => {
  switch (beat) {
    case undefined:
      return ARRIVAL_TUNING.altitudes.crashImminent;
    case 'crashImminent':
      return ARRIVAL_TUNING.altitudes.returningTo;
    case 'returningTo':
      return ARRIVAL_TUNING.altitudes.manualControl;
    default:
      return ARRIVAL_TUNING.altitudes.verdict;
  }
};

/// The height a beat sets exactly when it begins, or undefined for one that sets none.
export const altitudeAt = (beat: Script00Beat): number | undefined => {
  switch (beat) {
    case 'crashImminent':
      return ARRIVAL_TUNING.altitudes.crashImminent;
    case 'returningTo':
      return ARRIVAL_TUNING.altitudes.returningTo;
    case 'manualControl':
      return ARRIVAL_TUNING.altitudes.manualControl;
    case 'verdict':
      return ARRIVAL_TUNING.altitudes.verdict;
    default:
      return undefined;
  }
};

/// One step of the fall: the height after `seconds` of chasing the beat's target.
///
/// Exponential, so it closes on the target without passing it — the fall is monotonic by
/// construction rather than by a clamp, and a beat that takes longer than expected slows the
/// last of its segment instead of stopping dead or overshooting into the next one.
export const chasedAltitude = (
  altitude: number,
  beat: Script00Beat | undefined,
  seconds: number
): number => {
  const target = targetFor(beat);
  const tau =
    beat === 'manualControl'
      ? ARRIVAL_TUNING.chaseSeconds.final
      : ARRIVAL_TUNING.chaseSeconds.approach;
  const closed = 1 - Math.exp(-Math.max(0, seconds) / tau);
  return Math.max(target, altitude + (target - altitude) * closed);
};

/// Zero rather than negative zero.
///
/// Multiplying a negative angle by a zero factor leaves `-0`, which reads identically and
/// compares unequally. The landed pose is compared against the game's own opening Pose, so it
/// should be the number that Pose has.
const settled = (angle: number): number => (angle === 0 ? 0 : angle);

/// The pose while the ship is still under way, before the fall begins.
///
/// Level, because it is cruising rather than falling: the original's ELEVATION drum reads zero
/// all the way through the space segment, and starts moving when the view becomes Targ's.
export const arrivalCruisePose = (altitude: number): ArrivalCameraPose => ({
  altitude,
  heading: Math.PI,
  pitch: 0,
  roll: 0
});

/// The camera's orientation at one height, `elapsed` seconds into the descent.
export const arrivalPose = (
  altitude: number,
  elapsed: number
): ArrivalCameraPose => {
  const entry = ARRIVAL_TUNING.entryAltitude;
  const remaining = Math.min(1, Math.max(0, altitude / entry));
  // Level with the ground, not with the horizon: the pitch holds its plunge until the last few
  // thousand feet and then eases out, which is what the original's stills show.
  const steep = Math.min(1, altitude / ARRIVAL_TUNING.levelAltitude);
  // The tumble grows as the fall does and dies on the same approach the pitch levels out on, so
  // the view that meets the ground is square with it.
  const tumble = ARRIVAL_TUNING.rollAmplitude * (1 - remaining) * steep;
  return {
    altitude,
    heading: Math.PI,
    pitch: settled(ARRIVAL_TUNING.plungePitch * steep),
    roll: settled(
      tumble *
        Math.sin(elapsed * ARRIVAL_TUNING.rollTurnsPerSecond * Math.PI * 2)
    )
  };
};

/// The same Session Snapshot, seen from the Arrival's camera instead of the player's own.
///
/// Only the Pose is replaced. Everything the world renderer decides from — which objects are
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
      y: REFERENCE_OPENING_POSITION.y + pose.altitude,
      z: REFERENCE_OPENING_POSITION.z
    },
    roll: pose.roll
  })
});
