import type { GammaComet } from '../flyover/documents.ts';
import type { ErisPresentationDocument } from './documents.ts';

/// The comet DAMOCLES's centre, a function of the impact clock alone (#440, #538).
///
/// `$051E88` runs once a drawn frame. It finds the two waypoints of `system.json`'s `comet`
/// table the clock falls between and interpolates them in 1/32-second ticks, with the ST's own
/// 16.16 arithmetic, so a clock read here puts the comet where the machine puts it
/// (docs/research/damocles-script-motion-time.md, "Comet motion").

/// The impact clock as the mover reads it: `$793C`, minus the seconds left, and the
/// thirty-seconds of the current second that `$051EA8` folds into `$7942`.
export interface ImpactTime {
  /// 0 to 31.
  readonly fraction: number;
  /// Minus the seconds left, so it counts up towards zero. It stops at zero.
  readonly seconds: number;
}

/// `$793C` counts up one second every fifty VBLs (#551), from minus the deadline. The epsilon
/// is the one the Session uses on its own frame accumulator: elapsed is a sum of fixed steps, so
/// an exact hour of them lands a hair under the hour.
export const impactTime = (
  elapsed: number,
  time: ErisPresentationDocument['time']
): ImpactTime => {
  const spent = (elapsed * time.vblHertz) / time.impactVblsPerSecond + 1e-9;
  const whole = Math.floor(spent);
  const remaining = time.impactDeadlineSeconds - whole;
  return remaining <= 0
    ? { fraction: 0, seconds: 0 }
    : { fraction: Math.floor((spent - whole) * 32), seconds: -remaining };
};

/// The Session seconds a fresh game has already spent when the scripted arrival hands over
/// control: the reset's deadline less the clock at the hand-over. The port starts there, as the
/// ST does, rather than at the deadline the title screen installs.
export const handoverElapsed = (
  time: ErisPresentationDocument['time']
): number =>
  ((time.impactDeadlineSeconds - time.handoverSeconds) *
    time.impactVblsPerSecond) /
  time.vblHertz;

/// `$051FDA..$05201A`: an axis's `|delta|` over the segment's length in ticks, as an unsigned
/// 16.16 rate, with the sign kept aside because the divide works on magnitudes.
const rate = (delta: number, length: number) => {
  const magnitude = Math.abs(delta);
  return {
    fraction: Math.floor(((magnitude % length) * 0x1_00_00) / length) & 0xff_ff,
    integer: Math.floor(magnitude / length) & 0xff_ff,
    negative: delta < 0
  };
};

/// `$051EC6..$051EF0`: the ticks into the segment times the rate, each product on the tick
/// count's low word.
const displacement = (ticks: number, axis: ReturnType<typeof rate>): number => {
  const value =
    ticks * axis.integer + Math.floor((ticks * axis.fraction) / 0x1_00_00);
  return axis.negative ? -value : value;
};

/// DAMOCLES's System X and Z at an impact clock, or null once the clock has reached the table's
/// zero record: there `$051F42` destroys DAMOCLES and ERIS, and the sky pass skips a destroyed
/// Body (`$05314C`). What the collision looks like is the endgame's (#580).
///
/// Two readings are the port's, both where the three first records coincide so either gives the
/// same point. Before the first record's time, `-15500`, the ST's cursor rests on record 0 with
/// whatever rates were last derived, which no capture has seen; the port holds record 0. The X
/// drift `$7A84` is left out: it is zero unless the body-destruction dispatcher arms `$7A7E`,
/// which the port does not model.
export const cometCentre = (
  comet: GammaComet,
  time: ImpactTime
): { readonly x: number; readonly z: number } | null => {
  const records = comet.waypoints.records;
  // `$051FAA` reads a zero time word as the end of the table.
  const end = records.findIndex(record => record.seconds === 0);
  const last = end === -1 ? records.length - 1 : end;
  if (time.seconds >= records[last]!.seconds) {
    return null;
  }
  if (time.seconds < records[0]!.seconds) {
    return { x: records[0]!.x, z: records[0]!.z };
  }
  // `$051EB2` advances the cursor while the clock has reached the next record's time.
  let index = 0;
  while (index + 1 < last && time.seconds >= records[index + 1]!.seconds) {
    index += 1;
  }
  const first = records[index]!;
  const second = records[index + 1]!;
  // `asl.w #5`: a segment's length in ticks is a word, so one longer than 2,047 seconds wraps.
  const length = ((second.seconds - first.seconds) << 5) & 0xff_ff;
  if (length === 0) {
    return { x: first.x, z: first.z };
  }
  // `$051EBA..$051EBE`: the seconds into the segment in ticks, plus the second's fraction.
  const ticks = ((time.seconds - first.seconds) * 32 + time.fraction) & 0xff_ff;
  return {
    x: first.x + displacement(ticks, rate(second.x - first.x, length)),
    z: first.z + displacement(ticks, rate(second.z - first.z, length))
  };
};
