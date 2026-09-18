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
import { presentationIdentity } from '../src/damocles/title.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { createNewGameAction } from '../src/shell/menu.ts';
import { titleStorageKeys } from '../src/shell/title.ts';

const load = async () => {
  const [rawCatalogue, presentationText] = await Promise.all([
    Bun.file('../payload/damocles/catalogue.json').json(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).text()
  ]);
  const catalogue = parseCatalogue(rawCatalogue);
  const doc = readErisPresentation(JSON.parse(presentationText));
  const presentationSha256 = await sha256(presentationText);
  return {
    catalogue,
    doc,
    identity: damoclesSaveIdentity(catalogue, presentationSha256),
    presentationSha256,
    surface: erisSurfaceFrom(catalogue, doc)
  };
};

const sha256 = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
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

  test('refuses old schemas, invalid attachment state and a Catalogue mismatch', async () => {
    const loaded = await load();
    expect(() =>
      decodeDamoclesSave('{"schemaVersion":1}', loaded.identity)
    ).toThrow(/schema 1/);
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
    expect(() =>
      decodeDamoclesSave(
        JSON.stringify({ ...JSON.parse(encoded), schemaVersion: 3 }),
        loaded.identity
      )
    ).toThrow(/schema 3/);
    const invalidEntrance = JSON.parse(encoded);
    invalidEntrance.snapshot.structure.attachments[0].openUnits = -1;
    expect(() =>
      decodeDamoclesSave(JSON.stringify(invalidEntrance), loaded.identity)
    ).toThrow(/attachment state/);
    const editedPresentation = encodeDamoclesSave({
      identity: { ...loaded.identity, presentationSha256: 'other' },
      savedAt: '2026-09-12T08:00:00.000Z',
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot: session.captureResume(),
      where: damoclesWhere(session.snapshot.cell)
    });
    expect(() =>
      decodeDamoclesSave(editedPresentation, loaded.identity)
    ).toThrow(/payload identity/);
    const bodilessPose = JSON.parse(encoded);
    delete bodilessPose.snapshot.pose.body;
    expect(() =>
      decodeDamoclesSave(JSON.stringify(bodilessPose), loaded.identity)
    ).toThrow(/names no Body/);
  });

  test('identity pins the presentation by content, not by a declared version', async () => {
    const text = await Bun.file(
      new URL('../damocles/eris.json', import.meta.url)
    ).text();
    const loaded = await load();

    // The loader hashes the bytes it served, so the suite and the Title agree.
    expect(await presentationIdentity([text])).toBe(loaded.presentationSha256);

    // An edit that leaves every declared schema version alone still changes identity. That is
    // the whole reason this replaced erisSchemaVersion, which such an edit would not move.
    const edited = text.replace('"ERIS"', '"ERIS "');
    expect(edited).not.toBe(text);
    expect(await presentationIdentity([edited])).not.toBe(
      loaded.presentationSha256
    );

    // Documents join in a fixed order, and the separator keeps concatenation from colliding.
    expect(await presentationIdentity(['a', 'b'])).not.toBe(
      await presentationIdentity(['b', 'a'])
    );
    expect(await presentationIdentity(['ab', ''])).not.toBe(
      await presentationIdentity(['a', 'b'])
    );
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
