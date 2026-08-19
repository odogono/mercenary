import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { Bundle } from '../src/payload/documents.ts';
import { loadSettings, type Settings } from '../src/settings/index.ts';
import {
  expectRecordedPayload,
  loadPayload,
  readTraceText,
  repositoryRoot
} from './replay/artifacts.ts';
import { expectIdentical } from './replay/compare.ts';
import { MoverReplay } from './replay/movers.ts';
import {
  foldStates,
  parseTrace,
  type Trace,
  type TraceObject,
  type TraceValue
} from './replay/trace.ts';

const IDS = [
  'craft-0-standard',
  'craft-1-standard',
  'craft-1-poweramp',
  'craft-2-sinking',
  'craft-3-standard',
  'craft-4-standard',
  'craft-5-sinking',
  'craft-6-standard',
  'craft-7-slot7'
] as const;

const bundle: Bundle = await loadPayload();
const settings = loadSettings(
  await Bun.file(join(repositoryRoot, 'settings.json')).text()
);
const traces = new Map(
  await Promise.all(
    IDS.map(
      async id =>
        [
          id,
          parseTrace(await readTraceText('flight', id), 'flight', id)
        ] as const
    )
  )
);

const flightSettingsValue = (resolved: Settings['flight']): TraceValue => ({
  groundAltitude: resolved.groundAltitude ?? null,
  pitchScale: resolved.pitchScale,
  referenceFrameRate: resolved.referenceFrameRate,
  runMultiplier: resolved.runMultiplier,
  speedScale: resolved.speedScale,
  throttleFloorNotch: resolved.throttleFloorNotch,
  turnScale: resolved.turnScale
});

const initialCommand = (trace: Trace): TraceValue => {
  const scenario = trace.header['scenario'] as TraceObject;
  return {
    board: scenario['craft']!,
    poweramp: scenario['poweramp']!,
    throttle: scenario['notch']!
  };
};

const replay = (trace: Trace): void => {
  const expected = foldStates(trace);
  const driver = new MoverReplay(bundle, settings, trace.header);
  const dt = trace.header['dt'] as number;
  let sawSetup = false;
  let nextStep = 0;

  for (const [index, record] of trace.records.entries()) {
    expect(record['step']).toBe(nextStep);
    const command = record['command'];
    if (command !== undefined) {
      expect(record['elapsed']).toBe(driver.elapsed);
      if (record['elapsed'] === 0) {
        expectIdentical(
          initialCommand(trace),
          command,
          `${trace.id} setup command`
        );
        sawSetup = true;
      } else {
        driver.applyCommand(command as TraceObject);
      }
      continue;
    }

    const events = driver.advance(record['input'] as TraceObject, dt);
    expectIdentical(
      record['elapsed'],
      driver.elapsed,
      `${trace.id} elapsed ${nextStep}`
    );
    expectIdentical(
      expected[index],
      driver.snapshot(),
      `${trace.id} step ${nextStep}`
    );
    expectIdentical(
      record['events'],
      events.length === 0 ? undefined : events,
      `${trace.id} events ${nextStep}`
    );
    nextStep++;
  }
  expect(sawSetup).toBeTrue();
};

describe('the payload this gate runs against', () => {
  test('is the extraction the traces were recorded from', () => {
    for (const trace of traces.values()) {
      expectRecordedPayload(trace, bundle);
    }
  });
});

describe('the flight Replay Gate', () => {
  test('the nine traces are complete and cover the intended outcomes', () => {
    expect([...traces.keys()]).toEqual([...IDS]);
    expect(
      [...traces].map(([id, trace]) => [id, trace.records.length])
    ).toEqual([
      ['craft-0-standard', 530],
      ['craft-1-standard', 811],
      ['craft-1-poweramp', 563],
      ['craft-2-sinking', 1802],
      ['craft-3-standard', 440],
      ['craft-4-standard', 1102],
      ['craft-5-sinking', 1802],
      ['craft-6-standard', 563],
      ['craft-7-slot7', 563]
    ]);
    // Two empty event lists agreeing would pass silently, so pin that both sinking runs
    // genuinely contain no events and never report a touchdown.
    for (const id of ['craft-2-sinking', 'craft-5-sinking'] as const) {
      const records = traces.get(id)!.records;
      expect(
        records.some(record => record['events'] !== undefined)
      ).toBeFalse();
      expect(JSON.stringify(records)).not.toContain('"touchdown"');
    }
  });

  for (const id of IDS) {
    const trace = traces.get(id)!;
    describe(id, () => {
      test('uses the resolved flight settings recorded in its header', () => {
        const recorded = trace.header['settings'] as TraceObject;
        expectIdentical(
          recorded['flight'],
          flightSettingsValue(settings.flight),
          `${id} settings`
        );
      });

      test('reconstructs the emitter setup before the first step', () => {
        const driver = new MoverReplay(bundle, settings, trace.header);
        expectIdentical(
          trace.header['initial'],
          driver.snapshot(),
          `${id} initial`
        );
      });

      test('replays every recorded input and output bit-for-bit', () => {
        replay(trace);
      });
    });
  }
});
