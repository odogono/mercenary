import {
  SAVE_SCHEMA_VERSION,
  decodeSave,
  encodeSave,
  type SaveEnvironment,
  type SaveSnapshot
} from '../session/save.ts';
import type { Location } from '../world/index.ts';
import type { ReadStorage, RemoveStorage, WriteStorage } from './storage.ts';

export const SESSION_RESUME_STORAGE_KEY =
  'mercenary.browser-shell.session-resume.v1';

export interface SessionResumeStorage
  extends ReadStorage, RemoveStorage, WriteStorage {}

export type SessionResumeRead =
  | { readonly kind: 'empty' }
  | { readonly kind: 'restored'; readonly snapshot: SaveSnapshot }
  | { readonly kind: 'invalid'; readonly reason: string }
  | { readonly kind: 'unavailable'; readonly reason: string };

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/// Read the one automatic recovery record without letting it become a fourth Save slot.
///
/// An invalid record cannot become valid without a migration this version deliberately lacks,
/// so remove it after preserving the codec's exact refusal for the player-facing notice.
export const readSessionResume = (
  storage: SessionResumeStorage | undefined,
  environment: SaveEnvironment
): SessionResumeRead => {
  if (storage === undefined) {
    return {
      kind: 'unavailable',
      reason: 'browser storage is unavailable'
    };
  }
  let encoded: string | null;
  try {
    encoded = storage.getItem(SESSION_RESUME_STORAGE_KEY);
  } catch (error) {
    return { kind: 'unavailable', reason: reasonOf(error) };
  }
  if (encoded === null) {
    return { kind: 'empty' };
  }
  try {
    return {
      kind: 'restored',
      snapshot: decodeSave(encoded, environment).snapshot
    };
  } catch (error) {
    const reason = reasonOf(error);
    try {
      storage.removeItem(SESSION_RESUME_STORAGE_KEY);
    } catch {
      // The refusal is still the useful diagnosis. A caller will disable recovery if storage
      // also refuses removal, so do not replace it with a less specific cleanup error.
    }
    return { kind: 'invalid', reason };
  }
};

export type SessionResumeCheckpoint =
  | { readonly kind: 'clean' | 'throttled' | 'written' }
  | { readonly kind: 'disabled' | 'failed'; readonly reason: string };

export interface SessionResumePersistence {
  readonly checkpoint: (force?: boolean) => SessionResumeCheckpoint;
  readonly clear: () => SessionResumeCheckpoint;
  readonly dirty: () => void;
  readonly enabled: () => boolean;
}

export interface SessionResumePersistenceOptions {
  readonly capture: () => {
    readonly location: Location;
    readonly snapshot: SaveSnapshot;
  };
  readonly environment: SaveEnvironment;
  readonly now?: () => Date;
  readonly onFailure?: (reason: string) => void;
  readonly storage: SessionResumeStorage | undefined;
  readonly time?: () => number;
}

const CHECKPOINT_INTERVAL_MILLISECONDS = 1000;

/// Maintain the durable Session Resume behind a dirty/throttled boundary.
///
/// `checkpoint(true)` is for a semantic or lifecycle boundary. It still avoids serialising a
/// clean session; callers mark a replacement or mutation dirty before asking for the flush.
export const createSessionResumePersistence = (
  options: SessionResumePersistenceOptions
): SessionResumePersistence => {
  const now = options.now ?? (() => new Date());
  const time = options.time ?? (() => performance.now());
  let changed = false;
  let lastWrite: number | undefined;
  let disabledReason =
    options.storage === undefined
      ? 'browser storage is unavailable'
      : undefined;

  const disable = (reason: string): void => {
    disabledReason = reason;
    options.onFailure?.(reason);
  };
  const removeStale = (): void => {
    try {
      options.storage?.removeItem(SESSION_RESUME_STORAGE_KEY);
    } catch {
      // The original write failure is the actionable reason and recovery is already disabled.
    }
  };

  return {
    checkpoint: (force = false): SessionResumeCheckpoint => {
      if (disabledReason !== undefined) {
        return { kind: 'disabled', reason: disabledReason };
      }
      if (!changed) {
        return { kind: 'clean' };
      }
      const timestamp = time();
      if (
        !force &&
        lastWrite !== undefined &&
        timestamp - lastWrite < CHECKPOINT_INTERVAL_MILLISECONDS
      ) {
        return { kind: 'throttled' };
      }
      try {
        const captured = options.capture();
        options.storage!.setItem(
          SESSION_RESUME_STORAGE_KEY,
          encodeSave({
            environment: options.environment,
            location: captured.location,
            savedAt: now().toISOString(),
            schemaVersion: SAVE_SCHEMA_VERSION,
            snapshot: captured.snapshot
          })
        );
        changed = false;
        lastWrite = timestamp;
        return { kind: 'written' };
      } catch (error) {
        const reason = reasonOf(error);
        removeStale();
        disable(reason);
        return { kind: 'failed', reason };
      }
    },
    clear: (): SessionResumeCheckpoint => {
      if (disabledReason !== undefined) {
        return { kind: 'disabled', reason: disabledReason };
      }
      try {
        options.storage!.removeItem(SESSION_RESUME_STORAGE_KEY);
        changed = false;
        lastWrite = undefined;
        return { kind: 'written' };
      } catch (error) {
        const reason = reasonOf(error);
        disable(reason);
        return { kind: 'failed', reason };
      }
    },
    dirty: () => {
      changed = true;
    },
    enabled: () => disabledReason === undefined
  };
};
