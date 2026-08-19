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

const IDS = ['surface-walk', 'room-walk', 'craft-1-throttle-ladder'] as const;

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
          parseTrace(await readTraceText('game-core', id), 'game-core', id)
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

const initialCommands = (trace: Trace): TraceValue[] => {
  const scenario = trace.header['scenario'] as TraceObject;
  const commands: TraceValue[] = [];
  if (typeof scenario['craft'] === 'number') {
    commands.push({ board: scenario['craft'] });
  }
  if (typeof scenario['notch'] === 'number') {
    commands.push({ throttle: scenario['notch'] });
  }
  return commands;
};

const replay = (trace: Trace): void => {
  const expected = foldStates(trace);
  const driver = new MoverReplay(bundle, settings, trace.header);
  const dt = trace.header['dt'] as number;
  const setup = initialCommands(trace);
  let setupIndex = 0;
  let nextStep = 0;

  for (const [index, record] of trace.records.entries()) {
    expect(record['step']).toBe(nextStep);
    const command = record['command'];
    if (command !== undefined) {
      expect(record['elapsed']).toBe(driver.elapsed);
      if (record['elapsed'] === 0) {
        expectIdentical(
          setup[setupIndex],
          command,
          `${trace.id} setup command`
        );
        setupIndex++;
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
  expect(setupIndex).toBe(setup.length);
};

describe('the payload this gate runs against', () => {
  test('is the extraction the traces were recorded from', () => {
    for (const trace of traces.values()) {
      expectRecordedPayload(trace, bundle);
    }
  });
});

describe('the game-core Replay Gate', () => {
  test('the three traces are complete and cover their intended outcomes', () => {
    expect([...traces.keys()]).toEqual([...IDS]);
    expect(
      [...traces].map(([id, trace]) => [id, trace.records.length])
    ).toEqual([
      ['surface-walk', 784],
      ['room-walk', 628],
      ['craft-1-throttle-ladder', 725]
    ]);
    const roomWalk = traces.get('room-walk')!;
    expect(JSON.stringify(roomWalk.records)).not.toContain('"arrived"');
    expect(
      roomWalk.records.filter(record => record['events'] !== undefined).length
    ).toBe(2);
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
