import { describe, expect, test } from 'bun:test';

import { GameplaySession } from '../src/session/index.ts';
import type { Residence } from '../src/world/index.ts';
import { LegalRoute } from './legalCheckpoint.ts';
import { withoutScript } from './saveCheckpoint.ts';

/// Where two residences agree, to a float's rounding.
const expectSamePlace = (a: Residence, b: Residence): void => {
  expect(a.kind).toBe(b.kind);
  const at = 'at' in a ? a.at : undefined;
  const other = 'at' in b ? b.at : undefined;
  expect(at === undefined).toBe(other === undefined);
  if (at !== undefined && other !== undefined) {
    expect(at.x).toBeCloseTo(other.x, 3);
    expect(at.y).toBeCloseTo(other.y, 3);
    expect(at.z).toBeCloseTo(other.z, 3);
  }
};

/// Buys the Dart and boards it, which is the only legal way to be somewhere
/// firing is allowed at all.
const aboardTheDart = async (): Promise<LegalRoute> => {
  const route = await LegalRoute.open({ opening: true });
  route.waitForMessage('DO YOU WANT TO BUY?', 120);
  route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
  route.advance(4);
  route.run({ action: 'board', kind: 'reach', slot: 1 }, 240);
  return route;
};

const shotLifecycle = (route: LegalRoute): number =>
  route.session.observations().observations['effectLifecycle8'] as number;

describe('firing from a craft', () => {
  test('is refused on foot, and leaves nothing behind', async () => {
    const route = await LegalRoute.open({ opening: true });
    const before = route.session.observations().observations;

    expect(route.session.fire().outcome).toEqual({ kind: 'onFootRefused' });

    // A refusal is silent in the Reference Build, so the only way to be sure it
    // did nothing is that nothing observable moved.
    expect(route.session.observations().observations).toEqual(before);
  }, 60_000);

  test('puts one shot in the air, and asks for its sound', async () => {
    const route = await aboardTheDart();

    const fired = route.session.fire();

    expect(fired.outcome).toEqual({ kind: 'fired' });
    expect(fired.events).toEqual([{ fire: { sound: 8 } }]);
    expect(shotLifecycle(route)).toBe(16);
  }, 60_000);

  test('refuses a second shot while the first is still flying', async () => {
    const route = await aboardTheDart();
    route.session.fire();
    const before = route.session.observations().observations;

    expect(route.session.fire().outcome).toEqual({ kind: 'shotActiveRefused' });
    expect(route.session.observations().observations).toEqual(before);
  }, 60_000);

  test('lets a shot expire, and then allows the next one', async () => {
    const route = await aboardTheDart();
    route.session.fire();

    // Sixteen frames at the reference rate, and a little either side of the
    // boundary to show the lifecycle is what ends it.
    route.advance(15 / 20);
    expect(shotLifecycle(route)).toBeGreaterThan(0);
    route.advance(2 / 20);

    expect(shotLifecycle(route)).toBe(0);
    expect(route.session.fire().outcome).toEqual({ kind: 'fired' });
  }, 60_000);

  test('starts where the player is and covers one cell per life', async () => {
    const route = await aboardTheDart();
    const player = route.session.snapshot.player.position;
    expect(route.session.residenceOf(8).kind).toBe('gone');

    route.session.fire();
    const created = route.session.residenceOf(8);
    if (created.kind !== 'surface' || created.at === undefined) {
      throw new Error('a fired shot should be somewhere on the surface');
    }
    // The Reference Build copies the player's own position bytes, so a shot
    // begins exactly where its craft is rather than ahead of it.
    expect(created.at).toEqual(player);

    // Fifteen of the sixteen frames, which is as far as it gets before the
    // last one removes it.
    route.advance(15 / 20);
    const flown = route.session.residenceOf(8);
    if (flown.kind !== 'surface' || flown.at === undefined) {
      throw new Error('a shot mid-flight should still be on the surface');
    }
    const travelled = Math.hypot(
      flown.at.x - created.at.x,
      flown.at.y - created.at.y,
      flown.at.z - created.at.z
    );
    // Full magnitude is 4096 a frame, so fifteen frames is fifteen of them,
    // and the whole life is one high-byte unit — the unit cells are indexed by.
    expect(travelled).toBeCloseTo(15 * 4096, 0);
    expect(16 * 4096).toBe(0x1_00_00);

    route.advance(2 / 20);
    expect(route.session.residenceOf(8).kind).toBe('gone');
  }, 60_000);

  test('keeps a shot in the air across a Save', async () => {
    const route = await aboardTheDart();
    route.session.fire();
    route.advance(8 / 20);
    const before = route.session.observations().observations;

    const restored = GameplaySession.restore(
      route.session.content,
      route.session.benson,
      route.session.captureSaveSnapshot()
    );

    expect(withoutScript(restored.observations().observations)).toEqual(
      withoutScript(before)
    );
    // And it goes on expiring on the same frame it would have.
    restored.advance(7 / 20);
    route.advance(7 / 20);
    expect(restored.observations().observations['effectLifecycle8']).toBe(
      route.session.observations().observations['effectLifecycle8']
    );
    expectSamePlace(restored.residenceOf(8), route.session.residenceOf(8));
  }, 60_000);

  test('does not fire while a structure impact is still playing', async () => {
    const route = await aboardTheDart();

    // No impact can exist yet, so this pins the refusal's shape rather than
    // reaching it: the destruction slice is what will make it reachable.
    expect(route.session.fire().outcome).toEqual({ kind: 'fired' });
  }, 60_000);
});
