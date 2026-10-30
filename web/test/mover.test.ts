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
  slot7Pitch,
  step,
  surface,
  throttle,
  throttleStep,
  wallThud,
  wrapPitch,
  type ColonyCraftRules,
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
  readonly tumble?: Block['tumble'];
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
  ...(fields.mode !== undefined ? { mode: fields.mode } : {}),
  ...(fields.tumble !== undefined ? { tumble: fields.tumble } : {})
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
  table[7] = block({ ceiling: 1, handler: 'slot7', index: 7 });
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
    }),
    // The crash tumble the engine installs over a craft's own block.
    block({
      ceiling: 0,
      handler: 'tumble',
      index: 9,
      liftFactor: 1,
      mode: 'tumble',
      tumble: { altitudeDrop: 47, pitchStep: 21, rollStep: 16, yawStep: 13 }
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

/// The `$A13D` box as the endgame Data Payload carries it, trimmed to the
/// fields the control loop reads. The exported values are guarded against the
/// image by endgame-payload.test.ts and the C64 lab; what is pinned here is
/// what the engine does with them.
const colonyCraft: ColonyCraftRules = {
  axisMiddleByteWindow: [0x68, 0x78],
  callSites: [],
  cell: [8, 8],
  entry: {
    altitudeHighByte: 0x40,
    flagValue: 0xff,
    restAltitudeLowByte: 0x3f,
    wrappedAltitudeMiddleByte: 0xff
  },
  exitMover: 9,
  minimumAltitudeByte: 0xfc,
  successCarry: 'clear'
};

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
      heading: Math.PI / 2,
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
    expect(stalled.player.position.z).toBeLessThan(10_000);
  });

  test('a stalled frame is a run of bounded slices rather than one leap', () => {
    // Two thirtieths is exactly two of the longest slice a Mover will take, so a step of
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

  test('surface movement continues beyond the city boundary', () => {
    const outside = held(
      {
        ...start(),
        player: playerState({
          heading: Math.PI,
          position: {
            x: 10,
            y: 63,
            z: flight.limits.groundExtent - 10
          }
        })
      },
      intent({ walk: 1 }),
      1
    );

    expect(outside.player.position.z).toBeGreaterThan(
      flight.limits.groundExtent
    );
  });

  test('a flying craft can leave the city too', () => {
    const state = flying();
    const outside = step(
      {
        ...state,
        player: {
          ...state.player,
          heading: Math.PI,
          position: {
            ...state.player.position,
            z: flight.limits.groundExtent - 10
          }
        }
      },
      IDLE,
      HOST_FRAME,
      flight
    );

    expect(outside.player.position.z).toBeGreaterThan(
      flight.limits.groundExtent
    );
  });

  test("surface coordinates wrap like the Reference Build's 24-bit axes", () => {
    const wrapped = step(
      {
        ...start(),
        player: playerState({
          heading: Math.PI,
          position: { x: 10, y: 63, z: 0xff_ff_f0 }
        })
      },
      intent({ walk: 1 }),
      1 / 40,
      flight
    );

    expect(wrapped.player.position.z).toBe(24);
  });

  test('heading zero travels toward decreasing Z', () => {
    const moved = step(start(), intent({ walk: 1 }), 0.5, flight);

    expect(moved.player.position.x).toBe(10_000);
    expect(moved.player.position.z).toBeLessThan(10_000);
  });

  test('a quarter turn travels toward decreasing X', () => {
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

    expect(moved.player.position.x).toBeLessThan(10_000);
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
    expect(turning.player.yawVelocity).toBeLessThan(0);

    // Let go: a craft keeps turning for a while, which is the damping at work.
    const released = step(turning, IDLE, HOST_FRAME, flight);

    expect(released.player.yawVelocity).toBeGreaterThan(
      turning.player.yawVelocity
    );
    expect(released.player.yawVelocity).toBeLessThan(0);
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
    ).toBeLessThan(
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

    expect(held(flying(), turn, 30, quick).player.yawVelocity).toBeLessThan(
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

describe('the lift surfacing transition', () => {
  // The decoded arm ($A28E-$A2BA) writes the horizontal pair only: altitude
  // and the boarded craft survive the ride, which is the recovered route.
  const entrance = { cell: [9, 6], room: 5, site: 1 } as const;
  const lift = {
    altitudeWrap: 6,
    altitudeWrapSubtract: 7,
    ascendRate: 38,
    descendRate: 6,
    floor: 128,
    submergeAt: 0x71,
    submergeMiddle: 0x71,
    surfaceAt: 0x71,
    surfaceMiddle: 0x71
  } as unknown as import('../src/payload/documents.ts').UndergroundLift;

  test('keeps the boarded craft and its altitude', () => {
    const belowDecks = gameState({
      craft: 7,
      player: playerState({ position: { x: 1000, y: 63, z: 1000 } }),
      room: 5
    });
    const surfaced = surface(belowDecks, entrance, lift, 65_536, undefined);
    expect(surfaced.craft).toBe(7);
    expect(surfaced.room).toBeUndefined();
    expect(surfaced.player.position.y).toBe(63);
    expect(surfaced.player.position.x).toBe(9 * 65_536 + 0x71_00);
    expect(surfaced.player.position.z).toBe(6 * 65_536 + 0x71_00);
  });

  // $B455-$B462 loads X with zero, compares the room id against an immediate
  // $08 and stores X into $FA: rooms below 8 leave it clear, and room 8
  // exactly decrements X to $FF. So the flag the ride writes is decided by
  // which room rode up, not by the caller.
  test('a ride up from any room below eight leaves the flag clear', () => {
    const belowDecks = gameState({
      colonyCraftFlag: 0xff,
      player: playerState({ position: { x: 1000, y: 128, z: 1000 } }),
      room: 5
    });
    expect(
      surface(belowDecks, entrance, lift, 65_536, colonyCraft).colonyCraftFlag
    ).toBe(0);
  });

  test('the ride up from room eight surfaces with the flag set', () => {
    const hangar = gameState({
      player: playerState({ position: { x: 1000, y: 128, z: 1000 } }),
      room: 8
    });
    const surfaced = surface(
      hangar,
      { cell: [8, 8], room: 8, site: 8 },
      lift,
      65_536,
      colonyCraft
    );
    expect(surfaced.colonyCraftFlag).toBe(0xff);
    // Site 8's out-of-table reads both land on $08: the Colony Craft's cell.
    expect(surfaced.player.position.x).toBe(8 * 65_536 + 0x71_00);
    expect(surfaced.player.position.z).toBe(8 * 65_536 + 0x71_00);
  });

  test('a walker surfaces at the eye height they rode up with', () => {
    const walker = gameState({
      player: playerState({ position: { x: 1000, y: 128, z: 1000 } }),
      room: 5
    });
    expect(
      surface(walker, entrance, lift, 65_536, undefined).player.position.y
    ).toBe(128);
  });
});

describe('walking while aboard, which the underground allows', () => {
  test('a boarded craft taxiing indoors keeps its altitude', () => {
    const belowDecks = gameState({
      craft: 7,
      player: playerState({ position: { x: 1000, y: 63, z: 1000 } }),
      room: 5
    });
    const taxied = held(belowDecks, intent({ walk: 1 }), 60);
    expect(taxied.player.position.y).toBe(63);
    expect(taxied.craft).toBe(7);
  });
});

describe('the on-foot mover', () => {
  /// One reference frame, which is the step the decoded walk parameters are written for.
  const frame = 1 / flight.limits.referenceFrameRate;

  test('the step is fixed and arrives at once', () => {
    // `MOVE` dispatches out of a craft to its own routine: a fixed step and a fixed turn, with
    // no velocity to build and none to shed (ADR 0016).
    const moved = step(start(), intent({ walk: 1 }), frame, flight);

    expect(moved.player.position.z - 10_000).toBeCloseTo(-80, 9);
    expect(moved.player.speed).toBeCloseTo(80, 9);
  });

  test('the turn is fixed too and leaves no velocity behind', () => {
    const turned = step(start(), intent({ turn: 1 }), frame, flight);

    expect(turned.player.heading).toBeCloseTo(
      2 * Math.PI - 16 * flight.radiansPerUnit,
      9
    );
    expect(turned.player.yawVelocity).toBe(0);

    // Letting go stops the turn dead, because there was never a velocity.
    const released = step(turned, IDLE, frame, flight);
    expect(released.player.heading).toBeCloseTo(
      2 * Math.PI - 16 * flight.radiansPerUnit,
      9
    );
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

    expect(moved.player.position.z - 1000).toBeCloseTo(-80, 9);
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

/// Boarded on the Interstellar Ship, throttle wide open.
const aboardTheShip = (): GameState =>
  throttle({ ...start(), craft: 7 }, 10, rules);

describe('the Interstellar Ship handler', () => {
  // The phase-0 arm writes one byte — the pitch high byte — and returns
  // ($AA6E-$AA72): the ship sits pinned a quarter turn nose-up and no yaw,
  // throttle, translation or altitude step runs at all. The nonzero arm is
  // the terminal renderer, which is presentation rather than a Mover.
  //
  // The byte is the Data Payload's; that the exported value really is 1 is
  // guarded against the image by endgame-payload.test.ts. What is pinned here
  // is what the handler does with whatever byte it is handed.
  const endgame = { colonyCraft, slot7PitchHighByte: 1 };

  test('pins pitch a quarter turn nose-up', () => {
    const pinned = step(
      aboardTheShip(),
      intent({ pitch: 1 }),
      HOST_FRAME,
      flight,
      undefined,
      endgame
    );
    // Raw pitch $0100 out of level $0200 over a $0400 turn is +pi/2.
    expect(pinned.player.pitch).toBeCloseTo(Math.PI / 2, 12);
    expect(slot7Pitch(rules, endgame.slot7PitchHighByte)).toBeCloseTo(
      Math.PI / 2,
      12
    );
  });

  test('follows the decoded byte rather than a pin of its own', () => {
    // Two bytes, two attitudes: the handler stores what it was given, so a
    // different byte has to move the pin. Nothing here may hardcode $01.
    const level = step(
      aboardTheShip(),
      intent({ pitch: 1 }),
      HOST_FRAME,
      flight,
      undefined,
      { ...endgame, slot7PitchHighByte: 2 }
    );
    expect(level.player.pitch).toBe(0);
    expect(slot7Pitch(rules, 2)).toBe(0);
  });

  test('cannot be flown: full input moves nothing at all', () => {
    const held = intent({ pitch: 1, turn: 1, walk: 1 });
    let state = aboardTheShip();
    for (let frame = 0; frame < 120; frame++) {
      state = step(state, held, HOST_FRAME, flight, undefined, endgame);
    }
    expect(state.player.position).toEqual(aboardTheShip().player.position);
    expect(state.player.speed).toBe(0);
    expect(state.player.heading).toBe(0);
    expect(state.mode).toBe('grounded');
  });

  test('still advances time, so the world does not stop around it', () => {
    const later = step(
      aboardTheShip(),
      intent({}),
      HOST_FRAME,
      flight,
      undefined,
      endgame
    );
    expect(later.elapsed).toBeCloseTo(HOST_FRAME, 12);
  });
});

describe('the crash tumble the engine installs over a craft', () => {
  const TUMBLING = 9;
  const aloft = (): GameState =>
    gameState({
      craft: 1,
      mode: 'flying',
      mover: TUMBLING,
      player: playerState({ position: { x: 10_000, y: 400_000, z: 10_000 } })
    });

  test('falls by its own drop and answers no input at all', () => {
    const held = intent({ turn: 1, walk: 1 });

    const steered = step(aloft(), held, HOST_FRAME, flight);
    const ignored = step(aloft(), intent({}), HOST_FRAME, flight);

    // The handler reads nothing, so holding everything changes nothing.
    expect(steered.player.position).toEqual(ignored.player.position);
    expect(steered.player.heading).toBe(ignored.player.heading);
    expect(steered.player.position.y).toBeLessThan(400_000);
  });

  test('spins all three angles by their own steps', () => {
    const start = aloft();

    const spun = step(start, intent({}), HOST_FRAME, flight);

    expect(spun.player.heading).not.toBe(start.player.heading);
    expect(spun.player.pitch).not.toBe(start.player.pitch);
    expect(spun.player.roll).not.toBe(start.player.roll);
  });

  test('flies on the installed block rather than the craft it is in', () => {
    const onItsOwn = step(
      { ...aloft(), mover: undefined },
      intent({}),
      HOST_FRAME,
      flight
    );

    // Craft 1 climbs or holds under its own block; the tumble only falls.
    expect(onItsOwn.player.position.y).toBeGreaterThanOrEqual(
      step(aloft(), intent({}), HOST_FRAME, flight).player.position.y
    );
  });

  test('falls and spins as far in a second whatever the step (ADR 0083)', () => {
    const [twenties, sixties] = ([20, 60] as const).map(steps => {
      let state = aloft();
      for (let at = 0; at < steps; at += 1) {
        state = step(state, intent({}), 1 / steps, flight);
      }
      return state;
    }) as [GameState, GameState];

    // Twenty of the original's frames a second, whatever the browser's rate.
    expect(sixties.player.position.y).toBeCloseTo(
      twenties.player.position.y,
      6
    );
    expect(sixties.player.heading).toBeCloseTo(twenties.player.heading, 9);
    expect(400_000 - twenties.player.position.y).toBeCloseTo(
      20 * 47 * 0x1_00,
      6
    );
  });

  test('reaches the ground, gives a verdict, and puts the block away', () => {
    let state: GameState = {
      ...aloft(),
      player: playerState({ position: { x: 10_000, y: 6000, z: 10_000 } })
    };

    for (let frame = 0; frame < 4; frame += 1) {
      state = step(state, intent({}), HOST_FRAME, flight);
      if (state.touchdown !== undefined) {
        break;
      }
    }

    // A tumble ends the way an ordinary touchdown does, in play.
    expect(state.touchdown).toBeDefined();
    expect(state.mover).toBeUndefined();
  });
});

/// Standing where `start` stands, facing `heading`.
const facing = (heading: number): GameState => ({
  ...start(),
  player: { ...start().player, heading }
});

/// How far a step carried the player across the ground.
const moved = (from: GameState, to: GameState) => ({
  x: to.player.position.x - from.player.position.x,
  z: to.player.position.z - from.player.position.z
});

/// Strafe, an Extension (ADR 0059): the walk step at right angles to the heading, inside the
/// on-foot Mover, so every wall and interlock walking meets it meets too.
describe('Strafe on foot', () => {
  const frame = 1 / flight.limits.referenceFrameRate;

  test('a sidestep right is the step a quarter turn right would walk, under either convention', () => {
    for (const model of [
      flight,
      { ...flight, headingConvention: 'traceOracle' as const }
    ]) {
      for (const heading of [0, 0.4, Math.PI / 2, 2.5, 4]) {
        // Which way the heading runs for a right turn is the convention's; ask the Mover, and
        // read the change the short way round, as the heading wraps.
        const turned = step(facing(heading), intent({ turn: 1 }), frame, model)
          .player.heading;
        const rightward = Math.sign(
          ((turned - heading + 3 * Math.PI) % (2 * Math.PI)) - Math.PI
        );
        const quarter = heading + (rightward * Math.PI) / 2;
        const strafed = moved(
          facing(heading),
          step(facing(heading), intent({ strafe: 1 }), frame, model)
        );
        const walked = moved(
          facing(quarter),
          step(facing(quarter), intent({ walk: 1 }), frame, model)
        );
        expect(strafed.x).toBeCloseTo(walked.x, 6);
        expect(strafed.z).toBeCloseTo(walked.z, 6);
        expect(Math.hypot(strafed.x, strafed.z)).toBeCloseTo(80, 6);
      }
    }
  });

  test('left is right negated, and the heading and pitch are untouched', () => {
    const right = step(start(), intent({ strafe: 1 }), frame, flight);
    const left = step(start(), intent({ strafe: -1 }), frame, flight);
    expect(moved(start(), left).x).toBeCloseTo(-moved(start(), right).x, 9);
    expect(left.player.heading).toBe(start().player.heading);
    expect(left.player.pitch).toBe(0);
    expect(left.player.position.y).toBe(flight.groundAltitude);
  });

  test('walking and strafing together go no faster than walking alone', () => {
    const both = moved(
      start(),
      step(start(), intent({ strafe: 1, walk: 1 }), frame, flight)
    );
    expect(Math.hypot(both.x, both.z)).toBeCloseTo(80, 6);
    expect(Math.abs(both.x)).toBeCloseTo(80 * Math.SQRT1_2, 6);
  });

  test('running scales the sidestep as it scales the walk', () => {
    const ran = moved(
      start(),
      step(start(), intent({ running: true, strafe: 1 }), frame, flight)
    );
    expect(Math.hypot(ran.x, ran.z)).toBeCloseTo(
      80 * flight.limits.runMultiplier,
      6
    );
  });

  test('with no strafe the step is exactly the walk it always was', () => {
    const walked = step(start(), intent({ walk: 1 }), frame, flight);
    expect(walked.player.position.x).toBe(10_000 + 0);
    expect(walked.player.position.z - 10_000).toBeCloseTo(-80, 9);
  });

  describe('inside a Room', () => {
    const walls = new Containment(
      {
        bounds: {
          max: { x: 16 * 256, y: 1024, z: 8 * 256 },
          min: { x: 0, y: 0, z: 0 }
        }
      },
      { farMargin: 0xdf, nearMargin: 0x20 }
    );

    test('a wall stops a sidestep and counts the contact, as it does a walk', () => {
      // Facing +X at the near X wall, a sidestep one way pushes into it.
      const beside = {
        ...inside(),
        player: { ...inside().player, heading: 0 }
      };
      const pushes = [1, -1].map(strafe =>
        step(beside, intent({ strafe }), MAXIMUM_STEP, flight, walls)
      );
      const pushed = pushes.find(state => state.wallContact === 1)!;
      expect(pushed.player.position.x).toBe(walls.near);
      expect(wallThud(pushed)).toBe(true);
    });

    test('the step interlock runs down while strafing', () => {
      const arrived = {
        ...inside(),
        player: playerState({ position: { x: 1000, y: 128, z: 1000 } }),
        stepInterlock: 2
      };
      expect(
        step(arrived, intent({ strafe: 1 }), frame, flight, walls).stepInterlock
      ).toBeCloseTo(1, 9);
    });
  });
});
