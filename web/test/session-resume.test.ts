import { describe, expect, test } from 'bun:test';

import { playerState } from '../src/gameCore/index.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent
} from '../src/session/index.ts';
import {
  SAVE_SCHEMA_VERSION,
  encodeSave,
  type SaveSnapshot
} from '../src/session/save.ts';
import { flightModel, loadSettings } from '../src/settings/index.ts';
import { planFrame } from '../src/shell/frame.ts';
import {
  SESSION_RESUME_STORAGE_KEY,
  createSessionResumePersistence,
  readSessionResume,
  type SessionResumeStorage
} from '../src/shell/resume.ts';
import { World } from '../src/world/index.ts';
import { emptyContent, environment } from './fixtures/save.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

const bundle = await loadPayload();
const world = new World(bundle);
const settings = loadSettings(
  await Bun.file(`${repositoryRoot}/settings.json`).text()
);

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

  test('restores visible Sights exactly when the resumed session carries them', () => {
    const content = sessionContent(world, bundle, undefined);
    for (const [carried, expectedOverlays] of [
      [false, 0],
      [true, 1]
    ] as const) {
      const original = new GameplaySession(content, openingPlayer());
      if (carried) {
        original.carry(40);
      }
      const storage = new MemoryStorage();
      storage.setItem(
        SESSION_RESUME_STORAGE_KEY,
        encoded(original.captureSaveSnapshot())
      );

      const outcome = readSessionResume(storage, environment);
      expect(outcome.kind).toBe('restored');
      if (outcome.kind !== 'restored') {
        throw new Error('Expected a restored Session Resume');
      }
      const restored = GameplaySession.restore(
        content,
        undefined,
        outcome.snapshot
      );
      expect(
        planFrame(world, restored.snapshot, { height: 800, width: 1280 })
          .overlays
      ).toHaveLength(expectedOverlays);
    }
  });

  test('restores and deterministically continues an intermediate Lift Journey', () => {
    const content = sessionContent(
      world,
      bundle,
      flightModel(settings.flight, bundle.flight!, world.groundExtent)
    );
    const original = new GameplaySession(content, {
      ...openingPlayer(),
      position: {
        x: 3 * world.cellSize + 0x71_00,
        y: 128,
        z: 15 * world.cellSize + 0x71_00
      }
    });
    original.carry(46);
    original.rideLift();
    original.advance(2.345);
    const storage = new MemoryStorage();
    storage.setItem(
      SESSION_RESUME_STORAGE_KEY,
      encoded(original.captureSaveSnapshot())
    );
    const outcome = readSessionResume(storage, environment);
    expect(outcome.kind).toBe('restored');
    if (outcome.kind !== 'restored') {
      throw new Error('Expected a restored Lift Journey');
    }
    const restored = GameplaySession.restore(
      content,
      undefined,
      outcome.snapshot
    );
    original.advance(5);
    restored.advance(5);
    expect(restored.captureSaveSnapshot()).toEqual(
      original.captureSaveSnapshot()
    );
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

  test('preserves previous recovery and disables retries after a write failure', () => {
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
    expect(values.get(SESSION_RESUME_STORAGE_KEY)).toBe('old recovery');
    expect(failures).toEqual(['quota full']);

    persistence.dirty();
    expect(persistence.checkpoint(true)).toEqual({
      kind: 'disabled',
      reason: 'quota full'
    });
    expect(writes).toBe(1);
  });
});

test('preserves recovery when capture encoding fails before writing', () => {
  const storage = new MemoryStorage();
  storage.setItem(SESSION_RESUME_STORAGE_KEY, 'previous');
  const persistence = createSessionResumePersistence({
    encode: () => {
      throw new Error('capture refused');
    },
    storage
  });
  persistence.dirty();
  expect(persistence.checkpoint(true)).toEqual({
    kind: 'failed',
    reason: 'capture refused'
  });
  expect(storage.getItem(SESSION_RESUME_STORAGE_KEY)).toBe('previous');
});
