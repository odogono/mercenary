import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
  BensonProgram,
  BensonSession,
  DEFAULT_SESSION_SEED
} from '../../src/benson/index.ts';
import type { Bundle } from '../../src/payload/documents.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent
} from '../../src/session/index.ts';
import {
  bensonTunables,
  flightModel,
  loadSettings,
  type Settings
} from '../../src/settings/index.ts';
import { TextTable } from '../../src/text/index.ts';
import {
  foldStates,
  parseTrace,
  type Trace,
  type TraceObject,
  type TraceValue
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
  traceOracleRoom255Slots,
  traceOracleSnapshotValue
} from './sessionReplay.ts';

export interface GameplaySessionGateContext {
  readonly createSession: (options?: {
    readonly randomSeed?: bigint;
    readonly timeScale?: number;
  }) => GameplaySession;
  readonly world: World;
}

export interface GameplaySessionTraceSet {
  readonly coverage: (traces: ReadonlyMap<string, Trace>) => void;
  readonly ids: readonly string[];
  readonly recordCounts: readonly number[];
  readonly title: string;
}

export interface GameplaySessionGate extends GameplaySessionTraceSet {
  readonly applyCommand: (
    session: GameplaySession,
    command: TraceValue
  ) => TraceValue | void;
  readonly createSession: (
    context: GameplaySessionGateContext,
    trace: Trace
  ) => GameplaySession;
  readonly emitter: string;
  readonly prepareSteps?: (
    session: GameplaySession,
    trace: Trace
  ) => (() => void) | undefined;
}

const recordedSettings = (resolved: Settings) => ({
  flight: flightSettingsValue(resolved.flight),
  ...scriptSettingsValue(resolved)
});

/// Grade one emitter that drives the complete Gameplay Session.
///
/// Session composition, evidence checks, and the exact step protocol live here. The focused
/// emitter adapters supply only the setup and commands their Trace Oracle driver records, so a
/// new command cannot be accepted by one gate merely because another gate understands it.
export const gameplaySessionGate = async (
  gate: GameplaySessionGate
): Promise<void> => {
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
  const context: GameplaySessionGateContext = {
    createSession: options => {
      const tunables = bensonTunables(settings, program.framesPerTick);
      const randomSeed = options?.randomSeed ?? DEFAULT_SESSION_SEED;
      const scripts = new BensonSession(
        program,
        text,
        options?.timeScale === undefined
          ? tunables
          : { ...tunables, timeScale: options.timeScale },
        randomSeed
      );
      return new GameplaySession(
        sessionContent(world, bundle, flight),
        openingPlayer(),
        scripts,
        randomSeed
      );
    },
    world
  };

  const traces = new Map(
    await Promise.all(
      gate.ids.map(
        async id =>
          [
            id,
            parseTrace(await readTraceText(gate.emitter, id), gate.emitter, id)
          ] as const
      )
    )
  );

  const replay = (trace: Trace): void => {
    const expected = foldStates(trace);
    const session = gate.createSession(context, trace);
    const legacyRoom255Slots = traceOracleRoom255Slots(session.content.objects);
    const beforeStep = gate.prepareSteps?.(session, trace);
    const dt = trace.header['dt'] as number;
    let nextStep = 0;

    for (const [index, record] of trace.records.entries()) {
      expect(record['step']).toBe(nextStep);
      const command = record['command'];
      if (command !== undefined) {
        expectIdentical(
          record['elapsed'],
          session.snapshot.elapsed,
          `${trace.id} command elapsed ${nextStep}`
        );
        const outcome = gate.applyCommand(session, command);
        expectIdentical(
          record['outcome'],
          outcome as TraceValue | undefined,
          `${trace.id} command outcome ${nextStep}`
        );
        continue;
      }

      beforeStep?.();
      session.intent = intentFromRecord(record['input'] as TraceObject);
      const { events, snapshot } = session.advance(dt);
      expectIdentical(
        record['elapsed'],
        snapshot.elapsed,
        `${trace.id} elapsed ${nextStep}`
      );
      expectIdentical(
        expected[index],
        traceOracleSnapshotValue(snapshot, legacyRoom255Slots),
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

  describe(`the payload the ${gate.emitter} gate runs against`, () => {
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
            recordedSettings(settings),
            `${id} settings`
          );
        });

        test('reconstructs the emitter setup before the first step', () => {
          const session = gate.createSession(context, trace);
          const legacyRoom255Slots = traceOracleRoom255Slots(
            session.content.objects
          );
          expectIdentical(
            trace.header['initial'],
            traceOracleSnapshotValue(session.snapshot, legacyRoom255Slots),
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
