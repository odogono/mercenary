import { titleStorageKeys } from '../shell/title.ts';
import {
  DAMOCLES_RESUME_SCHEMA_VERSION,
  type DamoclesResumeRecord
} from './session.ts';

/// Damocles's Session Resume: one record, its own key, never Targ's (ADR 0041).
export const DAMOCLES_RESUME_STORAGE_KEY = titleStorageKeys('damocles').resume;

export interface ResumeStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/// Read a stored record, or nothing. A record that does not parse as exactly this schema is
/// removed and ignored: an old or damaged resume starts a fresh game rather than a broken one.
export const readDamoclesResume = (
  storage: ResumeStorage | undefined
): DamoclesResumeRecord | undefined => {
  if (storage === undefined) {
    return undefined;
  }
  let encoded: string | null;
  try {
    encoded = storage.getItem(DAMOCLES_RESUME_STORAGE_KEY);
  } catch {
    return undefined;
  }
  if (encoded === null) {
    return undefined;
  }
  const record = decode(encoded);
  if (record === undefined) {
    try {
      storage.removeItem(DAMOCLES_RESUME_STORAGE_KEY);
    } catch {
      // The record is already being ignored; a storage that refuses removal changes nothing.
    }
  }
  return record;
};

export const writeDamoclesResume = (
  storage: ResumeStorage | undefined,
  record: DamoclesResumeRecord
): void => {
  try {
    storage?.setItem(DAMOCLES_RESUME_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Resume is a convenience over play, not part of it; a full or refused storage loses only
    // the resume.
  }
};

const decode = (encoded: string): DamoclesResumeRecord | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  const pose = record['pose'] as Record<string, unknown> | undefined;
  const position = pose?.['position'] as Record<string, unknown> | undefined;
  if (
    record['schemaVersion'] !== DAMOCLES_RESUME_SCHEMA_VERSION ||
    !finite(record['elapsed']) ||
    pose === undefined ||
    !finite(pose['heading']) ||
    position === undefined ||
    !finite(position['x']) ||
    !finite(position['y']) ||
    !finite(position['z'])
  ) {
    return undefined;
  }
  return {
    elapsed: record['elapsed'],
    pose: {
      heading: pose['heading'],
      position: { x: position['x'], y: position['y'], z: position['z'] }
    },
    schemaVersion: DAMOCLES_RESUME_SCHEMA_VERSION
  };
};
