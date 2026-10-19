import { describe, expect, test } from 'bun:test';

import { ROOMS } from '../src/talk/scripts.ts';
import { room } from '../src/world/index.ts';
import type { LegalRoute } from './legalCheckpoint.ts';
import { ENGINES, Lines, openRoute, type Engine } from './talkParity.ts';

/// The briefing rooms, the banks and the prison as a Talk Script (ADR 0080),
/// against Benson Scripts 8, 11, 13, 28 and 29 as the oracle: each visit is
/// played by both, and both must show the same lines.

const BANKS = [42, 79, 159];
const PRISON = 81;
const MECHANOID_BRIEFING = 102;
const PALYAR_BRIEFING = 41;
/// A Room with nothing to say, to leave for.
const ELSEWHERE = 1;

const both = async (
  play: (route: LegalRoute) => Lines
): Promise<Record<Engine, readonly string[]>> => {
  const result = {} as Record<Engine, readonly string[]>;
  for (const engine of ENGINES) {
    result[engine] = play(await openRoute(engine, ROOMS)).lines;
  }
  return result;
};

const visit = (where: number, seconds: number) => (route: LegalRoute) => {
  route.session.teleport(room(where));
  return new Lines(route).advance(seconds);
};

/// Comes in, and goes once the given line has played.
const leaveAfter =
  (where: number, line: string) =>
  (route: LegalRoute): Lines => {
    route.session.teleport(room(where));
    const lines = new Lines(route).until(line);
    route.session.teleport(room(ELSEWHERE));
    return lines.advance(60);
  };

describe('the Room lines as a Talk Script', () => {
  test('each bank tells the player their credits', async () => {
    for (const bank of BANKS) {
      const played = await both(visit(bank, 15));
      expect(played.talk).toEqual(played.benson);
      expect(played.talk).toEqual(['BANK', 'YOU HAVE 9000 CREDITS', '']);
    }
  }, 120_000);

  test('the prison names itself, with no blank line after', async () => {
    const played = await both(visit(PRISON, 10));
    expect(played.talk).toEqual(played.benson);
    expect(played.talk).toEqual(['PRISON']);
  }, 60_000);

  test('the Mechanoid briefing plays whole to a player who stays', async () => {
    const played = await both(visit(MECHANOID_BRIEFING, 90));
    expect(played.talk).toEqual(played.benson);
    expect(played.talk.at(-2)).toBe('BRIEFING ENDS');
  }, 120_000);

  test('the Palyar briefing plays whole to a player who stays', async () => {
    const played = await both(visit(PALYAR_BRIEFING, 120));
    expect(played.talk).toEqual(played.benson);
    expect(played.talk.at(-2)).toBe('BRIEFING ENDS');
  }, 120_000);

  test('the Mechanoid briefing stops after its first paragraph once the player goes', async () => {
    const played = await both(leaveAfter(MECHANOID_BRIEFING, 'WE WILL PAY'));
    expect(played.talk).toEqual(played.benson);
    expect(played.talk).not.toContain('BRIEFING ENDS');
  }, 120_000);

  test('the Palyar briefing stops at the next paragraph once the player goes', async () => {
    for (const line of [
      'PALYAR BRIEFING ROOM',
      'WE WILL REWARD',
      'THERE IS A BIG FEE FOR'
    ]) {
      const played = await both(leaveAfter(PALYAR_BRIEFING, line));
      expect(played.talk).toEqual(played.benson);
      expect(played.talk).not.toContain('BRIEFING ENDS');
    }
  }, 300_000);
});
