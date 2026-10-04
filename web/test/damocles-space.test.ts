import { beforeAll, describe, expect, test } from 'bun:test';

import type { AssembledCatalogue, CraftBody } from '../src/catalogue/data.ts';
import {
  NO_BOXES,
  craftFloat,
  craftFrame,
  launch,
  throttleForEntry,
  type CraftProgram,
  type CraftState
} from '../src/craft/pass.ts';
import {
  enterSpace,
  land,
  landingPoint,
  spaceAltitude,
  spaceFrame,
  subStellarLongitude,
  type SpaceState
} from '../src/craft/space.ts';
import { craftProgram } from '../src/damocles/craftProgram.ts';
import { landingTrigger } from '../src/damocles/spacePolicy.ts';
import { turnOnClock } from '../src/damocles/terminator.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue } from './fixtures/catalogue.ts';

/// The launch, the swing, the space entry, the space pass and the range scan against the traced
/// flights of #558 (ADR 0051: "passes, exact"). Each Golden Trace under `traces/damocles/space/`
/// is exported from the ignored laboratory runs by
/// `research/damocles-st/scripts/space-trace-export.py`.

interface Stop {
  readonly altitude: number;
  readonly arrival: number;
  readonly bodies: number;
  readonly contact: number;
  readonly destination: number;
  readonly dilation: number;
  readonly frame: number;
  readonly hold: number;
  /// The scancode the stop script wrote to the key mailbox. Its handler runs after this
  /// stop's pass, so its words are the next stop's.
  readonly key: number | null;
  /// `$7A22` and `$7A1E`: the last landing point's latitude and longitude.
  readonly latitude: number;
  readonly longitude: number;
  readonly nearest: number;
  readonly occupancy: number;
  readonly panelSpeed: number;
  readonly pitch: number;
  readonly pitchRate: number;
  readonly poseY: number;
  readonly range: number;
  readonly roll: number;
  readonly sines: readonly [number, number, number, number];
  readonly slot: number;
  readonly spaceX: number;
  readonly spaceY: number;
  readonly spaceZ: number;
  readonly speed: number;
  readonly stick: number;
  readonly supported: number;
  readonly supportLevel: number;
  readonly swing: number;
  /// `$79BE`, the terminator word.
  readonly terminator: number;
  readonly throttle: number;
  readonly turnRate: number;
  /// Every Body's rotation accumulator `$62EA`, carried only on the stop before a landing.
  readonly turns?: readonly number[];
  readonly x: number;
  readonly y: number;
  readonly yaw: number;
  readonly z: number;
}

interface Trace {
  /// Each distinct Body table: X, Y, Z and the extent float per Body, by offset ÷ 4.
  readonly bodyTables: readonly (readonly (readonly [
    number,
    number,
    number,
    number
  ])[])[];
  readonly case: string;
  readonly stops: readonly Stop[];
}

const read = async (name: string): Promise<Trace> =>
  (await Bun.file(
    new URL(`../../traces/damocles/space/${name}.json`, import.meta.url)
  ).json()) as Trace;

let catalogue: AssembledCatalogue;
let program: CraftProgram;

beforeAll(async () => {
  catalogue = await loadCatalogue();
  program = craftProgram(catalogue.craft!);
});

const ESC = 0x01;

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

const craftOf = (stop: Stop): CraftState => ({
  contact: stop.contact,
  panelSpeed: stop.panelSpeed,
  pitch: stop.pitch,
  roll: stop.roll,
  speed: stop.speed,
  supported: stop.supported,
  supportLevel: stop.supportLevel,
  swing: stop.swing !== 0,
  throttle: stop.throttle,
  trig: trigOf(stop),
  turnRate: stop.turnRate,
  x: stop.x,
  y: stop.y,
  yaw: stop.yaw,
  z: stop.z
});

const spaceOf = (stop: Stop): SpaceState => ({
  dilation: stop.dilation,
  hold: stop.hold,
  nearest: stop.nearest,
  pitchRate: stop.pitchRate,
  range: stop.range,
  x: stop.spaceX,
  y: stop.spaceY,
  z: stop.spaceZ
});

/// The trace's Body table, with the turns where the stop carries them and the first world's
/// elsewhere: only the landing reads a turn.
const bodiesOf = (trace: Trace, stop: Stop): CraftBody[] =>
  trace.bodyTables[stop.bodies]!.map(([x, y, z, extent], index) => ({
    extent,
    turn: stop.turns?.[index] ?? catalogue.craft!.bodies[index]!.turn,
    x,
    y,
    z
  }));

/// The craft words the probe compares, X and Z masked as the pose copy `$058F64` masks them
/// on a Body.
const craftWords = (state: CraftState | Stop, masked: boolean) => ({
  contact: state.contact,
  pitch: state.pitch,
  roll: state.roll,
  speed: state.speed,
  supported: state.supported,
  throttle: state.throttle,
  turnRate: state.turnRate,
  x: masked ? state.x & 0x0f_ff_ff_ff : state.x,
  y: state.y,
  yaw: state.yaw,
  z: masked ? state.z & 0x0f_ff_ff_ff : state.z
});

const spaceWords = (space: SpaceState) => ({
  dilation: space.dilation,
  hold: space.hold,
  nearest: space.nearest,
  pitchRate: space.pitchRate,
  range: space.range,
  x: space.x,
  y: space.y,
  z: space.z
});

/// A key's handler, after the pass: Esc runs the launch; a throttle key's table entry writes
/// the throttle and clears the swing when it changes it.
const pressed = (
  state: CraftState,
  key: number,
  inSpace: boolean,
  slot: number
): CraftState => {
  if (key === ESC) {
    return launch(program, program.slots[slot]!, state, inSpace).state;
  }
  const entry = program.throttleKeys.find(k => k.scancode === key)!.entry;
  const throttle = throttleForEntry(state, entry, program.constants);
  return throttle === undefined ? state : { ...state, swing: false, throttle };
};

/// Case, and the passes of each kind it holds: on a Body (the swing, the swung climb and any
/// flight after an arrival), in space, and the arrivals. The 2,382 space passes are the note's.
/// `cross` climbs back into space from LACHESIS after its arrival, so its second entry starts
/// from the space position the landing left.
const CASES = [
  ['launch', { arrival: 0, space: 1425, surface: 74 }],
  ['steer', { arrival: 0, space: 325, surface: 74 }],
  ['return', { arrival: 1, space: 50, surface: 348 }],
  ['cross', { arrival: 1, space: 582, surface: 316 }]
] as const;

describe('the launch and space flight replay every traced pass word for word (#558)', () => {
  for (const [name, expected] of CASES) {
    test(name, async () => {
      const trace = await read(name);
      const counts = { arrival: 0, space: 0, surface: 0 };
      for (let i = 0; i + 1 < trace.stops.length; i += 1) {
        const before = trace.stops[i]!;
        const after = trace.stops[i + 1]!;
        const at = `${name} stop ${i}`;
        const craft = craftOf(before);
        // The trig routine runs before the pass from the attitude the last pass left.
        // The yaw is not masked; the sines are read a turn at a time.
        expect(craft.trig, at).toEqual({
          pitch: before.pitch,
          yaw: before.yaw & 0x3_ff
        });
        if (before.occupancy === 0) {
          // The pose copy's float of −Y, which the surface pass reads.
          expect(craftFloat(-before.y), at).toBe(before.altitude);
          const frame = craftFrame(
            program,
            program.slots[before.slot]!,
            craft,
            before.stick,
            NO_BOXES
          );
          let state = frame.state;
          if (before.key !== null) {
            state = pressed(state, before.key, false, before.slot);
          }
          if (frame.outcome === 'space') {
            // The space position is the Body's centre the craft left, 64 up.
            const body = catalogue.craft!.bodies.find(
              item => item.x === before.spaceX && item.z === before.spaceZ
            )!;
            expect(body, at).toBeDefined();
            const entered = enterSpace(
              program,
              state,
              {
                nearest: before.nearest,
                pitchRate: before.pitchRate,
                range: before.range
              },
              body
            );
            expect(after.occupancy, at).toBe(2);
            expect(craftWords(entered.craft, true), at).toEqual(
              craftWords(after, true)
            );
            expect(spaceWords(entered.space), at).toEqual({
              ...spaceWords(spaceOf(after)),
              dilation: 0x20
            });
            expect(entered.craft.swing, at).toBe(false);
          } else {
            expect(frame.outcome, at).toBe('moved');
            expect(after.occupancy, at).toBe(0);
            expect(craftWords(state, true), at).toEqual(
              craftWords(after, true)
            );
            expect(state.panelSpeed, at).toBe(after.panelSpeed);
            expect(state.swing, at).toBe(after.swing !== 0);
          }
          counts.surface += 1;
          continue;
        }
        const frame = spaceFrame(
          program,
          program.slots[0]!,
          craft,
          spaceOf(before),
          before.stick,
          bodiesOf(trace, after)
        );
        if (after.occupancy === 0) {
          // The arrival and, the same frame, the landing `$059268` over the Body it was
          // raised for (#567).
          expect(frame.arrival, at).toBe(after.destination);
          const body = bodiesOf(trace, before)[frame.arrival! / 4]!;
          const point = landingPoint(
            program.arithmetic,
            frame.space,
            body,
            body.turn
          );
          expect(
            {
              latitude: point.latitude,
              longitude: point.longitude,
              terminator: point.terminator
            },
            at
          ).toEqual({
            latitude: after.latitude,
            longitude: after.longitude,
            terminator: after.terminator
          });
          const landed = land(program, frame.craft, point, NO_BOXES);
          expect(craftWords(landed, false), at).toEqual(
            craftWords(after, false)
          );
          expect(landed.supportLevel, at).toBe(after.supportLevel);
          // The space position is the Body's centre, 64 up, for the next space entry.
          expect([after.spaceX, after.spaceY, after.spaceZ], at).toEqual([
            body.x,
            program.constants.spaceY,
            body.z
          ]);
          expect(landingTrigger(frame.arrival!), at).toBe(
            frame.arrival! / 4 + 0x1f
          );
          counts.arrival += 1;
          continue;
        }
        expect(frame.arrival, at).toBeNull();
        let state = frame.craft;
        if (before.key !== null) {
          state = pressed(state, before.key, true, before.slot);
        }
        expect(craftWords(state, true), at).toEqual(craftWords(after, true));
        expect(state.panelSpeed, at).toBe(after.panelSpeed);
        expect(spaceWords(frame.space), at).toEqual(spaceWords(spaceOf(after)));
        counts.space += 1;
      }
      expect(counts).toEqual(expected);
    });
  }
});

/// EAGLE NINE S E airborne over Dion, as `dion-north-airborne` holds it.
const aloft = (): CraftState => ({
  contact: 0,
  panelSpeed: 0,
  pitch: 0x2_5f,
  roll: 0,
  speed: 0x00_06_1a_1a,
  supported: 0,
  supportLevel: 0,
  swing: false,
  throttle: 0x00_06_10_00,
  trig: { pitch: 0x2_5f, yaw: 0 },
  turnRate: 0xff_00_10_00,
  x: 0,
  y: 68_331,
  yaw: 0,
  z: 0
});

describe('the launch gate (#558)', () => {
  test('sets the swing, the reverse throttle and the speed exponent aloft', () => {
    const launched = launch(program, program.slots[3]!, aloft(), false);
    expect(launched.outcome).toBe('launched');
    expect(launched.state.swing).toBe(true);
    expect(launched.state.throttle).toBe(0x00_0e_f0_00);
    expect(launched.state.speed).toBe(0xf0_00_1a_1a);
  });

  test('refuses in contact or in space, silently', () => {
    const grounded = { ...aloft(), contact: 0x3f };
    expect(launch(program, program.slots[3]!, grounded, false).outcome).toBe(
      'ignored'
    );
    expect(launch(program, program.slots[3]!, aloft(), true).outcome).toBe(
      'ignored'
    );
  });

  test('refuses with system string 21 below a ceiling of 100', () => {
    // CONCORD III, slot 10, whose +$1A is 90: the traced `refused-gate` control.
    const refused = launch(program, program.slots[10]!, aloft(), false);
    expect(refused.outcome).toBe('refused');
    expect(refused.state).toEqual(aloft());
  });
});

test('the altitude window in space reads the range ÷ 16,384', () => {
  // docs/research/damocles-panel-aboard.md: `$791C` = `$000B1290` shows `001450`.
  const window = spaceAltitude(program, 0x00_0b_12_90);
  expect(window >>> 16).toBe(0);
  expect(Math.floor(((window & 0xff_ff) * 10_000) / 0x1_00_00)).toBe(1450);
});

describe('the landing (#567)', () => {
  test('carries the destination turn on the clock every Body shares', async () => {
    // Each landing's turns are the first world's plus each rate times one VBL count: solved
    // from the Body the craft left, it gives every other Body's, the destination's included.
    const rates = catalogue.bodies.map(
      body => body.bodySurface?.rotationRate ?? 0
    );
    for (const name of ['return', 'cross']) {
      const stop = (await read(name)).stops.find(item => item.turns)!;
      const from = { rate: rates[4]!, start: catalogue.craft!.bodies[4]!.turn };
      catalogue.craft!.bodies.forEach((body, index) => {
        expect(
          turnOnClock(
            { ...from, turn: stop.turns![4]! },
            { rate: rates[index]!, start: body.turn }
          ),
          `${name} Body ${index}`
        ).toBe(stop.turns![index]!);
      });
    }
    // Eris in the start capture, `eris-spaceport-onfoot`, is 18,111 VBLs after the first world.
    const eris = catalogue.craft!.bodies[11]!;
    expect(
      turnOnClock(
        { rate: rates[11]!, start: eris.turn, turn: eris.turn },
        { rate: rates[11]!, start: eris.turn + rates[11]! * 18_111 }
      )
    ).toBe(eris.turn + rates[11]! * 18_111);
    expect(
      turnOnClock({ rate: 4, start: 0, turn: 2 }, { rate: rates[7]!, start: 0 })
    ).toBeNull();
  });

  test('writes the terminator word every arrival Pose captured', async () => {
    // The comet's capture stood where the impact clock had moved it, not at its Catalogue place.
    const poses = (await arrivalPoses()).poses.filter(
      pose => pose.body !== 'body-29'
    );
    expect(poses).toHaveLength(26);
    for (const pose of poses) {
      const index = Number(pose.body.slice('body-'.length));
      expect(
        subStellarLongitude(
          program.arithmetic,
          catalogue.craft!.bodies[index]!
        ),
        pose.id
      ).toBe(pose.subStellarLongitude);
    }
  });

  test('queues no trigger on ERIS or the comet', () => {
    expect(landingTrigger(11 * 4)).toBeNull();
    expect(landingTrigger(29 * 4)).toBeNull();
    expect(landingTrigger(7 * 4)).toBe(0x26);
  });

  test('never finds a support at the landing height', () => {
    const point = {
      latitude: 0x1_00,
      longitude: 0,
      terminator: 0,
      x: 0x00_10_00_00,
      z: 0x00_10_00_00
    };
    const everywhere = {
      supports: [
        {
          tag: 1,
          x: [0, 0xff_ff] as const,
          y: [0, 0] as const,
          z: [0, 0xff_ff] as const
        }
      ],
      walls: []
    };
    const landed = land(
      program,
      { ...aloft(), contact: 0x3f },
      point,
      everywhere
    );
    expect(landed.y).toBe(0x01_80_00_00);
    expect([landed.contact, landed.supported, landed.supportLevel]).toEqual([
      0, 0, 0
    ]);
  });
});
