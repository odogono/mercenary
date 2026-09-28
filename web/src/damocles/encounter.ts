import type { Craft, EncounterConstant } from '../catalogue/data.ts';
import {
  craftAdd,
  craftFixed,
  craftMultiply,
  type CraftArithmetic
} from './craft.ts';

/// The TOLOSA encounter (#581, ADR 0055): the moving-object pool's three routines as the aboard
/// frame path calls them at `$05987A`, the fire launcher `$050B96`, the stepper `$050ABC` and the
/// attack routine `$050D80` (docs/research/damocles-tolosa-encounter.md). The space path
/// `$059906` calls the first two only, and on foot the frame path calls none.
///
/// Only slots 8 (the player's shot), 11 (the ATTACK SHIP) and 15 (its shot) are ever written.
/// A record's position is three unsigned longs and its velocity three signed longs, as the
/// resident arrays hold them. Its body is Association B's byte 0, the body selector it was
/// stamped with; 0 is unplaced. Nothing in this module is Targ's.

const u32 = (value: number): number => value >>> 0;
const sx32 = (value: number): number => value | 0;

export type Longs = readonly [number, number, number];

export interface PoolObject {
  readonly body: number;
  readonly counter: number;
  readonly position: Longs;
  readonly velocity: Longs;
}

/// Slots 8, 11 and 15.
export interface Pool {
  readonly ship: PoolObject;
  readonly shipShot: PoolObject;
  readonly shot: PoolObject;
}

export type EncounterConstants = Readonly<Record<EncounterConstant, number>>;

export interface EncounterProgram {
  readonly arithmetic: CraftArithmetic;
  readonly constants: EncounterConstants;
  /// The first world's records, which a New Game starts from.
  readonly initial: Pool;
}

export const encounterProgram = (craft: Craft): EncounterProgram => {
  const record = (slot: number): PoolObject => {
    const found = craft.encounter.slots.find(item => item.slot === slot)!;
    return {
      body: found.body,
      counter: found.counter,
      position: found.position,
      velocity: found.velocity
    };
  };
  return {
    arithmetic: {
      arctan: craft.arithmetic.arctan.bytes,
      exp: craft.arithmetic.exp.words,
      octants: craft.arithmetic.octants,
      sine: craft.arithmetic.sine.longs
    },
    constants: Object.fromEntries(
      Object.entries(craft.encounter.constants).map(([name, value]) => [
        name,
        value.operand
      ])
    ) as EncounterConstants,
    initial: { ship: record(11), shipShot: record(15), shot: record(8) }
  };
};

/// What the frame path's pass hands the pool.
export interface EncounterInputs {
  /// The surface path `$05987A` runs the attack routine; the space path `$059906` does not.
  readonly attack: boolean;
  /// `$7AC9`: the body byte a launched or steered object is stamped with.
  readonly bodyByte: number;
  /// `$7A92`, `$7A30`, `$7A9A`: the camera the attack routine measures from. In every traced pass
  /// it was the pose `$7AB2`/`$7AB6`/`$7ABA`, which the player's shot starts from.
  readonly camera: Longs;
  /// The fire bit of `$79C2`. The launcher also needs `$7AB0` non-negative, which it always is
  /// aboard, and `$7BBE` clear.
  readonly firing: boolean;
  /// `$070104`, the encounter gate.
  readonly gate: number;
  /// `$7AA9`, the body selector's low byte the kill compares slot 11's body byte with.
  readonly selector: number;
  /// `$7AAE` = 2: in space the stepper does not clamp Y at the ground.
  readonly space: boolean;
  /// `$797A`, the craft's speed float.
  readonly speed: number;
  /// The attitude words `$7AC0` and `$7AC2` the frame sines `$7AD6`–`$7AE2` were taken at: the
  /// attitude this pass's Mover left.
  readonly trig: { readonly pitch: number; readonly yaw: number };
}

export type EncounterEvent =
  /// `$050BB4`: the player fired, arming `$04C610`.
  | 'fire'
  /// `$050B4A`: the player's shot hit the ship: `$04C610`, flash `$AA00`, string `$31`.
  | 'kill'
  /// `$050DD2`: the ship fired, arming the thud `$04C630`.
  | 'ship-fire'
  /// `$050E44`: the ship re-steered at the player.
  | 'steer'
  /// `$050DFA`: the ship's shot hit the player: `$04C652`, the noise flash, string `$30`, flash
  /// `$AAAA` and the death state.
  | 'zap';

export interface EncounterPass {
  readonly events: readonly EncounterEvent[];
  readonly gate: number;
  readonly pool: Pool;
}

interface Mutable {
  body: number;
  counter: number;
  position: [number, number, number];
  velocity: [number, number, number];
}

const copy = (object: PoolObject): Mutable => ({
  body: object.body,
  counter: object.counter,
  position: [...object.position],
  velocity: [...object.velocity]
});

const freeze = (object: Mutable): PoolObject => ({
  body: object.body,
  counter: object.counter,
  position: [object.position[0], object.position[1], object.position[2]],
  velocity: [object.velocity[0], object.velocity[1], object.velocity[2]]
});

/// `$0541BA`: inside when every component, shifted left by four as a long and made positive,
/// is at most the radius shifted the same way, compared unsigned.
export const insideBox = (radius: number, components: Longs): boolean => {
  const limit = u32(radius * 16);
  return components.every(component => {
    let shifted = u32(component << 4);
    if (shifted >= 0x80_00_00_00) {
      shifted = u32(-shifted);
    }
    return shifted <= limit;
  });
};

/// `swap`, `ext.w`, `swap`: the high word cut to its low byte, sign-extended, which is the
/// surface's wrap at 256 cells.
const wrapped = (value: number): number => {
  const high = ((((value >>> 16) & 0xff) << 24) >> 24) & 0xff_ff;
  return sx32(high * 0x1_00_00 + (value & 0xff_ff));
};

const separation = (a: Longs, b: Longs): Longs => [
  sx32(a[0] - b[0]),
  sx32(a[1] - b[1]),
  sx32(a[2] - b[2])
];

/// `$050E86`: each separation shifted right arithmetically and negated.
const toward = (sep: Longs, shift: number): [number, number, number] => [
  sx32(-(sep[0] >> shift)),
  sx32(-(sep[1] >> shift)),
  sx32(-(sep[2] >> shift))
];

const sine = (arithmetic: CraftArithmetic, angle: number): number =>
  arithmetic.sine[angle & 0x3_ff]!;

/// `$050BD4`–`$050D74`: the shot's velocity. The speed plus `$000A1F00`, with only the sum's
/// exponent kept (`clr.w d5`), scales the view's direction from the frame sines.
const shotVelocity = (
  program: EncounterProgram,
  inputs: EncounterInputs
): [number, number, number] => {
  const t = program.arithmetic;
  const scale =
    u32(craftAdd(inputs.speed, program.constants.shotSpeedBias)) &
    0xff_ff_00_00;
  const cosPitch = sine(t, inputs.trig.pitch + 0x1_00);
  const sinPitch = sine(t, inputs.trig.pitch);
  const cosYaw = sine(t, inputs.trig.yaw + 0x1_00);
  const sinYaw = sine(t, inputs.trig.yaw);
  return [
    craftFixed(u32(craftMultiply(t, cosPitch, sinYaw) + scale)),
    craftFixed(u32(sinPitch + scale)),
    craftFixed(u32(craftMultiply(t, cosPitch, cosYaw) + scale))
  ];
};

/// One pass of the pool: the launcher and the stepper, then, on the surface path, the attack
/// routine.
export const encounterPass = (
  program: EncounterProgram,
  pool: Pool,
  inputs: EncounterInputs
): EncounterPass => {
  const k = program.constants;
  const shot = copy(pool.shot);
  const ship = copy(pool.ship);
  const shipShot = copy(pool.shipShot);
  const events: EncounterEvent[] = [];
  let gate = inputs.gate;

  // `$050B96`: the player's shot.
  if (inputs.firing && shot.counter === 0) {
    events.push('fire');
    shot.body = inputs.bodyByte;
    shot.counter = k.shotSteps;
    shot.position = [...inputs.camera];
    shot.velocity = shotVelocity(program, inputs);
  }

  // `$050ABC`: slots 15 down to 8. A counter that runs out clears the record and does not move
  // it. After slot 8 moves, the kill test runs and the stepper returns.
  for (const object of [shipShot, ship, shot]) {
    if (object.counter === 0 || object.counter === k.hold) {
      continue;
    }
    object.counter = (object.counter - 1) & 0xff_ff;
    if (object.counter === 0) {
      object.body = 0;
      continue;
    }
    object.position[0] = u32(object.position[0] + object.velocity[0]);
    let y = u32(object.position[1] + object.velocity[1]);
    if (y >= 0x80_00_00_00 && !inputs.space) {
      y = 0xff_ff_ff_ff;
    }
    object.position[1] = y;
    object.position[2] = u32(object.position[2] + object.velocity[2]);
    if (object === shot && ship.body === inputs.selector) {
      // `$050B28`: slot 8 against slot 11, X and Z wrapped to the surface.
      const sep: Longs = [
        wrapped(u32(shot.position[0] - ship.position[0])),
        sx32(shot.position[1] - ship.position[1]),
        wrapped(u32(shot.position[2] - ship.position[2]))
      ];
      if (insideBox(k.killBox, sep)) {
        events.push('kill');
        gate = 0;
        ship.counter = 0;
        ship.body = 0;
        shot.counter = 0;
        shot.body = 0;
      }
    }
  }

  // `$050D80`: the attack routine, on the surface path only.
  if (inputs.attack && gate !== 0 && (ship.counter & 0x80_00) === 0) {
    const sep = separation(ship.position, inputs.camera);
    if (!insideBox(k.window, sep)) {
      events.push('steer');
      ship.velocity = toward(sep, k.steerShift);
      ship.counter = k.coast;
      ship.body = inputs.bodyByte;
    } else if (shipShot.counter === 0) {
      events.push('ship-fire');
      shipShot.counter = k.shipShotSteps;
      shipShot.body = inputs.bodyByte;
      shipShot.velocity = toward(sep, k.shipShotShift);
      shipShot.position = [...ship.position];
    } else if (
      insideBox(k.zapBox, separation(shipShot.position, inputs.camera))
    ) {
      // The counters are left: the ship stays parked at `hold` and its shot runs out unseen.
      events.push('zap');
      gate = 0;
      ship.body = 0;
      shipShot.body = 0;
    }
  }

  return {
    events,
    gate,
    pool: { ship: freeze(ship), shipShot: freeze(shipShot), shot: freeze(shot) }
  };
};

/// Whether a record is drawn: placed, and stamped with the Body the player is on.
export const poolObjectShown = (
  object: PoolObject,
  selector: number
): boolean => object.body !== 0 && object.body === selector;
