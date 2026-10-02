import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  encodeDionResume,
  readDionResume
} from '../../../web/src/dion/resume.ts';
import {
  decodeDionRecord,
  dionRecordIdentity,
  encodeDionRecord
} from '../../../web/src/dion/save.ts';
import { DionSession } from '../../../web/src/dion/session.ts';
import { dionControlCaptures } from '../../../web/test/dion-controls.ts';
import { dionContent } from '../../../web/test/dion-documents.ts';

// Research-only I2 source audit. No source snapshot/clock injection, expanded
// session implementation, browser storage or runtime/payload mutation.
const root = join(import.meta.dir, '../../..');
const sha = (path: string) =>
  createHash('sha256')
    .update(readFileSync(join(root, path)))
    .digest('hex');
const content = await dionContent();
const identity = dionRecordIdentity(content);
if (
  identity.contentSha256 !==
  'c50b402c04c70ab74f95a938c0f867e740ea843157e514764f2bceb84a2f44ed'
)
  throw new Error('Known I2 content changed');
for (const [path, expected] of Object.entries({
  'web/src/dion/save.ts':
    'd18489f0e36653a6a8b68d2fa7f0d8ecd32620c3d3a718ed5ee14df38a546832',
  'web/src/dion/restore.ts':
    '0048baa6fade40f2fbd1de734a5f76a3562821907aea2dbc2bdee9c9ef146d28',
  'web/src/dion/read.ts':
    '9bb47e2fb7b57cee1d4262bc5298f79cedc2db2b515a5da88798c22d1fbfe3fa',
  'web/src/dion/session.ts':
    '311c69efcb87da7d10d66555e4dc922364d355402c755c94af30ede378206832',
  'web/src/dion/script.ts':
    '2122c152ee372fb40db58f171e71b02f8f3452e9fc762ac470097fe5a0dc4f6b',
  'web/src/dion/content.ts':
    '0f512cfd6dc0c270f2a30b374c28eb0696e055867a9f69c754d26994feb0298a',
  'web/src/dion/resume.ts':
    'f8e1bbf84559c8b701d3b0e09119c6cac140f114719c38109053fbc8c7ad2854',
  'web/test/dion-controls.ts':
    '6cfebc17d75094ce638fcc98dd5b61deab27ee8b5500d7aba8e19dce19ec9e92'
}))
  if (sha(path) !== expected)
    throw new Error(`Known I2 validator changed: ${path}`);
const pins = [
  'web/src/dion/save.ts',
  'web/src/dion/restore.ts',
  'web/src/dion/read.ts',
  'web/src/dion/session.ts',
  'web/src/dion/script.ts',
  'web/src/dion/content.ts',
  'web/src/dion/resume.ts',
  'web/test/dion-controls.ts'
];
const documents = ['world', 'panel', 'messages', 'scripts', 'sound', 'service']
  .map(kind => `payload/dion/${kind}.json`)
  .concat('web/dion/metis.json');
const captures = dionControlCaptures(content);
if (captures.length !== 33) throw new Error('I2 control matrix changed');
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
  const resumed = readDionResume({ getItem: () => resume }, content);
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
    (r.identity as { contentSha256: string }).contentSha256 = '0'.repeat(64);
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
      schemaVersion: 1,
      validators: Object.fromEntries(pins.map(path => [path, sha(path)])),
      documents: Object.fromEntries(
        documents.map(path => [
          path,
          { bytes: readFileSync(join(root, path)).length, sha256: sha(path) }
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
