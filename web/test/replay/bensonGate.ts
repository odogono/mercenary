import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { loadSettings, type Settings } from '../../src/settings/index.ts';
import { TextTable } from '../../src/text/index.ts';
import {
  parseTrace,
  type Trace,
  type TraceObject,
  type TraceValue
} from '../../src/trace/index.ts';
import {
  BensonProgram,
  ORACLE_TIME_SCALE,
  bensonTunables
} from '../oracle/index.ts';
import {
  expectRecordedPayload,
  loadPayload,
  readTraceText,
  repositoryRoot
} from './artifacts.ts';
import {
  emitRecords,
  prepareSession,
  scenarioFromHeader,
  sessionSnapshot
} from './bensonReplay.ts';
import { expectIdentical } from './compare.ts';

export const scriptSettingsValue = (resolved: Settings) => ({
  message: {
    charactersPerSecond: 2,
    holdSeconds: resolved.message.holdSeconds
  },
  scripts: {
    instructionBudget: resolved.scripts.instructionBudget,
    timeScale: ORACLE_TIME_SCALE
  }
});

export const tunablesValue = (
  settings: Settings,
  framesPerTick: number,
  timeScale: number | null
): TraceValue => {
  const tunables = bensonTunables(settings, framesPerTick);
  return {
    framesPerSecond: tunables.framesPerSecond,
    framesPerTick: tunables.framesPerTick,
    instructionBudget: tunables.instructionBudget,
    messageCharactersPerSecond: 2,
    messageHoldSeconds: tunables.messageHoldSeconds,
    timeScale: timeScale ?? tunables.timeScale
  };
};

export interface BensonGate {
  readonly coverage: (traces: ReadonlyMap<string, Trace>) => void;
  readonly ids: readonly string[];
  readonly recordCounts: readonly number[];
  readonly title: string;
}

export const bensonGate = async (gate: BensonGate): Promise<void> => {
  const bundle = await loadPayload();
  const settings = loadSettings(
    await Bun.file(join(repositoryRoot, 'settings.json')).text()
  );
  if (bundle.benson === undefined || bundle.text === undefined) {
    throw new Error('the Data Payload carries no scripts');
  }
  const program = BensonProgram.fromDocument(bundle.benson);
  const text = new TextTable(bundle.text);

  const traces = new Map(
    await Promise.all(
      gate.ids.map(
        async id =>
          [
            id,
            parseTrace(await readTraceText('benson', id), 'benson', id)
          ] as const
      )
    )
  );

  const sessionFor = (trace: Trace) => {
    const scenario = scenarioFromHeader(trace.header);
    const tunables = bensonTunables(settings, program.framesPerTick);
    return prepareSession(
      program,
      text,
      scenario.timeScale === null
        ? tunables
        : { ...tunables, timeScale: scenario.timeScale },
      scenario
    );
  };

  describe('the payload this gate runs against', () => {
    test('is the extraction the traces were recorded from', () => {
      for (const trace of traces.values()) {
        expectRecordedPayload(trace, bundle);
      }
    });
  });

  describe(gate.title, () => {
    test('the traces are complete and cover their intended outcomes', () => {
      expect([...traces.keys()]).toEqual([...gate.ids]);
      expect([...traces].map(([, trace]) => trace.records.length)).toEqual([
        ...gate.recordCounts
      ]);
      gate.coverage(traces);
    });

    for (const id of gate.ids) {
      const trace = traces.get(id)!;
      describe(id, () => {
        test('uses the resolved script settings recorded in its header', () => {
          const recorded = trace.header['settings'] as TraceObject;
          expectIdentical(
            recorded,
            scriptSettingsValue(settings),
            `${id} settings`
          );
        });

        test('uses the resolved tunables recorded in its header', () => {
          const scenario = scenarioFromHeader(trace.header);
          expectIdentical(
            trace.header['tunables'],
            tunablesValue(settings, program.framesPerTick, scenario.timeScale),
            `${id} tunables`
          );
        });

        test('reconstructs the emitter setup before the first step', () => {
          expectIdentical(
            trace.header['initial'],
            sessionSnapshot(sessionFor(trace)),
            `${id} initial`
          );
        });

        test('replays every recorded input and output bit-for-bit', () => {
          const scenario = scenarioFromHeader(trace.header);
          const session = sessionFor(trace);
          const dt = trace.header['dt'] as number;
          const actual = emitRecords(session, scenario, dt);
          expectIdentical(trace.records as TraceValue, actual, `${id} records`);
        });
      });
    }
  });
};
