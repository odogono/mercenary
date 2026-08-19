import { describe, expect, test } from 'bun:test';

import { blockFor, speedFixedPoint } from '../src/flight/index.ts';
import {
  IDLE,
  MAXIMUM_STEP,
  REFERENCE_WALKING_EYE_ALTITUDE,
  board,
  ceilingFor,
  controlLimits,
  effectiveThrottle,
  flightModel,
  gameState,
  intent,
  leave,
  notchForKey,
  playerState,
  rawPitch,
  step,
  throttle,
  throttleStep,
  wallThud,
  wrapPitch,
  type FlightModel,
  type GameState,
  type Intent
} from '../src/gameCore/index.ts';
import { Containment } from '../src/navigation/index.ts';
import type {
  Block,
  FlightDocument,
  FlightRules
} from '../src/payload/documents.ts';
import { SUPPORTED_FLIGHT_SCHEMA_VERSION } from '../src/payload/load.ts';

/// The mover, asserted against the behaviours the kit's own suite asserts.
///
/// The Reference Build's two Movers are exercised together here because `GameCore.step` selects
/// between them: the filtered craft loop over a Craft Parameter Block, and the fixed-step on-foot
/// routine. The dynamics are written in code rather than read from a payload so that each test
/// states what it depends on; the Replay Gates are where the decoded parameters are graded.

const block = (fields: {
  readonly ceiling?: number;
  readonly handler?: Block['handler'];
  readonly index: number;
  readonly liftFactor?: number;
  readonly mode?: string;
  readonly pitchStep?: number;
  readonly speedDamping?: number;
  readonly throttleGain?: number;
  readonly yawAuthority?: number;
  readonly yawDamping?: number;
}): Block => ({
  ceiling: fields.ceiling ?? 10,
  handler: fields.handler ?? 'standard',
  index: fields.index,
  liftFactor: fields.liftFactor ?? 0.5,
  pitchStep: fields.pitchStep ?? 8,
  rollCoupling: 4,
  speedDamping: fields.speedDamping ?? 0.5,
  throttleGain: fields.throttleGain ?? 0.390_625,
  yawAuthority: fields.yawAuthority ?? 1,
  yawDamping: fields.yawDamping ?? 0.9375,
  ...(fields.mode !== undefined ? { mode: fields.mode } : {})
});

/// The rules as our own image decodes them, so the thresholds under test are real.
const rules: FlightRules = {
  angleUnitsPerTurn: 1024,
  ceilingClimbScale: 9.313_225_746_154_785e-10,
  ceilingUnit: 65_536,
  crashDescentRate: 256,
  crashPitch: 640,
  groundAltitude: 63,
  groundBand: 64,
  levelPitch: 512,
  poweramp: { ceiling: 90, craft: 1, throttleScale: 2 },
  takeoffSpeed: 128,
  throttleLimit: 32_768,
  throttleNotches: Array.from({ length: 10 }, (_, index) => 2 ** (5 + index)),
  walkingBlock: 8
};

/// Eight craft then walking, as the Reference Build's table is laid out. The walking block damps
/// its yaw almost to nothing, which is why a craft on the ground handles as it does.
const blocks = (): Block[] => {
  const table = Array.from({ length: 8 }, (_, index) => block({ index }));
  table[2] = block({ handler: 'sinking', index: 2, pitchStep: 0 });
  table.push(
    block({
      ceiling: 0,
      index: 8,
      liftFactor: 1,
      mode: 'grounded',
      pitchStep: 1,
      speedDamping: 0.25,
      throttleGain: 1,
      yawAuthority: 16,
      yawDamping: 1.525_878_906_25e-5
    })
  );
  return table;
};

const document: FlightDocument = {
  blocks: blocks(),
  counts: {},
  rules,
  schemaVersion: SUPPORTED_FLIGHT_SCHEMA_VERSION,
  // The Reference Build's own on-foot step and turn, per frame.
  walk: { step: 80, turnStep: 16 }
};

const flight = flightModel(document);

const start = (): GameState =>
  gameState({
    player: playerState({ position: { x: 10_000, y: 63, z: 10_000 } })
  });

/// Boarded, airborne and moving — the state most flight rules apply to.
const flying = (
  fields: {
    readonly altitude?: number;
    readonly craft?: number;
    readonly notch?: number;
  } = {}
): GameState => {
  const grounded = start();
  return throttle(
    {
      ...grounded,
      craft: fields.craft ?? 1,
      mode: 'flying',
      player: {
        ...grounded.player,
        position: {
          ...grounded.player.position,
          y: fields.altitude ?? 20_000
        }
      }
    },
    fields.notch ?? 10,
    rules
  );
};

/// Underground, near the near wall and facing decreasing X.
///
/// The room is set rather than arrived at: taking the lift reads the underground document, which
/// belongs to a later gate than this one.
const inside = (): GameState =>
  gameState({
    player: playerState({
      heading: (3 * Math.PI) / 2,
      position: { x: 40, y: 128, z: 1000 }
    }),
    room: 3
  });

/// One sixtieth is the host's frame, which is deliberately not the reference rate.
const HOST_FRAME = 1 / 60;

const held = (
  state: GameState,
  input: Intent,
  frames: number,
  model: FlightModel = flight
): GameState => {
  let result = state;
  for (let frame = 0; frame < frames; frame++) {
    result = step(result, input, HOST_FRAME, model);
  }
  return result;
};

describe('properties that hold whatever the block', () => {
  test('the same inputs produce the same state', () => {
    const input = intent({ pitch: 0.5, running: true, turn: 0.25, walk: 1 });

    expect(held(start(), input, 120)).toEqual(held(start(), input, 120));
  });

  test('a long frame is broken into bounded steps', () => {
    const stalled = step(start(), intent({ walk: 1 }), 1, flight);

    expect(stalled.elapsed).toBeCloseTo(1, 9);
    expect(stalled.player.position.z).toBeGreaterThan(10_000);
  });

  test('a stalled frame is a run of bounded slices rather than one leap', () => {
    // Two thirtieths is exactly two of the longest slice the integrator will take, so a step of
    // it has to come out bit-for-bit identical to taking those two slices by hand. A different
    // bound, or no bound at all, would integrate the filters over a different set of steps.
    const input = intent({ turn: 1 });
    const stalled = step(flying(), input, 2 / 30, flight);
    const sliced = step(
      step(flying(), input, 1 / 30, flight),
      input,
      1 / 30,
      flight
    );

    expect(stalled).toEqual(sliced);
  });

  test('a non-positive or non-finite step is ignored', () => {
    const state = start();
    const input = intent({ walk: 1 });

    expect(step(state, input, 0, flight)).toEqual(state);
    expect(step(state, input, -1, flight)).toEqual(state);
    expect(step(state, input, Number.NaN, flight)).toEqual(state);
    expect(step(state, input, Number.POSITIVE_INFINITY, flight)).toEqual(state);
  });

  test('intent axes are clamped on construction', () => {
    const wild = intent({
      pitch: Number.NaN,
      turn: Number.POSITIVE_INFINITY,
      walk: 12
    });

    expect(wild.turn).toBe(0);
    expect(wild.pitch).toBe(0);
    expect(wild.walk).toBe(1);
    expect(intent({ walk: -12 }).walk).toBe(-1);
  });

  test('the heading stays within one turn', () => {
    const turned = held(flying(), intent({ turn: 1 }), 2000);

    expect(turned.player.heading).toBeGreaterThanOrEqual(0);
    expect(turned.player.heading).toBeLessThan(2 * Math.PI);
  });

  test('movement is held inside the world', () => {
    const cornered = held(
      {
        ...start(),
        player: playerState({
          heading: Math.PI,
          position: { x: 10, y: 63, z: 10 }
        })
      },
      intent({ walk: 1 }),
      600
    );

    expect(cornered.player.position.z).toBeGreaterThanOrEqual(0);
    expect(cornered.player.position.z).toBeLessThanOrEqual(
      flight.limits.groundExtent
    );
  });

  test('heading zero travels toward increasing Z', () => {
    const moved = step(start(), intent({ walk: 1 }), 0.5, flight);

    expect(moved.player.position.x).toBe(10_000);
    expect(moved.player.position.z).toBeGreaterThan(10_000);
  });

  test('a quarter turn travels toward increasing X', () => {
    const moved = step(
      {
        ...start(),
        player: playerState({
          heading: Math.PI / 2,
          position: { x: 10_000, y: 63, z: 10_000 }
        })
      },
      intent({ walk: 1 }),
      0.5,
      flight
    );

    expect(moved.player.position.x).toBeGreaterThan(10_000);
    expect(moved.player.position.z).toBeCloseTo(10_000, 3);
  });

  test('the doorway transition counts down in the frame loop, not in either mover', () => {
    // It is world time and not script time, and it runs whether the player is walking, flying or
    // standing still — so slowing the scripts down for legibility must not slow it with them.
    const waiting = { ...start(), transitionCooldown: 10 };
    const frame = 1 / flight.limits.referenceFrameRate;

    expect(step(waiting, IDLE, frame, flight).transitionCooldown).toBeCloseTo(
      9,
      9
    );
    expect(
      step({ ...flying(), transitionCooldown: 10 }, IDLE, frame, flight)
        .transitionCooldown
    ).toBeCloseTo(9, 9);
    expect(step(waiting, IDLE, 1, flight).transitionCooldown).toBe(0);
  });
});

describe('the two filters at work', () => {
  test('yaw velocity builds and then decays rather than stopping dead', () => {
    const turning = held(flying(), intent({ turn: 1 }), 60);
    expect(turning.player.yawVelocity).toBeGreaterThan(0);

    // Let go: a craft keeps turning for a while, which is the damping at work.
    const released = step(turning, IDLE, HOST_FRAME, flight);

    expect(released.player.yawVelocity).toBeLessThan(
      turning.player.yawVelocity
    );
    expect(released.player.yawVelocity).toBeGreaterThan(0);
  });

  test('speed settles on the throttle fixed point', () => {
    const cruising = held(flying({ notch: 10 }), IDLE, 600);
    const craft = blockFor(document, cruising.craft);

    expect(cruising.player.speed).toBeCloseTo(
      speedFixedPoint(
        cruising.throttle,
        craft.throttleGain,
        craft.speedDamping
      ),
      6
    );
  });

  test('turning right is turning left negated', () => {
    const left = step(flying(), intent({ turn: -1 }), 0.5, flight);
    const right = step(flying(), intent({ turn: 1 }), 0.5, flight);

    expect(left.player.yawVelocity).toBeCloseTo(-right.player.yawVelocity, 12);
  });

  test('a craft banks into its turn but a walker never rolls', () => {
    const flyer = held(flying(), intent({ turn: 1 }), 60);
    const walker = held(start(), intent({ turn: 1 }), 60);

    expect(flyer.player.roll).not.toBe(0);
    expect(walker.player.roll).toBe(0);
  });

  test('the reference frame rate sets the pace of everything', () => {
    const quick = flightModel(
      document,
      controlLimits({ referenceFrameRate: 10 })
    );
    const slow = flightModel(
      document,
      controlLimits({ referenceFrameRate: 5 })
    );

    expect(
      step(flying(), intent({ turn: 1 }), 0.1, quick).player.yawVelocity
    ).toBeGreaterThan(
      step(flying(), intent({ turn: 1 }), 0.1, slow).player.yawVelocity
    );
  });

  test('the turn builds more than four times faster at four times the frame rate', () => {
    // The frame rate fixes both the rate a craft turns at and the lag before it gets there,
    // which a scale alone would leave alone.
    const slow = flightModel(
      document,
      controlLimits({ referenceFrameRate: 5 })
    );
    const quick = flightModel(
      document,
      controlLimits({ referenceFrameRate: 20 })
    );
    const turn = intent({ turn: 1 });

    expect(held(flying(), turn, 30, quick).player.yawVelocity).toBeGreaterThan(
      held(flying(), turn, 30, slow).player.yawVelocity * 2
    );
  });
});

describe('the throttle', () => {
  test('digit notches set absolute throttle and are each a doubling', () => {
    expect(throttle(start(), 1, rules).throttle).toBe(32);
    expect(throttle(start(), 2, rules).throttle).toBe(64);
    expect(throttle(start(), 10, rules).throttle).toBe(16_384);
  });

  test('an out of range notch is refused rather than clamped', () => {
    const state = throttle(start(), 1, rules);

    expect(throttle(state, 0, rules)).toEqual(state);
    expect(throttle(state, 99, rules)).toEqual(state);
  });

  test('relative throttle doubles and halves and stops at the engine limit', () => {
    const eighth = throttle(start(), 8, rules);
    expect(eighth.throttle).toBe(4096);

    const raised = throttleStep(eighth, 1, rules);
    expect(raised.throttle).toBe(8192);

    // The top notch is the last one below the limit, so doubling it is refused outright rather
    // than clamped — the Reference Build left the value alone.
    const top = throttle(start(), 10, rules);
    expect(throttleStep(top, 1, rules).throttle).toBe(top.throttle);

    expect(throttleStep(raised, -1, rules).throttle).toBe(4096);
    expect(throttleStep(raised, 0, rules)).toEqual(raised);
  });

  test('the throttle falls away to nothing below the lowest notch', () => {
    const lowest = throttle(start(), 1, rules);

    expect(throttleStep(lowest, -1, rules).throttle).toBe(0);
    // And climbs back onto the ladder from nothing rather than doubling zero.
    expect(
      throttleStep(throttleStep(lowest, -1, rules), 1, rules).throttle
    ).toBe(32);
  });

  test('the poweramp doubles the throttle for one craft only', () => {
    const dart = { ...flying({ craft: rules.poweramp.craft }), poweramp: true };
    const other = { ...flying({ craft: 3 }), poweramp: true };

    expect(effectiveThrottle(flight, dart)).toBe(
      dart.throttle * rules.poweramp.throttleScale
    );
    expect(effectiveThrottle(flight, other)).toBe(other.throttle);
  });

  test('the throttle keys start where the window says and stop at the top', () => {
    // The decoded ladder spans 512 to 1, so its bottom rungs are imperceptible whatever the
    // overall speed. The window maps keys to notches and leaves the ladder alone.
    const windowed = flightModel(
      document,
      controlLimits({ throttleFloorNotch: 3 })
    );

    expect(notchForKey(windowed, 1)).toBe(3);
    expect(notchForKey(windowed, 2)).toBe(4);
    expect(notchForKey(windowed, 8)).toBe(10);
    expect(notchForKey(windowed, 10)).toBe(10);
  });

  test('an unwindowed ladder maps keys straight onto notches', () => {
    const plain = flightModel(
      document,
      controlLimits({ throttleFloorNotch: 1 })
    );

    for (let key = 1; key <= 10; key++) {
      expect(notchForKey(plain, key)).toBe(key);
    }
  });

  test('the window never selects a notch off the ladder', () => {
    const silly = flightModel(
      document,
      controlLimits({ throttleFloorNotch: 99 })
    );
    const below = flightModel(
      document,
      controlLimits({ throttleFloorNotch: -5 })
    );

    expect(notchForKey(silly, 1)).toBe(rules.throttleNotches.length);
    expect(notchForKey(below, 1)).toBe(1);
  });
});

describe('take-off, the ceiling and landing', () => {
  test('a craft cannot leave the ground below the take-off speed', () => {
    // Nose up on an idle throttle: the vertical step is skipped entirely, so the craft stays put
    // and cannot even be pitched.
    const idling = held({ ...start(), craft: 1 }, intent({ pitch: 1 }), 120);

    expect(idling.mode).toBe('grounded');
    expect(idling.player.pitch).toBe(0);
    expect(idling.player.position.y).toBeLessThan(rules.groundBand);
  });

  test('a take-off run followed by pitch leaves the ground', () => {
    const rolling = held(
      throttle({ ...start(), craft: 1 }, 10, rules),
      IDLE,
      60
    );
    expect(rolling.player.speed).toBeGreaterThanOrEqual(rules.takeoffSpeed);

    const airborne = held(rolling, intent({ pitch: 1 }), 120);

    expect(airborne.mode).toBe('flying');
    expect(airborne.player.position.y).toBeGreaterThan(rules.groundBand);
  });

  test('a walker cannot take off however fast they are moving', () => {
    // The take-off gate is a speed, and walking can exceed it, so being in a craft has to be a
    // condition of leaving the ground in its own right.
    const sprinting = held(
      start(),
      intent({ pitch: 1, running: true, walk: 1 }),
      600
    );

    expect(sprinting.mode).toBe('grounded');
    expect(sprinting.player.position.y).toBe(flight.groundAltitude);
  });

  test('the ceiling stops the climb without stopping the craft', () => {
    const ceiling = blockFor(document, 1).ceiling * rules.ceilingUnit;
    const pinned = held(
      flying({ altitude: ceiling + 1 }),
      intent({ pitch: 1 }),
      120
    );

    expect(pinned.player.position.y).toBeCloseTo(ceiling + 1, 0);
    expect(pinned.player.speed).toBeGreaterThan(0);
  });

  test('the poweramp raises the ceiling for the craft it belongs to', () => {
    const dart = flying({ craft: rules.poweramp.craft });
    const craft = blockFor(document, dart.craft);

    expect(ceilingFor(flight, dart, craft)).toBe(craft.ceiling);
    expect(ceilingFor(flight, { ...dart, poweramp: true }, craft)).toBe(
      rules.poweramp.ceiling
    );
  });

  test('a gentle touchdown lands and snaps to the ground', () => {
    let state = flying({ altitude: rules.groundBand + 4, notch: 4 });
    state = { ...state, player: { ...state.player, pitch: -0.02 } };
    for (let frame = 0; frame < 600 && state.touchdown === undefined; frame++) {
      state = step(state, IDLE, HOST_FRAME, flight);
    }

    expect(state.touchdown).toBe('landed');
    expect(state.mode).toBe('grounded');
    expect(state.player.position.y).toBe(rules.groundAltitude);
    expect(state.player.roll).toBe(0);
  });

  test('diving into the ground is a crash', () => {
    let state = flying({ altitude: rules.groundBand + 2000, notch: 10 });
    // Well past the pitch the loop tolerates.
    state = { ...state, player: { ...state.player, pitch: -1.2 } };
    for (let frame = 0; frame < 600 && state.touchdown === undefined; frame++) {
      state = step(state, IDLE, HOST_FRAME, flight);
    }

    expect(state.touchdown).toBe('crashed');
  });

  test('touchdown is reported once rather than every frame afterward', () => {
    let state = flying({ altitude: rules.groundBand + 4, notch: 4 });
    state = { ...state, player: { ...state.player, pitch: -0.02 } };
    for (let frame = 0; frame < 600 && state.touchdown === undefined; frame++) {
      state = step(state, IDLE, HOST_FRAME, flight);
    }
    expect(state.touchdown).toBe('landed');

    expect(step(state, IDLE, HOST_FRAME, flight).touchdown).toBeUndefined();
  });

  test('the pitch tests are written around level being half a turn', () => {
    expect(rawPitch(0, rules)).toBeCloseTo(512, 9);
    // Nose down raises the raw value toward the crash threshold; nose up lowers it, which is why
    // the loop lets a nose-high landing through.
    expect(rawPitch(-0.8, rules)).toBeGreaterThan(rules.crashPitch);
    expect(rawPitch(0.8, rules)).toBeLessThan(rules.crashPitch);
    // And it is an angle in the engine's own units, so it wraps rather than running away.
    expect(rawPitch(3 * Math.PI, rules)).toBeGreaterThanOrEqual(0);
    expect(rawPitch(3 * Math.PI, rules)).toBeLessThan(rules.angleUnitsPerTurn);
  });

  test('pitch wraps over the top rather than clamping', () => {
    // The Reference Build's ten-bit pitch wraps, so a craft can be flown right over the top.
    expect(wrapPitch(0)).toBe(0);
    expect(wrapPitch(Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5, 12);
    expect(wrapPitch(-Math.PI - 0.5)).toBeCloseTo(Math.PI - 0.5, 12);
    expect(wrapPitch(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
  });

  test('the sinking craft cannot be pitched and loses height', () => {
    const sinking = flying({ altitude: 500_000, craft: 2, notch: 10 });
    const dropped = held(sinking, intent({ pitch: 1 }), 60);

    expect(dropped.player.pitch).toBe(0);
    expect(dropped.player.position.y).toBeLessThan(sinking.player.position.y);
  });
});

describe('boarding and leaving', () => {
  test('boarding takes the craft position and heading and its block', () => {
    const boarded = board(
      start(),
      3,
      { x: 50_000, y: 0, z: 60_000 },
      1.25,
      flight
    );

    expect(boarded.craft).toBe(3);
    expect(blockFor(document, boarded.craft).index).toBe(3);
    expect(boarded.player.position.x).toBe(50_000);
    expect(boarded.player.position.z).toBe(60_000);
    expect(boarded.player.position.y).toBe(rules.groundAltitude);
    expect(boarded.player.heading).toBe(1.25);
    expect(boarded.throttle).toBe(0);
    expect(boarded.mode).toBe('grounded');
  });

  test('leaving restores the walking eye height and walking keeps it', () => {
    const airborne = flying();
    const rolled = {
      ...airborne,
      player: { ...airborne.player, roll: 0.4 }
    };
    const out = leave(rolled, flight);
    const walked = step(out, intent({ walk: 1 }), HOST_FRAME, flight);

    expect(out.craft).toBeUndefined();
    expect(out.player.position.y).toBe(REFERENCE_WALKING_EYE_ALTITUDE);
    expect(walked.player.position.y).toBe(REFERENCE_WALKING_EYE_ALTITUDE);
    expect(out.player.roll).toBe(0);
    expect(out.mode).toBe('grounded');
  });

  test('stepping out of a craft leaves none of its dynamics behind', () => {
    const airborne = flying();
    const out = step(
      leave(
        {
          ...airborne,
          player: { ...airborne.player, roll: 0.4, yawVelocity: 12 }
        },
        flight
      ),
      IDLE,
      HOST_FRAME,
      flight
    );

    expect(out.player.yawVelocity).toBe(0);
    expect(out.player.roll).toBe(0);
    expect(out.player.pitch).toBe(0);
  });
});

describe('the on-foot mover', () => {
  /// One reference frame, which is the step the decoded walk parameters are written for.
  const frame = 1 / flight.limits.referenceFrameRate;

  test('the step is fixed and arrives at once', () => {
    // `MOVE` dispatches out of a craft to its own routine: a fixed step and a fixed turn, with
    // no velocity to build and none to shed (ADR 0016).
    const moved = step(start(), intent({ walk: 1 }), frame, flight);

    expect(moved.player.position.z - 10_000).toBeCloseTo(80, 9);
    expect(moved.player.speed).toBeCloseTo(80, 9);
  });

  test('the turn is fixed too and leaves no velocity behind', () => {
    const turned = step(start(), intent({ turn: 1 }), frame, flight);

    expect(turned.player.heading).toBeCloseTo(16 * flight.radiansPerUnit, 9);
    expect(turned.player.yawVelocity).toBe(0);

    // Letting go stops the turn dead, because there was never a velocity.
    const released = step(turned, IDLE, frame, flight);
    expect(released.player.heading).toBeCloseTo(16 * flight.radiansPerUnit, 9);
  });

  test('walking backwards is the step negated', () => {
    const forward = step(start(), intent({ walk: 1 }), frame, flight);
    const back = step(start(), intent({ walk: -1 }), frame, flight);

    expect(forward.player.position.z - 10_000).toBeCloseTo(
      -(back.player.position.z - 10_000),
      9
    );
  });

  test('running multiplies the decoded step rather than changing it', () => {
    // The Reference Build had no run, so this is a Mac Adaptation on a decoded step.
    const walked = step(start(), intent({ walk: 1 }), frame, flight);
    const ran = step(
      start(),
      intent({ running: true, walk: 1 }),
      frame,
      flight
    );

    expect(ran.player.position.z - 10_000).toBeCloseTo(
      (walked.player.position.z - 10_000) * flight.limits.runMultiplier,
      9
    );
    // The speed it reports is the decoded step, which the run does not touch.
    expect(ran.player.speed).toBe(walked.player.speed);
  });

  test('the on-foot routine has no vertical term at all', () => {
    // Which is the real reason a walker can never leave the ground: the routine this comes from
    // does not touch altitude, whatever the pitch or the speed.
    const sprinted = held(
      start(),
      intent({ pitch: 1, running: true, walk: 1 }),
      600
    );

    expect(sprinted.player.position.y).toBe(flight.groundAltitude);
    expect(sprinted.mode).toBe('grounded');
    expect(sprinted.player.pitch).toBe(0);
  });

  test('on foot the altitude is held at the ground value', () => {
    const fallen = {
      ...start(),
      player: playerState({ position: { x: 10_000, y: 999_999, z: 10_000 } })
    };

    expect(step(fallen, IDLE, HOST_FRAME, flight).player.position.y).toBe(
      flight.groundAltitude
    );
  });

  test('the ground altitude can be overridden for feel without touching the decode', () => {
    const raised = flightModel(
      document,
      controlLimits({ groundAltitude: 200 })
    );

    expect(step(start(), IDLE, HOST_FRAME, raised).player.position.y).toBe(200);
    expect(raised.document.rules.groundAltitude).toBe(rules.groundAltitude);
  });
});

describe('walking inside a Room', () => {
  /// Room 3's shape, and the two immediates its walls are made of.
  const walls = new Containment(
    {
      bounds: {
        max: { x: 16 * 256, y: 1024, z: 8 * 256 },
        min: { x: 0, y: 0, z: 0 }
      }
    },
    { farMargin: 0xdf, nearMargin: 0x20 }
  );
  const frame = 1 / flight.limits.referenceFrameRate;

  test('underground the player moves on foot whatever they are in', () => {
    // The Reference Build consults the underground flag before anything else, so a craft
    // underground still moves on foot. Ours cannot get one down there, but the dispatch has to
    // agree with the original's all the same.
    const carried = {
      ...inside(),
      craft: 1,
      player: playerState({ position: { x: 1000, y: 128, z: 1000 } })
    };
    const moved = step(carried, intent({ walk: 1 }), frame, flight, walls);

    expect(moved.player.position.z - 1000).toBeCloseTo(80, 9);
    expect(moved.player.speed).toBeCloseTo(80, 9);
    expect(moved.mode).toBe('grounded');
  });

  test('a wall stops the walk and the contact is counted', () => {
    const pushed = step(
      inside(),
      intent({ walk: 1 }),
      MAXIMUM_STEP,
      flight,
      walls
    );

    expect(pushed.player.position.x).toBe(walls.near);
    expect(pushed.wallContact).toBe(1);
    expect(pushed.wallContactLatch).toBe(0);
    expect(wallThud(pushed)).toBe(true);
  });

  test('the latch carries the frame before, which is what sounds the wall once', () => {
    // Without it the wall would sound once a frame for as long as the player leaned on it. A step
    // no longer than one slice is a single frame of the walk, which is what the latch counts: a
    // longer one is several, and the second of those already sees the first one's contact.
    const pushed = step(
      inside(),
      intent({ walk: 1 }),
      MAXIMUM_STEP,
      flight,
      walls
    );
    const leaning = step(
      pushed,
      intent({ walk: 1 }),
      MAXIMUM_STEP,
      flight,
      walls
    );

    expect(leaning.wallContact).toBe(1);
    expect(leaning.wallContactLatch).toBe(1);
    expect(wallThud(leaning)).toBe(false);
  });

  test('the step interlock runs down only while the player is walking', () => {
    // It is steps and not time precisely so that a stationary player cannot run it down, which
    // is what keeps arrival from handing them straight back through the Doorway they came from.
    const arrived = {
      ...inside(),
      player: playerState({ position: { x: 1000, y: 128, z: 1000 } }),
      stepInterlock: 2
    };

    expect(step(arrived, IDLE, frame, flight, walls).stepInterlock).toBe(2);
    expect(
      step(arrived, intent({ walk: 1 }), frame, flight, walls).stepInterlock
    ).toBeCloseTo(1, 9);
  });

  test('on the surface there is no wall contact to report', () => {
    const leaving = {
      ...start(),
      wallContact: 1,
      wallContactLatch: 1
    };
    const walked = step(leaving, intent({ walk: 1 }), frame, flight);

    expect(walked.wallContact).toBe(0);
    expect(walked.wallContactLatch).toBe(0);
    expect(wallThud(walked)).toBe(false);
  });
});
