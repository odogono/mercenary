import { describe, expect, test } from 'bun:test';

import { GameplaySession, sessionContent } from '../src/session/index.ts';
import { World } from '../src/world/index.ts';
import { loadPayload } from './replay/artifacts.ts';

const bundle = await loadPayload();
const world = new World(bundle);
const content = sessionContent(world, bundle, undefined);
const rules = bundle.endgame.combat.siteDestruction;

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
        frames: 0,
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
