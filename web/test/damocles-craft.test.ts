import { beforeAll, describe, expect, test } from 'bun:test';

import type { AssembledCatalogue } from '../src/catalogue/data.ts';
import {
  bindBoxes,
  craftFloat,
  craftFrame,
  craftPass,
  type BoundBoxes,
  type CraftProgram,
  type CraftState
} from '../src/craft/pass.ts';
import { craftProgram } from '../src/damocles/craftProgram.ts';
import { loadCatalogue } from './fixtures/catalogue.ts';

/// The craft Mover against the traced passes of #549 and the refused moves of #550 (ADR 0051:
/// "passes, exact"). Each Golden Trace under `traces/damocles/craft/` is exported from the
/// ignored laboratory runs by `research/damocles-st/scripts/craft-trace-export.py`.

interface Stop {
  readonly altitude: number;
  readonly boxes?: number;
  readonly contact: number;
  readonly frame: number;
  /// On a poked stop, the words the previous pass left before the stop script overwrote them.
  readonly observed?: Partial<Stop>;
  readonly occupancy: number;
  readonly panelSpeed: number | null;
  readonly pitch: number;
  readonly poked?: readonly number[];
  readonly poseY: number;
  readonly roll: number;
  readonly sines: readonly [number, number, number, number];
  readonly slot: number;
  readonly speed: number;
  readonly stick: number;
  readonly supported: number;
  readonly supportLevel: number;
  readonly throttle: number;
  readonly turnRate: number;
  readonly vbl?: number;
  readonly x: number;
  readonly y: number;
  readonly yaw: number;
  readonly z: number;
}

interface Trace {
  readonly boxLists?: readonly {
    readonly supports: readonly (readonly number[])[];
    readonly walls: readonly (readonly number[])[];
  }[];
  readonly case: string;
  readonly kind: 'passes' | 'vbl-changes';
  readonly stops: readonly Stop[];
}

const read = async (name: string): Promise<Trace> =>
  (await Bun.file(
    new URL(`../../traces/damocles/craft/${name}.json`, import.meta.url)
  ).json()) as Trace;

let catalogue: AssembledCatalogue;
let program: CraftProgram;

beforeAll(async () => {
  catalogue = await loadCatalogue();
  program = craftProgram(catalogue.craft!);
});

const pair = (words: readonly number[], at: number) =>
  [words[at]!, words[at + 1]!] as const;

/// The recorded `$CB88` lists as the Mover's bound boxes.
const boundFrom = (
  lists: NonNullable<Trace['boxLists']>[number]
): BoundBoxes => ({
  supports: lists.supports.map(words => ({
    tag: words[6]!,
    x: pair(words, 2),
    y: pair(words, 0),
    z: pair(words, 4)
  })),
  walls: lists.walls.map(words => ({
    x: pair(words, 2),
    y: pair(words, 0),
    z: pair(words, 4)
  }))
});

/// The pitch and yaw whose sine-table entries are the frame's recorded attitude sines.
const trigOf = (stop: Stop): { pitch: number; yaw: number } => {
  const sine = program.arithmetic.sine;
  const angle = (sin: number, cos: number) => {
    for (let a = 0; a < 0x4_00; a += 1) {
      if (sine[a] === sin && sine[(a + 0x1_00) & 0x3_ff] === cos) {
        return a;
      }
    }
    throw new Error('no angle has these sines');
  };
  return {
    pitch: angle(stop.sines[1], stop.sines[0]),
    yaw: angle(stop.sines[3], stop.sines[2])
  };
};

const stateOf = (stop: Stop, trig = trigOf(stop)): CraftState => ({
  contact: stop.contact,
  panelSpeed: stop.panelSpeed ?? 0,
  pitch: stop.pitch,
  roll: stop.roll,
  speed: stop.speed,
  supported: stop.supported,
  supportLevel: stop.supportLevel,
  swing: false,
  throttle: stop.throttle,
  trig,
  turnRate: stop.turnRate,
  x: stop.x,
  y: stop.y,
  yaw: stop.yaw,
  z: stop.z
});

/// The words ADR 0051 compares, with X and Z masked as the pose copy `$058F64` masks them.
const compared = (state: CraftState | Stop, panel = true) => ({
  contact: state.contact,
  ...(panel ? { panelSpeed: state.panelSpeed } : {}),
  pitch: state.pitch,
  roll: state.roll,
  speed: state.speed,
  supported: state.supported,
  supportLevel: state.supportLevel,
  turnRate: state.turnRate,
  x: state.x & 0x0f_ff_ff_ff,
  y: state.y,
  yaw: state.yaw,
  z: state.z & 0x0f_ff_ff_ff
});

describe('the craft number system', () => {
  test("turns an integer into the program's float as `$04BDD4` does", () => {
    // `$79BA` holds the float of −Y: −63 on the ground, as every limo stop reads it.
    expect(craftFloat(-63)).toBe(0x00_05_e0_80);
    expect(craftFloat(0)).toBe(0xff_f0_10_00);
    expect(craftFloat(1)).toBe(0x00_00_10_00);
    expect(craftFloat(0x1_00_00)).toBe(0x00_10_10_00);
  });
});

/// Case, passes the note modelled and matched, and the passes that end otherwise.
const PASS_CASES = [
  ['limo', 259],
  ['limo-lifted', 119],
  ['limo-lifted-fast', 219],
  ['eagle', 891],
  ['eagle-slow', 151],
  ['eagle-land', 511],
  ['eagle-crash', 189],
  ['eagle-high', 129],
  ['concord-ceiling', 191]
] as const;

describe('the craft pass replays every traced pass word for word (#549)', () => {
  for (const [name, modelled] of PASS_CASES) {
    test(name, async () => {
      const trace = await read(name);
      const lists = trace.boxLists!.map(boundFrom);
      let matched = 0;
      let landings = 0;
      let spaces = 0;
      let boarded = false;
      for (let i = 0; i + 1 < trace.stops.length; i += 1) {
        const before = trace.stops[i]!;
        const after = trace.stops[i + 1]!;
        if (before.occupancy !== 0) {
          boarded = false;
          continue;
        }
        const trig = trigOf(before);
        const poked = (before.poked ?? []).length > 0;
        if (!poked) {
          // The pose copy's float of −Y and, but for the first frame after boarding, the
          // attitude sines of the pass's own starting attitude: what the port derives.
          expect(craftFloat(-before.y)).toBe(before.altitude);
          if (boarded) {
            expect(trig).toEqual({ pitch: before.pitch, yaw: before.yaw });
          }
        }
        boarded = true;
        const slot = program.slots[before.slot]!;
        const boxes = lists[before.boxes!]!;
        const pass = craftPass(
          program,
          slot,
          stateOf(before, trig),
          before.stick,
          boxes
        );
        if (after.occupancy === 1) {
          // eagle-crash: the pass that crossed 64 in a dive went to the landing handler, and
          // the next frame had the player on foot.
          expect(pass.landing).toBe(true);
          landings += 1;
          continue;
        }
        if (after.occupancy === 2) {
          // eagle-high: the pre-pass Y had reached `$1F0` × 65,536.
          expect(
            craftFrame(
              program,
              slot,
              stateOf(before, trig),
              before.stick,
              boxes
            ).outcome
          ).toBe('space');
          spaces += 1;
          continue;
        }
        expect(after.frame).not.toBe(before.frame);
        if (poked) {
          continue;
        }
        expect(pass.landing).toBe(false);
        expect(compared(pass.state)).toEqual(
          compared({ ...after, ...after.observed })
        );
        matched += 1;
      }
      const pokedStops = trace.stops.filter(
        (stop, index) =>
          index + 1 < trace.stops.length &&
          stop.occupancy === 0 &&
          (stop.poked ?? []).length > 0
      ).length;
      expect(matched + pokedStops).toBe(modelled);
      expect(landings).toBe(name === 'eagle-crash' ? 1 : 0);
      expect(spaces).toBe(name === 'eagle-high' ? 1 : 0);
    });
  }
});

/// Capital Spaceport's boxes bound as the limo's cell binds them: scale 2, 1, 2 about the
/// intra-cell origin 31958, 34328 (docs/research/damocles-collision-response.md).
const spaceportBoxes = (): BoundBoxes => {
  const detail = catalogue.models.find(
    model => model.id === 'interior-0303d6'
  )!;
  return bindBoxes(detail.boxes!, [2, 2], { x: 31_958, z: 34_328 });
};

describe('the refused move bounces one pass back (#550)', () => {
  test("binds the spaceport's boxes as the limo's traced cell holds them", async () => {
    const trace = await read('limo');
    expect(spaceportBoxes()).toEqual(boundFrom(trace.boxLists![0]!));
  });

  // Each run pokes key 4's throttle at the start; two write a second throttle at VBL 480,
  // key 4 again or F4, which the next pass reads.
  for (const [name, refusals, second] of [
    ['limo-crash', 1, undefined],
    ['limo-crash-again', 2, 0x00_07_10_00],
    ['limo-crash-reverse', 1, 0x00_07_f0_00]
  ] as const) {
    test(name, async () => {
      const trace = await read(name);
      const boxes = spaceportBoxes();
      const slot = program.slots[5]!;
      let refused = 0;
      let frames = 0;
      for (let i = 0; i + 1 < trace.stops.length; i += 1) {
        const before = trace.stops[i]!;
        const after = trace.stops[i + 1]!;
        const poke =
          second !== undefined && before.vbl! < 480 && after.vbl! >= 480;
        if (
          JSON.stringify(compared(after, false)) ===
          JSON.stringify(compared(before, false))
        ) {
          // Only the throttle changed: the second poke, sampled before the next pass.
          expect(poke && after.throttle === second).toBe(true);
          continue;
        }
        const frame = craftFrame(
          program,
          slot,
          { ...stateOf(before), ...(poke ? { throttle: second } : {}) },
          before.stick,
          boxes
        );
        expect(compared(frame.state, false)).toEqual(compared(after, false));
        expect(frame.state.throttle).toBe(after.throttle);
        refused += frame.outcome === 'refused' ? 1 : 0;
        frames += 1;
      }
      expect(refused).toBe(refusals);
      expect(frames).toBeGreaterThan(40);
    });
  }
});
