import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { load } from '../src/payload/load.ts';
import { readTargAssets } from '../src/server/assets.ts';
import { GameplaySession } from '../src/session/index.ts';
import { SHRINE } from '../src/talk/scripts.ts';
import { SURFACE, World } from '../src/world/index.ts';
import { LegalRoute } from './legalCheckpoint.ts';
import { readPayloadFile, repositoryRoot } from './replay/artifacts.ts';
import { Lines, openRoute, talkScript } from './talkParity.ts';

/// The Shrine at Surface Cell (20,20), outside the city (ADR 0084): its Talk
/// Script speaks when the player comes into its grounds, and takes the energy
/// crystal left inside it as an offering.

const CELL = 0x1_00_00;
const SHRINE_CENTRE = { x: 20.5 * CELL, y: 0, z: 20.5 * CELL };
/// Inside the grounds, well outside the Shrine's footprint.
const GROUNDS_EDGE = { x: 20.1 * CELL, y: 0, z: 20.1 * CELL };
/// The Shrine's object slot, after the original 64.
const SHRINE_SLOT = 64;
const ENERGY_CRYSTAL = 31;
const LARGE_BOX = 34;
/// The object flag the World Port's `fix` sets.
const FIXED = 16;

const standAt = (route: LegalRoute, at: typeof SHRINE_CENTRE): void => {
  route.session.teleport(SURFACE);
  route.session.place(at);
};

/// Carries the object to the point, waits out the arrival line, and drops it.
const leave = (route: LegalRoute, slot: number, at: typeof SHRINE_CENTRE) => {
  route.session.carry(slot);
  standAt(route, at);
  const lines = new Lines(route).advance(5);
  route.session.drop(slot);
  return lines.advance(15);
};

const flags = (route: LegalRoute, slot: number): number =>
  route.session
    .captureSaveSnapshot()
    .objectFlags.find(([at]) => at === slot)![1];

describe('the Shrine as a Talk Script', () => {
  test('greets a player who comes into its grounds, each time', async () => {
    const route = await openRoute(SHRINE);
    standAt(route, GROUNDS_EDGE);
    const lines = new Lines(route).advance(5);
    route.session.place({ x: 2 * CELL, y: 0, z: 2 * CELL });
    lines.advance(2);
    standAt(route, SHRINE_CENTRE);
    expect(lines.advance(5).lines).toEqual([
      'A SHRINE STANDS HERE',
      'A SHRINE STANDS HERE'
    ]);
  }, 60_000);

  test('is indifferent to any other object left inside it', async () => {
    const route = await openRoute(SHRINE);
    const played = leave(route, LARGE_BOX, SHRINE_CENTRE);
    expect(played.lines).toEqual([
      'A SHRINE STANDS HERE',
      'THE SHRINE IS INDIFFERENT'
    ]);
    expect(flags(route, LARGE_BOX) & FIXED).toBe(0);
  }, 60_000);

  test('ignores an object left in its grounds but outside it', async () => {
    const route = await openRoute(SHRINE);
    const played = leave(route, ENERGY_CRYSTAL, GROUNDS_EDGE);
    expect(played.lines).toEqual(['A SHRINE STANDS HERE']);
    expect(flags(route, ENERGY_CRYSTAL) & FIXED).toBe(0);
  }, 60_000);

  test('accepts the energy crystal once, fixes it, and remembers through a Save', async () => {
    const route = await openRoute(SHRINE);
    const played = leave(route, ENERGY_CRYSTAL, SHRINE_CENTRE);
    expect(played.lines).toEqual([
      'A SHRINE STANDS HERE',
      'THE SHRINE',
      'ACCEPTS THE CRYSTAL',
      'IT WILL NOT BE MOVED',
      ''
    ]);
    expect(flags(route, ENERGY_CRYSTAL) & FIXED).toBe(FIXED);

    const restored = GameplaySession.restore(
      route.session.content,
      route.session.benson,
      route.session.captureSaveSnapshot(),
      { scripts: talkScript(SHRINE) }
    );
    restored.place({ x: 2 * CELL, y: 0, z: 2 * CELL });
    const again = new Lines(LegalRoute.resume(restored)).advance(1);
    restored.place(SHRINE_CENTRE);
    // The restored display may first replay the offering's clearing line.
    expect(again.advance(5).lines.filter(line => line !== '')).toEqual([
      'THE SHRINE IS AT PEACE'
    ]);
  }, 60_000);
});

const read = async (name: string) => {
  try {
    return await readPayloadFile(name);
  } catch {
    return undefined;
  }
};

const withAssets = () =>
  load(read, () => readTargAssets(join(repositoryRoot, 'assets/targ')));

describe('the Shrine as an Authored Asset', () => {
  test('restores a Save made before it was placed, standing where it was put', async () => {
    const before = await openRoute(SHRINE);
    const snapshot = before.session.captureSaveSnapshot();
    expect(snapshot.residence.some(([slot]) => slot === SHRINE_SLOT)).toBe(
      false
    );
    const after = await LegalRoute.open({
      bundle: await withAssets(),
      talk: talkScript(SHRINE)
    });
    const restored = GameplaySession.restore(
      after.session.content,
      after.session.benson,
      snapshot,
      { scripts: talkScript(SHRINE) }
    );
    expect(restored.residenceOf(SHRINE_SLOT).kind).toBe('surface');
    expect(
      restored
        .captureSaveSnapshot()
        .residence.some(([slot]) => slot === SHRINE_SLOT)
    ).toBe(true);
  }, 60_000);

  test('stands in its own slot at Surface Cell (20,20), outside the city', async () => {
    const bundle = await withAssets();
    const shrine = new World(bundle).objects.find(o => o.slot === SHRINE_SLOT);
    expect(shrine?.model).toBe('authored:shrine');
    expect(Math.floor(shrine!.origin.x / CELL)).toBe(20);
    expect(Math.floor(shrine!.origin.z / CELL)).toBe(20);
  });
});
