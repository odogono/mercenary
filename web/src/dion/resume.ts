import {
  createSessionResumePersistence,
  type SessionResumeStorage
} from '../shell/resume.ts';
import type { DionContent } from './content.ts';
import {
  DION_SAVE_SCHEMA_VERSION,
  DION_STORAGE,
  decodeDionRecord,
  dionRecordIdentity,
  encodeDionRecord
} from './save.ts';
import { DionSession } from './session.ts';

export const dionWhere = (session: DionSession): string => {
  const state = session.snapshot;
  return `METIS ${state.cell & 15}-${state.cell >> 4}${state.taxi.passenger ? ' · TAXI' : ''}`;
};
export const encodeDionResume = (
  content: DionContent,
  session: DionSession
): string =>
  encodeDionRecord({
    identity: dionRecordIdentity(content),
    savedAt: new Date().toISOString(),
    schemaVersion: DION_SAVE_SCHEMA_VERSION,
    snapshot: session.captureResume(),
    where: dionWhere(session)
  });
export const readDionResume = (
  storage: SessionResumeStorage | undefined,
  content: DionContent
): {
  readonly reason: string | null;
  readonly session: DionSession;
} => {
  try {
    const encoded = storage?.getItem(DION_STORAGE.resume);
    const snapshot =
      encoded == null
        ? undefined
        : decodeDionRecord(encoded, dionRecordIdentity(content), content)
            .snapshot;
    return { reason: null, session: new DionSession(content, snapshot) };
  } catch (error) {
    return {
      reason: error instanceof Error ? error.message : String(error),
      session: new DionSession(content)
    };
  }
};
export const createDionResumePersistence = (options: {
  readonly content: DionContent;
  readonly onFailure: (reason: string) => void;
  readonly session: () => DionSession;
  readonly storage: SessionResumeStorage | undefined;
}) =>
  createSessionResumePersistence({
    encode: () => encodeDionResume(options.content, options.session()),
    onFailure: options.onFailure,
    storage: options.storage,
    storageKey: DION_STORAGE.resume
  });
