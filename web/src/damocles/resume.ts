import {
  createSessionResumePersistence,
  type SessionResumeStorage
} from '../shell/resume.ts';
import { titleStorageKeys } from '../shell/title.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesWhere,
  decodeDamoclesSave,
  encodeDamoclesSave,
  type DamoclesSaveIdentity,
  type DamoclesSaveSnapshot
} from './save.ts';
import type { DamoclesSession } from './session.ts';

/// Damocles's Session Resume: one record, its own key, never Targ's (ADR 0041).
export const DAMOCLES_RESUME_STORAGE_KEY = titleStorageKeys('damocles').resume;

export type { SessionResumeStorage as ResumeStorage };

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export type DamoclesResumeRead =
  | { readonly kind: 'empty' }
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'restored'; readonly snapshot: DamoclesSaveSnapshot }
  | { readonly kind: 'unavailable'; readonly reason: string };

export const readDamoclesResume = (
  storage: SessionResumeStorage | undefined,
  identity: DamoclesSaveIdentity
): DamoclesResumeRead => {
  if (storage === undefined) {
    return { kind: 'unavailable', reason: 'browser storage is unavailable' };
  }
  let encoded: string | null;
  try {
    encoded = storage.getItem(DAMOCLES_RESUME_STORAGE_KEY);
  } catch (error) {
    return { kind: 'unavailable', reason: reasonOf(error) };
  }
  if (encoded === null) {
    return { kind: 'empty' };
  }
  try {
    return {
      kind: 'restored',
      snapshot: decodeDamoclesSave(encoded, identity).snapshot
    };
  } catch (error) {
    const reason = reasonOf(error);
    try {
      storage.removeItem(DAMOCLES_RESUME_STORAGE_KEY);
    } catch {
      // The record is already being ignored.
    }
    return { kind: 'invalid', reason };
  }
};

export const encodeDamoclesResumeRecord = (
  identity: DamoclesSaveIdentity,
  session: DamoclesSession,
  now = () => new Date()
): string => {
  const snapshot = session.captureResume();
  return encodeDamoclesSave({
    identity,
    savedAt: now().toISOString(),
    schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
    snapshot,
    where: damoclesWhere(session.snapshot.cell)
  });
};

export const writeDamoclesResume = (
  storage: SessionResumeStorage | undefined,
  identity: DamoclesSaveIdentity,
  session: DamoclesSession,
  now = () => new Date()
): void => {
  storage?.setItem(
    DAMOCLES_RESUME_STORAGE_KEY,
    encodeDamoclesResumeRecord(identity, session, now)
  );
};

export const removeDamoclesResume = (
  storage: SessionResumeStorage | undefined
): void => {
  storage?.removeItem(DAMOCLES_RESUME_STORAGE_KEY);
};

export const createDamoclesResumePersistence = (options: {
  readonly identity: DamoclesSaveIdentity;
  readonly onFailure?: (reason: string) => void;
  readonly session: () => DamoclesSession;
  readonly storage: SessionResumeStorage | undefined;
}) =>
  createSessionResumePersistence({
    encode: () =>
      encodeDamoclesResumeRecord(options.identity, options.session()),
    storage: options.storage,
    storageKey: DAMOCLES_RESUME_STORAGE_KEY,
    ...(options.onFailure === undefined ? {} : { onFailure: options.onFailure })
  });
