import { describe, expect, test } from 'bun:test';

import { playerState } from '../src/gameCore/index.ts';
import { GameplaySession } from '../src/session/index.ts';
import type { SaveSnapshot } from '../src/session/save.ts';
import {
  SaveSlots,
  createSavePersistence,
  slotLabel,
  slotStorageKey,
  type SavePersistenceOptions,
  type SlotStorage
} from '../src/shell/saves.ts';
import { emptyContent, environment } from './fixtures/save.ts';

class MemoryStorage implements SlotStorage {
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

describe('the three Browser Shell save slots', () => {
  test('isolates values and refreshes the latest storage contents', () => {
    const storage = new MemoryStorage();
    const slots = new SaveSlots(storage);

    slots.write(1, 'first');
    slots.write(3, 'third');
    expect(slots.read(1)).toBe('first');
    expect(slots.read(2)).toBeNull();
    expect(slots.read(3)).toBe('third');

    storage.setItem(slotStorageKey(1), 'newer-tab');
    expect(slots.read(1)).toBe('newer-tab');
    slots.delete(1);
    expect(slots.read(1)).toBeNull();
  });

  test('rejects numbers outside the three fixed slots', () => {
    const slots = new SaveSlots(new MemoryStorage());
    expect(() => slots.read(0)).toThrow('slot must be 1, 2, or 3');
    expect(() => slots.write(4, 'no')).toThrow('slot must be 1, 2, or 3');
  });

  test('does not hide storage failures', () => {
    const slots = new SaveSlots({
      getItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
      setItem: () => {}
    });
    expect(() => slots.read(1)).toThrow('blocked');
  });
});

// One immutable Snapshot for the whole file: nothing here depends on its identity, and
// rebuilding a session per captured Save only measures the session builder.
const SNAPSHOT: SaveSnapshot = new GameplaySession(
  emptyContent(),
  playerState({ position: { x: 1000, y: 0, z: 2000 } }),
  undefined
).captureSaveSnapshot();

const harness = (overrides: Partial<SavePersistenceOptions> = {}) => {
  const storage = new MemoryStorage();
  const restored: SaveSnapshot[] = [];
  let released = 0;
  let clock = 0;
  const persistence = createSavePersistence({
    capture: () => ({ location: { kind: 'surface' }, snapshot: SNAPSHOT }),
    environment,
    now: () => new Date('2026-08-21T09:05:00.000Z'),
    release: () => {
      released += 1;
    },
    restore: value => restored.push(value),
    storage,
    time: () => clock,
    ...overrides
  });
  return {
    advance: (ms: number) => {
      clock += ms;
    },
    persistence,
    released: () => released,
    restored,
    storage
  };
};

describe('the Save persistence core', () => {
  test('describes an empty slot, then the Save written to it', () => {
    const { persistence } = harness();

    expect(persistence.describe(2)).toEqual({ slot: 2, state: 'empty' });
    expect(persistence.save(2)).toEqual({ kind: 'done' });

    const described = persistence.describe(2);
    expect(described).toEqual({
      savedAt: new Date('2026-08-21T09:05:00.000Z'),
      slot: 2,
      state: 'saved',
      where: 'SURFACE'
    });
  });

  test('costs two presses to overwrite an occupied slot', () => {
    const { persistence, storage } = harness();
    persistence.save(1);
    const first = storage.values.get(slotStorageKey(1));

    expect(persistence.save(1)).toEqual({ kind: 'armed' });
    expect(persistence.armed()).toEqual({ action: 'save', slot: 1 });
    // Nothing was written by the arming press.
    expect(storage.values.get(slotStorageKey(1))).toBe(first);

    expect(persistence.save(1)).toEqual({ kind: 'done' });
    expect(persistence.armed()).toBeUndefined();
  });

  test('arms per slot, so a press on one slot cannot overwrite another', () => {
    const { persistence } = harness();
    persistence.save(1);
    persistence.save(2);

    expect(persistence.save(1)).toEqual({ kind: 'armed' });
    // Slot 2 is occupied too, so it must arm on its own rather than inherit slot 1's press.
    expect(persistence.save(2)).toEqual({ kind: 'armed' });
    expect(persistence.armed()).toEqual({ action: 'save', slot: 2 });
  });

  test('costs two presses to delete, and disarms when looked away from', () => {
    const { persistence, storage } = harness();
    persistence.save(3);

    expect(persistence.delete(3)).toEqual({ kind: 'armed' });
    persistence.disarm();
    expect(persistence.armed()).toBeUndefined();

    expect(persistence.delete(3)).toEqual({ kind: 'armed' });
    expect(persistence.delete(3)).toEqual({ kind: 'done' });
    expect(storage.values.has(slotStorageKey(3))).toBeFalse();
  });

  test('refuses to delete or load an empty slot, in its own words', () => {
    const { persistence } = harness();

    expect(persistence.delete(1)).toEqual({
      kind: 'failed',
      reason: 'slot 1 is empty'
    });
    expect(persistence.load(1)).toEqual({
      kind: 'failed',
      reason: 'slot 1 is empty'
    });
  });

  test('restores a Save and releases held input', () => {
    const { persistence, released, restored } = harness();
    persistence.save(1);
    const savedTimes = released();

    expect(persistence.load(1)).toEqual({ kind: 'done' });
    expect(restored).toHaveLength(1);
    expect(released()).toBe(savedTimes + 1);
  });

  test('surfaces the codec reason for a Save it cannot read', () => {
    const { persistence, storage } = harness();
    storage.setItem(slotStorageKey(2), 'not a save at all');

    const described = persistence.describe(2);
    expect(described.state).toBe('invalid');
    expect(described).toHaveProperty('reason');
    // The refusal reaches the player rather than being flattened to "INVALID".
    expect(persistence.load(2).kind).toBe('failed');
  });

  test('reports every slot unavailable without storage', () => {
    const { persistence } = harness({ storage: undefined });

    expect(persistence.describe(1)).toEqual({
      reason: 'browser storage is unavailable',
      slot: 1,
      state: 'unavailable'
    });
    expect(persistence.save(1)).toEqual({
      kind: 'failed',
      reason: 'browser storage is unavailable'
    });
  });

  test('reports a slot unavailable when reading it throws', () => {
    const { persistence } = harness({
      storage: {
        getItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => {},
        setItem: () => {}
      }
    });

    expect(persistence.describe(1)).toEqual({
      reason: 'blocked',
      slot: 1,
      state: 'unavailable'
    });
  });

  test('lends the message line only while a notice is live', () => {
    const { advance, persistence } = harness();

    expect(persistence.message('BENSON SPEAKS')).toEqual({
      source: 'game',
      text: 'BENSON SPEAKS'
    });
    persistence.save(1);
    expect(persistence.message('BENSON SPEAKS')).toEqual({
      source: 'shell',
      text: 'SAVED SLOT 1'
    });
    advance(2000);
    expect(persistence.message('BENSON SPEAKS')).toEqual({
      source: 'game',
      text: 'BENSON SPEAKS'
    });
  });

  test('keeps a failure on the message line until dismissed', () => {
    const { advance, persistence } = harness();

    expect(persistence.load(1).kind).toBe('failed');
    advance(60_000);
    expect(persistence.message('BENSON SPEAKS')).toEqual({
      source: 'shell',
      text: 'LOAD FAILED — SLOT 1 IS EMPTY'
    });
    persistence.dismiss();
    expect(persistence.message('BENSON SPEAKS').source).toBe('game');
  });

  test('announces every change so chrome can redraw itself', () => {
    const { persistence } = harness();
    let changes = 0;
    persistence.onChange(() => {
      changes += 1;
    });

    persistence.save(1);
    persistence.save(1);
    persistence.disarm();
    expect(changes).toBe(3);
  });

  test('labels each slot state for a single line of chrome', () => {
    const { persistence } = harness();
    expect(slotLabel(persistence.describe(1))).toBe('SLOT 1 — EMPTY');
    persistence.save(1);
    expect(slotLabel(persistence.describe(1))).toStartWith(
      'SLOT 1 — SURFACE — '
    );
    expect(slotLabel({ reason: 'why', slot: 2, state: 'invalid' })).toBe(
      'SLOT 2 — INVALID'
    );
    expect(
      slotLabel({ reason: 'blocked', slot: 3, state: 'unavailable' })
    ).toBe('SLOT 3 — UNAVAILABLE');
  });
});
