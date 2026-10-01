import type {
  SavePersistence,
  SaveSlot,
  SlotDescription
} from '../shell/saves.ts';
import { titleStorageKeys } from '../shell/title.ts';
import type { DionContent } from './content.ts';

/// Mercenary III's Save and Session Resume identity, reserved by I1 (#647).
///
/// A Mercenary III record names its Title, its Destination, the pinned program image
/// and the content it was written against. It keeps its own storage keys under
/// `mercenary.browser-shell.dion.*`, never Targ's or Damocles's, and a Damocles Save
/// identity is never evidence that a record is compatible (D1 item 7). No snapshot
/// schema is admitted yet: restore-complete persistence is I2's (#648), so every record
/// is refused here, a foreign one for being foreign and an MIII one for being early.

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
  expected: DionRecordIdentity
): never => {
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
  return refuse(
    'Mercenary III Saves are reserved until #648; this record cannot be restored yet'
  );
};

/// The System Menu's three slots for Mercenary III: described honestly, never written.
export const createDionSavePersistence = (options: {
  readonly identity: DionRecordIdentity;
  readonly storage: Storage | undefined;
}): SavePersistence => {
  const listeners = new Set<() => void>();
  const describe = (slot: SaveSlot): SlotDescription => {
    if (options.storage === undefined) {
      return {
        reason: 'browser storage is unavailable',
        slot,
        state: 'unavailable'
      };
    }
    let encoded: string | null;
    try {
      encoded = options.storage.getItem(DION_STORAGE.save(slot));
    } catch {
      return {
        reason: 'browser storage is unavailable',
        slot,
        state: 'unavailable'
      };
    }
    if (encoded === null) {
      return { slot, state: 'empty' };
    }
    try {
      return decodeDionRecord(encoded, options.identity);
    } catch (error) {
      return {
        reason: error instanceof Error ? error.message : String(error),
        slot,
        state: 'invalid'
      };
    }
  };
  const reserved = {
    kind: 'failed' as const,
    reason: 'Mercenary III Saves arrive with #648'
  };
  return {
    armed: () => undefined,
    delete: () => reserved,
    describe,
    disarm: () => {},
    dismiss: () => listeners.forEach(listener => listener()),
    load: () => reserved,
    message: text => ({ source: 'game', text }),
    onChange: listener => {
      listeners.add(listener);
    },
    save: () => reserved
  };
};
