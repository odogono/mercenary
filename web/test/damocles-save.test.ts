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
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { presentationIdentity } from '../src/damocles/title.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { createNewGameAction } from '../src/shell/menu.ts';
import { titleStorageKeys } from '../src/shell/title.ts';

const load = async () => {
  const [rawCatalogue, presentationText, rawStrings] = await Promise.all([
    Bun.file('../payload/damocles/catalogue.json').json(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).text(),
    Bun.file('../payload/damocles/strings.json').json()
  ]);
  const catalogue = parseCatalogue(rawCatalogue);
  const doc = readErisPresentation(JSON.parse(presentationText));
  const presentationSha256 = await sha256(presentationText);
  return {
    catalogue,
    doc,
    identity: damoclesSaveIdentity(catalogue, presentationSha256),
    presentationSha256,
    strings: parseDamoclesStrings(rawStrings),
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
  test('restores a pending briefcase Drop and its stored contents exactly', async () => {
    const loaded = await load();
    const initial = new DamoclesSession(loaded).captureResume();
    const carried = [
      'object-slot-108',
      'object-slot-92',
      'object-slot-178',
      'object-slot-151',
      'object-slot-157',
      'object-slot-158',
      'object-slot-180',
      'object-slot-202',
      'object-slot-203',
      'object-slot-204',
      'object-slot-215'
    ];
    const original = new DamoclesSession(loaded, {
      ...initial,
      carried,
      pendingBriefcaseDrop: {
        head: 'object-slot-108',
        residence: {
          body: 'body-11',
          kind: 'surface',
          placementClass: 4,
          position: { x: 0, y: 0, z: 0 }
        }
      },
      pose: {
        body: 'body-11',
        heading: 0,
        position: { x: 0, y: loaded.doc.eye.heightUnits, z: 0 }
      },
      residence: carried.map(instance => ({
        instance,
        residence: {
          kind: 'carried',
          placementClass: loaded.catalogue.instances.find(
            item => item.id === instance
          )!.placementClass!
        }
      })),
      structure: null
    });
    const roundTrip = (session: DamoclesSession) =>
      new DamoclesSession(
        loaded,
        decodeDamoclesSave(
          encodeDamoclesSave({
            identity: loaded.identity,
            savedAt: '2026-09-18T17:00:00.000Z',
            schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
            snapshot: session.captureResume(),
            where: 'ERIS'
          }),
          loaded.identity,
          loaded.catalogue
        ).snapshot
      );
    const restored = roundTrip(original);
    expect(restored.captureResume()).toEqual(original.captureResume());
    expect(original.drop()).toEqual({ kind: 'dropped' });
    expect(restored.drop()).toEqual({ kind: 'dropped' });
    expect(restored.captureResume()).toEqual(original.captureResume());
    expect(restored.captureResume().briefcaseStore).toEqual([
      'object-slot-215'
    ]);
    const stored = roundTrip(restored);
    expect(stored.captureResume()).toEqual(restored.captureResume());
    original.advance(16 / 50);
    stored.advance(16 / 50);
    expect(original.take()).toEqual({ kind: 'took' });
    expect(stored.take()).toEqual({ kind: 'took' });
    expect(stored.captureResume()).toEqual(original.captureResume());
    expect(stored.snapshot.carried).toEqual(carried);
  });

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
    const incompleteSchema4 = JSON.parse(encoded);
    delete incompleteSchema4.snapshot.script;
    expect(() =>
      decodeDamoclesSave(JSON.stringify(incompleteSchema4), loaded.identity)
    ).toThrow(/snapshot.script/);
  });

  test('round-trips a suspended response without replaying effects', async () => {
    const loaded = await load();
    const session = new DamoclesSession(loaded);
    const initial = session.captureResume();
    const suspended = {
      ...initial,
      carried: ['object-slot-183'],
      residence: [
        {
          instance: 'object-slot-183',
          residence: { kind: 'carried' as const, placementClass: 4 }
        }
      ],
      script: {
        ...initial.script,
        display: {
          id: 'script2-inline-1' as const,
          kind: 'scrolling' as const,
          reveal: { beneath: ' '.repeat(48), offset: 0, pixels: 80 }
        },
        execution: {
          returnStack: [],
          revision: 2,
          script: 'damocles.script.slot-2' as const,
          // Step 1: suspended immediately after the first message, which is presenting.
          step: 1
        },
        message: {
          id: 'script2-inline-1' as const,
          remainingFrames: 190
        },
        triggers: initial.script.triggers.map(trigger =>
          trigger.index === 2 ? { ...trigger, armed: false } : trigger
        )
      }
    };
    const record = {
      identity: loaded.identity,
      savedAt: '2026-09-18T17:00:00.000Z',
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot: suspended,
      where: 'ERIS 07-08'
    };
    expect(
      decodeDamoclesSave(encodeDamoclesSave(record), loaded.identity)
    ).toEqual(record);
    const stale = structuredClone(record);
    stale.snapshot.script.execution!.revision = 3;
    expect(() =>
      decodeDamoclesSave(encodeDamoclesSave(stale), loaded.identity)
    ).toThrow(/revision/);
    const foreignResidence = {
      ...record,
      snapshot: {
        ...record.snapshot,
        carried: [],
        residence: [
          {
            instance: 'object-slot-183',
            residence: {
              body: 'body-11',
              insertionGroup: 1,
              kind: 'structure' as const,
              level: 0,
              parent: 'eris-surface-89',
              placementClass: 4,
              position: { x: 0, y: 0, z: 0 }
            }
          }
        ]
      }
    };
    expect(() =>
      decodeDamoclesSave(
        encodeDamoclesSave(foreignResidence),
        loaded.identity,
        loaded.catalogue
      )
    ).toThrow(/Catalogue/);
    const restored = new DamoclesSession(loaded, suspended);
    expect(restored.drainEffects()).toEqual([]);
    restored.advance(190 / 50);
    expect(restored.snapshot.message?.id).toBe('script2-inline-2');
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
      catalogue: loaded.catalogue,
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
