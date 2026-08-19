import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { BensonProgram, BensonSession } from '../../src/benson/index.ts';
import type { Bundle } from '../../src/payload/documents.ts';
import {
  bensonTunables,
  flightModel,
  loadSettings,
  type Settings
} from '../../src/settings/index.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent
} from '../../src/session/index.ts';
import { TextTable } from '../../src/text/index.ts';
import {
  foldStates,
  parseTrace,
  type Trace,
  type TraceObject
} from '../../src/trace/index.ts';
import { World } from '../../src/world/index.ts';
import {
  expectRecordedPayload,
  loadPayload,
  readTraceText,
  repositoryRoot
} from './artifacts.ts';
import { scriptSettingsValue } from './bensonGate.ts';
import { expectIdentical } from './compare.ts';
import { flightSettingsValue } from './moverGate.ts';
import {
  eventValue,
  intentFromRecord,
  keyFromCommand,
  snapshotValue
} from './sessionReplay.ts';

export interface SessionGate {
  readonly coverage: (traces: ReadonlyMap<string, Trace>) => void;
  readonly ids: readonly string[];
  readonly recordCounts: readonly number[];
  readonly title: string;
}

const scriptAndMessageSettings = (resolved: Settings) => ({
  flight: flightSettingsValue(resolved.flight),
  ...scriptSettingsValue(resolved)
});

export const sessionGate = async (gate: SessionGate): Promise<void> => {
  const bundle: Bundle = await loadPayload();
  const settings = loadSettings(
    await Bun.file(join(repositoryRoot, 'settings.json')).text()
  );
  const world = new World(bundle);
  if (bundle.benson === undefined || bundle.text === undefined) {
    throw new Error('the Data Payload carries no scripts');
  }
  if (bundle.flight === undefined) {
    throw new Error('the Data Payload carries no flight document');
  }
  const program = BensonProgram.fromDocument(bundle.benson);
  const text = new TextTable(bundle.text);
  const flight = flightModel(
    settings.flight,
    bundle.flight,
    world.groundExtent
  );

  const traces = new Map(
    await Promise.all(
      gate.ids.map(
        async id =>
          [
            id,
            parseTrace(await readTraceText('session', id), 'session', id)
          ] as const
      )
    )
  );

  const sessionFor = (trace: Trace): GameplaySession => {
    const scenario = trace.header['scenario'] as TraceObject;
    const timeScale = scenario['timeScale'] as number | null;
    const tunables = bensonTunables(settings, program.framesPerTick);
    const scripts = new BensonSession(
      program,
      text,
      timeScale === null ? tunables : { ...tunables, timeScale }
    );
    const session = new GameplaySession(
      sessionContent(world, bundle, flight),
      openingPlayer(),
      scripts
    );
    const script = scenario['script'] as number;
    if (!session.start(script)) {
      throw new Error(`script ${script} would not start`);
    }
    return session;
  };

  const replay = (trace: Trace): void => {
    const expected = foldStates(trace);
    const session = sessionFor(trace);
    const scenario = trace.header['scenario'] as TraceObject;
    const walkTo = scenario['walkTo'];
    const take = scenario['take'] === true;
    const dt = trace.header['dt'] as number;
    let reached = typeof walkTo !== 'number';
    let nextStep = 0;

    for (const [index, record] of trace.records.entries()) {
      expect(record['step']).toBe(nextStep);
      const command = record['command'];
      if (command !== undefined) {
        const press = (command as TraceObject)['press'];
        if (press !== undefined) {
          session.press(keyFromCommand(press));
        }
        const craft = (command as TraceObject)['board'];
        if (typeof craft === 'number') {
          session.board(craft);
        }
        continue;
      }

      if (typeof walkTo === 'number' && !reached) {
        const { outcome } = session.reach(take ? 'take' : 'board', walkTo);
        if (outcome.kind !== 'nothingInReach') {
          reached = true;
        }
      }

      const input = record['input'] as TraceObject;
      session.intent = intentFromRecord(input);
      const { events, snapshot } = session.advance(dt);
      expectIdentical(
        record['elapsed'],
        snapshot.elapsed,
        `${trace.id} elapsed ${nextStep}`
      );
      expectIdentical(
        expected[index],
        snapshotValue(snapshot, session.game),
        `${trace.id} step ${nextStep}`
      );
      expectIdentical(
        record['events'],
        events.length === 0 ? undefined : events.map(eventValue),
        `${trace.id} events ${nextStep}`
      );
      nextStep += 1;
    }
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
        test('uses the resolved settings recorded in its header', () => {
          expectIdentical(
            trace.header['settings'],
            scriptAndMessageSettings(settings),
            `${id} settings`
          );
        });

        test('reconstructs the emitter setup before the first step', () => {
          const session = sessionFor(trace);
          expectIdentical(
            trace.header['initial'],
            snapshotValue(session.snapshot, session.game),
            `${id} initial`
          );
        });

        test('replays every recorded input and output bit-for-bit', () => {
          replay(trace);
        });
      });
    }
  });
};
