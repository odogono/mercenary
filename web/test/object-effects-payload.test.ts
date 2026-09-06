import { describe, expect, test } from 'bun:test';

import { load } from '../src/payload/load.ts';
import { readers } from '../src/payload/read.ts';
import { loadPayload } from './replay/artifacts.ts';

describe('object-effects payload', () => {
  test('is required, independently versioned, and names the functional Sights slot', async () => {
    const bundle = await loadPayload();

    expect(bundle.objectEffects.schemaVersion).toBe(1);
    expect(bundle.objectEffects.sights.slot).toBe(40);
    expect(bundle.objectEffects.sights.bitmapRows).toEqual([
      0xff_00_ff,
      ...Array<number>(20).fill(0)
    ]);
  });

  test('rejects malformed bitmap metadata', () => {
    const valid = {
      bitmapRows: [0xff_00_ff, ...Array<number>(20).fill(0)],
      colours: { room: 1, surface: 15 },
      height: 21,
      origin: [136, 66],
      pixelScale: [2, 2],
      slot: 40,
      width: 24
    };
    for (const sights of [
      { ...valid, bitmapRows: valid.bitmapRows.slice(1) },
      { ...valid, bitmapRows: [-1, ...valid.bitmapRows.slice(1)] },
      { ...valid, origin: [319, 135] },
      { ...valid, pixelScale: [0, 2] },
      { ...valid, colours: { room: 16, surface: 15 } },
      { ...valid, slot: 256 }
    ]) {
      expect(() =>
        readers.objectEffects(
          { name: 'object-effects.json' },
          { counts: { effects: 1, sightsPixels: 16 }, schemaVersion: 1, sights }
        )
      ).toThrow();
    }
  });

  test('the bundle loader refuses a missing or stale document', async () => {
    const bodies = new Map<string, string>();
    const payload = await loadPayload();
    const names = [
      'manifest.json',
      'world.json',
      'surface.json',
      'objects.json',
      'rooms.json',
      'endgame.json',
      'text.json',
      'benson.json',
      'interaction.json',
      'flight.json',
      'underground.json',
      'sound.json',
      'object-effects.json'
    ];
    for (const name of names) {
      const key = name
        .replace('.json', '')
        .replace('-effects', 'Effects') as keyof typeof payload;
      const value = name === 'manifest.json' ? payload.manifest : payload[key];
      if (value !== undefined) {
        bodies.set(name, JSON.stringify(value));
      }
    }
    await expect(
      load(async name =>
        name === 'object-effects.json' ? undefined : bodies.get(name)
      )
    ).rejects.toThrow('object-effects.json');
    const stale = { ...payload.objectEffects, schemaVersion: 2 };
    await expect(
      load(async name =>
        name === 'object-effects.json'
          ? JSON.stringify(stale)
          : bodies.get(name)
      )
    ).rejects.toThrow('unsupported schemaVersion');
  });
});
