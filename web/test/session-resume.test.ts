import { describe, expect, test } from 'bun:test';

import { playerState } from '../src/gameCore/index.ts';
import { GameplaySession } from '../src/session/index.ts';
import {
  SAVE_SCHEMA_VERSION,
  encodeSave,
  type SaveSnapshot
} from '../src/session/save.ts';
import {
  SESSION_RESUME_STORAGE_KEY,
  createSessionResumePersistence,
  readSessionResume,
  type SessionResumeStorage
} from '../src/shell/resume.ts';
import { emptyContent, environment } from './fixtures/save.ts';

class MemoryStorage implements SessionResumeStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const snapshotAt = (x: number): SaveSnapshot =>
  new GameplaySession(
    emptyContent(),
    playerState({ position: { x, y: 0, z: 2000 } }),
    undefined
  ).captureSaveSnapshot();

const encoded = (snapshot: SaveSnapshot): string =>
  encodeSave({
    environment,
    location: { kind: 'surface' },
    savedAt: '2026-08-25T12:00:00.000Z',
    schemaVersion: SAVE_SCHEMA_VERSION,
    snapshot
  });

describe('Session Resume startup', () => {
  test('uses one versioned key outside the player Save slots', () => {
    expect(SESSION_RESUME_STORAGE_KEY).toBe(
      'mercenary.browser-shell.session-resume.v1'
    );
  });

  test('restores an exact compatible Save Snapshot', () => {
    const storage = new MemoryStorage();
    const snapshot = snapshotAt(1234);
    storage.setItem(SESSION_RESUME_STORAGE_KEY, encoded(snapshot));

    expect(readSessionResume(storage, environment)).toEqual({
      kind: 'restored',
      snapshot
    });
  });

  test('reports an empty store without inventing a failure', () => {
    expect(readSessionResume(new MemoryStorage(), environment)).toEqual({
      kind: 'empty'
    });
  });

  test('removes malformed recovery instead of failing startup repeatedly', () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSION_RESUME_STORAGE_KEY, 'not json');

    const outcome = readSessionResume(storage, environment);

    expect(outcome.kind).toBe('invalid');
    expect(outcome).toHaveProperty('reason');
    expect(storage.getItem(SESSION_RESUME_STORAGE_KEY)).toBeNull();
  });

  test('atomically removes a schema-8 recovery record', () => {
    const storage = new MemoryStorage();
    const stale = JSON.parse(encoded(snapshotAt(1234))) as {
      schemaVersion: number;
    };
    stale.schemaVersion = 8;
    storage.setItem(SESSION_RESUME_STORAGE_KEY, JSON.stringify(stale));

    expect(readSessionResume(storage, environment).kind).toBe('invalid');
    expect(storage.getItem(SESSION_RESUME_STORAGE_KEY)).toBeNull();
  });

  test('removes recovery from a different exact environment', () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSION_RESUME_STORAGE_KEY, encoded(snapshotAt(1234)));

    const outcome = readSessionResume(storage, {
      ...environment,
      payload: { ...environment.payload, decoderVersion: 999 }
    });

    expect(outcome.kind).toBe('invalid');
    expect(storage.getItem(SESSION_RESUME_STORAGE_KEY)).toBeNull();
  });

  test('reports unavailable storage without throwing', () => {
    expect(readSessionResume(undefined, environment)).toEqual({
      kind: 'unavailable',
      reason: 'browser storage is unavailable'
    });
  });
});

describe('Session Resume checkpoints', () => {
  test('writes dirty state immediately, then throttles it to one second', () => {
    const storage = new MemoryStorage();
    let clock = 0;
    let current = snapshotAt(1000);
    const persistence = createSessionResumePersistence({
      capture: () => ({ location: { kind: 'surface' }, snapshot: current }),
      environment,
      now: () => new Date('2026-08-25T12:00:00.000Z'),
      storage,
      time: () => clock
    });

    persistence.dirty();
    expect(persistence.checkpoint()).toEqual({ kind: 'written' });
    const first = storage.getItem(SESSION_RESUME_STORAGE_KEY);

    current = snapshotAt(2000);
    persistence.dirty();
    clock = 999;
    expect(persistence.checkpoint()).toEqual({ kind: 'throttled' });
    expect(storage.getItem(SESSION_RESUME_STORAGE_KEY)).toBe(first);

    clock = 1000;
    expect(persistence.checkpoint()).toEqual({ kind: 'written' });
    expect(readSessionResume(storage, environment)).toEqual({
      kind: 'restored',
      snapshot: current
    });
  });

  test('forces a dirty checkpoint at a lifecycle boundary', () => {
    const storage = new MemoryStorage();
    let current = snapshotAt(1000);
    const persistence = createSessionResumePersistence({
      capture: () => ({ location: { kind: 'surface' }, snapshot: current }),
      environment,
      storage,
      time: () => 0
    });
    persistence.dirty();
    persistence.checkpoint();

    current = snapshotAt(3000);
    persistence.dirty();
    expect(persistence.checkpoint(true)).toEqual({ kind: 'written' });
    expect(readSessionResume(storage, environment)).toEqual({
      kind: 'restored',
      snapshot: current
    });
  });

  test('does no work when the session has not changed', () => {
    const persistence = createSessionResumePersistence({
      capture: () => ({
        location: { kind: 'surface' },
        snapshot: snapshotAt(1000)
      }),
      environment,
      storage: new MemoryStorage()
    });

    expect(persistence.checkpoint(true)).toEqual({ kind: 'clean' });
  });

  test('removes stale recovery and disables retries after a write failure', () => {
    const values = new Map([[SESSION_RESUME_STORAGE_KEY, 'old recovery']]);
    let writes = 0;
    const failures: string[] = [];
    const persistence = createSessionResumePersistence({
      capture: () => ({
        location: { kind: 'surface' },
        snapshot: snapshotAt(1000)
      }),
      environment,
      onFailure: reason => failures.push(reason),
      storage: {
        getItem: key => values.get(key) ?? null,
        removeItem: key => {
          values.delete(key);
        },
        setItem: () => {
          writes += 1;
          throw new Error('quota full');
        }
      }
    });

    persistence.dirty();
    expect(persistence.checkpoint(true)).toEqual({
      kind: 'failed',
      reason: 'quota full'
    });
    expect(values.has(SESSION_RESUME_STORAGE_KEY)).toBeFalse();
    expect(failures).toEqual(['quota full']);

    persistence.dirty();
    expect(persistence.checkpoint(true)).toEqual({
      kind: 'disabled',
      reason: 'quota full'
    });
    expect(writes).toBe(1);
  });
});
