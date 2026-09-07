import type { UndergroundLift } from '../payload/documents.ts';

export type LiftDirection = 'down' | 'up';
export type LiftScene = 'room' | 'surface';

export interface LiftJourneyState {
  readonly direction: LiftDirection;
  readonly elapsedFrames: number;
  readonly entranceRoom: number;
  readonly fractionalFrameRemainder: number;
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

export const startLiftJourney = (
  direction: LiftDirection,
  entranceRoom: number,
  lift: UndergroundLift,
  restingAltitude = lift.descending.floor
): LiftJourneyState => {
  const start = direction === 'up' ? lift.ascending : lift.descending;
  return {
    direction,
    elapsedFrames: 0,
    entranceRoom,
    fractionalFrameRemainder: 0,
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

const tick = (
  current: LiftJourneyState,
  lift: UndergroundLift
): LiftAdvance => {
  const timing = lift.timing.find(item => item.room === current.entranceRoom)?.[
    current.direction
  ];
  if (timing === undefined) {
    throw new Error(
      `Lift Journey has no captured timing for Room ${current.entranceRoom}`
    );
  }
  const upperHalf = current.position >= 0x42 ? 1 : 0;
  const rate = lift.motionRates[current.stage * 2 + upperHalf];
  if (rate === undefined) {
    throw new Error(
      `Lift Journey has no motion rate for stage ${current.stage}`
    );
  }
  let stage = current.stage;
  let position = current.position;
  if (current.direction === 'up') {
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
  const elapsedFrames = current.elapsedFrames + 1;
  const scene: LiftScene =
    elapsedFrames >= timing.sceneAt
      ? current.direction === 'up'
        ? 'surface'
        : 'room'
      : current.direction === 'up'
        ? 'room'
        : 'surface';
  const next = { ...current, elapsedFrames, position, scene, stage };
  const altitude = liftCameraAltitude(next, lift);
  const completed = elapsedFrames >= timing.stopAt;
  return {
    completed,
    ...(completed
      ? {
          finalAltitude:
            current.direction === 'down' ? lift.descending.floor : altitude
        }
      : { journey: next }),
    sceneChanged: scene !== current.scene,
    surfaceSeconds: 0
  };
};

export const advanceLiftJourney = (
  current: LiftJourneyState,
  seconds: number,
  lift: UndergroundLift
): LiftAdvance => {
  let remainingSeconds = seconds;
  let frameRemainder = current.fractionalFrameRemainder;
  let journey = current;
  let sceneChanged = false;
  let surfaceSeconds = 0;
  while (remainingSeconds > 1e-12) {
    const untilTick = (1 - frameRemainder) / lift.framesPerSecond;
    const slice = Math.min(remainingSeconds, untilTick);
    if (journey.scene === 'surface') {
      surfaceSeconds += slice;
    }
    frameRemainder += slice * lift.framesPerSecond;
    remainingSeconds -= slice;
    if (frameRemainder < 1 - 1e-9) {
      break;
    }
    frameRemainder = 0;
    const advanced = tick(journey, lift);
    sceneChanged ||= advanced.sceneChanged;
    if (advanced.completed) {
      if (journey.direction === 'up') {
        surfaceSeconds += remainingSeconds;
      }
      return { ...advanced, sceneChanged, surfaceSeconds };
    }
    journey = advanced.journey!;
  }
  return {
    completed: false,
    journey: {
      ...journey,
      fractionalFrameRemainder: Math.max(0, frameRemainder)
    },
    sceneChanged,
    surfaceSeconds
  };
};
