import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { Bundle } from '../../src/payload/documents.ts';
import { loadSettings, type Settings } from '../../src/settings/index.ts';
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
import { expectIdentical } from './compare.ts';
import { MoverReplay } from './movers.ts';

/// The Replay Gate protocol both Movers are graded by.
///
/// The flight gate and the game-core gate ask the same four questions of every trace — is the
/// payload the one it was recorded from, were the resolved settings the ones in its header, does
/// the emitter setup reconstruct, and does every recorded step replay bit-for-bit — so the loop
/// that asks them lives once. What genuinely differs between the two gates is only which traces
/// they read and what the emitter's opening command looks like, and those are the parameters.
///
/// Keeping this in one place is not tidiness: a change to the protocol that landed in one copy
/// and not the other would leave a gate quietly comparing less than it claims to, which is the
/// one failure a Replay Gate must not have.

/// The resolved flight settings as a trace header records them.
///
/// `groundAltitude` is the one field whose absence is meaningful — it means "use the captured
/// Reference Build height" — and the Oracle writes that absence as `null`.
export const flightSettingsValue = (
  resolved: Settings['flight']
): TraceValue => ({
  groundAltitude: resolved.groundAltitude ?? null,
  pitchScale: resolved.pitchScale,
  referenceFrameRate: resolved.referenceFrameRate,
  runMultiplier: resolved.runMultiplier,
  speedScale: resolved.speedScale,
  throttleFloorNotch: resolved.throttleFloorNotch,
  turnScale: resolved.turnScale
});

export interface MoverGate {
  /// Extra assertions about the traces as a set — that a run produced no events, say, or stayed
  /// in one Room. Two empty comparisons agreeing would pass silently, so each gate pins what its
  /// scenarios are actually there to demonstrate.
  readonly coverage: (traces: ReadonlyMap<string, Trace>) => void;
  readonly emitter: string;
  readonly ids: readonly string[];
  /// How many records each trace should carry, in `ids` order.
  readonly recordCounts: readonly number[];
  /// The commands the emitter issues before the first step, in order. The flight emitter sends
  /// one combined command and game-core sends up to two, so this is a list either can express.
  readonly setupCommands: (trace: Trace) => TraceValue[];
  /// The name the gate's own `describe` block reads under.
  readonly title: string;
}

export const moverGate = async (gate: MoverGate): Promise<void> => {
  const bundle: Bundle = await loadPayload();
  const settings = loadSettings(
    await Bun.file(join(repositoryRoot, 'settings.json')).text()
  );
  const world = new World(bundle);
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

  const driverFor = (trace: Trace): MoverReplay =>
    new MoverReplay(bundle, world, settings, trace.header);

  const replay = (trace: Trace): void => {
    const expected = foldStates(trace);
    const driver = driverFor(trace);
    const dt = trace.header['dt'] as number;
    const setup = gate.setupCommands(trace);
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
        test('uses the resolved flight settings recorded in its header', () => {
          const recorded = trace.header['settings'] as TraceObject;
          expectIdentical(
            recorded['flight'],
            flightSettingsValue(settings.flight),
            `${id} settings`
          );
        });

        test('reconstructs the emitter setup before the first step', () => {
          expectIdentical(
            trace.header['initial'],
            driverFor(trace).snapshot(),
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
