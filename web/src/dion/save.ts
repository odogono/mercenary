import {
  createSlotPersistence,
  type SavePersistence,
  type SaveSlot
} from '../shell/saves.ts';
import { titleStorageKeys } from '../shell/title.ts';
import type { DionContent } from './content.ts';
import { readDionResume } from './restore.ts';
import type { DionResumeRecord } from './session.ts';

/// Mercenary III's title-local Save and Session Resume identity (#648).
/// Records bind the pinned program and complete content fingerprint to a validated
/// simulation snapshot. Browser Shell storage and chooser mechanics are shared.

export const DION_TITLE = 'dion' as const;
export const DION_DESTINATION = 'metis' as const;
export const DION_STORAGE = titleStorageKeys(DION_TITLE);

export interface DionRecordIdentity {
  readonly contentSha256: string;
  readonly destination: typeof DION_DESTINATION;
  readonly programSha256: string;
  readonly title: typeof DION_TITLE;
}

export const dionRecordIdentity = (
  content: DionContent
): DionRecordIdentity => ({
  contentSha256: content.contentSha256,
  destination: DION_DESTINATION,
  programSha256: content.source.programSha256,
  title: DION_TITLE
});

export class DionRecordRefused extends Error {
  override readonly name = 'DionRecordRefused';
}

const refuse = (reason: string): never => {
  throw new DionRecordRefused(reason);
};

const objectOf = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/// Decode a stored record, refusing it with the reason a player is shown.
///
/// The order matters: a record from another Title is named as such before anything
/// about its schema is read, so a Damocles or Targ Save placed under an MIII key is
/// never mistaken for an early MIII one.
export const decodeDionRecord = (
  encoded: string,
  expected: DionRecordIdentity,
  content?: DionContent
): DionSaveRecord => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    return refuse('not JSON');
  }
  const record = objectOf(parsed);
  if (record === null) {
    return refuse('not a Save record');
  }
  const identity = objectOf(record['identity']);
  const title = identity?.['title'];
  if (title !== DION_TITLE) {
    return refuse(
      typeof title === 'string'
        ? `a ${title === 'damocles' ? 'Damocles' : title} record, not Mercenary III`
        : 'not a Mercenary III record'
    );
  }
  if (identity!['programSha256'] !== expected.programSha256) {
    return refuse('written against another program image');
  }
  if (identity!['contentSha256'] !== expected.contentSha256) {
    return refuse('written against other Mercenary III content');
  }
  if (identity!['destination'] !== expected.destination) {
    return refuse('written for another Destination');
  }
  if (record['schemaVersion'] !== DION_SAVE_SCHEMA_VERSION) {
    return refuse('unsupported Mercenary III Save schema');
  }
  const savedAt = record['savedAt'];
  const where = record['where'];
  if (
    typeof savedAt !== 'string' ||
    !Number.isFinite(Date.parse(savedAt)) ||
    typeof where !== 'string'
  ) {
    return refuse('invalid Save description');
  }
  try {
    return {
      identity: expected,
      savedAt,
      schemaVersion: DION_SAVE_SCHEMA_VERSION,
      snapshot: readDionResume(record['snapshot'], content),
      where
    };
  } catch (error) {
    return refuse(error instanceof Error ? error.message : String(error));
  }
};

export const DION_SAVE_SCHEMA_VERSION = 1;
export interface DionSaveRecord {
  readonly identity: DionRecordIdentity;
  readonly savedAt: string;
  readonly schemaVersion: number;
  readonly snapshot: DionResumeRecord;
  readonly where: string;
}
export const encodeDionRecord = (record: DionSaveRecord): string =>
  JSON.stringify(record);

export const createDionSavePersistence = (options: {
  readonly capture: () => {
    readonly snapshot: DionResumeRecord;
    readonly where: string;
  };
  readonly content: DionContent;
  readonly identity: DionRecordIdentity;
  readonly release: () => void;
  readonly restore: (snapshot: DionResumeRecord, slot: SaveSlot) => void;
  readonly storage: Storage | undefined;
}): SavePersistence =>
  createSlotPersistence({
    capture: options.capture,
    decode: encoded =>
      decodeDionRecord(encoded, options.identity, options.content),
    encode: (captured, savedAt) =>
      encodeDionRecord({
        ...captured,
        identity: options.identity,
        savedAt,
        schemaVersion: DION_SAVE_SCHEMA_VERSION
      }),
    release: options.release,
    restore: options.restore,
    slotKey: DION_STORAGE.save,
    storage: options.storage
  });
