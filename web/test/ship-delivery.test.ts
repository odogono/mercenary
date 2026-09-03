import { describe, expect, test } from 'bun:test';

import { BensonHostState } from '../src/benson/index.ts';
import { GameplaySession } from '../src/session/index.ts';
import { room } from '../src/world/index.ts';
import { LegalRoute } from './legalCheckpoint.ts';

const CREDITS = BensonHostState.firstNumberDecimal;
const SHIP = 7;
const SURFACE = 0;

/// Hires the ship for real, through script 2, and stops before any of it has
/// been delivered.
const justHired = async (): Promise<LegalRoute> => {
  const route = await LegalRoute.open();
  route.session.scripts!.host = route.session.scripts!.host.withDecimal(
    CREDITS,
    1_000_000
  );
  route.session.carry(30);
  route.session.teleport(room(16));
  route.waitForMessage('DO YOU WANT TO HIRE?');
  route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
  // Stops the moment the script writes its state and before the descent has
  // consumed it. There is room to do that because a hundredth of a second is a
  // fifth of a Reference Build frame, so the accepted value survives a few
  // steps -- which is also why the window has to be watched rather than waited
  // out.
  for (let step = 0; step < 6000; step++) {
    route.advance(1 / 100);
    if (route.session.observations().observations['shipInbound'] === 255) {
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

describe('a ship that has been hired but not yet despatched', () => {
  test('is still in Room 5, and the state byte says it is coming', async () => {
    const route = await justHired();
    const observed = route.session.observations().observations;
    expect(observed['shipInbound']).toBe(255);
    expect(observed[`objectRoom.${SHIP}`]).toBe(5);
  }, 60_000);

  test('survives a Save taken in that window', async () => {
    const route = await justHired();
    const resumed = GameplaySession.restore(
      route.session.content,
      route.session.scripts,
      route.session.captureSaveSnapshot()
    );
    expect(resumed.observations().observations['shipInbound']).toBe(255);

    resumed.advance(1);
    expect(resumed.observations().observations['shipInbound']).toBe(127);
    expect(resumed.observations().observations[`objectRoom.${SHIP}`]).toBe(
      SURFACE
    );
  }, 60_000);
});

describe('the ship on its way down', () => {
  test('leaves Room 5 for cell 8:8 in a single step', async () => {
    const route = await justHired();
    route.advance(1 / 20);
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

  test('descends by the decoded decay, exactly', async () => {
    const route = await justHired();
    route.advance(1 / 20);
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

  test('lands after the decoded number of frames and clears the state', async () => {
    const route = await justHired();
    // One frame to despatch, then the decoded descent.
    route.advance((1 + 779) / 20);
    const observed = route.session.observations().observations;

    expect(observed['shipInbound']).toBe(0);
    expect(observed[`objectRoom.${SHIP}`]).toBe(SURFACE);
    expect(altitudeOf(route.session)).toBe(0);
  }, 60_000);

  test('is still one frame short of the ground the step before', async () => {
    const route = await justHired();
    route.advance((1 + 778) / 20);
    expect(route.session.observations().observations['shipInbound']).toBe(127);
    expect(altitudeOf(route.session)).toBeGreaterThan(0);
  }, 60_000);

  test('stays landed once it is down', async () => {
    const route = await justHired();
    route.advance((1 + 779) / 20);
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

  test('carries the part of a frame that has not elapsed across a Save', async () => {
    const route = await justHired();
    route.advance(1 / 20);
    // A third of a frame: too little to move the ship, and it must not be lost.
    route.advance(1 / 60);
    const snapshot = route.session.captureSaveSnapshot();
    expect(snapshot.deliveryFrames).toBeGreaterThan(0);
    expect(snapshot.deliveryFrames).toBeLessThan(1);

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
    route.session.scripts!.host = route.session.scripts!.host.withDecimal(
      CREDITS,
      999_999
    );
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
