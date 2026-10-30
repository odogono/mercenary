import { describe, expect, test } from 'bun:test';

import { GameplaySession } from '../src/session/index.ts';
import { COMMERCE, ESCAPE } from '../src/talk/scripts.ts';
import { room } from '../src/world/index.ts';
import { LegalRoute } from './legalCheckpoint.ts';
import {
  Lines,
  openRoute,
  openRouteWith,
  presetting,
  talkScript
} from './talkParity.ts';

/// The Escape as a Talk Script (ADR 0080), ported from Benson Script 7: each
/// route must show the lines Benson showed and leave the same Ending phase,
/// which the snapshot keeps. `escape.test.ts` covers the routes themselves.

const SHIP = 7;
const NOVADRIVE = 25;
const HANGAR_ROOM = 5;
const ADVERT_CELL = 0x32;
const CELL = 0x1_00_00;

/// The Escape asks commerce whether the ship was hired.
const escapeScript = talkScript(ESCAPE, COMMERCE);
const open = (annoyed = false): Promise<LegalRoute> =>
  annoyed
    ? openRouteWith(
        presetting(talkScript(ESCAPE, COMMERCE), ESCAPE, 'annoyed', 'true')
      )
    : openRoute(ESCAPE, COMMERCE);

const phase = (session: GameplaySession): number =>
  session.observations().observations['endingPhase'] as number;

const pressY = (route: LegalRoute): void => {
  route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
};

/// Aboard the recovered ship in the hangar, the Escape just started.
const aboardInTheHangar = async (
  novadrive = true,
  annoyed = false
): Promise<Lines> => {
  const route = await open(annoyed);
  if (novadrive) {
    route.session.carry(NOVADRIVE);
  }
  route.session.teleport(room(HANGAR_ROOM));
  route.settle();
  route.run({ action: 'board', kind: 'reach', slot: SHIP }, 60);
  expect(route.session.observations().observations['occupancy']).toBe(SHIP);
  return new Lines(route);
};

const surfaceAboard = (lines: Lines): Lines => {
  lines.route.run({ command: { kind: 'rideLift' }, kind: 'command' });
  expect(lines.route.session.observations().observations['room']).toBe(0);
  return lines;
};

/// Up the lift, to the prompt, and Y.
const launch = (lines: Lines): Lines => {
  surfaceAboard(lines.until('INTERSTELLAR SHIP')).until('PRESS Y TO LAUNCH');
  pressY(lines.route);
  return lines.advance(10);
};

/// Destroys the author's advert from a Dart parked over it, as
/// `escape.test.ts` does.
const strikeTheAdvert = (route: LegalRoute): void => {
  const session = route.session;
  session.board(1);
  session.game = {
    ...session.game,
    player: {
      ...session.game.player,
      heading: Math.PI,
      position: {
        x: (ADVERT_CELL & 0x0f) * CELL + 0x70_00,
        y: 0,
        z: (ADVERT_CELL >> 4) * CELL + 0x70_00
      }
    }
  };
  session.fire();
  route.advance(1 / 20);
  route.settle();
  session.adjust({ attackingShip: false });
  session.leaveCraft();
  // Commerce greets a Dart boarded without buying it: let that play out.
  route.advance(30);
};

/// Plays a route on Talk, checking its lines and phase against Benson's.
const onTalk = async (
  play: () => Promise<Lines>
): Promise<{ lines: string[]; phase: number }> => {
  const lines = await play();
  const result = { lines: lines.lines, phase: phase(lines.route.session) };
  expect(result).toMatchSnapshot();
  return result;
};

describe('the Escape as a Talk Script', () => {
  test('launches with a Novadrive as Benson Script 7 does', async () => {
    const played = await onTalk(async () =>
      launch(await aboardInTheHangar()).until('SEE YOU IN MERCENARY II')
    );
    // The Escape writes 1, and the Ending carries the phase on from there.
    expect(played.phase).toBeGreaterThan(0);
    expect(played.lines).toEqual([
      'INTERSTELLAR SHIP',
      'PRESS Y TO LAUNCH',
      'THE AUTHOR SENDS YOU',
      'CONGRATULATIONS ON YOUR',
      'ESCAPE FROM TARG',
      '',
      'SAVE OUT THE STATUS AND',
      'SEE YOU IN MERCENARY II'
    ]);
  }, 120_000);

  test('repeats GAME OVER every 15 ticks, silencing both voices', async () => {
    const played = await onTalk(async () =>
      launch(await aboardInTheHangar())
        .until('SEE YOU IN MERCENARY II')
        .advance(20)
    );
    const gameOvers = played.lines.filter(line => line === 'GAME OVER');
    expect(gameOvers.length).toBeGreaterThan(1);
  }, 120_000);

  test('tells of the commander’s brother-in-law when he is annoyed', async () => {
    const played = await onTalk(async () => {
      const lines = await aboardInTheHangar(true, true);
      return launch(lines).until('SEE YOU IN MERCENARY II');
    });
    expect(played.lines).toContain('IS PLEASED YOU,VE GONE');
  }, 120_000);

  test('hears from commerce that the Dart was taken unpaid', async () => {
    const route = await open();
    // Commerce scolds the thief, and tells the Escape. Benson started no
    // Benson Script for a Dart boarded this way, so there is no record.
    route.session.board(1);
    route.advance(1 / 20);
    route.session.leaveCraft();
    route.advance(30);
    route.session.carry(NOVADRIVE);
    route.session.teleport(room(HANGAR_ROOM));
    route.settle();
    route.run({ action: 'board', kind: 'reach', slot: SHIP }, 60);
    const lines = launch(new Lines(route)).until('SEE YOU IN MERCENARY II');
    expect(lines.lines).toContain('IS PLEASED YOU,VE GONE');
  }, 120_000);

  test('without a Novadrive, refuses on the surface', async () => {
    const played = await onTalk(async () =>
      surfaceAboard((await aboardInTheHangar(false)).until('INTERSTELLAR SHIP'))
        .until('NOVADRIVE REQUIRED')
        .advance(5)
    );
    expect(played.lines).toEqual([
      'INTERSTELLAR SHIP',
      'NOVADRIVE REQUIRED',
      ''
    ]);
    expect(played.phase).toBe(0);
  }, 120_000);

  test('leaving the ship at the prompt ends with a blank line', async () => {
    const played = await onTalk(async () => {
      const lines = surfaceAboard(
        (await aboardInTheHangar()).until('INTERSTELLAR SHIP')
      ).until('PRESS Y TO LAUNCH');
      lines.route.run({ command: { kind: 'leaveCraft' }, kind: 'command' });
      lines.advance(2);
      pressY(lines.route);
      return lines.advance(5);
    });
    expect(played.lines.at(-1)).toBe('');
    expect(played.phase).toBe(0);
  }, 120_000);

  test('a Novadrive dropped before Y sends it back to refuse', async () => {
    const played = await onTalk(async () => {
      const lines = surfaceAboard(
        (await aboardInTheHangar()).until('INTERSTELLAR SHIP')
      ).until('PRESS Y TO LAUNCH');
      expect(lines.route.session.drop(NOVADRIVE).outcome.kind).toBe('dropped');
      pressY(lines.route);
      return lines.until('NOVADRIVE REQUIRED').advance(5);
    });
    expect(played.phase).toBe(0);
  }, 120_000);

  test('a destroyed advert keeps the player on Targ', async () => {
    const played = await onTalk(async () => {
      const route = await open();
      strikeTheAdvert(route);
      route.session.carry(NOVADRIVE);
      route.session.teleport(room(HANGAR_ROOM));
      route.settle();
      route.run({ action: 'board', kind: 'reach', slot: SHIP }, 60);
      return launch(new Lines(route)).until('FIX HIS ADVERT').advance(5);
    });
    expect(played.lines.slice(-4)).toEqual([
      "THE AUTHOR WON'T LET",
      'YOU LEAVE UNTIL YOU',
      'FIX HIS ADVERT',
      ''
    ]);
    expect(played.phase).toBe(0);
  }, 120_000);

  test('a Save at the prompt restores and still escapes', async () => {
    const lines = surfaceAboard(
      (await aboardInTheHangar()).until('INTERSTELLAR SHIP')
    ).until('PRESS Y TO LAUNCH');
    const session = lines.route.session;
    const restored = GameplaySession.restore(
      session.content,
      session.scripts,
      session.captureSaveSnapshot(),
      { scripts: escapeScript }
    );
    // The prompt plays again, then waits for Y.
    const resumed = new Lines(LegalRoute.resume(restored)).advance(5);
    pressY(resumed.route);
    resumed.until('SEE YOU IN MERCENARY II');
    expect(phase(restored)).toBeGreaterThan(0);
  }, 120_000);
});
