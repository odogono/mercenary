import { describe, expect, test } from 'bun:test';

import { GameplaySession } from '../src/session/index.ts';
import { room } from '../src/world/index.ts';
import { LegalRoute } from './legalCheckpoint.ts';

const SHIP = 7;
const SURFACE = 0;

/// Hires the ship for real, through the commerce Talk Script, and stops in the step it sets
/// off (ADR 0083: a hired ship starts down at once, in seconds).
const justHired = async (): Promise<LegalRoute> => {
  const route = await LegalRoute.open();
  route.session.adjust({ credits: 1_000_000 });
  route.session.carry(30);
  route.session.teleport(room(16));
  route.waitForMessage('DO YOU WANT TO HIRE?');
  route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
  for (let step = 0; step < 6000; step++) {
    route.advance(1 / 100);
    // Accepted (255) the step the hire lands; descending (127) from the next.
    if (route.session.observations().observations['shipInbound'] === 127) {
      return route;
    }
  }
  throw new Error('the hire never despatched a ship');
};

const altitudeOf = (session: GameplaySession): number => {
  const where = session.snapshot.residence.get(SHIP);
  if (where === undefined || !('at' in where) || where.at === undefined) {
    throw new Error('the ship has not been placed');
  }
  return where.at.y;
};

describe('a ship that has been hired', () => {
  test('sets off from Room 5 for cell 8:8 at once', async () => {
    const route = await justHired();
    const observed = route.session.observations().observations;

    expect(observed['shipInbound']).toBe(127);
    expect(observed[`objectRoom.${SHIP}`]).toBe(SURFACE);
    const where = route.session.snapshot.residence.get(SHIP)!;
    expect('at' in where && where.at).toEqual({
      x: 0x08_99_00,
      y: 0x7f_00_00,
      z: 0x08_8b_00
    });
  }, 60_000);

  test('survives a Save taken as it sets off', async () => {
    const route = await justHired();
    const resumed = GameplaySession.restore(
      route.session.content,
      route.session.scripts,
      route.session.captureSaveSnapshot()
    );
    resumed.advance(1);
    expect(resumed.observations().observations['shipInbound']).toBe(127);
    expect(resumed.observations().observations[`objectRoom.${SHIP}`]).toBe(
      SURFACE
    );
  }, 60_000);
});

describe('the ship on its way down', () => {
  test('descends by the decoded decay, exactly', async () => {
    const route = await justHired();
    const seen: number[] = [altitudeOf(route.session) >>> 8];
    for (let step = 0; step < 5; step++) {
      route.advance(1 / 20);
      seen.push(altitudeOf(route.session) >>> 8);
    }
    expect(seen).toEqual([
      0x7f_00, 0x7e_01, 0x7d_04, 0x7c_09, 0x7b_10, 0x7a_19
    ]);
  }, 60_000);

  test('keeps its altitude a whole multiple of 0x100', async () => {
    const route = await justHired();
    for (let step = 0; step < 40; step++) {
      route.advance(1 / 20);
      expect(altitudeOf(route.session) % 0x1_00).toBe(0);
    }
  }, 60_000);

  test('does not care that the player is underground', async () => {
    const route = await justHired();
    route.advance(1 / 20);
    const high = altitudeOf(route.session);
    route.session.teleport(room(1));
    route.advance(2);
    expect(altitudeOf(route.session)).toBeLessThan(high);
  }, 60_000);

  test('lands in the decoded 39 seconds and clears the state', async () => {
    const route = await justHired();
    route.advance(779 / 20);
    const observed = route.session.observations().observations;

    expect(observed['shipInbound']).toBe(0);
    expect(observed[`objectRoom.${SHIP}`]).toBe(SURFACE);
    expect(altitudeOf(route.session)).toBe(0);
  }, 60_000);

  test('is still above the ground a twentieth of a second before', async () => {
    const route = await justHired();
    route.advance(778 / 20);
    expect(route.session.observations().observations['shipInbound']).toBe(127);
    expect(altitudeOf(route.session)).toBeGreaterThan(0);
  }, 60_000);

  test('stays landed once it is down', async () => {
    const route = await justHired();
    route.advance(779 / 20);
    route.advance(30);
    expect(altitudeOf(route.session)).toBe(0);
    expect(route.session.observations().observations['shipInbound']).toBe(0);
  }, 60_000);
});

describe('how the descent is stepped', () => {
  test('two half advances land in the same place as one whole one', async () => {
    const halves = await justHired();
    for (let step = 0; step < 80; step++) {
      halves.advance(1 / 40);
    }
    const whole = await justHired();
    for (let step = 0; step < 40; step++) {
      whole.advance(1 / 20);
    }
    expect(altitudeOf(halves.session)).toBe(altitudeOf(whole.session));
  }, 120_000);

  test('a Save mid-descent resumes frame for frame', async () => {
    const route = await justHired();
    route.advance(20 / 20);
    const resumed = GameplaySession.restore(
      route.session.content,
      route.session.scripts,
      route.session.captureSaveSnapshot()
    );
    expect(altitudeOf(resumed)).toBe(altitudeOf(route.session));

    for (let step = 0; step < 60; step++) {
      resumed.advance(1 / 20);
      route.advance(1 / 20);
    }
    expect(altitudeOf(resumed)).toBe(altitudeOf(route.session));
  }, 120_000);

  test('carries the seconds of its descent across a Save', async () => {
    const route = await justHired();
    route.advance(1 / 20);
    // Too little more to move the ship, and it must not be lost.
    route.advance(1 / 60);
    const snapshot = route.session.captureSaveSnapshot();
    expect(snapshot.deliverySeconds).toBeGreaterThan(1 / 20);

    const resumed = GameplaySession.restore(
      route.session.content,
      route.session.scripts,
      snapshot
    );
    resumed.advance(1 / 60);
    route.advance(1 / 60);
    expect(altitudeOf(resumed)).toBe(altitudeOf(route.session));
  }, 60_000);
});

describe('a ship that was never hired', () => {
  test('stays in Room 5 however long the session runs', async () => {
    const route = await LegalRoute.open();
    route.advance(120);
    const observed = route.session.observations().observations;
    expect(observed['shipInbound']).toBe(0);
    expect(observed[`objectRoom.${SHIP}`]).toBe(5);
  }, 60_000);

  test('is not despatched by a refused hire', async () => {
    const route = await LegalRoute.open();
    route.session.adjust({ credits: 999_999 });
    route.session.carry(30);
    route.session.teleport(room(16));
    route.waitForMessage('DO YOU WANT TO HIRE?');
    route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
    route.advance(60);

    const observed = route.session.observations().observations;
    expect(observed['shipInbound']).toBe(0);
    expect(observed[`objectRoom.${SHIP}`]).toBe(5);
    expect(observed['credits']).toBe(999_999);
  }, 60_000);
});
