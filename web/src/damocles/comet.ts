import type { GammaComet } from '../flyover/documents.ts';
import type { ErisPresentationDocument } from './documents.ts';

/// The comet DAMOCLES's centre, from the impact clock and the endgame drift (#440, #538, #624).
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
  /// Minus the seconds left, then seconds since impact. `$793C` keeps counting up.
  readonly seconds: number;
}

/// `$7C1C` as the reset leaves it in every capture: a second is `$19 << 6` counter units, 50 VBLs.
export const NEW_GAME_CLOCK_LEVEL = 6;
/// Page 4, MORE TIME: `$04D616` with level 8, a second of 200 VBLs.
export const MORE_TIME_CLOCK_LEVEL = 8;

/// The AUTHORS COMPUTER's supported clock levels, expressed as multipliers of normal time.
/// Its 0–10 levels give 64x down to 1/16x; the same level governs Body rotation and impact.
export const clockLevelAtRate = (multiplier: number): number => {
  const level = NEW_GAME_CLOCK_LEVEL - Math.log2(multiplier);
  if (!Number.isInteger(level) || level < 0 || level > 10) {
    throw new Error('rate must be a power of two from 0.0625 through 64');
  }
  return level;
};

/// The impact clock where the rate level last changed: `clock` is in level-6 seconds, the unit
/// `impactTime` reads, at Session seconds `elapsed`.
export interface ClockAnchor {
  readonly clock: number;
  readonly elapsed: number;
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
  return {
    fraction: Math.floor((spent - whole) * 32),
    seconds: whole - time.impactDeadlineSeconds
  };
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

interface Waypoint {
  readonly seconds: number;
  readonly x: number;
  readonly z: number;
}

/// `$051FBE..$051FA4`: the latch copies the terminator and the record after it to `$7CF4`, and
/// each time the clock reaches the second's time both times gain 500 and the pair steps on by its
/// own delta, `next' = 2 * next - start`. The segment keeps its length, so the comet carries
/// straight on at the last segment's speed.
const extended = (
  start: Waypoint,
  next: Waypoint,
  seconds: number
): readonly [Waypoint, Waypoint] => {
  let first = start;
  let second = next;
  while (seconds >= second.seconds) {
    const stepped = {
      seconds: second.seconds + EXTENSION_SECONDS,
      x: 2 * second.x - first.x,
      z: 2 * second.z - first.z
    };
    first = { ...second, seconds: first.seconds + EXTENSION_SECONDS };
    second = stepped;
  }
  return [first, second];
};

/// `$051F72`, `addi.w #$1F4`: what each extension adds to both scratch records' times.
const EXTENSION_SECONDS = 500;

/// `$051EBA..$051EF6`: a point `ticks` into the segment from `first` to `second`.
const interpolate = (
  first: Waypoint,
  second: Waypoint,
  time: ImpactTime
): { readonly x: number; readonly z: number } => {
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

/// DAMOCLES's System X and Z at an impact clock. At zero the caller must have passed the
/// waypoint latch to see the extended straight path; a destroyed Body is filtered by its reader.
///
/// Two readings are the port's, both where the three first records coincide so either gives the
/// same point. Before the first record's time, `-15500`, the ST's cursor rests on record 0 with
/// whatever rates were last derived, which no capture has seen; the port holds record 0.
///
/// The X `$7A84` is the armed anchor `$7A7E` minus clock `$793C`, added to X by `$051EFA`. Once
/// `$7A82` is set, `$051F00` stops recomputing it, so it keeps the value the last pass before the
/// latch left: the anchor less −1, the second before zero. The BOOK's page 5 run pins both
/// readings on every sample either side of zero (#625).
export const cometCentre = (
  comet: GammaComet,
  time: ImpactTime,
  endgame: { readonly drift: number | null; readonly passed: boolean } = {
    drift: null,
    passed: false
  }
): { readonly x: number; readonly z: number } | null => {
  const records = comet.waypoints.records;
  // `$051FAA` reads a zero time word as the end of the table.
  const end = records.findIndex(record => record.seconds === 0);
  const last = end === -1 ? records.length - 1 : end;
  const drift =
    endgame.drift === null
      ? 0
      : endgame.drift - (endgame.passed ? -1 : time.seconds);
  if (time.seconds >= records[last]!.seconds) {
    if (!endgame.passed) {
      return null;
    }
    const [first, second] = extended(
      records[last]!,
      records[last + 1]!,
      time.seconds
    );
    const point = interpolate(first, second, time);
    return { x: point.x + drift, z: point.z };
  }
  if (time.seconds < records[0]!.seconds) {
    return { x: records[0]!.x + drift, z: records[0]!.z };
  }
  // `$051EB2` advances the cursor while the clock has reached the next record's time.
  let index = 0;
  while (index + 1 < last && time.seconds >= records[index + 1]!.seconds) {
    index += 1;
  }
  const point = interpolate(records[index]!, records[index + 1]!, time);
  return { x: point.x + drift, z: point.z };
};
