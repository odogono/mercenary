import { describe, expect, test } from 'bun:test';

import { load } from '../src/payload/load.ts';
import { readers } from '../src/payload/read.ts';
import { loadPayload } from './replay/artifacts.ts';

describe('object-effects payload', () => {
  test('is required, independently versioned, and names the functional Sights slot', async () => {
    const bundle = await loadPayload();

    expect(bundle.objectEffects.schemaVersion).toBe(2);
    expect(bundle.objectEffects.metalDetector).toEqual({
      altitudeHighByteLimit: 1,
      colours: { mechanoid: 6, neutral: 2, palyar: 5 },
      mechanoidMask: 64,
      neutralMask: 32,
      slot: 26
    });
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
          {
            counts: { effects: 2, sightsPixels: 16 },
            metalDetector: {
              altitudeHighByteLimit: 1,
              colours: { mechanoid: 6, neutral: 2, palyar: 5 },
              mechanoidMask: 64,
              neutralMask: 32,
              slot: 26
            },
            schemaVersion: 2,
            sights
          }
        )
      ).toThrow();
    }
  });

  test('rejects a changed Metal Detector predicate contract', async () => {
    const payload = await loadPayload();
    expect(() =>
      readers.objectEffects(
        { name: 'object-effects.json' },
        {
          ...payload.objectEffects,
          metalDetector: {
            ...payload.objectEffects.metalDetector,
            altitudeHighByteLimit: 0
          }
        }
      )
    ).toThrow('Metal Detector');
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
    const stale = { ...payload.objectEffects, schemaVersion: 3 };
    await expect(
      load(async name =>
        name === 'object-effects.json'
          ? JSON.stringify(stale)
          : bodies.get(name)
      )
    ).rejects.toThrow('unsupported schemaVersion');
  });
});
