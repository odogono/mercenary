import { craftLog } from './tables.ts';
import type {
  CraftConstant,
  CraftParameters,
  CraftSlot,
  DetailBoxes
} from './types.ts';

/// The craft Mover (ADR 0051): the pass `$057F46`–`$0583E8`, the wheeled tail `$057DE6`, the
/// landing handler `$057CF2` and the aboard frame path `$05970E`–`$05976A`, run in the program's
/// own log-domain floats (docs/research/damocles-craft-control.md,
/// docs/research/damocles-collision-response.md).
///
/// A float is a long: a signed binary exponent word over a signed mantissa word in units of
/// `$1000`. Every long here is held as an unsigned 32-bit number, and every word the program
/// compares signed is read signed where it is compared. Nothing in this module is Targ's.

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

/// The tables the pass multiplies through, and the sine table it reads its attitude from.
export interface CraftArithmetic {
  /// `$063002`: the byte table the landing's `atan2` `$04EA48` indexes by a ratio word.
  readonly arctan: Uint8Array;
  /// `$60000`: 4,096 mantissa words, indexed by a log fraction.
  readonly exp: Uint16Array;
  /// `$04EAF2`: the `atan2` octant words, bit 15 set where the table angle is negated.
  readonly octants: readonly number[];
  /// `$64000`: 1,024 floats, entry i = sin(2π(i + ½)/1024).
  readonly sine: Uint32Array;
}

/// A mantissa replaced by its log fraction: the word at `$64000` plus the signed mantissa.
const log = (f: number): number => long(high(f), craftLog(f & 0xff_ff));

/// A log fraction turned back into a mantissa: `ror.w #4`, `andi.w #$1FFE`, then `$60000`.
const exp = (arithmetic: CraftArithmetic, f: number): number => {
  const word = f & 0xff_ff;
  const index = ((word >>> 4) | (word << 12)) & 0x1f_fe;
  return long(high(f), arithmetic.exp[index / 2]!);
};

/// A product: the two logs added, exponent into exponent with the fraction's carry.
export const craftMultiply = (
  arithmetic: CraftArithmetic,
  a: number,
  b: number
): number => exp(arithmetic, u32(log(a) + log(b)));

/// A quotient: the two logs subtracted as longs.
export const craftDivide = (
  arithmetic: CraftArithmetic,
  a: number,
  b: number
): number => exp(arithmetic, u32(log(a) - log(b)));

/// A square: the log doubled as a long.
export const craftSquare = (arithmetic: CraftArithmetic, f: number): number =>
  exp(arithmetic, u32(log(f) * 2));

/// A square root: `asr.l #1` of the log, then `lsr.w #4` and `andi.w #$FFE` into `$60000`.
export const craftSqrt = (arithmetic: CraftArithmetic, f: number): number => {
  const half = asr32(log(f), 1).value;
  const index = ((half & 0xff_ff) >>> 4) & 0x0f_fe;
  return long(high(half), arithmetic.exp[index / 2]!);
};

/// `$04BD34`: `d2 := d1 + d2`, aligning the smaller operand by shifting its mantissa.
export const craftAdd = (first: number, second: number): number => {
  let d1 = u32(first);
  let d2 = u32(second);
  if (sx32(d1) >= sx32(d2)) {
    [d1, d2] = [d2, d1];
  }
  const m1 = d1 & 0xff_ff;
  const m2 = d2 & 0xff_ff;
  const diff = sx16(high(d2) - high(d1));
  if (diff > 11) {
    return d2;
  }
  const shifted = (sx16(m1) >> Math.min(diff & 63, 31)) & 0xff_ff;
  const total = (m2 + shifted) & 0xff_ff;
  d2 = long(high(d2), total);
  const differ = ((m1 ^ m2) & 0x80_00) !== 0;
  const doubleLow = (value: number): number =>
    u32(long(high(value), (value << 1) & 0xff_ff) - 0x1_00_00);
  const halveLow = (value: number): number =>
    u32(long(high(value), sx16(value) >> 1) + 0x1_00_00);
  const even = (value: number): number => long(high(value), value & 0xff_fe);
  if ((total & 0x80_00) === 0) {
    if (total === 0) {
      return u32(d2 + 0xff_f0_10_00);
    }
    if (differ) {
      while ((d2 & 0x10_00) === 0) {
        d2 = doubleLow(d2);
      }
      return even(d2);
    }
    if ((d2 & 0x20_00) !== 0) {
      d2 = halveLow(d2);
    }
    return even(d2);
  }
  if (differ) {
    if ((d2 & 0x10_00) === 0) {
      return even(d2);
    }
    while ((d2 & 0x10_00) !== 0) {
      d2 = doubleLow(d2);
    }
    return d2;
  }
  if ((d2 & 0x20_00) === 0) {
    d2 = halveLow(d2);
  }
  return even(d2);
};

/// `$05807A`–`$0580E0` and its repeats: a float as a 32-bit integer, mantissa × 2^(exp − 12),
/// rounding on the last bit shifted out.
export const craftFixed = (f: number): number => {
  const d7 = u32(f);
  if (sx32(d7) < 0) {
    // A negative exponent: nought, or ±1 at exactly −1.
    if (((high(d7) + 1) & 0xff_ff) === 0) {
      return sx16(d7) < 0 ? -1 : 1;
    }
    return 0;
  }
  const shift = sx16(29 - high(d7));
  if (shift < 0) {
    if (shift + 1 === 0) {
      const m = sx16(d7) * 4;
      if (m * 0x1_00_00 >= -0x80_00_00_00 && m * 0x1_00_00 < 0x80_00_00_00) {
        return sx32(u32(m * 0x1_00_00) & 0xff_fc_00_00);
      }
    }
    return sx16(d7) >= 0 ? 0x7f_ff_ff_ff : -0x80_00_00_00;
  }
  const placed = u32(((d7 * 2) & 0xff_ff) * 0x1_00_00);
  const shifted = asr32(placed, shift);
  return sx32(shifted.value + (shifted.carry ? 1 : 0));
};

/// `$05837A`–`$0583A6` and `$0583B8`–`$0583E4`: a float as a word, the same rounding.
export const craftWord = (f: number): number => {
  const d7 = u32(f);
  if (sx32(d7) < 0) {
    if (((high(d7) + 1) & 0xff_ff) === 0) {
      return sx16(d7) < 0 ? -1 : 1;
    }
    return 0;
  }
  const shift = (14 - high(d7)) & 0xff_ff;
  const shifted = asr32(u32(sx16(d7) * 4), shift);
  let d4 = shifted.value;
  if (shifted.carry) {
    d4 = long(high(d4), d4 + 1);
  }
  return sx16(d4);
};

/// `$04BDD8`: a signed long as a float. The exponent is the integer's highest set bit, the
/// mantissa its next eleven bits, truncated, with the sign on the mantissa. Nought is
/// `$FFF01000`.
export const craftLongFloat = (value: number): number => {
  const signed = sx32(value);
  const magnitude = Math.abs(signed);
  if (magnitude === 0) {
    return 0xff_f0_10_00;
  }
  const e = 31 - Math.clz32(magnitude);
  const mantissa = Math.floor(magnitude * 2 ** (12 - e)) & 0xff_fe;
  return long(e, signed < 0 ? -mantissa : mantissa);
};

/// `$04BDD4`: `$04BDD8` on a 28-bit signed integer.
export const craftFloat = (value: number): number =>
  craftLongFloat(sx32(u32(value) * 16) >> 4);

/// A float with its mantissa negated, as `neg.w` on the low word leaves it.
export const craftNegate = (f: number): number => long(high(f), -(f & 0xff_ff));
const negated = craftNegate;

/// `$4DFEC`, the panel's copy of a speed: the integer of its magnitude.
export const craftPanelSpeed = (speed: number): number =>
  craftFixed(sx16(speed) < 0 ? negated(speed) : speed);

/// Every constant the Mover compares against, as the Catalogue publishes it.
export type CraftConstants = Readonly<Record<CraftConstant, number>>;

/// What the Mover needs from the Data Payload: the tables, the constants and the slot table.
export interface CraftProgram {
  readonly arithmetic: CraftArithmetic;
  readonly constants: CraftConstants;
  readonly slots: readonly CraftSlot[];
  /// The table at `$0557D6`, by ST scancode.
  readonly throttleKeys: readonly {
    readonly entry: number;
    readonly scancode: number;
  }[];
}

/// The craft words the session holds aboard (ADR 0051 decision 4), in the program's units.
///
/// X and Z are the body position as the port keeps it, not masked to the surface's 28 bits:
/// the port wraps positions where it measures them. Pitch, yaw and roll are the attitude words
/// `$7AC0`, `$7AC2` and `$7ABE`; yaw is not masked, as the pass does not mask it.
export interface CraftState {
  /// `$7ACA`: `$3F` in ground contact, else 0.
  readonly contact: number;
  /// `$4DFEC`: the panel's integer copy of the speed's magnitude.
  readonly panelSpeed: number;
  readonly pitch: number;
  readonly roll: number;
  /// `$797A`, a float.
  readonly speed: number;
  /// `$7BC8`: `$3F` while standing on a support.
  readonly supported: number;
  /// `$7B02`: the support's tag word while standing on one.
  readonly supportLevel: number;
  /// `$7B0C`: set by the launch (`$055822`) and cleared by the space entry, the stop preset or
  /// a throttle key that writes. While it is set the pass swings the pitch (`$057F18`).
  readonly swing: boolean;
  /// `$7BAC`, a float. Its mantissa's sign is the gear.
  readonly throttle: number;
  /// The pitch and yaw the frame's attitude sines `$7AD6`–`$7AE5` were taken at. The trig
  /// routine runs once a frame before the pass, so the first pass after boarding still reads
  /// the on-foot attitude, and a refused move's second pass reads the frame's first.
  readonly trig: { readonly pitch: number; readonly yaw: number };
  /// `$7970`, a float.
  readonly turnRate: number;
  readonly x: number;
  readonly y: number;
  readonly yaw: number;
  readonly z: number;
}

/// The joystick byte `$79C2`: bit 0 up, 1 down, 2 left, 3 right.
export const STICK_UP = 1;
export const STICK_DOWN = 2;
export const STICK_LEFT = 4;
export const STICK_RIGHT = 8;

/// One Building detail box as the cell bind leaves it at `$CB88`: words, X and Z unsigned.
export interface BoundBox {
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
  readonly z: readonly [number, number];
}

/// The bound structure's two lists: `supports` (list A, with the tag) and `walls` (list B).
export interface BoundBoxes {
  readonly supports: readonly (BoundBox & { readonly tag: number })[];
  readonly walls: readonly BoundBox[];
}

export const NO_BOXES: BoundBoxes = { supports: [], walls: [] };

/// One axis of a bound box: each word times the scale, keeping the low word, plus the origin.
const bindAxis = (
  pair: readonly [number, number],
  by: number,
  at: number
): readonly [number, number] => {
  const [first, second] = pair.map(
    value => (value * by + (Math.floor(at) & 0xff_ff)) & 0xff_ff
  ) as [number, number];
  return by < 0 ? [second, first] : [first, second];
};

/// `$053AF0`: a Building detail's boxes bound at a structure's scale about its intra-cell
/// origin. Y is multiplied by `$539D0`, which is always 1; each X and Z word by the scale,
/// keeping the low word, plus the origin, the pair swapped under a negative scale.
export const bindBoxes = (
  boxes: DetailBoxes,
  scale: readonly [number, number],
  origin: { readonly x: number; readonly z: number }
): BoundBoxes => {
  const bind = (box: DetailBoxes['walls'][number]): BoundBox => ({
    x: bindAxis(box.x, scale[0], origin.x),
    y: [box.y[0] & 0xff_ff, box.y[1] & 0xff_ff],
    z: bindAxis(box.z, scale[1], origin.z)
  });
  return {
    supports: boxes.supports.map(box => ({ ...bind(box), tag: box.tag })),
    walls: boxes.walls.map(bind)
  };
};

/// `$0590AE`: whether the point is inside any box of either list. Nothing with a non-zero high
/// word of Y is tested. Y compares signed, X and Z unsigned, and every bound is inclusive.
export const insideBox = (
  boxes: BoundBoxes,
  point: { readonly x: number; readonly y: number; readonly z: number }
): boolean => {
  if (high(u32(point.y)) !== 0) {
    return false;
  }
  const x = point.x & 0xff_ff;
  const y = sx16(point.y);
  const z = point.z & 0xff_ff;
  return [...boxes.supports, ...boxes.walls].some(
    box =>
      y >= sx16(box.y[0]) &&
      y <= sx16(box.y[1]) &&
      x >= box.x[0] &&
      x <= box.x[1] &&
      z >= box.z[0] &&
      z <= box.z[1]
  );
};

/// `$0583EA`: the first support whose top stands no more than `$80` below the eye less 63,
/// and whose X/Z bounds hold the point. A Y high word other than nought refuses at once.
export const supportUnder = (
  boxes: BoundBoxes,
  x: number,
  y: number,
  z: number,
  eye: number
): (BoundBox & { readonly tag: number }) | undefined => {
  if (high(u32(y)) !== 0) {
    return undefined;
  }
  const ye = y & 0xff_ff;
  const xe = x & 0xff_ff;
  const ze = z & 0xff_ff;
  return boxes.supports.find(box => {
    const d = sx16(box.y[1] + eye - ye);
    return (
      d >= 0 &&
      d <= 0x80 &&
      xe >= box.x[0] &&
      xe <= box.x[1] &&
      ze >= box.z[0] &&
      ze <= box.z[1]
    );
  });
};

/// What one pass left: the craft words, and whether it went to the landing handler.
export interface CraftPass {
  /// The pass branched to `$057CF2` (a hard touchdown), or the wheeled tail did.
  readonly landing: boolean;
  readonly state: CraftState;
}

const sine = (arithmetic: CraftArithmetic, angle: number): number =>
  arithmetic.sine[angle & 0x3_ff]!;

/// One pass of the common craft pass over `parameters`, with the wheeled tail for a wheeled
/// slot. The stick is the byte `$79C2`. The attitude sines are those of `state.trig`, and the
/// support search reads `boxes`.
export const craftPass = (
  program: CraftProgram,
  slot: CraftSlot,
  state: CraftState,
  stick: number,
  boxes: BoundBoxes
): CraftPass => {
  const { arithmetic: t, constants: k } = program;
  const p = slot.parameters as CraftParameters;
  const mul = (a: number, b: number) => craftMultiply(t, a, b);
  // Turn rate: damped above the zero, then accelerated by the stick, right tested first.
  let rate = state.turnRate;
  if (sx32(rate) >= sx32(0xff_00_00_00)) {
    rate = mul(rate, p.turnDamping);
  }
  if ((stick & STICK_RIGHT) !== 0) {
    rate = craftAdd(p.turnAcceleration, rate);
  } else if ((stick & STICK_LEFT) !== 0) {
    rate = craftAdd(negated(p.turnAcceleration), rate);
  }
  // Pitch: the up bit alone raises the word (nose down), the down bit alone lowers it.
  let pitch = state.pitch;
  if ((stick & STICK_DOWN) === 0) {
    pitch = (pitch + p.pitchStep) & k.pitchMask;
  }
  if ((stick & STICK_UP) === 0) {
    pitch = (pitch - p.pitchStep) & k.pitchMask;
  }
  // Target speed: the throttle doubled, times the altitude factor above 65,536, quartered in
  // contact, times the thrust gain. `$79BA` is the float of −Y the pose copy wrote.
  let target = u32(state.throttle + k.throttleDouble);
  const altitude = u32(negated(craftFloat(-state.y)) - k.altitudeScale);
  if (sx32(altitude) >= 0) {
    target = mul(target, Math.min(sx32(altitude), k.altitudeCap));
  }
  if (state.contact !== 0) {
    target = u32(target - k.contactQuarter);
  }
  target = mul(target, p.thrustGain);
  const speed = mul(craftAdd(state.speed, target), p.speedLag);
  const panelSpeed = craftPanelSpeed(speed);
  // Displacement along the attitude the frame's sines were taken at.
  const cosPitch = sine(t, state.trig.pitch + 0x1_00);
  const sinPitch = sine(t, state.trig.pitch);
  const cosYaw = sine(t, state.trig.yaw + 0x1_00);
  const sinYaw = sine(t, state.trig.yaw);
  const x = state.x + craftFixed(mul(mul(cosPitch, sinYaw), speed));
  const z = state.z + craftFixed(mul(mul(cosPitch, cosYaw), speed));
  let vertical = mul(sinPitch, speed);
  if ((vertical & 0x80_00) === 0) {
    // The ceiling: the climb halves for every 65,536 of Y above `+1A` × 65,536.
    const over = sx16(p.ceiling - (u32(state.y) >>> 16));
    if (over < 0) {
      vertical = u32(vertical + (over & 0xff_ff) * 0x1_00_00);
    }
  }
  let dy = craftFixed(vertical);
  if (p.pitchStep === 0) {
    dy = -dy;
  }
  let y = sx32(state.y + dy);
  const moved: CraftState = {
    ...state,
    panelSpeed,
    pitch,
    speed,
    turnRate: rate,
    x,
    y,
    z
  };
  if (y < k.groundY && (dy < k.landingStep || pitch >>> 2 >= k.landingPitch)) {
    return { landing: true, state: moved };
  }
  let { contact, roll, supported, supportLevel } = state;
  let grounded: boolean;
  if (y >= k.groundY) {
    const support = supportUnder(boxes, x, y, z, k.supportEye);
    if (support === undefined) {
      contact = 0;
      supported = 0;
      supportLevel = 0;
      grounded = false;
    } else {
      supported = k.supported;
      y = long(high(u32(y)), support.y[1] + k.supportEye);
      supportLevel = support.tag;
      grounded = true;
    }
  } else {
    y = k.groundEye;
    grounded = true;
  }
  if (grounded) {
    contact = k.contact;
    roll = 0;
    if (pitch > k.levelPitch || sx16(speed) < 0 || sx32(speed) <= k.takeOff) {
      pitch = k.levelPitch;
    }
  }
  // Yaw from the turn rate, scaled by cos⁴ of the frame's pitch near the vertical.
  let turn = rate;
  if (
    (pitch & k.pitchMask) >= k.verticalLow &&
    (pitch & k.pitchMask) < k.verticalHigh
  ) {
    let c = exp(t, u32(log(cosPitch) * 2));
    c = exp(t, u32(log(c) * 2));
    turn = exp(t, u32(log(turn) + log(c)));
  }
  const yaw = (state.yaw + craftWord(turn)) & 0xff_ff;
  if (contact === 0) {
    roll =
      craftWord(u32(rate + (p.rollExponent & 0xff_ff) * 0x1_00_00)) & 0xff_ff;
  }
  const passed: CraftState = {
    ...moved,
    contact,
    pitch,
    roll,
    supported,
    supportLevel,
    y: sx32(y),
    yaw
  };
  // `$057DEA`–`$057DF8`: a wheeled craft that lost contact from a pre-pass Y below 64 lands.
  const landing =
    slot.class === 'wheeled' &&
    contact === 0 &&
    sx32(state.y) - k.wheeledDrop < 0;
  return { landing, state: passed };
};

/// `$054744`, the stop preset: throttle and speed to the zero, the trim toggle, the panel's
/// copy and the launch swing cleared.
export const stopPreset = (
  state: CraftState,
  constants: CraftConstants
): CraftState => ({
  ...state,
  panelSpeed: 0,
  speed: u32(constants.zero),
  swing: false,
  throttle: u32(constants.zero)
});

/// How a frame aboard ended.
export type CraftOutcome =
  /// The move stood.
  | 'moved'
  /// `$0590AE` refused the move and the craft bounced one pass back.
  | 'refused'
  /// The landing handler set the craft down and stopped it. The session decides the rest:
  /// `$057D2E` masks the island answer with `$794A` and disembarks unless it says sea.
  | 'landed'
  /// The pre-pass Y reached `$1F0` × 65,536, so the frame loop enters space at `$055868`
  /// (`enterSpace`) once the pass has run.
  | 'space';

export interface CraftFrame {
  readonly outcome: CraftOutcome;
  readonly state: CraftState;
}

/// `$057CF2`: a hard touchdown. The first two box tests return at once when the craft's point
/// is inside a box, leaving the frame's own test to refuse the move. Otherwise the craft is set
/// down at eye height, in contact and level, and stopped.
const landingHandler = (
  program: CraftProgram,
  state: CraftState,
  boxes: BoundBoxes
): CraftFrame => {
  const k = program.constants;
  if (insideBox(boxes, state)) {
    return { outcome: 'moved', state };
  }
  const lowered = { ...state, supportLevel: 0, y: k.groundEye };
  if (insideBox(boxes, lowered)) {
    return { outcome: 'moved', state: lowered };
  }
  return {
    outcome: 'landed',
    state: stopPreset(
      { ...lowered, contact: k.contact, pitch: k.levelPitch },
      k
    )
  };
};

/// The numeric pass, launch swing and hard touchdown, before Title-owned service/collision work.
/// A frame can retain its initial swing controls for a collision retry through `controlState`.
export const craftMotionPass = (
  program: CraftProgram,
  slot: CraftSlot,
  state: CraftState,
  stick: number,
  boxes: BoundBoxes,
  controlState: CraftState = state
): CraftFrame => {
  const k = program.constants;
  // `$057F46`: while `$7B0C` is set the pass goes to `$057F18` instead. It swings the pitch
  // towards `$280` and ends, until `(pitch + $80) & $3FF` passes `$300`; after that the pass
  // runs on with the stick read as nought.
  const swung = (controlState.pitch + k.swingBias) & k.swingMask;
  const swinging = controlState.swing && swung <= k.swingHigh;
  const read = controlState.swing ? 0 : stick;
  const run = (from: CraftState): CraftFrame => {
    if (swinging) {
      const step = swung > k.swingLow ? k.swingStep : -k.swingStep;
      return {
        outcome: 'moved',
        state: { ...from, pitch: (from.pitch + step) & 0xff_ff }
      };
    }
    const pass = craftPass(program, slot, from, read, boxes);
    return pass.landing
      ? landingHandler(program, pass.state, boxes)
      : { outcome: 'moved', state: pass.state };
  };
  return run(state);
};

/// One frame aboard: `$05970E`–`$05976A`. The pass runs; a landing goes to the handler; the
/// box test then either lets the move stand or refuses it. A refusal restores the position,
/// negates the throttle's and the speed's mantissas, runs the pass again untested from the
/// restored position with the same sines, and drops the throttle's exponent to `$FFF0`.
export const craftFrame = (
  program: CraftProgram,
  slot: CraftSlot,
  state: CraftState,
  stick: number,
  boxes: BoundBoxes
): CraftFrame => {
  const k = program.constants;
  const run = (from: CraftState) =>
    craftMotionPass(program, slot, from, stick, boxes, state);
  let frame = run(state);
  if (frame.outcome === 'moved' && insideBox(boxes, frame.state)) {
    const again = run({
      ...frame.state,
      speed: negated(frame.state.speed),
      throttle: negated(frame.state.throttle),
      x: state.x,
      y: state.y,
      z: state.z
    });
    frame = {
      outcome: again.outcome === 'landed' ? 'landed' : 'refused',
      state: {
        ...again.state,
        throttle: long(k.collisionExponent, again.state.throttle)
      }
    };
  }
  return {
    // `$05976A` tests the pose copy's Y, which the frame took before the pass.
    outcome:
      frame.outcome === 'moved' && high(u32(state.y)) >= k.spaceEntry
        ? 'space'
        : frame.outcome,
    // The next frame's trig routine reads the attitude this one left.
    state: {
      ...frame.state,
      trig: { pitch: frame.state.pitch, yaw: frame.state.yaw }
    }
  };
};

/// What the launch key did (`$055822`, Esc).
export type LaunchOutcome =
  /// Not aboard, or in ground contact: `rts` with nothing written.
  | 'ignored'
  /// The slot's `+$1A` is below the gate: system string 21, and nothing written.
  | 'refused'
  /// `$7B0C` set, the reverse throttle and the speed's exponent written. The key effect
  /// `$054848` follows.
  | 'launched';

/// `$055822`: the launch. It needs the player aboard on a Body (`$7AAE` = 0), out of ground
/// contact, in a slot whose `+$1A` is at least the gate. It then sets the swing, writes the
/// reverse throttle `$000EF000` and puts the speed's mantissa under the exponent `$F000`.
export const launch = (
  program: CraftProgram,
  slot: CraftSlot,
  state: CraftState,
  inSpace: boolean
): { readonly outcome: LaunchOutcome; readonly state: CraftState } => {
  const k = program.constants;
  if (inSpace || state.contact !== 0) {
    return { outcome: 'ignored', state };
  }
  if (slot.parameters === null) {
    throw new Error(`craft slot ${slot.slot} has no +$1A for the launch gate`);
  }
  if (slot.parameters.ceiling < k.launchGate) {
    return { outcome: 'refused', state };
  }
  return {
    outcome: 'launched',
    state: {
      ...state,
      speed: long(k.launchSpeedExponent, state.speed),
      swing: true,
      throttle: u32(k.launchThrottle)
    }
  };
};

/// `$0556AA`–`$055708`: a throttle key's table entry. `$80` stops, an even entry is forward and
/// an odd one reverse, at exponent entry ÷ 2. Answers the new throttle, or undefined where the
/// key writes nothing (an unchanged value). A write also clears the swing `$7B0C` (`$055700`).
export const throttleForEntry = (
  state: CraftState,
  entry: number,
  constants: CraftConstants
): number | undefined => {
  const value =
    entry >= 0x80
      ? u32(constants.zero)
      : long(entry >> 1, (entry & 1) === 0 ? 0x10_00 : 0xf0_00);
  return value === state.throttle ? undefined : value;
};

/// `$05575E`: `-` scales the throttle by `$FFFF1F80`. A result below 1.0 runs the stop preset
/// instead, which also stops the craft.
export const throttleDown = (
  program: CraftProgram,
  state: CraftState
): CraftState => {
  const scaled = craftMultiply(
    program.arithmetic,
    state.throttle,
    u32(program.constants.throttleDown)
  );
  return sx32(scaled) < 0
    ? stopPreset(state, program.constants)
    : { ...state, throttle: scaled };
};

/// `$055798`: `=` scales the throttle by `$1080`, ignored once the result passes `$E0000`.
export const throttleUp = (
  program: CraftProgram,
  state: CraftState
): CraftState | undefined => {
  const scaled = craftMultiply(
    program.arithmetic,
    state.throttle,
    program.constants.throttleUp
  );
  return sx32(scaled) > program.constants.throttleCap
    ? undefined
    : { ...state, throttle: scaled };
};

/// A throttle as a signed magnitude: the mantissa a 4.12 fraction, the exponent a power of two.
const throttleMagnitude = (throttle: number): number =>
  (sx16(throttle) / 0x10_00) * 2 ** sx16(throttle >>> 16);

/// The pad's shoulder buttons aboard (ADR 0059): the throttle key a notch up or down the ladder
/// `$0557D6` gives the digits and function keys, so a press is one real key and each notch
/// doubles the speed, as Targ's relative keys step its own ladder. Below the lowest notch either
/// way, up is key `1` and down is Space's stop. Otherwise the step keeps the gear, digits
/// forward and function keys in reverse: up is the first notch past the throttle, down the
/// last one short of it, or the stop below them. Answers the ST scancode, or undefined at the
/// top of the ladder, where Targ refuses the step too.
export const throttleNotchKey = (
  program: CraftProgram,
  state: CraftState,
  direction: -1 | 1
): number | undefined => {
  const notches = program.throttleKeys
    .filter(key => key.entry < 0x80)
    .map(key => ({
      magnitude: throttleMagnitude(
        long(key.entry >> 1, (key.entry & 1) === 0 ? 0x10_00 : 0xf0_00)
      ),
      scancode: key.scancode
    }));
  const stop = program.throttleKeys.find(key => key.entry >= 0x80)?.scancode;
  const current = throttleMagnitude(state.throttle);
  const gear = notches
    .filter(notch => Math.sign(notch.magnitude) === (current < 0 ? -1 : 1))
    .sort((a, b) => Math.abs(a.magnitude) - Math.abs(b.magnitude));
  const size = Math.abs(current);
  const lowest = gear[0];
  if (lowest === undefined || size < Math.abs(lowest.magnitude)) {
    const forward = notches
      .filter(notch => notch.magnitude > 0)
      .sort((a, b) => a.magnitude - b.magnitude)[0];
    return direction > 0 ? forward?.scancode : stop;
  }
  if (direction > 0) {
    return gear.find(notch => Math.abs(notch.magnitude) > size)?.scancode;
  }
  return (
    gear.filter(notch => Math.abs(notch.magnitude) < size).at(-1)?.scancode ??
    stop
  );
};
