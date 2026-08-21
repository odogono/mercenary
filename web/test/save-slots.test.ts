import { describe, expect, test } from 'bun:test';

import {
  SaveSlots,
  slotStorageKey,
  type SlotStorage
} from '../src/shell/saves.ts';

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
