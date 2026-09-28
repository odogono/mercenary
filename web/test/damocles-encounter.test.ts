import { beforeAll, describe, expect, test } from 'bun:test';

import {
  encounterPass,
  encounterProgram,
  insideBox,
  type EncounterInputs,
  type EncounterProgram,
  type Longs,
  type Pool,
  type PoolObject
} from '../src/damocles/encounter.ts';
import { loadCatalogue } from './fixtures/catalogue.ts';

/// The pool's three routines against the encounters of #581 (ADR 0055: "passes, exact"). Each
/// Golden Trace under `traces/damocles/encounter/` holds every pass's inputs and pool as the
/// frame path's call site `$05987A` saw them, exported from the ignored laboratory runs by
/// `research/damocles-st/scripts/encounter-probe.py export`.

interface Slot {
  readonly body: number;
  readonly counter: number;
  readonly position: Longs;
  readonly velocity: Longs;
}

interface Pass {
  readonly attitude: readonly [number, number];
  readonly boarded: number;
  readonly bodyByte: number;
  readonly camera: Longs;
  readonly death: number;
  readonly gate: number;
  readonly inhibit: number;
  readonly mode: number;
  readonly pose: Longs;
  readonly selector: number;
  readonly slots: Readonly<Record<'8' | '11' | '15', Slot>>;
  readonly speed: number;
  readonly stick: number;
  readonly trig: readonly [number, number, number, number];
  readonly vbl: number;
}

interface Trace {
  readonly case: string;
  readonly end: 'zap' | null;
  readonly passes: readonly Pass[];
}

const read = async (name: string): Promise<Trace> =>
  (await Bun.file(
    new URL(`../../traces/damocles/encounter/${name}.json`, import.meta.url)
  ).json()) as Trace;

let program: EncounterProgram;

beforeAll(async () => {
  const catalogue = await loadCatalogue();
  program = encounterProgram(catalogue.craft!);
});

const object = (slot: Slot): PoolObject => ({
  body: slot.body,
  counter: slot.counter,
  position: slot.position,
  velocity: slot.velocity
});

const poolOf = (pass: Pass): Pool => ({
  ship: object(pass.slots['11']),
  shipShot: object(pass.slots['15']),
  shot: object(pass.slots['8'])
});

const inputsOf = (pass: Pass): EncounterInputs => ({
  attack: true,
  bodyByte: pass.bodyByte,
  camera: pass.camera,
  firing: (pass.stick & 0x80) !== 0 && pass.boarded >= 0 && pass.inhibit === 0,
  gate: pass.gate,
  selector: pass.selector,
  space: pass.mode === 2,
  speed: pass.speed,
  trig: { pitch: pass.attitude[0], yaw: pass.attitude[1] }
});

describe('the TOLOSA encounter pool', () => {
  for (const name of ['limo-armed', 'airborne-armed', 'limo-ahead']) {
    test(`${name}: every pass is the next pass's pool`, async () => {
      const trace = await read(name);
      const events = new Map<string, number>();
      for (let index = 0; index + 1 < trace.passes.length; index += 1) {
        const pass = trace.passes[index]!;
        const next = trace.passes[index + 1]!;
        const result = encounterPass(program, poolOf(pass), inputsOf(pass));
        expect({ gate: result.gate, pool: result.pool }).toEqual({
          gate: next.gate,
          pool: poolOf(next)
        });
        for (const event of result.events) {
          events.set(event, (events.get(event) ?? 0) + 1);
        }
      }
      const last = trace.passes.at(-1)!;
      const end = encounterPass(program, poolOf(last), inputsOf(last));
      if (trace.end === 'zap') {
        expect(end.events).toContain('zap');
        expect(end.gate).toBe(0);
      }
      // The run's own counts, as the note tabulates them.
      const expected = {
        'airborne-armed': { 'ship-fire': 2, steer: 9 },
        'limo-ahead': { fire: 8, kill: 1 },
        'limo-armed': { 'ship-fire': 1, steer: 12 }
      }[name]!;
      expect(Object.fromEntries(events)).toEqual(expected);
    });
  }

  test('the frame sines are the sines of the attitude the pass left', async () => {
    const sine = program.arithmetic.sine;
    for (const name of ['limo-ahead', 'airborne-armed']) {
      for (const pass of (await read(name)).passes) {
        const [pitch, yaw] = pass.attitude;
        expect(pass.trig).toEqual([
          sine[(pitch + 0x1_00) & 0x3_ff]!,
          sine[pitch & 0x3_ff]!,
          sine[(yaw + 0x1_00) & 0x3_ff]!,
          sine[yaw & 0x3_ff]!
        ]);
      }
    }
  });

  test('a New Game starts from the first world stale records', () => {
    expect(program.initial.ship.position).toEqual([
      0x0c_79_ff_5e, 0x01_3d_ef_74, 0x04_9b_6b_e0
    ]);
    expect([
      program.initial.shot.counter,
      program.initial.ship.counter,
      program.initial.shipShot.counter
    ]).toEqual([0, 0, 0]);
  });

  test('the box test compares shifted magnitudes unsigned', () => {
    expect(insideBox(0x4_00, [0x4_00, -0x4_00, 0])).toBe(true);
    expect(insideBox(0x4_00, [0x4_01, 0, 0])).toBe(false);
    // A component of 2^28 shifts out to nought, which the original reads as inside.
    expect(insideBox(0x4_00, [0x10_00_00_00, 0, 0])).toBe(true);
  });
});
