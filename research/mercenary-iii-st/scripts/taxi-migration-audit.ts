import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  TAXI_SOURCE_PINS,
  TAXI_SOURCE_REVISION,
  withTaxiSource
} from './taxi-source.ts';

// Research-only I2 source audit. No source snapshot/clock injection, expanded
// session implementation, browser storage or runtime/payload mutation.
await withTaxiSource(
  async ({
    root,
    codec,
    resume,
    SourceSession: DionSession,
    dionControlCaptures,
    content
  }) => {
    const { decodeDionRecord, dionRecordIdentity, encodeDionRecord } = codec;
    const { encodeDionResume, readDionResume } = resume;
    const readResume = (encoded: string) =>
      readDionResume(
        {
          getItem: () => encoded,
          removeItem: () => {
            throw new Error('Unexpected source-storage removal');
          },
          setItem: () => {
            throw new Error('Unexpected source-storage write');
          }
        },
        content
      );
    const sha = (path: string) =>
      createHash('sha256')
        .update(readFileSync(join(root, path)))
        .digest('hex');
    const identity = dionRecordIdentity(content);
    if (
      identity.contentSha256 !==
      'c50b402c04c70ab74f95a938c0f867e740ea843157e514764f2bceb84a2f44ed'
    )
      throw new Error('Known I2 content changed');
    const pins = Object.keys(TAXI_SOURCE_PINS);
    const documents = [
      'world',
      'panel',
      'messages',
      'scripts',
      'sound',
      'service'
    ]
      .map(kind => `payload/dion/${kind}.json`)
      .concat('web/dion/metis.json');
    const captures = dionControlCaptures(content);
    if (captures.length !== 33) throw new Error('I2 control matrix changed');
    const controlRoundTrips = captures.map(control => {
      const uninterrupted = new DionSession(content);
      for (const operation of control.operations.slice(0, control.index)) {
        if (operation.kind === 'advance')
          uninterrupted.advance(operation.seconds);
        else if (operation.kind === 'press')
          uninterrupted.press(operation.action);
        else uninterrupted.intent = operation.intent;
      }
      if (!isDeepStrictEqual(uninterrupted.captureResume(), control.record))
        throw new Error(
          `Uninterrupted source replay disagrees: ${control.name}`
        );
      const encoded = encodeDionRecord({
        identity,
        savedAt: '2026-10-02T00:00:00Z',
        schemaVersion: 1,
        snapshot: control.record,
        where: control.name
      });
      const decoded = decodeDionRecord(encoded, identity, content);
      const restored = new DionSession(content, decoded.snapshot);
      const resumed = readResume(encodeDionResume(content, uninterrupted));
      if (
        resumed.reason ||
        !isDeepStrictEqual(restored.captureResume(), control.record) ||
        !isDeepStrictEqual(resumed.session.captureResume(), control.record)
      )
        throw new Error(`Source Save/Resume disagrees: ${control.name}`);
      return {
        name: control.name,
        uninterruptedReplay: true,
        saveRoundTrip: true,
        resumeRoundTrip: true
      };
    });
    const source = captures.find(c => c.name === 'sp/exit-post')!;
    const s = new DionSession(content);
    for (const operation of source.operations) {
      if (operation.kind === 'advance') s.advance(operation.seconds);
      else if (operation.kind === 'press') s.press(operation.action);
      else s.intent = operation.intent;
    }
    if (!isDeepStrictEqual(s.captureResume(), source.record))
      throw new Error('Source replay disagrees');
    s.drainSound();
    const checkpoints: unknown[] = [];
    for (const seconds of [32_520, 61_320]) {
      // Advance from actual opening using normal advance; no clock/state injection.
      while (s.snapshot.clock.day === 0 && s.snapshot.clock.seconds < seconds)
        s.advance(11 / 50);
      const record = s.captureResume();
      const encoded = encodeDionRecord({
        identity,
        savedAt: '2026-10-02T00:00:00Z',
        schemaVersion: 1,
        snapshot: record,
        where: `sp/idle/${seconds}`
      });
      const decoded = decodeDionRecord(encoded, identity, content);
      const restored = new DionSession(content, decoded.snapshot);
      const resume = encodeDionResume(content, s);
      const resumed = readResume(resume);
      if (
        resumed.reason ||
        !isDeepStrictEqual(restored.captureResume(), record) ||
        !isDeepStrictEqual(resumed.session.captureResume(), record)
      )
        throw new Error('Source Save/Resume round trip disagrees');
      checkpoints.push({
        seconds,
        sourceSnapshotSha256: createHash('sha256')
          .update(JSON.stringify(record))
          .digest('hex'),
        tick: record.snapshot.tick,
        frame: record.snapshot.frame,
        frameCounter: record.snapshot.frameCounter,
        remainder: record.remainder,
        clock: record.snapshot.clock,
        cash: record.snapshot.cash,
        cell: record.snapshot.cell,
        passenger: record.snapshot.taxi.passenger,
        pending: record.snapshot.pending,
        flagsSet: record.snapshot.narrative.flags.flatMap((on, i) =>
          on ? [i] : []
        ),
        pc: record.snapshot.narrative.pc,
        stack: record.snapshot.narrative.stack,
        queued: record.snapshot.narrative.queued,
        timed: record.snapshot.narrative.timed,
        available: record.snapshot.narrative.available,
        messageSerial: record.snapshot.narrative.message.serial,
        messageBusy: record.snapshot.narrative.message.busy,
        sound: record.snapshot.sound,
        phase: record.snapshot.phase,
        saveRoundTrip: true,
        resumeRoundTrip: true
      });
      s.drainSound();
    }
    const base = {
      identity,
      savedAt: '2026-10-02T00:00:00Z',
      schemaVersion: 1,
      snapshot: source.record,
      where: source.name
    };
    const validatorCases: Record<string, boolean | string> = {};
    const cases: Record<string, (r: typeof base) => void> = {
      flag10: r => {
        (r.snapshot.snapshot.narrative.flags as boolean[])[10] = true;
      },
      flag22: r => {
        (r.snapshot.snapshot.narrative.flags as boolean[])[22] = true;
      },
      duplicateAvailable: r => {
        (r.snapshot.snapshot.narrative.available as number[]).push(
          r.snapshot.snapshot.narrative.available[0]!
        );
      },
      clockMismatch: r => {
        (r.snapshot.snapshot.clock as { seconds: number }).seconds = 86_399;
      },
      unknownScriptPc: r => {
        (r.snapshot.snapshot.narrative as { pc: number }).pc = 12;
      },
      negativeTaxiProgress: r => {
        (r.snapshot.snapshot.taxi as { progress: number }).progress = -1;
      },
      wrongContent: r => {
        (r.identity as { contentSha256: string }).contentSha256 = '0'.repeat(
          64
        );
      }
    };
    for (const [name, mutate] of Object.entries(cases)) {
      const r = structuredClone(base);
      mutate(r);
      try {
        decodeDionRecord(JSON.stringify(r), identity, content);
        validatorCases[name] = true;
      } catch (error) {
        validatorCases[name] =
          error instanceof Error ? error.message : String(error);
      }
    }
    console.log(
      JSON.stringify(
        {
          identity,
          sourceRevision: TAXI_SOURCE_REVISION,
          controlRoundTrips,
          schemaVersion: 1,
          validators: Object.fromEntries(pins.map(path => [path, sha(path)])),
          documents: Object.fromEntries(
            documents.map(path => [
              path,
              {
                bytes: readFileSync(join(root, path)).length,
                sha256: sha(path)
              }
            ])
          ),
          controls: captures.map(c => c.name),
          source: source.name,
          checkpoints,
          validatorCases
        },
        null,
        2
      )
    );
  }
);
