import { describe, expect, test } from 'bun:test';

import { parseCatalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  DAMOCLES_RESUME_STORAGE_KEY,
  readDamoclesResume,
  writeDamoclesResume,
  type ResumeStorage
} from '../src/damocles/resume.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { intent } from '../src/gameCore/index.ts';
import { titleStorageKeys } from '../src/shell/title.ts';

const content = async (): Promise<DamoclesContent> => {
  const [catalogue, presentation] = await Promise.all([
    Bun.file('../payload/damocles/catalogue.json').json(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json()
  ]);
  const doc = readErisPresentation(presentation);
  return { doc, surface: erisSurfaceFrom(parseCatalogue(catalogue), doc) };
};

const memoryStorage = (): ResumeStorage & {
  readonly map: Map<string, string>;
} => {
  const map = new Map<string, string>();
  return {
    getItem: key => map.get(key) ?? null,
    map,
    removeItem: key => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    }
  };
};

describe('the Damocles Gameplay Session', () => {
  test('opens on foot in the spaceport cell and hands out immutable snapshots', async () => {
    const session = new DamoclesSession(await content());
    const first = session.snapshot;
    expect(first.occupancy).toEqual({ kind: 'onFoot' });
    expect(first.cell).toEqual({ x: 7, z: 8 });
    expect(first.carried).toEqual([]);
    expect(first.elapsed).toBe(0);
    expect(session.advance(0)).toEqual(first);
    session.intent = intent({ walk: 1 });
    const later = session.advance(0.5);
    expect(first.pose.position).toEqual(first.pose.position);
    expect(later.elapsed).toBeCloseTo(0.5, 9);
    expect(later.pose.position).not.toEqual(first.pose.position);
    expect(later.pose.position.y).toBe(63);
  });

  test('steps long frames in bounded pieces', async () => {
    const stepped = new DamoclesSession(await content());
    stepped.intent = intent({ walk: 1 });
    const whole = stepped.advance(1);
    const pieces = new DamoclesSession(await content());
    pieces.intent = intent({ walk: 1 });
    for (let i = 0; i < 60; i += 1) {
      pieces.advance(1 / 60);
    }
    expect(whole.pose.position.z).toBeCloseTo(
      pieces.snapshot.pose.position.z,
      3
    );
    expect(whole.elapsed).toBeCloseTo(1, 9);
  });

  test('resumes exactly where it left off, from its own key', async () => {
    const storage = memoryStorage();
    const session = new DamoclesSession(await content());
    session.intent = intent({ turn: -1, walk: 1 });
    session.advance(3);
    writeDamoclesResume(storage, session.captureResume());
    expect([...storage.map.keys()]).toEqual([DAMOCLES_RESUME_STORAGE_KEY]);
    expect(DAMOCLES_RESUME_STORAGE_KEY).toBe(
      'mercenary.browser-shell.damocles.session-resume.v1'
    );
    expect(titleStorageKeys('targ').resume).toBe(
      'mercenary.browser-shell.session-resume.v1'
    );
    const restored = new DamoclesSession(
      await content(),
      readDamoclesResume(storage)
    );
    expect(restored.snapshot).toEqual(session.snapshot);
  });

  test('discards a record it cannot read and starts afresh', async () => {
    const storage = memoryStorage();
    storage.setItem(DAMOCLES_RESUME_STORAGE_KEY, '{"schemaVersion":1}');
    expect(readDamoclesResume(storage)).toBeUndefined();
    expect(storage.map.size).toBe(0);
    storage.setItem(DAMOCLES_RESUME_STORAGE_KEY, 'not json');
    expect(readDamoclesResume(storage)).toBeUndefined();
    storage.setItem(
      DAMOCLES_RESUME_STORAGE_KEY,
      JSON.stringify({
        elapsed: 1,
        pose: { heading: 0, position: { x: 1, y: 2, z: 3 } },
        schemaVersion: 3
      })
    );
    expect(readDamoclesResume(storage)).toBeUndefined();
    expect(readDamoclesResume(undefined)).toBeUndefined();
    const fresh = new DamoclesSession(
      await content(),
      readDamoclesResume(storage)
    );
    expect(fresh.snapshot.cell).toEqual({ x: 7, z: 8 });
  });
});
