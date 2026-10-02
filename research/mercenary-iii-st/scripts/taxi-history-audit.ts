import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import type { DionSession } from '../../../web/src/dion/session.ts';
import { loadTourcraftContent } from '../../../web/src/dion/tourcraftContent.ts';
import { taxiCanonicalStartFrames } from './taxi-canonical-reference.ts';
import { TaxiHistoryModel } from './taxi-history-model.ts';
import {
  TAXI_SOURCE_PINS,
  TAXI_SOURCE_REVISION,
  withTaxiSource
} from './taxi-source.ts';

const advanceTicks = (session: DionSession, count: number): void => {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('Nonintegral input duration');
  }
  for (let tick = 0; tick < count; tick++) {
    session.advance(1 / 50);
  }
  session.drainSound();
};

// Ordinary I2 simulation inputs; no clock/pose/Save injection or browser storage.
// Freeze the source code, then independently observe the documented R6 scheduler.
const root = join(import.meta.dir, '../../..');
const sha = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
await withTaxiSource(
  async ({
    SourceSession,
    content: source,
    dionControlCaptures,
    codec,
    resume
  }) => {
    const identity = codec.dionRecordIdentity(source);
    const expanded = await loadTourcraftContent(async path => {
      const text = readFileSync(join(root, path.slice(1)), 'utf8');
      return { text, value: JSON.parse(text) };
    });
    const control = dionControlCaptures(source).find(
      c => c.name === 'sp/Start-pre'
    )!;
    const lateFrame = 147_228;
    const finishFrame = lateFrame + 560;
    const replay = (startFrame: number) => {
      const session = new SourceSession(source);
      const model = new TaxiHistoryModel(
        expanded.legacy,
        expanded.programmes,
        expanded.gameplay.initial
      );
      // Observational wrappers leave all original source method results/state intact.
      const observed = session as unknown as {
        frame(): void;
        narrative: {
          frame(): void;
          idMessage(id: number): boolean;
          start(id: number): boolean;
          tick(): void;
          state: { wait: number };
        };
      };
      const n = observed.narrative;
      const sourceTick = n.tick.bind(n);
      n.tick = () => {
        model.tick();
        sourceTick();
      };
      const sourceFrame = observed.frame.bind(session);
      observed.frame = () => {
        model.beforeInput(session.snapshot.clock.seconds);
        sourceFrame();
      };
      let lastResetTick = -1;
      const sourceOpcode = n.frame.bind(n);
      n.frame = () => {
        model.frame();
        const oldWait = n.state.wait;
        sourceOpcode();
        if (oldWait !== 0 && n.state.wait === 0) {
          lastResetTick = session.snapshot.tick;
        }
      };
      const sourceStart = n.start.bind(n);
      n.start = id => {
        model.start(id);
        return sourceStart(id);
      };
      const sourceMessage = n.idMessage.bind(n);
      n.idMessage = id => {
        model.idMessage(id);
        return sourceMessage(id);
      };
      for (const operation of control.operations.slice(0, control.index)) {
        if (operation.kind === 'advance') {
          advanceTicks(session, Math.round(operation.seconds * 50));
        } else if (operation.kind === 'press') {
          session.press(operation.action);
        } else {
          session.intent = operation.intent;
        }
      }
      advanceTicks(session, startFrame * 11 - session.snapshot.tick);
      const startClock = session.snapshot.clock.seconds;
      session.press('star');
      advanceTicks(session, finishFrame * 11 - session.snapshot.tick);
      if (
        session.snapshot.taxi.counter !== 2 ||
        session.snapshot.taxi.destination !== 0
      ) {
        throw new Error('Taxi has not completed');
      }
      session.press('leave');
      advanceTicks(session, 11);
      const snapshot = session.captureResume();
      const encoded = codec.encodeDionRecord({
        identity,
        savedAt: '2026-10-02T00:00:00Z',
        schemaVersion: 1,
        snapshot,
        where: 'sp/history-collision'
      });
      const decoded = codec.decodeDionRecord(encoded, identity, source);
      const restored = new SourceSession(source, decoded.snapshot);
      const resumeBytes = resume.encodeDionResume(source, session);
      const resumed = resume.readDionResume(
        {
          getItem: () => resumeBytes,
          removeItem: () => {
            throw new Error('Unexpected source-storage removal');
          },
          setItem: () => {
            throw new Error('Unexpected source-storage write');
          }
        },
        source
      );
      if (
        resumed.reason ||
        !isDeepStrictEqual(restored.captureResume(), snapshot) ||
        !isDeepStrictEqual(resumed.session.captureResume(), snapshot)
      ) {
        throw new Error('Invalid source round trip');
      }
      return {
        session,
        model,
        lastResetTick,
        encoded,
        launches: structuredClone(model.launches),
        resumeBytes,
        scheduler: structuredClone(model.state),
        snapshot,
        startClock,
        startFrame
      };
    };
    // Generate an ordinary source once. Candidate selection subsequently uses
    // only its validated state and this fixed, source-pinned replay family.
    const primary = replay(lateFrame);
    const state = codec.decodeDionRecord(primary.encoded, identity, source)
      .snapshot.snapshot;
    const resetOffsetFrames = primary.lastResetTick / 11 - primary.startFrame;
    if (resetOffsetFrames !== 484) {
      throw new Error('Single-trip wait-reset calibration changed');
    }
    const candidates = taxiCanonicalStartFrames(
      state.tick,
      state.frame,
      state.narrative.wait,
      resetOffsetFrames,
      control.record.snapshot.frame
    );
    const histories = candidates.map(start =>
      start === lateFrame ? primary : replay(start)
    );
    const [canonical, early, late] = histories;
    if (
      !canonical ||
      !early ||
      !late ||
      !isDeepStrictEqual(canonical.snapshot, early.snapshot) ||
      canonical.encoded !== early.encoded ||
      !isDeepStrictEqual(early.snapshot, late.snapshot) ||
      early.encoded !== late.encoded ||
      !isDeepStrictEqual(
        { ...JSON.parse(early.resumeBytes), savedAt: null },
        { ...JSON.parse(late.resumeBytes), savedAt: null }
      )
    ) {
      throw new Error('Source records do not collide');
    }
    if (
      early.scheduler.pc !== null ||
      early.scheduler.lastEncounterRequest !== 0xff_db ||
      late.scheduler.pc !== 0x7_5a_09 ||
      late.scheduler.lastEncounterRequest !== 0
    ) {
      throw new Error('Scheduler witness changed');
    }
    if (
      !histories.every(
        h =>
          h.lastResetTick / 11 - h.startFrame === resetOffsetFrames &&
          isDeepStrictEqual(h.snapshot, primary.snapshot) &&
          isDeepStrictEqual(
            { ...JSON.parse(h.resumeBytes), savedAt: null },
            { ...JSON.parse(primary.resumeBytes), savedAt: null }
          )
      )
    ) {
      throw new Error(
        'A timing candidate is not a complete source-matching history'
      );
    }
    // Independently replay the selected reference again without restoration.
    // Compare reconstructed scheduler state and identical later inputs to that
    // uninterrupted reference, keeping this VM-only proof explicitly bounded.
    const reference = replay(canonical.startFrame);
    for (let tick = 0; tick <= 600 * 11; tick++) {
      if (
        !isDeepStrictEqual(canonical.model.state, reference.model.state) ||
        !isDeepStrictEqual(
          canonical.model.requests,
          reference.model.requests
        ) ||
        !isDeepStrictEqual(
          canonical.session.captureResume(),
          reference.session.captureResume()
        )
      ) {
        throw new Error(`Canonical replay future differs at tick ${tick}`);
      }
      if (tick !== 600 * 11) {
        advanceTicks(canonical.session, 1);
        advanceTicks(reference.session, 1);
      }
    }
    process.stdout.write(
      JSON.stringify(
        {
          canonicalReplay: {
            resetOffsetFrames,
            fullStateMatchRequired: true,
            metadataUsedForSelection: false,
            laterInputTicksCompared: 600 * 11,
            candidateStartFrames: histories.map(h => h.startFrame),
            rule: 'Earliest Start among complete source-matching replays of the retained single-trip prefix, fixed final Leave and one-tick call schedule.',
            selectedStartFrame: canonical.startFrame,
            matchesEarlierScheduler: isDeepStrictEqual(
              canonical.scheduler,
              early.scheduler
            ),
            limit:
              'Finite single-trip reference family only; no universal source eligibility, full expanded state construction or browser migration proof.'
          },
          expandedContentSha256: expanded.contentSha256,
          histories: histories.map(h => ({
            launches: h.launches,
            scheduler: {
              ...h.scheduler,
              flags: undefined,
              flagsSet: h.scheduler.flags.flatMap((on, index) =>
                on ? [index] : []
              )
            },
            startClock: h.startClock,
            startFrame: h.startFrame
          })),
          identicalResumeStateAndIdentityIgnoringWallTimeMetadata: true,
          identicalSaveBytes: true,
          identicalSourceSnapshots: true,

          limit:
            'Independent R6 scheduler witness, not a complete expanded runtime, original-engine flight, or production-browser comparison.',
          saveBytesSha256: sha(early.encoded),
          schemaVersion: 1,
          source: {
            cash: early.snapshot.snapshot.cash,
            clock: early.snapshot.snapshot.clock,
            frame: early.snapshot.snapshot.frame,
            pc: early.snapshot.snapshot.narrative.pc,
            tick: early.snapshot.snapshot.tick,
            wait: early.snapshot.snapshot.narrative.wait
          },
          sourceIdentity: identity,
          sourcePins: TAXI_SOURCE_PINS,
          sourceRevision: TAXI_SOURCE_REVISION,
          sourceRoundTrips: true,
          sourceSnapshotSha256: sha(JSON.stringify(early.snapshot))
        },
        null,
        2
      ) + '\n'
    );
  }
);
