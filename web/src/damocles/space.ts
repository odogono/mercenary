import type { CraftBody, CraftSlot } from '../catalogue/data.ts';
import {
  STICK_DOWN,
  STICK_LEFT,
  STICK_RIGHT,
  STICK_UP,
  craftAdd,
  craftDivide,
  craftLongFloat,
  craftMultiply,
  craftNegate,
  craftSqrt,
  craftSquare,
  type CraftArithmetic,
  type CraftProgram,
  type CraftState
} from './craft.ts';

/// Space, the craft Mover's third Occupancy (#558, ADR 0051): the space entry `$055868`, the
/// space pass `$05872E` over slot 0's Craft Parameter Block, and the frame's range and
/// nearest-Body scan `$052DB0` with the arrival hold `$7B0A` and the arrival test `$052FDA`
/// (docs/research/damocles-space-flight.md). It runs in the same log-domain floats as the
/// surface pass, one pass every `time.ticksPerPass` ticks, and is pure.

const u32 = (value: number): number => value >>> 0;
const sx16 = (value: number): number => ((value & 0xff_ff) << 16) >> 16;
const sx32 = (value: number): number => value | 0;
const high = (value: number): number => value >>> 16;
const long = (hi: number, lo: number): number =>
  u32((hi & 0xff_ff) * 0x1_00_00 + (lo & 0xff_ff));

/// `v >> count` on a signed long, and the last bit shifted out, as `asr.l` leaves them.
const asr32 = (
  value: number,
  count: number
): { readonly carry: boolean; readonly value: number } => {
  const shift = count & 63;
  const signed = sx32(value);
  if (shift === 0) {
    return { carry: false, value: u32(signed) };
  }
  const carry =
    shift <= 32
      ? ((Math.floor(signed / 2 ** (shift - 1)) % 2) + 2) % 2 === 1
      : signed < 0;
  return {
    carry,
    value: u32(shift >= 32 ? (signed < 0 ? -1 : 0) : signed >> shift)
  };
};

/// `$058B5A` and its repeats: a float as a signed word, rounding on the last bit shifted out.
/// The displacement form saturates an exponent above 14; the yaw and pitch forms do not.
export const spaceWord = (f: number, saturate: boolean): number => {
  const d7 = u32(f);
  if (sx32(d7) < 0) {
    if (((high(d7) + 1) & 0xff_ff) === 0) {
      return sx16(((d7 & 0x80_00) !== 0 ? 0xff_ff : 0) | 1);
    }
    return 0;
  }
  const shift = sx16(14 - high(d7));
  if (saturate && shift < 0) {
    return (d7 & 0x80_00) !== 0 ? -0x80_00 : 0x7f_ff;
  }
  const shifted = asr32(u32(sx16(d7) * 4), shift & 0xff_ff);
  let out = shifted.value;
  if (shifted.carry) {
    out = long(high(out), out + 1);
  }
  return sx16(out);
};

/// `$0589D6` and its repeats: a float as a 32-bit integer, truncated, saturating.
export const spaceFixed = (f: number): number => {
  const d4 = u32(f);
  if (sx32(d4) < 0) {
    return (d4 & 0x80_00) !== 0 ? -1 : 0;
  }
  const shift = sx16(0x1d - high(d4));
  if (shift >= 0) {
    return sx32(asr32(u32(((d4 * 2) & 0xff_ff) * 0x1_00_00), shift).value);
  }
  if (shift + 1 === 0) {
    const placed = sx16(d4) * 4 * 0x1_00_00;
    if (placed >= -0x80_00_00_00 && placed < 0x80_00_00_00) {
      return sx32(u32(placed) & 0xff_fc_00_00);
    }
  }
  return (d4 & 0x80_00) === 0 ? 0x7f_ff_ff_ff : -0x80_00_00_00;
};

/// The words the space path keeps beside the craft's own (docs/research/damocles-space-flight.md,
/// "What this means for the port"). Floats are raw longs, positions signed longs.
export interface SpaceState {
  /// `$7876`: 32γ, the word the impact clock's step reads.
  readonly dilation: number;
  /// `$7B0A`: passes left before an arrival may be raised.
  readonly hold: number;
  /// `$7924`: the nearest Body's table offset, 4 × the Body.
  readonly nearest: number;
  /// `$7974`: the pitch rate, a float.
  readonly pitchRate: number;
  /// `$791C`: the nearest range, a float, as the last frame's scan left it.
  readonly range: number;
  /// `$799A`, `$799E` and `$79A2`: the craft's position in the System.
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/// The space words a flight leaves behind for the next: only the space path writes them, so
/// they carry over the surface from one flight to the next, and the first world boots with
/// its own.
export type SpaceMemory = Pick<SpaceState, 'nearest' | 'pitchRate' | 'range'>;

/// `$055868`, the space entry, after the frame's pass: the swing cleared, the arrival hold
/// started, the throttle's and speed's exponent words set, the pitch level. The space position
/// is what the last landing left, `($5F40(a0), $40, $5FC0(a0))` for the Body the craft was on.
/// The frame returns without drawing, so the next frame's sines are this attitude's.
export const enterSpace = (
  program: CraftProgram,
  state: CraftState,
  memory: SpaceMemory,
  body: CraftBody
): { readonly craft: CraftState; readonly space: SpaceState } => {
  const k = program.constants;
  const pitch = k.spacePitch;
  return {
    craft: {
      ...state,
      pitch,
      speed: long(k.spaceSpeedExponent, state.speed),
      swing: false,
      throttle: long(k.spaceThrottleExponent, state.throttle),
      trig: { pitch, yaw: state.yaw }
    },
    space: {
      ...memory,
      dilation: 0x20,
      hold: k.spaceHold,
      x: body.x,
      y: k.spaceY,
      z: body.z
    }
  };
};

const sine = (arithmetic: CraftArithmetic, angle: number): number =>
  arithmetic.sine[angle & 0x3_ff]!;

/// The rate damped unless `rate − $FF000000` is negative, as `cmpi.l` then `bmi` test it.
const damped = (
  arithmetic: CraftArithmetic,
  rate: number,
  damping: number
): number =>
  (u32(rate - 0xff_00_00_00) & 0x80_00_00_00) === 0
    ? craftMultiply(arithmetic, rate, damping)
    : rate;

/// One pass of `$05872E` in free flight: slot 0's block whatever the craft, over the frame's
/// attitude sines and the last frame's range. The pitch is not integrated: it is level plus
/// four times the pitch rate. Roll and contact are nought.
export const spacePass = (
  program: CraftProgram,
  slot: CraftSlot,
  craft: CraftState,
  space: SpaceState,
  stick: number
): { readonly craft: CraftState; readonly space: SpaceState } => {
  const { arithmetic: t, constants: k } = program;
  const p = slot.parameters;
  if (p === null) {
    throw new Error('the space pass reads a slot with pass parameters');
  }
  const mul = (a: number, b: number) => craftMultiply(t, a, b);
  // The turn rate `$7970`: right tested first, as on a Body.
  let rate = damped(t, craft.turnRate, p.turnDamping);
  if ((stick & STICK_RIGHT) !== 0) {
    rate = craftAdd(p.turnAcceleration, rate);
  } else if ((stick & STICK_LEFT) !== 0) {
    rate = craftAdd(craftNegate(p.turnAcceleration), rate);
  }
  // The pitch rate `$7974`: up adds the acceleration, down subtracts it.
  let pitchRate = damped(t, space.pitchRate, p.turnDamping);
  if ((stick & STICK_UP) !== 0) {
    pitchRate = craftAdd(p.turnAcceleration, pitchRate);
  } else if ((stick & STICK_DOWN) !== 0) {
    pitchRate = craftAdd(craftNegate(p.turnAcceleration), pitchRate);
  }
  // Speed: (V + throttle × gain) × lag × range / (range + 65,536).
  const thrust = mul(craft.throttle, p.thrustGain);
  let speed = mul(craftAdd(craft.speed, thrust), p.speedLag);
  const near = craftDivide(
    t,
    space.range,
    craftAdd(k.spaceRangeScale, space.range)
  );
  speed = mul(speed, near);
  // 32γ into `$7876`, and one of three forms of c·v/√(v² + 1024) into `$4DFEC` (#551).
  const s = craftAdd(k.spaceDilationBias, craftSquare(t, speed));
  const dilation = spaceWord(craftSqrt(t, s), true);
  let panel: number;
  if (dilation > k.panelFastBound) {
    panel = u32(
      k.panelLight - spaceFixed(craftDivide(t, k.panelHalfLightScaled, s))
    );
  } else if (dilation > k.panelSlowBound) {
    const inner = craftAdd(
      craftNegate(craftDivide(t, k.panelLightSquaredScaled, s)),
      k.panelLightSquared
    );
    panel = spaceFixed(craftSqrt(t, inner));
  } else {
    const magnitude = (speed & 0x80_00) === 0 ? speed : craftNegate(speed);
    panel = spaceFixed(mul(magnitude, k.panelSlowScale));
  }
  // A saturating word per axis along the frame's attitude.
  const cosPitch = sine(t, craft.trig.pitch + 0x1_00);
  const sinPitch = sine(t, craft.trig.pitch);
  const cosYaw = sine(t, craft.trig.yaw + 0x1_00);
  const sinYaw = sine(t, craft.trig.yaw);
  const dz = spaceWord(mul(mul(cosPitch, cosYaw), speed), true);
  const dx = spaceWord(mul(mul(cosPitch, sinYaw), speed), true);
  const dy = spaceWord(mul(sinPitch, speed), true);
  const yaw = (craft.yaw + spaceWord(rate, false)) & 0xff_ff;
  // `+$E` is slot 0's pitch scale exponent, 2: four times the rate.
  const pitch =
    (spaceWord(u32(pitchRate + (p.rollExponent & 0xff_ff) * 0x1_00_00), false) +
      k.spaceLevelPitch) &
    0xff_ff;
  const x = sx32(space.x + dx);
  const y = sx32(space.y + dy);
  const z = sx32(space.z + dz);
  return {
    // The pose `$7AB2`/`$7AB6`/`$7ABA` is the space position.
    craft: {
      ...craft,
      contact: 0,
      panelSpeed: sx32(panel),
      pitch,
      roll: 0,
      speed,
      supported: 0,
      turnRate: rate,
      x,
      y,
      yaw,
      z
    },
    space: { ...space, dilation: dilation & 0xff_ff, pitchRate, x, y, z }
  };
};

/// `$055F60` then `$045710`: the view rotation at `$42C20`, nine floats, from the camera words
/// the pose copy writes (roll, pitch and yaw).
export const viewMatrix = (
  arithmetic: CraftArithmetic,
  roll: number,
  pitch: number,
  yaw: number
): readonly number[] => {
  const mul = (a: number, b: number) => craftMultiply(arithmetic, a, b);
  const sr = sine(arithmetic, roll);
  const cr = sine(arithmetic, roll + 0x1_00);
  const sp = sine(arithmetic, pitch);
  const cp = sine(arithmetic, pitch + 0x1_00);
  const sy = sine(arithmetic, yaw);
  const cy = sine(arithmetic, yaw + 0x1_00);
  return [
    mul(cp, sy),
    sp,
    mul(cp, cy),
    craftAdd(mul(mul(sr, sp), sy), mul(cr, cy)),
    craftNegate(mul(sr, cp)),
    craftAdd(craftNegate(mul(cr, sy)), mul(mul(sr, sp), cy)),
    craftAdd(mul(sr, cy), craftNegate(mul(mul(cr, sp), sy))),
    mul(cr, cp),
    craftNegate(craftAdd(mul(sr, sy), mul(mul(cr, sp), cy)))
  ];
};

/// `$052DE8`–`$052E8C`: a Body's offset from the craft rotated by the view (`$05668A`), and its
/// length. The rows are summed and squared in the order `$840`, `$5C0`, `$340`, which is rows
/// 0, 2 and 1.
export const bodyRange = (
  arithmetic: CraftArithmetic,
  matrix: readonly number[],
  body: { readonly x: number; readonly y: number; readonly z: number },
  craft: { readonly x: number; readonly y: number; readonly z: number }
): number => {
  const mul = (a: number, b: number) => craftMultiply(arithmetic, a, b);
  const d = [
    craftLongFloat(body.x - craft.x),
    craftLongFloat(body.y - craft.y),
    craftLongFloat(body.z - craft.z)
  ];
  const row = (at: number) =>
    craftAdd(
      craftAdd(mul(d[0]!, matrix[at]!), mul(d[1]!, matrix[at + 1]!)),
      mul(d[2]!, matrix[at + 2]!)
    );
  const [a, b, c] = [row(0), row(6), row(3)].map(value =>
    craftSquare(arithmetic, value)
  );
  return craftSqrt(arithmetic, craftAdd(craftAdd(a!, b!), c!));
};

/// What a frame in space left: the words, and the Body an arrival is raised for, if any.
export interface SpaceFrame {
  /// The Body offset `$052FDA` raised `$7A28` for, which the landing `$059268` takes the same
  /// frame. Null while the hold runs or the range is not close enough.
  readonly arrival: number | null;
  readonly craft: CraftState;
  readonly space: SpaceState;
}

/// One frame in space after the dispatch (`$0598A6`–`$059920`): the pass, the pose copy's
/// camera words, the range to every Body in the scene and the nearest, and then either the
/// hold counted down or, once it is out, the arrival test. `bodies` is the Body table by
/// offset ÷ 4, as the frame reads it after the comet mover has run.
export const spaceFrame = (
  program: CraftProgram,
  slot: CraftSlot,
  craft: CraftState,
  space: SpaceState,
  stick: number,
  bodies: readonly CraftBody[]
): SpaceFrame => {
  const { arithmetic: t, constants: k } = program;
  const moved = spacePass(program, slot, craft, space, stick);
  const matrix = viewMatrix(
    t,
    moved.craft.roll,
    moved.craft.pitch,
    moved.craft.yaw
  );
  let range = u32(k.nearestStart);
  let { nearest } = space;
  for (let index = bodies.length - 1; index >= 0; index -= 1) {
    const body = bodies[index]!;
    // A negative Y takes a Body out of the scene.
    if (body.y < 0) {
      continue;
    }
    const length = bodyRange(t, matrix, body, moved.space);
    if ((u32(length - range) & 0x80_00_00_00) !== 0) {
      range = length;
      nearest = index * 4;
    }
  }
  let { hold } = space;
  let arrival: number | null = null;
  if (hold !== 0) {
    hold -= 1;
  } else if (nearest !== 0) {
    // `$052FDA`: the range's exponent word against the Body's extent's; DIALIS, offset 0,
    // is never arrived at.
    const gap = sx16(high(range) - high(bodies[nearest / 4]!.extent));
    if (sx16(gap - k.arrivalGap) < 0) {
      arrival = nearest;
    }
  }
  return {
    arrival,
    // The next frame's trig routine reads the attitude this one left.
    craft: {
      ...moved.craft,
      trig: { pitch: moved.craft.pitch, yaw: moved.craft.yaw }
    },
    space: { ...moved.space, hold, nearest, range }
  };
};

/// `$04DEEE`, the altitude window in space: the range float × 4, fixed without rounding, and
/// read as 16.16 by the shared printer. So the window reads range ÷ 16,384.
export const spaceAltitude = (program: CraftProgram, range: number): number =>
  spaceFixed(u32(range + program.constants.spaceAltitudeScale));
