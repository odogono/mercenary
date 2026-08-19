import { describe, expect, test } from 'bun:test';

import {
  blockFor,
  settle,
  speedFixedPoint,
  yawFixedPoint,
  type FlightMode,
  type Touchdown
} from '../src/flight/index.ts';
import type {
  Block,
  FlightDocument,
  FlightRules
} from '../src/payload/documents.ts';
import { SUPPORTED_FLIGHT_SCHEMA_VERSION } from '../src/payload/load.ts';

/// The two filters, and which block the loop runs on.
///
/// These are the numbers every other movement gate is built out of, so they are asserted on
/// their own before any state is stepped: a divergence here would present as every craft
/// flying slightly wrong, which is the hardest shape of failure to read.
///
/// The dynamics are written in code rather than read from a payload, so each test says what it
/// depends on — the same reason the kit's own suite carries a fixture.

const block = (fields: {
  readonly handler?: Block['handler'];
  readonly index: number;
  readonly mode?: string;
}): Block => ({
  ceiling: 10,
  handler: fields.handler ?? 'standard',
  index: fields.index,
  liftFactor: 0.5,
  pitchStep: 8,
  rollCoupling: 4,
  speedDamping: 0.5,
  throttleGain: 0.390_625,
  yawAuthority: 1,
  yawDamping: 0.9375,
  ...(fields.mode !== undefined ? { mode: fields.mode } : {})
});

/// Only `walkingBlock` is read by anything below; the rest of the record is filled in because
/// the type is the payload's own and a partial one would be a fixture nothing else could share.
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
  throttleNotches: [32, 64],
  walkingBlock: 2
};

const document: FlightDocument = {
  blocks: [
    block({ index: 0 }),
    block({ handler: 'sinking', index: 1 }),
    block({ index: 2, mode: 'grounded' })
  ],
  counts: {},
  rules,
  schemaVersion: SUPPORTED_FLIGHT_SCHEMA_VERSION,
  walk: { step: 80, turnStep: 16 }
};

describe('the spellings the port keeps', () => {
  test('a mode and a verdict are written as the Golden Trace writes them', () => {
    // The kit keeps these as enums and the Oracle writes them as these strings, so the port
    // spells them the same way and a replay compares them without a mapping table in between.
    const modes: readonly FlightMode[] = ['flying', 'grounded'];
    const verdicts: readonly Touchdown[] = ['crashed', 'landed'];

    expect([...modes, ...verdicts]).toEqual([
      'flying',
      'grounded',
      'crashed',
      'landed'
    ]);
  });
});

describe('the block the loop runs on', () => {
  test('a boarded slot selects its own Craft Parameter Block', () => {
    expect(blockFor(document, 1).index).toBe(1);
    expect(blockFor(document, 1).handler).toBe('sinking');
  });

  test('nothing boarded selects the block after the craft', () => {
    // Not the on-foot walk, which never reaches the control loop at all (ADR 0016). This is the
    // block a landed craft taxis on, which is why the engine installs a mode on it.
    const walking = blockFor(document, undefined);

    expect(walking.index).toBe(rules.walkingBlock);
    expect(walking.mode).toBe('grounded');
  });

  test('a slot the document has no block for is refused rather than read past', () => {
    expect(() => blockFor(document, 9)).toThrow(/9/);
  });
});

describe('settling a first-order filter', () => {
  test('a whole frame lands on the reference recurrence', () => {
    // Solving the filter rather than iterating it has to agree with the original at its own
    // rate: one frame of `velocity * damping + authority`, forty times over.
    const damping = 0.9375;
    const authority = 1;
    const target = yawFixedPoint(authority, damping);
    let iterated = 0;
    for (let frame = 0; frame < 40; frame++) {
      iterated = iterated * damping + authority;
    }

    expect(settle(0, target, damping, 40)).toBeCloseTo(iterated, 9);
  });

  test('a fractional frame lands between two frames of the recurrence', () => {
    const damping = 0.9375;
    const target = yawFixedPoint(1, damping);
    const one = settle(0, target, damping, 1);
    const two = settle(0, target, damping, 2);
    const between = settle(0, target, damping, 1.5);

    expect(between).toBeGreaterThan(one);
    expect(between).toBeLessThan(two);
  });

  test('no frames at all leaves the value where it was', () => {
    expect(settle(3, 7, 0.5, 0)).toBe(3);
  });

  test('an undamped filter steps to its target only once a whole frame has passed', () => {
    // There is no curve to solve without damping, so the recurrence arrives in one frame and
    // the solved form has to say so rather than raise zero to a fractional power.
    expect(settle(3, 7, 0, 0.5)).toBe(3);
    expect(settle(3, 7, 0, 1)).toBe(7);
    expect(settle(3, 7, 0, 2)).toBe(7);
  });

  test('a damping that is not a number takes the same branch as none at all', () => {
    // The guard this comes from is `damping > 0`, which a NaN fails; `damping <= 0` would pass
    // it through to `pow` and produce a NaN state out of a merely absent parameter.
    expect(settle(3, 7, Number.NaN, 0.5)).toBe(3);
    expect(settle(3, 7, Number.NaN, 1)).toBe(7);
  });
});

describe('where the two filters settle', () => {
  test('yaw damps and then takes its input, and speed does the opposite', () => {
    // The two are not the same filter twice, which is the whole reason their fixed points
    // differ: authority / (1 - d) against throttle * gain * d / (1 - d).
    expect(yawFixedPoint(1, 0.9375)).toBeCloseTo(16, 9);
    expect(speedFixedPoint(16_384, 0.390_625, 0.5)).toBeCloseTo(6400, 9);
  });

  test('an undamped filter has no fixed point to solve for', () => {
    // Dividing by 1 - d is meaningless at unit damping, so both fall back to one frame's own
    // contribution rather than a limit the recurrence never reaches.
    expect(yawFixedPoint(1, 1)).toBe(1);
    expect(speedFixedPoint(16_384, 0.390_625, 1)).toBe(16_384 * 0.390_625);
  });

  test('the speed fixed point is the throttle scaled, so it is linear in it', () => {
    const single = speedFixedPoint(32, 0.390_625, 0.5);

    expect(speedFixedPoint(64, 0.390_625, 0.5)).toBeCloseTo(single * 2, 9);
  });
});
