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
  type DamoclesSaveContent,
  type DamoclesSaveIdentity,
  type DamoclesSaveSnapshot
} from './save.ts';
import { DamoclesSession, type DamoclesContent } from './session.ts';

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
  identity: DamoclesSaveIdentity,
  content: DamoclesSaveContent = {},
  options: { readonly preserveInvalid?: boolean } = {}
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
      snapshot: decodeDamoclesSave(encoded, identity, content).snapshot
    };
  } catch (error) {
    const reason = reasonOf(error);
    try {
      if (!options.preserveInvalid) {
        storage.removeItem(DAMOCLES_RESUME_STORAGE_KEY);
      }
    } catch {
      // The record is already being ignored.
    }
    return { kind: 'invalid', reason };
  }
};

/// The session a resume read opens. A record can decode and still name what this Catalogue no
/// longer has, such as a structure a regenerated Catalogue retired (#673). The session refuses
/// it on restore. Such a record is then treated like an undecodable one: it is removed unless
/// asked to be kept, the read reports it invalid, and play starts as a new game rather than
/// stopping on a black screen.
export const openDamoclesResume = async (
  read: DamoclesResumeRead,
  storage: SessionResumeStorage | undefined,
  content: DamoclesContent,
  options: { readonly preserveInvalid?: boolean } = {}
): Promise<{
  readonly read: DamoclesResumeRead;
  readonly session: DamoclesSession;
}> => {
  if (read.kind !== 'restored') {
    return { read, session: new DamoclesSession(content) };
  }
  try {
    await DamoclesSession.prepare(content, read.snapshot);
    return { read, session: new DamoclesSession(content, read.snapshot) };
  } catch (error) {
    try {
      if (!options.preserveInvalid) {
        storage?.removeItem(DAMOCLES_RESUME_STORAGE_KEY);
      }
    } catch {
      // The record is already being ignored.
    }
    return {
      read: { kind: 'invalid', reason: reasonOf(error) },
      session: new DamoclesSession(content)
    };
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
    where: damoclesWhere(session.snapshot)
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
