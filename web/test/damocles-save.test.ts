import { describe, expect, test } from 'bun:test';

import { parseCatalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { createDamoclesResumePersistence } from '../src/damocles/resume.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  damoclesWhere,
  decodeDamoclesSave,
  encodeDamoclesSave
} from '../src/damocles/save.ts';
import { createDamoclesSavePersistence } from '../src/damocles/saves.ts';
import { DamoclesSession } from '../src/damocles/session.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { createNewGameAction } from '../src/shell/menu.ts';
import { titleStorageKeys } from '../src/shell/title.ts';

const load = async () => {
  const [rawCatalogue, presentation] = await Promise.all([
    Bun.file('../payload/damocles/catalogue.json').json(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json()
  ]);
  const catalogue = parseCatalogue(rawCatalogue);
  const doc = readErisPresentation(presentation);
  return {
    catalogue,
    doc,
    identity: damoclesSaveIdentity(catalogue, doc),
    surface: erisSurfaceFrom(catalogue, doc)
  };
};

describe('Damocles Saves', () => {
  test('round-trip the same envelope Session Resume uses', async () => {
    const loaded = await load();
    const session = new DamoclesSession(loaded);
    session.teleportToCell(2, 3);
    const record = {
      identity: loaded.identity,
      savedAt: '2026-09-12T08:00:00.000Z',
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot: session.captureResume(),
      where: damoclesWhere(session.snapshot.cell)
    };
    const decoded = decodeDamoclesSave(
      encodeDamoclesSave(record),
      loaded.identity
    );
    expect(decoded).toEqual(record);
    expect(decoded.where).toBe('ERIS 02-03');
  });

  test('refuses a schema-2 Resume and a Catalogue mismatch', async () => {
    const loaded = await load();
    expect(() =>
      decodeDamoclesSave('{"schemaVersion":2}', loaded.identity)
    ).toThrow(/schema 2/);
    const session = new DamoclesSession(loaded);
    const encoded = encodeDamoclesSave({
      identity: loaded.identity,
      savedAt: '2026-09-12T08:00:00.000Z',
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot: session.captureResume(),
      where: damoclesWhere(session.snapshot.cell)
    });
    expect(() =>
      decodeDamoclesSave(encoded, {
        ...loaded.identity,
        catalogueProgramSha256: 'other'
      })
    ).toThrow(/payload identity/);
  });

  test('New Game leaves player Saves standing', async () => {
    const loaded = await load();
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      removeItem: (key: string) => {
        map.delete(key);
      },
      setItem: (key: string, value: string) => {
        map.set(key, value);
      }
    };
    const keys = titleStorageKeys('damocles');
    let session = new DamoclesSession(loaded);
    session.teleportToCell(1, 1);
    const persistence = createDamoclesSavePersistence({
      capture: () => ({
        snapshot: session.captureResume(),
        where: damoclesWhere(session.snapshot.cell)
      }),
      identity: loaded.identity,
      release: () => undefined,
      restore: snapshot => {
        session = new DamoclesSession(loaded, snapshot);
      },
      slotKey: keys.save,
      storage
    });
    expect(persistence.save(1).kind).toBe('done');
    const newGame = createNewGameAction(() => {
      session = new DamoclesSession(loaded);
    });
    expect(newGame.press().kind).toBe('armed');
    expect(newGame.press().kind).toBe('started');
    expect(session.snapshot.cell).toEqual({ x: 7, z: 8 });
    expect(persistence.describe(1).state).toBe('saved');
    expect(keys.save(1)).not.toBe(titleStorageKeys('targ').save(1));
  });

  test('a Resume write failure is reported, not swallowed', async () => {
    const loaded = await load();
    const session = new DamoclesSession(loaded);
    const failures: string[] = [];
    const persistence = createDamoclesResumePersistence({
      identity: loaded.identity,
      onFailure: reason => failures.push(reason),
      session: () => session,
      storage: {
        getItem: () => null,
        removeItem: () => undefined,
        setItem: () => {
          throw new Error('quota exceeded');
        }
      }
    });
    persistence.dirty();
    expect(persistence.checkpoint(true)).toEqual({
      kind: 'failed',
      reason: 'quota exceeded'
    });
    expect(failures).toEqual(['quota exceeded']);
  });
});
