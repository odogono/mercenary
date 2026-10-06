import {
  createSessionResumePersistence,
  type SessionResumeStorage
} from '../shell/resume.ts';
import { createSlotPersistence, type SaveSlot } from '../shell/saves.ts';
import { list, record } from './read.ts';
import {
  DION_STORAGE,
  DionRecordRefused,
  dionRecordIdentity,
  type DionSaveRecord
} from './save.ts';
import type { DionResumeRecord } from './session.ts';
import type { TourcraftContent } from './tourcraftContent.ts';
import {
  readTourcraftResume,
  scriptAddress,
  scriptReference
} from './tourcraftRestore.ts';
import { TourcraftSession } from './tourcraftSession.ts';

export const TOURCRAFT_SAVE_SCHEMA_VERSION = 6;
const MAX_BYTES = 262_144;
const limit = (encoded: string) => {
  if (new TextEncoder().encode(encoded).length > MAX_BYTES) {
    throw new DionRecordRefused('Save exceeds 256 KiB');
  }
};
export const tourcraftWhere = (session: TourcraftSession) => {
  const s = session.snapshot;
  const name =
    s.location === 65_535 ? 'SPACE' : s.location === 100 ? 'TOLOSA' : 'METIS';
  return `${name} ${s.cell & 15}-${s.cell >> 4}${s.tourcraft?.flight?.mode !== 'foot' && s.tourcraft?.flight ? (s.tourcraft.flight.pilot === 'eagle' ? ' · EAGLE' : ' · TOURCRAFT') : s.taxi.passenger ? ' · TAXI' : ''}`;
};
export const encodeTourcraftRecord = (
  content: TourcraftContent,
  snapshot: DionResumeRecord,
  where: string,
  savedAt = new Date().toISOString()
): string => {
  readTourcraftResume(snapshot, content);
  const n = snapshot.snapshot
    .narrative as import('./tourcraftNarrative.ts').TourcraftScriptState;
  const encoded = JSON.stringify({
    identity: dionRecordIdentity({
      ...content.legacy,
      contentSha256: content.contentSha256
    }),
    savedAt,
    schemaVersion: TOURCRAFT_SAVE_SCHEMA_VERSION,
    snapshot: {
      ...snapshot,
      snapshot: {
        ...snapshot.snapshot,
        narrative: {
          ...n,
          pc: scriptReference(content, n.pc),
          stack: n.stack.map(a => scriptReference(content, a)),
          timedTarget: scriptReference(content, n.timedTarget)
        }
      }
    },
    where
  });
  limit(encoded);
  return encoded;
};
export const decodeTourcraftRecord = (
  encoded: string,
  content: TourcraftContent
): DionSaveRecord => {
  try {
    limit(encoded);
    const r = record(JSON.parse(encoded), 'Save');
    const identity = record(r['identity'], 'identity');
    if (identity['title'] !== 'dion') {
      throw new Error(
        `a ${String(identity['title'])} record, not Mercenary III`
      );
    }
    if (r['schemaVersion'] !== TOURCRAFT_SAVE_SCHEMA_VERSION) {
      throw new Error('Incompatible prototype Save. Start a New Game.');
    }
    const expected = dionRecordIdentity({
      ...content.legacy,
      contentSha256: content.contentSha256
    });
    if (
      Object.keys(identity).length !== 4 ||
      Object.entries(expected).some(([k, v]) => identity[k] !== v)
    ) {
      throw new Error('Incompatible Mercenary III content. Start a New Game.');
    }
    if (
      Object.keys(r).length !== 5 ||
      Object.keys(r).some(
        k =>
          ![
            'schemaVersion',
            'identity',
            'savedAt',
            'where',
            'snapshot'
          ].includes(k)
      )
    ) {
      throw new Error('Invalid Save envelope');
    }
    if (
      typeof r['savedAt'] !== 'string' ||
      !Number.isFinite(Date.parse(r['savedAt'])) ||
      r['savedAt'].length > 64 ||
      typeof r['where'] !== 'string' ||
      r['where'].length > 128
    ) {
      throw new Error('Invalid Save description');
    }
    const raw = record(r['snapshot'], 'snapshot');
    const s = record(raw['snapshot'], 'state');
    const n = record(s['narrative'], 'narrative');
    const stack = list(n['stack'], 'stack');
    if (stack.length > 8) {
      throw new Error('Return stack exceeds eight');
    }
    const snapshot = readTourcraftResume(
      {
        ...raw,
        snapshot: {
          ...s,
          narrative: {
            ...n,
            pc: scriptAddress(content, n['pc']),
            stack: stack.map(a => scriptAddress(content, a)),
            timedTarget: scriptAddress(content, n['timedTarget'])
          }
        }
      },
      content
    );
    return {
      identity: expected,
      savedAt: r['savedAt'],
      schemaVersion: TOURCRAFT_SAVE_SCHEMA_VERSION,
      snapshot,
      where: r['where']
    };
  } catch (error) {
    throw new DionRecordRefused(
      error instanceof Error ? error.message : String(error)
    );
  }
};
export const readTourcraftSession = (
  storage: SessionResumeStorage | undefined,
  content: TourcraftContent
): { reason: string | null; session: TourcraftSession } => {
  try {
    const encoded = storage?.getItem(DION_STORAGE.resume);
    return {
      reason: null,
      session: new TourcraftSession(
        content,
        encoded == null
          ? undefined
          : decodeTourcraftRecord(encoded, content).snapshot
      )
    };
  } catch (error) {
    return {
      reason: error instanceof Error ? error.message : String(error),
      session: new TourcraftSession(content)
    };
  }
};
export const createTourcraftResumePersistence = (options: {
  content: TourcraftContent;
  onFailure: (reason: string) => void;
  session: () => TourcraftSession;
  storage: SessionResumeStorage | undefined;
}) =>
  createSessionResumePersistence({
    encode: () =>
      encodeTourcraftRecord(
        options.content,
        options.session().captureResume(),
        tourcraftWhere(options.session())
      ),
    onFailure: options.onFailure,
    storage: options.storage,
    storageKey: DION_STORAGE.resume
  });
export const createTourcraftSavePersistence = (options: {
  capture: () => { snapshot: DionResumeRecord; where: string };
  content: TourcraftContent;
  release: () => void;
  restore: (snapshot: DionResumeRecord, slot: SaveSlot) => void;
  storage: Storage | undefined;
}) =>
  createSlotPersistence({
    capture: options.capture,
    decode: encoded => decodeTourcraftRecord(encoded, options.content),
    encode: (captured, savedAt) =>
      encodeTourcraftRecord(
        options.content,
        captured.snapshot,
        captured.where,
        savedAt
      ),
    release: options.release,
    restore: options.restore,
    slotKey: DION_STORAGE.save,
    storage: options.storage
  });
