import type { Settings } from '../../src/settings/index.ts';

/// The interpreter's frame clock (ADR 0083 keeps it to the oracle): display
/// timing in frames, and the instruction budget the interpreter runs to.
export interface BensonTunables {
  framesPerSecond: number;
  framesPerTick: number;
  instructionBudget: number;
  messageHoldSeconds: number;
  timeScale: number;
}

/// The pace live play ran Benson Scripts at before the Talk Scripts: six
/// times the original's.
export const ORACLE_TIME_SCALE = 6;

export const defaultTunables = (framesPerTick = 50): BensonTunables => ({
  framesPerSecond: 50,
  framesPerTick,
  instructionBudget: 512,
  messageHoldSeconds: 3,
  timeScale: 1
});

/// The oracle's pacing from these settings, for one payload's tick length.
export const bensonTunables = (
  settings: Settings,
  framesPerTick: number
): BensonTunables => ({
  framesPerSecond: 50,
  framesPerTick,
  instructionBudget: settings.scripts.instructionBudget,
  messageHoldSeconds: settings.message.holdSeconds,
  timeScale: ORACLE_TIME_SCALE
});

/// The silent wait between bursts, in seconds, for a message interval in
/// frames: the burst's own 25 frames are not part of it.
export const waitSecondsFor = (
  messageInterval: number,
  tunables: BensonTunables
): number =>
  (Math.max(26, Math.trunc(messageInterval)) - 25) /
  (tunables.framesPerSecond * Math.max(1e-9, tunables.timeScale));
