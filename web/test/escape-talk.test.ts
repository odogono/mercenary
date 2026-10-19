import { describe, expect, test } from 'bun:test';

import { GameplaySession } from '../src/session/index.ts';
import { ESCAPE } from '../src/talk/scripts.ts';
import { room } from '../src/world/index.ts';
import { LegalRoute } from './legalCheckpoint.ts';
import {
  ENGINES,
  Lines,
  openRoute,
  talkScript,
  type Engine
} from './talkParity.ts';

/// The Escape as a Talk Script (ADR 0080), against Benson Script 7 as the
/// oracle: each route is played twice, once by each, and both must show the
/// same lines and leave the same Ending phase. `escape.test.ts` covers the
/// routes themselves against Benson Script 7 alone.

const SHIP = 7;
const NOVADRIVE = 25;
const HANGAR_ROOM = 5;
const ADVERT_CELL = 0x32;
const CELL = 0x1_00_00;
const COMMANDER_ANNOYED = 0x20;

const escapeScript = talkScript(ESCAPE);
const open = (engine: Engine): Promise<LegalRoute> => openRoute(engine, ESCAPE);

const phase = (session: GameplaySession): number =>
  session.observations().observations['endingPhase'] as number;

/// Y, as the shell sends it: to Benson, and to the Talk Scripts.
const pressY = (route: LegalRoute): void => {
  route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
  route.session.input('KeyY');
};

/// Aboard the recovered ship in the hangar, the Escape just started.
const aboardInTheHangar = async (
  engine: Engine,
  novadrive = true
): Promise<Lines> => {
  const route = await open(engine);
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
  session.scripts!.host = session.scripts!.host.write('attackingShip', 0);
  session.leaveCraft();
};

/// Plays a route by both engines and returns each one's lines and phase.
const both = async (
  play: (engine: Engine) => Promise<Lines>
): Promise<Record<Engine, { lines: string[]; phase: number }>> => {
  const result = {} as Record<Engine, { lines: string[]; phase: number }>;
  for (const engine of ENGINES) {
    const lines = await play(engine);
    result[engine] = {
      lines: lines.lines,
      phase: phase(lines.route.session)
    };
  }
  return result;
};

describe('the Escape as a Talk Script', () => {
  test('launches with a Novadrive as Benson Script 7 does', async () => {
    const played = await both(async engine =>
      launch(await aboardInTheHangar(engine)).until('SEE YOU IN MERCENARY II')
    );
    expect(played.talk).toEqual(played.benson);
    // The Escape writes 1, and the Ending carries the phase on from there.
    expect(played.talk.phase).toBeGreaterThan(0);
    expect(played.talk.lines).toEqual([
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
    const played = await both(async engine =>
      launch(await aboardInTheHangar(engine))
        .until('SEE YOU IN MERCENARY II')
        .advance(20)
    );
    const gameOvers = played.talk.lines.filter(line => line === 'GAME OVER');
    expect(gameOvers.length).toBeGreaterThan(1);
    expect(played.talk).toEqual(played.benson);
  }, 120_000);

  test('tells of the commander’s brother-in-law when he is annoyed', async () => {
    const played = await both(async engine => {
      const lines = await aboardInTheHangar(engine);
      const session = lines.route.session;
      session.scripts!.host = session.scripts!.host.with({
        engineFlags: session.scripts!.host.engineFlags | COMMANDER_ANNOYED
      });
      return launch(lines).until('SEE YOU IN MERCENARY II');
    });
    expect(played.talk).toEqual(played.benson);
    expect(played.talk.lines).toContain('IS PLEASED YOU,VE GONE');
  }, 120_000);

  test('without a Novadrive, refuses on the surface', async () => {
    const played = await both(async engine =>
      surfaceAboard(
        (await aboardInTheHangar(engine, false)).until('INTERSTELLAR SHIP')
      )
        .until('NOVADRIVE REQUIRED')
        .advance(5)
    );
    expect(played.talk).toEqual(played.benson);
    expect(played.talk.lines).toEqual([
      'INTERSTELLAR SHIP',
      'NOVADRIVE REQUIRED',
      ''
    ]);
    expect(played.talk.phase).toBe(0);
  }, 120_000);

  test('leaving the ship at the prompt ends with a blank line', async () => {
    const played = await both(async engine => {
      const lines = surfaceAboard(
        (await aboardInTheHangar(engine)).until('INTERSTELLAR SHIP')
      ).until('PRESS Y TO LAUNCH');
      lines.route.run({ command: { kind: 'leaveCraft' }, kind: 'command' });
      lines.advance(2);
      pressY(lines.route);
      return lines.advance(5);
    });
    expect(played.talk).toEqual(played.benson);
    expect(played.talk.lines.at(-1)).toBe('');
    expect(played.talk.phase).toBe(0);
  }, 120_000);

  test('a Novadrive dropped before Y sends it back to refuse', async () => {
    const played = await both(async engine => {
      const lines = surfaceAboard(
        (await aboardInTheHangar(engine)).until('INTERSTELLAR SHIP')
      ).until('PRESS Y TO LAUNCH');
      expect(lines.route.session.drop(NOVADRIVE).outcome.kind).toBe('dropped');
      pressY(lines.route);
      return lines.until('NOVADRIVE REQUIRED').advance(5);
    });
    expect(played.talk).toEqual(played.benson);
    expect(played.talk.phase).toBe(0);
  }, 120_000);

  test('a destroyed advert keeps the player on Targ', async () => {
    const played = await both(async engine => {
      const route = await open(engine);
      strikeTheAdvert(route);
      route.session.carry(NOVADRIVE);
      route.session.teleport(room(HANGAR_ROOM));
      route.settle();
      route.run({ action: 'board', kind: 'reach', slot: SHIP }, 60);
      return launch(new Lines(route)).until('FIX HIS ADVERT').advance(5);
    });
    expect(played.talk).toEqual(played.benson);
    expect(played.talk.lines.slice(-4)).toEqual([
      "THE AUTHOR WON'T LET",
      'YOU LEAVE UNTIL YOU',
      'FIX HIS ADVERT',
      ''
    ]);
    expect(played.talk.phase).toBe(0);
  }, 120_000);

  test('a Save at the prompt restores and still escapes', async () => {
    const lines = surfaceAboard(
      (await aboardInTheHangar('talk')).until('INTERSTELLAR SHIP')
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

  test('a Save from Benson Script 7 at the prompt resumes once the ship is boarded again', async () => {
    const lines = surfaceAboard(
      (await aboardInTheHangar('benson')).until('INTERSTELLAR SHIP')
    ).until('PRESS Y TO LAUNCH');
    const session = lines.route.session;
    const restored = GameplaySession.restore(
      session.content,
      session.scripts,
      session.captureSaveSnapshot(),
      { scripts: escapeScript }
    );
    expect(restored.scripts!.reference?.running).toBeUndefined();
    // Benson Script 7 is stopped, so the prompt is gone. The Escape starts
    // again when the ship is boarded again: off, a moment on foot, back on.
    const route = LegalRoute.resume(restored);
    route.run({ command: { kind: 'leaveCraft' }, kind: 'command' });
    route.advance(1);
    route.run({ action: 'board', kind: 'reach', slot: SHIP }, 60);
    const resumed = new Lines(route).until('PRESS Y TO LAUNCH').advance(5);
    expect(resumed.lines.slice(0, 2)).toEqual([
      'INTERSTELLAR SHIP',
      'PRESS Y TO LAUNCH'
    ]);
    pressY(route);
    resumed.until('SEE YOU IN MERCENARY II');
    expect(phase(restored)).toBeGreaterThan(0);
  }, 120_000);
});
