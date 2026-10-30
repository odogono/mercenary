import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { GameplaySession, sessionContent } from '../src/session/index.ts';
import {
  SAVE_SCHEMA_VERSION,
  decodeSave,
  encodeSave,
  type SaveSnapshot
} from '../src/session/save.ts';
import { flightModel, loadSettings } from '../src/settings/index.ts';
import { saveEnvironment } from '../src/shell/session.ts';
import { World } from '../src/world/index.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

const bundle = await loadPayload();
const world = new World(bundle);
if (bundle.flight === undefined) {
  throw new Error('the Data Payload is incomplete');
}
const rules = bundle.endgame.combat.siteDestruction;
const settings = loadSettings(
  await Bun.file(join(repositoryRoot, 'settings.json')).text()
);
const content = sessionContent(
  world,
  bundle,
  flightModel(settings.flight, bundle.flight, world.groundExtent)
);
const environment = saveEnvironment(bundle, settings);

/// A Save built around one tampered combat block, for the codec to refuse.
const envelopeWith = (combat: SaveSnapshot['combat']): string =>
  encodeSave({
    environment,
    location: { kind: 'surface' },
    savedAt: '2026-08-23T00:00:00.000Z',
    schemaVersion: SAVE_SCHEMA_VERSION,
    snapshot: { ...session().captureSaveSnapshot(), combat }
  });

/// Restoring with one field of the combat block changed.
const restoreWith = (
  change: (
    combat: NonNullable<SaveSnapshot['combat']>
  ) => SaveSnapshot['combat']
): void => {
  const snapshot = session().captureSaveSnapshot();
  GameplaySession.restore(content, undefined, {
    ...snapshot,
    combat: change(snapshot.combat!)
  });
};

const session = (): GameplaySession =>
  new GameplaySession(content, {
    heading: 0,
    pitch: 0,
    position: { x: 0, y: 0, z: 0 },
    roll: 0,
    speed: 0,
    yawVelocity: 0
  });

/// A Site of each kind, taken from the decoded census.
const mechanoidCell = rules.initialTable.findIndex(
  byte => (byte & rules.mechanoidMask) !== 0 && (byte & rules.neutralMask) === 0
);

describe('the Site Ledger a Gameplay Session owns', () => {
  test('starts from the decoded partition with nothing destroyed', () => {
    const observed = session().observations().observations;

    expect(observed['destroyedCells']).toBe('');
    expect(observed['palyarDestroyed']).toBe(0);
    expect(observed['mechanoidDestroyed']).toBe(0);
  });

  test('is carried in the session half of a Save Snapshot', () => {
    const snapshot = session().captureSaveSnapshot();

    expect(snapshot.combat).not.toBeNull();
    expect(snapshot.combat!.siteTable).toHaveLength(256);
    expect(snapshot.combat!.siteTable).toEqual([...rules.initialTable]);
    expect(snapshot.combat!.palyarDestroyed).toBe(0);
    expect(snapshot.combat!.mechanoidDestroyed).toBe(0);
  });

  test('restores a struck ledger, counters and all', () => {
    const original = session();
    const struck = original.captureSaveSnapshot();
    const table = [...struck.combat!.siteTable];
    table[mechanoidCell] = table[mechanoidCell]! | rules.destroyedMask;
    const wounded = {
      ...struck,
      combat: {
        approachSeconds: 0,
        attackerVelocity: null,
        hostileShot: null,
        impact: null,
        mechanoidDestroyed: 7,
        palyarDestroyed: 3,
        playerShot: null,
        siteTable: table
      }
    };

    const restored = GameplaySession.restore(content, undefined, wounded);
    const observed = restored.observations().observations;

    expect(observed['destroyedCells']).toBe(
      mechanoidCell.toString(16).padStart(2, '0')
    );
    expect(observed['mechanoidDestroyed']).toBe(7);
    expect(observed['palyarDestroyed']).toBe(3);
    // The counters came back as stored rather than recounted from the table,
    // which is the only way a restored Site's history survives.
    expect(restored.captureSaveSnapshot().combat).toEqual(wounded.combat);
  });
});

describe('a Save whose combat state could not have happened', () => {
  test('is refused when a counter stands beyond its own Sites', () => {
    expect(() =>
      restoreWith(combat => ({ ...combat, mechanoidDestroyed: 0xff }))
    ).toThrow('faction counter is beyond its Sites');
  });

  test('is refused when the Site Ledger has gained state', () => {
    expect(() =>
      restoreWith(combat => {
        const siteTable = [...combat.siteTable];
        // A reaction id no cell ever carried.
        siteTable[0] = (siteTable[0]! | rules.lowIdMask) & 0xff;
        return { ...combat, siteTable };
      })
    ).toThrow('gained state at cell 0');
  });

  test('is refused when a shot is flying with nowhere to be', () => {
    expect(() =>
      restoreWith(combat => ({
        ...combat,
        playerShot: { secondsLeft: 0.2, velocity: { x: 1, y: 0, z: 0 } }
      }))
    ).toThrow('Player Projectile and its place disagree');
  });

  test('is refused when a hostile shot is flying with nowhere to be', () => {
    expect(() =>
      restoreWith(combat => ({
        ...combat,
        hostileShot: { secondsLeft: 0.2, velocity: { x: 1, y: 0, z: 0 } }
      }))
    ).toThrow('Hostile Projectile and its place disagree');
  });

  test('is refused when an impact outlives its own lifecycle', () => {
    expect(() =>
      restoreWith(combat => ({
        ...combat,
        impact: { cell: 1, secondsLeft: (rules.impactFrames + 1) / 20 }
      }))
    ).toThrow('impact outlives its own lifecycle');
  });

  test('is refused when it installs a mover the payload has not got', () => {
    const snapshot = session().captureSaveSnapshot();
    expect(() =>
      GameplaySession.restore(content, undefined, {
        ...snapshot,
        game: { ...snapshot.game, mover: 200 }
      })
    ).toThrow('installs missing mover 200');
  });

  test('is refused when a world with Sites carries no combat state at all', () => {
    const snapshot = session().captureSaveSnapshot();
    expect(() =>
      GameplaySession.restore(content, undefined, { ...snapshot, combat: null })
    ).toThrow('no combat state for a world with Sites');
  });
});

describe('the closed codec the combat block travels in', () => {
  test('will not even write a Site Ledger of the wrong size', () => {
    const snapshot = session().captureSaveSnapshot();

    // Encoding reads its own output back, so a Save this wrong never reaches
    // storage to be refused later.
    expect(() =>
      encodeSave({
        environment,
        location: { kind: 'surface' },
        savedAt: '2026-08-23T00:00:00.000Z',
        schemaVersion: SAVE_SCHEMA_VERSION,
        snapshot: {
          ...snapshot,
          combat: {
            ...snapshot.combat!,
            siteTable: snapshot.combat!.siteTable.slice(0, 255)
          }
        }
      })
    ).toThrow('siteTable must contain 256 bytes');
  });

  test('refuses a field it was not expecting', () => {
    const saved = JSON.parse(
      envelopeWith(session().captureSaveSnapshot().combat)
    );
    saved.snapshot.combat.morale = 3;

    expect(() => decodeSave(JSON.stringify(saved), environment)).toThrow(
      'unexpected field morale'
    );
  });

  test('refuses a field it was expecting', () => {
    const saved = JSON.parse(
      envelopeWith(session().captureSaveSnapshot().combat)
    );
    delete saved.snapshot.combat.palyarDestroyed;

    expect(() => decodeSave(JSON.stringify(saved), environment)).toThrow(
      'palyarDestroyed'
    );
  });

  test('refuses schemas before the supported heading migration', () => {
    const saved = JSON.parse(
      envelopeWith(session().captureSaveSnapshot().combat)
    );
    saved.schemaVersion = 10;

    expect(() => decodeSave(JSON.stringify(saved), environment)).toThrow(
      'unsupported Save schemaVersion 10'
    );
  });
});
