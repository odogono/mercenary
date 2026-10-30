import type { UndergroundLift } from '../payload/documents.ts';

export type LiftDirection = 'down' | 'up';
export type LiftScene = 'room' | 'surface';

/// A Lift Journey at a moment of it (ADR 0083): seconds since it began, and
/// the stage, position and scene its track gives for them.
export interface LiftJourneyState {
  readonly direction: LiftDirection;
  readonly elapsedSeconds: number;
  readonly entranceRoom: number;
  readonly position: number;
  readonly restingAltitude: number;
  readonly scene: LiftScene;
  readonly stage: number;
}

export interface LiftAdvance {
  readonly completed: boolean;
  readonly finalAltitude?: number;
  readonly journey?: LiftJourneyState;
  readonly sceneChanged: boolean;
  readonly surfaceSeconds: number;
}

export const liftPhaseIndex = (journey: LiftJourneyState): number =>
  journey.stage * 2 + (journey.position >= 0x42 ? 1 : 0);

export const startLiftJourney = (
  direction: LiftDirection,
  entranceRoom: number,
  lift: UndergroundLift,
  restingAltitude = lift.descending.floor
): LiftJourneyState => {
  const start = direction === 'up' ? lift.ascending : lift.descending;
  return {
    direction,
    elapsedSeconds: 0,
    entranceRoom,
    position: start.position,
    restingAltitude,
    scene: direction === 'up' ? 'room' : 'surface',
    stage: start.stage
  };
};

/// Camera height calculated by `$A24A-$A27A`. The native multiply returns the
/// high byte of position × $DD; the controller doubles that byte, adds $80,
/// joins it to the stage and divides the resulting word by two.
export const liftCameraAltitude = (
  journey: LiftJourneyState,
  lift: UndergroundLift
): number => {
  const productHigh = Math.floor((journey.position * 0xdd) / 0x1_00);
  const doubled = productHigh * 2 + 0x80;
  const carry = doubled > 0xff ? 1 : 0;
  let altitude =
    ((((journey.stage + carry) & 0xff) << 8) | (doubled & 0xff)) >> 1;
  // $A269-$A279 subtracts seven middle-byte bands when the camera
  // reaches band six. Preserve the signed result for world projection.
  if (altitude >= lift.altitudeWrap * 0x1_00) {
    altitude -= lift.altitudeWrapSubtract * 0x1_00;
  }
  altitude +=
    journey.direction === 'up'
      ? lift.cameraOffsets.ascending
      : -lift.cameraOffsets.descending;
  return altitude;
};

/// One journey's whole course: where the cab is after each of the original's
/// frames, worked out once from the payload's per-frame rates, and the times
/// its scene changes and it stops.
interface LiftTrack {
  readonly sceneSeconds: number;
  readonly steps: readonly {
    readonly position: number;
    readonly stage: number;
  }[];
  readonly stepsPerSecond: number;
  readonly stopSeconds: number;
}

const tracks = new WeakMap<UndergroundLift, Map<string, LiftTrack>>();

const trackOf = (
  lift: UndergroundLift,
  entranceRoom: number,
  direction: LiftDirection
): LiftTrack => {
  let byJourney = tracks.get(lift);
  if (byJourney === undefined) {
    byJourney = new Map();
    tracks.set(lift, byJourney);
  }
  const key = `${entranceRoom}:${direction}`;
  const known = byJourney.get(key);
  if (known !== undefined) {
    return known;
  }
  const timing = lift.timing.find(item => item.room === entranceRoom)?.[
    direction
  ];
  if (timing === undefined) {
    throw new Error(
      `Lift Journey has no captured timing for Room ${entranceRoom}`
    );
  }
  const start = direction === 'up' ? lift.ascending : lift.descending;
  const steps = [{ position: start.position, stage: start.stage }];
  for (let frame = 1; frame <= timing.stopAt; frame += 1) {
    const before = steps[frame - 1]!;
    const rate =
      lift.motionRates[before.stage * 2 + (before.position >= 0x42 ? 1 : 0)];
    if (rate === undefined) {
      throw new Error(
        `Lift Journey has no motion rate for stage ${before.stage}`
      );
    }
    let { position, stage } = before;
    if (direction === 'up') {
      position += rate;
      if (position >= lift.positionWrap) {
        position = 0;
        stage += 1;
      }
    } else {
      position -= rate;
      if (position < 0) {
        position = lift.positionWrap;
        stage -= 1;
      }
    }
    steps.push({ position, stage });
  }
  const track = {
    sceneSeconds: timing.sceneAt / lift.framesPerSecond,
    steps,
    stepsPerSecond: lift.framesPerSecond,
    stopSeconds: timing.stopAt / lift.framesPerSecond
  };
  byJourney.set(key, track);
  return track;
};

/// The step a time falls in; a float sum a hair short of a boundary counts as
/// having reached it.
const stepAt = (track: LiftTrack, seconds: number): number =>
  Math.floor(seconds * track.stepsPerSecond + 1e-9);

const sceneAt = (
  direction: LiftDirection,
  track: LiftTrack,
  seconds: number
): LiftScene =>
  stepAt(track, seconds) >= stepAt(track, track.sceneSeconds) ===
  (direction === 'up')
    ? 'surface'
    : 'room';

/// How long until the journey's next event: its scene changing, or its stop.
export const liftSecondsToNextEvent = (
  journey: LiftJourneyState,
  lift: UndergroundLift
): number => {
  const track = trackOf(lift, journey.entranceRoom, journey.direction);
  const change = stepAt(track, track.sceneSeconds) / track.stepsPerSecond;
  const stop = stepAt(track, track.stopSeconds) / track.stepsPerSecond;
  const next =
    stepAt(track, journey.elapsedSeconds) < stepAt(track, change)
      ? change
      : stop;
  return next - journey.elapsedSeconds;
};

/// The journey `seconds` after it began, or undefined once it has stopped.
export const liftJourneyAt = (
  start: Pick<
    LiftJourneyState,
    'direction' | 'entranceRoom' | 'restingAltitude'
  >,
  seconds: number,
  lift: UndergroundLift
): LiftJourneyState | undefined => {
  const track = trackOf(lift, start.entranceRoom, start.direction);
  const step = stepAt(track, seconds);
  if (step >= stepAt(track, track.stopSeconds)) {
    return undefined;
  }
  const { position, stage } = track.steps[step]!;
  return {
    direction: start.direction,
    elapsedSeconds: seconds,
    entranceRoom: start.entranceRoom,
    position,
    restingAltitude: start.restingAltitude,
    scene: sceneAt(start.direction, track, seconds),
    stage
  };
};

/// The journey `seconds` further on. Time spent with the surface showing is
/// reported, so the surface's own systems run for it; an ascent that stops
/// within the step has the rest of it on the surface too.
export const advanceLiftJourney = (
  current: LiftJourneyState,
  seconds: number,
  lift: UndergroundLift
): LiftAdvance => {
  const track = trackOf(lift, current.entranceRoom, current.direction);
  const until = current.elapsedSeconds + seconds;
  const stop = stepAt(track, track.stopSeconds) / track.stepsPerSecond;
  const end = Math.min(until, stop);
  const change = stepAt(track, track.sceneSeconds) / track.stepsPerSecond;
  const [surfaceFrom, surfaceTo] =
    current.direction === 'up' ? [change, end] : [0, Math.min(change, end)];
  let surfaceSeconds = Math.max(
    0,
    Math.min(end, surfaceTo) - Math.max(current.elapsedSeconds, surfaceFrom)
  );
  const next = liftJourneyAt(current, until, lift);
  if (next === undefined) {
    if (current.direction === 'up') {
      surfaceSeconds += until - stop;
    }
    const final = {
      ...current,
      ...track.steps.at(-1)!,
      scene: sceneAt(current.direction, track, stop)
    };
    return {
      completed: true,
      finalAltitude:
        current.direction === 'down'
          ? lift.descending.floor
          : liftCameraAltitude(final, lift),
      sceneChanged: final.scene !== current.scene,
      surfaceSeconds
    };
  }
  return {
    completed: false,
    journey: next,
    sceneChanged: next.scene !== current.scene,
    surfaceSeconds
  };
};
