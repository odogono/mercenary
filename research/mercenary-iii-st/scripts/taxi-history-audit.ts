import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import type { DionSession } from '../../../web/src/dion/session.ts';
import { loadTourcraftContent } from '../../../web/src/dion/tourcraftContent.ts';
import { TaxiHistoryModel } from './taxi-history-model.ts';

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
const frozen = mkdtempSync(join(tmpdir(), 'mercenary-taxi-history-'));
const sha = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
const pins = {
  'web/src/dion/content.ts':
    '0f512cfd6dc0c270f2a30b374c28eb0696e055867a9f69c754d26994feb0298a',
  'web/src/dion/read.ts':
    '9bb47e2fb7b57cee1d4262bc5298f79cedc2db2b515a5da88798c22d1fbfe3fa',
  'web/src/dion/restore.ts':
    '0048baa6fade40f2fbd1de734a5f76a3562821907aea2dbc2bdee9c9ef146d28',
  'web/src/dion/resume.ts':
    'f8e1bbf84559c8b701d3b0e09119c6cac140f114719c38109053fbc8c7ad2854',
  'web/src/dion/save.ts':
    'd18489f0e36653a6a8b68d2fa7f0d8ecd32620c3d3a718ed5ee14df38a546832',
  'web/src/dion/script.ts':
    '2122c152ee372fb40db58f171e71b02f8f3452e9fc762ac470097fe5a0dc4f6b',
  'web/src/dion/session.ts':
    '311c69efcb87da7d10d66555e4dc922364d355402c755c94af30ede378206832',
  'web/test/dion-controls.ts':
    '6cfebc17d75094ce638fcc98dd5b61deab27ee8b5500d7aba8e19dce19ec9e92'
};
try {
  const archive = spawnSync(
    'git',
    ['archive', 'e4cba434', 'web/src', 'web/test', 'payload/dion', 'web/dion'],
    { cwd: root, maxBuffer: 64 * 1024 * 1024 }
  );
  if (archive.status !== 0) {
    throw new Error(archive.stderr.toString());
  }
  const unpack = spawnSync('tar', ['-xf', '-', '-C', frozen], {
    input: archive.stdout
  });
  if (unpack.status !== 0) {
    throw new Error(unpack.stderr.toString());
  }
  for (const [path, expected] of Object.entries(pins)) {
    if (sha(readFileSync(join(frozen, path))) !== expected) {
      throw new Error(`Changed source: ${path}`);
    }
  }
  const { DionSession: SourceSession } = (await import(
    join(frozen, 'web/src/dion/session.ts')
  )) as typeof import('../../../web/src/dion/session.ts');
  const { dionContent } = (await import(
    join(frozen, 'web/test/dion-documents.ts')
  )) as typeof import('../../../web/test/dion-documents.ts');
  const { dionControlCaptures } = (await import(
    join(frozen, 'web/test/dion-controls.ts')
  )) as typeof import('../../../web/test/dion-controls.ts');
  const codec = (await import(
    join(frozen, 'web/src/dion/save.ts')
  )) as typeof import('../../../web/src/dion/save.ts');
  const resume = (await import(
    join(frozen, 'web/src/dion/resume.ts')
  )) as typeof import('../../../web/src/dion/resume.ts');
  const source = await dionContent();
  const identity = codec.dionRecordIdentity(source);
  if (
    identity.contentSha256 !==
    'c50b402c04c70ab74f95a938c0f867e740ea843157e514764f2bceb84a2f44ed'
  ) {
    throw new Error('Changed source identity');
  }
  const expanded = await loadTourcraftContent(async path => {
    const text = readFileSync(join(root, path.slice(1)), 'utf8');
    return { text, value: JSON.parse(text) };
  });
  const control = dionControlCaptures(source).find(
    c => c.name === 'sp/Start-pre'
  )!;
  const lateFrame = 147_228;
  const finishFrame = lateFrame + 560;
  const histories = [];
  for (const startFrame of [lateFrame - 65_536, lateFrame]) {
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
    const sourceOpcode = n.frame.bind(n);
    n.frame = () => {
      model.frame();
      sourceOpcode();
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
    histories.push({
      encoded,
      launches: model.launches,
      resumeBytes,
      scheduler: structuredClone(model.state),
      snapshot,
      startClock,
      startFrame
    });
  }
  const [early, late] = histories;
  if (
    !early ||
    !late ||
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
  process.stdout.write(
    JSON.stringify(
      {
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
        sourcePins: pins,
        sourceRoundTrips: true,
        sourceSnapshotSha256: sha(JSON.stringify(early.snapshot))
      },
      null,
      2
    ) + '\n'
  );
} finally {
  rmSync(frozen, { force: true, recursive: true });
}
