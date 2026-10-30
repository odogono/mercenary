import { describe, expect, test } from 'bun:test';

import { GameplaySession } from '../src/session/index.ts';
import { DELIVERIES } from '../src/talk/scripts.ts';
import { room } from '../src/world/index.ts';
import { LegalRoute } from './legalCheckpoint.ts';
import {
  ENGINES,
  Lines,
  openRoute,
  talkScript,
  type Engine
} from './talkParity.ts';

/// The deliveries as a Talk Script (ADR 0080), against Benson Scripts 3-6, 9,
/// 14-20 and 22-25 as the oracle: each visit is played by both, and both must
/// show the same lines and leave the same credits and object. What each Room
/// pays is `deliveries.test.ts`'s, against the Benson Scripts alone.

/// Each Room and the object it wants, in the survey's order.
const ROWS: readonly (readonly [room: number, slot: number])[] = [
  [136, 29],
  [155, 42],
  [162, 38],
  [163, 44],
  [165, 41],
  [173, 31],
  [147, 34],
  [146, 35],
  [144, 43],
  [170, 45],
  [154, 12],
  [70, 29],
  [50, 31],
  [48, 34],
  [34, 35],
  [18, 43]
];

const CAPTURED_MECHANOID = 12;
const ENGINE_ROOM = 136;
const MECHANOID_FUEL_STORES = 70;
const NEUTRON_FUEL = 29;
/// A Room with nothing to say, to leave a delivery Room for.
const ELSEWHERE = 1;
/// The object flag Benson marks a paid-for object with.
const PAID = 1;

interface Outcome {
  readonly credits: number;
  readonly flags: number;
  readonly lies: number;
  readonly lines: readonly string[];
}

const outcome = (lines: Lines, slot: number): Outcome => {
  const observed = lines.route.session.observations().observations;
  return {
    credits: observed['credits'] as number,
    // The paid-for mark is the Talk Script's own now, so only Benson sets it.
    flags: (observed[`objectFlags.${slot}`] as number) & ~PAID,
    lies: observed[`objectRoom.${slot}`] as number,
    lines: lines.lines
  };
};

/// Plays a visit by both engines, and returns what each left.
const both = async (
  slot: number,
  play: (route: LegalRoute) => Lines | Promise<Lines>
): Promise<Record<Engine, Outcome>> => {
  const result = {} as Record<Engine, Outcome>;
  for (const engine of ENGINES) {
    result[engine] = outcome(
      await play(await openRoute(engine, DELIVERIES)),
      slot
    );
  }
  return result;
};

/// Carries the object into the Room and puts it down once asked to.
const handIn = (route: LegalRoute, slot: number, buyer: number): Lines => {
  route.session.carry(slot);
  route.session.teleport(room(buyer));
  const lines = new Lines(route).until('PLEASE LEAVE').advance(10);
  route.session.drop(slot);
  return lines.until('').advance(5);
};

/// Leaves the object somewhere and waits out whatever that Room says.
const leaveAt = (route: LegalRoute, slot: number, where: number): void => {
  route.session.carry(slot);
  route.session.teleport(room(where));
  route.advance(2);
  route.session.drop(slot);
  route.advance(60);
};

describe('the deliveries as a Talk Script', () => {
  test('every Room pays for its object as its Benson Script does', async () => {
    for (const [buyer, slot] of ROWS) {
      const played = await both(slot, route => handIn(route, slot, buyer));
      expect(played.talk).toEqual(played.benson);
      expect(played.talk.lies).toBe(buyer);
      expect(played.talk.lines.at(-2)).toStartWith('YOU HAVE ');
    }
  }, 300_000);

  test('pays for the Neutron Fuel with these lines', async () => {
    const played = await both(NEUTRON_FUEL, route =>
      handIn(route, NEUTRON_FUEL, ENGINE_ROOM)
    );
    expect(played.talk.lines).toEqual([
      'ENGINE ROOM',
      'PLEASE LEAVE',
      'NEUTRON FUEL',
      'HERE FOR 200000 REWARD',
      '200000 CREDITS PAID',
      'YOU HAVE 209000 CREDITS',
      ''
    ]);
  }, 60_000);

  test('says only the Room’s name to a player who brings nothing', async () => {
    const played = await both(NEUTRON_FUEL, route => {
      route.session.teleport(room(ENGINE_ROOM));
      return new Lines(route).advance(10);
    });
    expect(played.talk).toEqual(played.benson);
    expect(played.talk.lines).toEqual(['ENGINE ROOM', '']);
  }, 60_000);

  test('pays nothing to a player who leaves holding the object', async () => {
    const played = await both(NEUTRON_FUEL, route => {
      route.session.carry(NEUTRON_FUEL);
      route.session.teleport(room(ENGINE_ROOM));
      const lines = new Lines(route).until('HERE FOR 200000 REWARD');
      route.session.teleport(room(ELSEWHERE));
      return lines.advance(10);
    });
    expect(played.talk).toEqual(played.benson);
    expect(played.talk.lines.at(-1)).toBe('');
    expect(played.talk.credits).toBe(9000);
  }, 60_000);

  test('pays for an object put down while the Room’s name still plays', async () => {
    const played = await both(NEUTRON_FUEL, route => {
      route.session.carry(NEUTRON_FUEL);
      route.session.teleport(room(ENGINE_ROOM));
      route.advance(0.25);
      route.session.drop(NEUTRON_FUEL);
      return new Lines(route).advance(30);
    });
    expect(played.talk).toEqual(played.benson);
    expect(played.talk.credits).toBe(209_000);
  }, 60_000);

  test('pays once for an object both factions want', async () => {
    const played = await both(NEUTRON_FUEL, route => {
      handIn(route, NEUTRON_FUEL, ENGINE_ROOM);
      route.session.carry(NEUTRON_FUEL);
      route.session.teleport(room(MECHANOID_FUEL_STORES));
      return new Lines(route).advance(15);
    });
    expect(played.talk).toEqual(played.benson);
    expect(played.talk.lines).toEqual(['MECHANOID FUEL STORES', '']);
    expect(played.talk.credits).toBe(209_000);
  }, 60_000);

  test('the Mechanoids take nothing while their leader is away', async () => {
    const played = await both(NEUTRON_FUEL, route => {
      leaveAt(route, CAPTURED_MECHANOID, ELSEWHERE);
      route.session.carry(NEUTRON_FUEL);
      route.session.teleport(room(MECHANOID_FUEL_STORES));
      return new Lines(route).advance(15);
    });
    expect(played.talk).toEqual(played.benson);
    expect(played.talk.lines).toEqual([
      'MECHANOID FUEL STORES',
      'THE MECHANOIDS SAY',
      'PUT BACK OUR LEADER',
      ''
    ]);
  }, 120_000);

  test('pays nothing for an object an older Save marked paid for', async () => {
    const session = (await openRoute('talk', DELIVERIES)).session;
    const saved = session.captureSaveSnapshot();
    const restored = GameplaySession.restore(
      session.content,
      session.scripts,
      {
        ...saved,
        objectFlags: saved.objectFlags.map(([slot, flags]) => [
          slot,
          slot === NEUTRON_FUEL ? flags | PAID : flags
        ])
      },
      { scripts: talkScript(DELIVERIES) }
    );
    const route = LegalRoute.resume(restored);
    route.session.carry(NEUTRON_FUEL);
    route.session.teleport(room(ENGINE_ROOM));
    const played = outcome(new Lines(route).advance(10), NEUTRON_FUEL);
    expect(played.lines).toEqual(['ENGINE ROOM', '']);
    expect(played.credits).toBe(9000);
    // The script has taken the mark over.
    expect(
      (restored.observations().observations[
        `objectFlags.${NEUTRON_FUEL}`
      ] as number) & PAID
    ).toBe(0);
  }, 60_000);

  test('a Save while the Room waits for the drop restores and still pays', async () => {
    const route = await openRoute('talk', DELIVERIES);
    route.session.carry(NEUTRON_FUEL);
    route.session.teleport(room(ENGINE_ROOM));
    new Lines(route).until('HERE FOR 200000 REWARD').advance(5);
    const session = route.session;
    const restored = GameplaySession.restore(
      session.content,
      session.scripts,
      session.captureSaveSnapshot(),
      { scripts: talkScript(DELIVERIES) }
    );
    const resumed = LegalRoute.resume(restored);
    restored.drop(NEUTRON_FUEL);
    new Lines(resumed).until('200000 CREDITS PAID').advance(5);
    expect(restored.observations().observations['credits']).toBe(209_000);
  }, 60_000);
});
