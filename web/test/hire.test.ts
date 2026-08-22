import { describe, expect, test } from 'bun:test';

import { BensonHostState } from '../src/benson/index.ts';
import { room } from '../src/world/index.ts';
import { LegalRoute } from './legalCheckpoint.ts';

const CREDITS = BensonHostState.firstNumberDecimal;
/// Accepted, or already on its way down: either way the ship is coming.
const underway = (route: LegalRoute): boolean =>
  route.session.observations().observations['shipInbound'] !== 0;
const HIRED = 0x04;
const RENTAL_ROOM = 16;
const ANTENNA = 30;

/// A session holding `balance`, standing in the rental Room.
///
/// The balance is set rather than earned. Earning it takes most of the
/// game, and what is under test here is a comparison the script makes, not
/// whether the economy can reach the number -- the dossier already settles
/// that it can, at most once.
const atTheTerminal = async (
  balance: number,
  options?: { readonly antenna?: 'absent' | 'carried' | 'inRoom' }
): Promise<LegalRoute> => {
  const route = await LegalRoute.open();
  const scripts = route.session.scripts!;
  scripts.host = scripts.host.withDecimal(CREDITS, balance);

  const antenna = options?.antenna ?? 'carried';
  if (antenna === 'carried') {
    route.session.carry(ANTENNA);
  } else if (antenna === 'inRoom') {
    route.session.carry(ANTENNA);
    route.session.teleport(room(RENTAL_ROOM));
    route.advance(2);
    route.session.drop();
    route.session.teleport(room(1));
    route.settle();
  }
  route.session.teleport(room(RENTAL_ROOM));
  return route;
};

/// Says yes to the terminal's question and lets the answer land.
const sayYes = (route: LegalRoute): void => {
  route.advance(20);
  route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
  route.advance(30);
};

describe('the Antenna the rental terminal needs', () => {
  test('works when it is carried in', async () => {
    const route = await atTheTerminal(1_000_000, { antenna: 'carried' });
    sayYes(route);
    expect(underway(route)).toBeTrue();
  }, 60_000);

  test('works when it was left in the Room', async () => {
    const route = await atTheTerminal(1_000_000, { antenna: 'inRoom' });
    sayYes(route);
    expect(underway(route)).toBeTrue();
  }, 60_000);

  test('the terminal is dead without it, whatever the balance', async () => {
    const route = await atTheTerminal(99_000_000, { antenna: 'absent' });
    sayYes(route);
    const after = route.session.observations().observations;
    expect(after['shipInbound']).toBe(0);
    expect(after['credits']).toBe(99_000_000);
    expect((after['engineFlags'] as number) & HIRED).toBe(0);
  }, 60_000);
});

/// The affordability test compares only the millions pair, so it is a
/// comparison against a round million rather than against the price. One
/// credit short of the price is refused; one credit over the pair boundary
/// is accepted and leaves a single credit behind.
describe('what the rental costs', () => {
  test('refuses 999,999', async () => {
    const route = await atTheTerminal(999_999);
    sayYes(route);
    const after = route.session.observations().observations;
    expect(after['credits']).toBe(999_999);
    expect(after['shipInbound']).toBe(0);
    expect((after['engineFlags'] as number) & HIRED).toBe(0);
  }, 60_000);

  test('accepts 1,000,000 and leaves one credit', async () => {
    const route = await atTheTerminal(1_000_000);
    sayYes(route);
    const after = route.session.observations().observations;
    expect(after['credits']).toBe(1);
    expect(underway(route)).toBeTrue();
    expect((after['engineFlags'] as number) & HIRED).toBe(HIRED);
  }, 60_000);

  test('takes exactly 999,999 from a larger balance', async () => {
    const route = await atTheTerminal(1_909_000);
    sayYes(route);
    expect(route.session.observations().observations['credits']).toBe(909_001);
  }, 60_000);

  test('is refused just under the pair boundary and accepted just over it', async () => {
    for (const [balance, accepted] of [
      [1_999_999, true],
      [999_999, false]
    ] as const) {
      const route = await atTheTerminal(balance);
      sayYes(route);
      expect(underway(route)).toBe(accepted);
    }
  }, 120_000);
});

describe('not hiring', () => {
  test('another key changes nothing', async () => {
    const route = await atTheTerminal(1_000_000);
    route.advance(20);
    route.run({ command: { key: null, kind: 'press' }, kind: 'command' });
    route.advance(30);
    const after = route.session.observations().observations;
    expect(after['credits']).toBe(1_000_000);
    expect(after['shipInbound']).toBe(0);
    expect((after['engineFlags'] as number) & HIRED).toBe(0);
  }, 60_000);

  test('saying nothing changes nothing', async () => {
    const route = await atTheTerminal(1_000_000);
    route.advance(120);
    const after = route.session.observations().observations;
    expect(after['credits']).toBe(1_000_000);
    expect(after['shipInbound']).toBe(0);
    expect((after['engineFlags'] as number) & HIRED).toBe(0);
  }, 60_000);

  test('leaving and coming back offers it again', async () => {
    const route = await atTheTerminal(1_000_000);
    route.advance(120);
    route.settle();
    route.session.teleport(room(83));
    route.settle();
    route.session.teleport(room(RENTAL_ROOM));
    sayYes(route);
    expect(underway(route)).toBeTrue();
  }, 120_000);
});

/// The script has no already-hired guard, and none is added here. It cannot
/// matter in a legal game: the closed economy tops out at 1,909,000, which
/// funds one hire and never a second.
describe('hiring twice', () => {
  test('is refused by the price, not by a guard', async () => {
    const route = await atTheTerminal(1_909_000);
    sayYes(route);
    expect(route.session.observations().observations['credits']).toBe(909_001);

    route.settle();
    route.session.teleport(room(83));
    route.settle();
    route.session.teleport(room(RENTAL_ROOM));
    sayYes(route);

    // 909,001 does not reach the million the terminal compares against.
    expect(route.session.observations().observations['credits']).toBe(909_001);
  }, 120_000);
});

describe('walking in and hiring', () => {
  test('takes the Doorway from Room 83 and hires from inside', async () => {
    const route = await LegalRoute.open();
    route.session.scripts!.host = route.session.scripts!.host.withDecimal(
      CREDITS,
      1_000_000
    );
    route.session.carry(ANTENNA);
    route.session.teleport(room(83));
    route.settle();

    // The last leg is walked, not teleported: the Doorway has to open.
    route.walkThroughTo(RENTAL_ROOM);
    expect(route.session.observations().observations['room']).toBe(RENTAL_ROOM);

    // The terminal's poll does not wait forever, so the answer goes in while
    // it is still asking.
    let heard = '';
    const listen = (ticks: number): void => {
      for (let step = 0; step < ticks; step++) {
        route.advance(0.5);
        const text = route.session.observations().observations['messageText'];
        if (typeof text === 'string' && text.includes('8-8')) {
          heard = text;
        }
      }
    };
    listen(40);
    route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
    listen(80);

    const after = route.session.observations().observations;
    expect(after['credits']).toBe(1);
    expect(underway(route)).toBeTrue();
    expect((after['engineFlags'] as number) & HIRED).toBe(HIRED);
    // The terminal says where it is sending the ship.
    expect(heard).toContain('8-8');
  }, 120_000);
});
