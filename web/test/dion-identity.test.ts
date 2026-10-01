import { describe, expect, test } from 'bun:test';

import { decodeDamoclesSave } from '../src/damocles/save.ts';
import { damoclesTitle } from '../src/damocles/title.ts';
import {
  DION_STORAGE,
  createDionSavePersistence,
  decodeDionRecord,
  dionRecordIdentity
} from '../src/dion/save.ts';
import { dionTitle } from '../src/dion/title.ts';
import { decodeSave, type SaveEnvironment } from '../src/session/save.ts';
import { titleStorageKeys } from '../src/shell/title.ts';
import { dionContent } from './dion-documents.ts';

/// Mercenary III's reserved identity (#647, D1 item 7): its own Title, storage keys and
/// record identity, and refusal in both directions between it and the other Titles.

const memory = (entries: Record<string, string>): Storage => {
  const map = new Map(Object.entries(entries));
  return {
    clear: () => map.clear(),
    getItem: key => map.get(key) ?? null,
    key: index => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
    removeItem: key => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    }
  };
};

const dionRecord = (identity: object): string =>
  JSON.stringify({
    identity,
    savedAt: '2026-10-01T00:00:00Z',
    schemaVersion: 1,
    where: 'METIS'
  });

describe('the Mercenary III Title identity', () => {
  test('is its own Title with storage keys of its own', () => {
    expect(dionTitle.slug).toBe('dion');
    const keys = [
      DION_STORAGE.resume,
      DION_STORAGE.lock,
      DION_STORAGE.ownershipChannel,
      DION_STORAGE.save(1)
    ];
    for (const other of [titleStorageKeys('targ'), damoclesTitle.storage]) {
      const theirs = [
        other.resume,
        other.lock,
        other.ownershipChannel,
        other.save(1),
        other.save(2),
        other.save(3)
      ];
      expect(keys.some(key => theirs.includes(key))).toBe(false);
    }
    expect(DION_STORAGE.resume).toBe(
      'mercenary.browser-shell.dion.session-resume.v1'
    );
    expect(DION_STORAGE.save(3)).toBe(
      'mercenary.browser-shell.dion.save.v1.slot-3'
    );
  });

  test('names the Title, the pinned program and the content', async () => {
    const content = await dionContent();
    expect(dionRecordIdentity(content)).toEqual({
      contentSha256: content.contentSha256,
      destination: 'metis',
      programSha256:
        '4e8b74122910bcaa109b944eebb6f0ec18fdeb1175c34eea3c932d0e1b18b62c',
      title: 'dion'
    });
  });

  test('refuses Damocles and Targ records as foreign', async () => {
    const identity = dionRecordIdentity(await dionContent());
    expect(() =>
      decodeDionRecord(
        JSON.stringify({
          identity: { destination: 'damocles', title: 'damocles' },
          schemaVersion: 26
        }),
        identity
      )
    ).toThrow('a Damocles record, not Mercenary III');
    expect(() =>
      decodeDionRecord(
        JSON.stringify({ environment: {}, schemaVersion: 18 }),
        identity
      )
    ).toThrow('not a Mercenary III record');
    expect(() => decodeDionRecord('{', identity)).toThrow('not JSON');
  });

  test('refuses a Mercenary III record of other content, and admits none yet', async () => {
    const identity = dionRecordIdentity(await dionContent());
    expect(() =>
      decodeDionRecord(
        dionRecord({ ...identity, programSha256: 'f'.repeat(64) }),
        identity
      )
    ).toThrow('another program image');
    expect(() =>
      decodeDionRecord(
        dionRecord({ ...identity, contentSha256: 'e'.repeat(64) }),
        identity
      )
    ).toThrow('other Mercenary III content');
    expect(() => decodeDionRecord(dionRecord(identity), identity)).toThrow(
      'reserved until #648'
    );
  });

  test('is refused by the Damocles and Targ decoders', async () => {
    const identity = dionRecordIdentity(await dionContent());
    const record = dionRecord(identity);
    expect(() =>
      decodeDamoclesSave(record, {
        catalogueProgramSha256:
          '8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef',
        destination: 'damocles',
        presentationSha256: 'test',
        title: 'damocles'
      })
    ).toThrow();
    expect(() => decodeSave(record, {} as SaveEnvironment)).toThrow();
  });

  test('describes its slots and refuses to write them', async () => {
    const identity = dionRecordIdentity(await dionContent());
    const storage = memory({
      [DION_STORAGE.save(2)]: JSON.stringify({
        identity: { title: 'damocles' }
      }),
      [titleStorageKeys('damocles').save(1)]: dionRecord(identity)
    });
    const persistence = createDionSavePersistence({ identity, storage });
    // A Damocles slot holding an MIII record is not an MIII slot: slot 1 here is empty.
    expect(persistence.describe(1)).toEqual({ slot: 1, state: 'empty' });
    expect(persistence.describe(2)).toMatchObject({ state: 'invalid' });
    expect(persistence.save(1)).toEqual({
      kind: 'failed',
      reason: 'Mercenary III Saves arrive with #648'
    });
    expect(storage.getItem(DION_STORAGE.save(1))).toBeNull();
  });
});
