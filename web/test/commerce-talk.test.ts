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

/// Hiring the ship, the Dart's owner and the captured Mechanoid as a Talk
/// Script (ADR 0080), ported from Benson Scripts 2, 1 and 12: each scenario
/// must show the lines and leave the outcome Benson did, which the snapshot
/// keeps.
///
/// One difference is deliberate: Benson Script 2 kept the hire's answer in
/// engine flag 1, the opening's "bought the Dart", and the port doesn't.

const DART = 1;
const CAPTURED_MECHANOID = 12;
const ANTENNA = 30;
const SHIP_RENTAL = 16;
const MECHANOID_BRIEFING = 102;
const STARTS_SCRIPT = 4;
/// A Room with nothing to say, to leave the surface for.
const UNDERGROUND = 1;

interface Outcome {
  readonly attacking: boolean;
  readonly credits: number;
  readonly lines: readonly string[];
  readonly shipInbound: number;
}

const outcome = (lines: Lines): Outcome => {
  const observed = lines.route.session.observations().observations;
  return {
    attacking: observed['attackingShip'] as boolean,
    credits: observed['credits'] as number,
    lines: lines.lines,
    shipInbound: observed['shipInbound'] as number
  };
};

/// A route whose object starts its own Benson Script when boarded or taken,
/// as the opening leaves it: armed through a Save, which is how the flag
/// reaches the session rather than the host it projects.
const armed = async (slot: number, bought = false): Promise<LegalRoute> => {
  // Bought, as the opening tells commerce.
  const scripts = bought
    ? presetting(talkScript(COMMERCE, ESCAPE), COMMERCE, 'bought', 'true')
    : talkScript(COMMERCE, ESCAPE);
  const route = await openRouteWith(scripts);
  const snapshot = route.session.captureSaveSnapshot();
  const restored = GameplaySession.restore(
    route.session.content,
    route.session.benson,
    {
      ...snapshot,
      objectFlags: snapshot.objectFlags.map(([at, flags]) =>
        at === slot ? [at, flags | STARTS_SCRIPT] : [at, flags]
      )
    },
    { scripts }
  );
  return LegalRoute.resume(restored);
};

const setCredits = (route: LegalRoute, credits: number): void => {
  route.session.adjust({ credits });
};

const pressY = (route: LegalRoute): void => {
  route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
};

/// Plays a scenario on Talk, checking what it left against Benson's.
const onTalk = async (play: () => Promise<Lines>): Promise<Outcome> => {
  const result = outcome(await play());
  expect(result).toMatchSnapshot();
  return result;
};

/// At the hire's prompt, the antenna in hand.
const atTheHire = async (credits: number): Promise<Lines> => {
  const route = await openRoute(COMMERCE, ESCAPE);
  setCredits(route, credits);
  route.session.carry(ANTENNA);
  route.session.teleport(room(SHIP_RENTAL));
  return new Lines(route).until('DO YOU WANT TO HIRE?');
};

/// From beside the Dart, then a moment aboard: World Events come from what
/// changed between frames.
const boardDart = (route: LegalRoute): void => {
  const session = route.session;
  const dart = session.content.objects.find(object => object.slot === DART)!;
  session.teleport({ kind: 'surface' });
  session.game = {
    ...session.game,
    player: { ...session.game.player, position: { ...dart.origin } }
  };
  route.run({ action: 'board', kind: 'reach', slot: DART }, 60);
  route.advance(1);
};

describe('commerce as a Talk Script', () => {
  test('hires the ship for a Y', async () => {
    const played = await onTalk(async () => {
      const lines = await atTheHire(1_500_000);
      pressY(lines.route);
      return lines.advance(30);
    });
    expect(played.lines.slice(-3)).toEqual([
      'SHIP DESPATCHED',
      'IT WILL LAND',
      'AT LOC 8-8 IN 2 MINS'
    ]);
    expect(played.credits).toBe(500_001);
    // The Ship Delivery has started, and counts down.
    expect(played.shipInbound).toBeGreaterThan(0);
  }, 120_000);

  test('asks the player to call again when no Y comes', async () => {
    const played = await onTalk(async () =>
      (await atTheHire(1_500_000)).advance(20)
    );
    expect(played.lines.slice(-3)).toEqual([
      'OK PLEASE CALL AGAIN',
      'MESSAGE ENDS',
      ''
    ]);
  }, 120_000);

  test('refuses a player with less than a million credits', async () => {
    const played = await onTalk(async () => {
      const lines = await atTheHire(999_999);
      pressY(lines.route);
      return lines.advance(30);
    });
    expect(played.lines).toContain('INSUFFICIENT FUNDS');
    expect(played.credits).toBe(999_999);
  }, 120_000);

  test('the rental is not working without the antenna', async () => {
    const played = await onTalk(async () => {
      const route = await openRoute(COMMERCE, ESCAPE);
      route.session.teleport(room(SHIP_RENTAL));
      return new Lines(route).advance(10);
    });
    expect(played.lines).toEqual(['COMMUNICATION ROOM', 'NOT WORKING', '']);
  }, 60_000);

  test('the Dart’s owner sends a ship after a thief', async () => {
    const played = await onTalk(async () => {
      const route = await armed(DART);
      boardDart(route);
      return new Lines(route).advance(30);
    });
    expect(played.lines).toContain('HE IS NOT TOO PLEASED');
  }, 120_000);

  test('a buyer gets the job offer once off the surface', async () => {
    const played = await onTalk(async () => {
      const route = await armed(DART, true);
      boardDart(route);
      route.session.leaveCraft();
      route.session.teleport(room(UNDERGROUND));
      return new Lines(route).advance(40);
    });
    // The offer may come sooner or later by chance, from the session's dice.
    expect(played.lines).toEqual([
      'MESSAGE FROM PALYARS',
      '- - - JOB OFFER - - -',
      'FOR MORE INFORMATION',
      'GO TO THE BRIEFING ROOM',
      'IN COMPLEX AT LOC O9-O6',
      'MESSAGE ENDS',
      ''
    ]);
  }, 120_000);

  test('the Dart’s script runs at its first boarding only', async () => {
    const played = await onTalk(async () => {
      const route = await armed(DART);
      boardDart(route);
      const lines = new Lines(route).advance(30);
      route.session.leaveCraft();
      route.advance(1);
      boardDart(route);
      return lines.advance(15);
    });
    expect(
      played.lines.filter(line => line === 'HE IS NOT TOO PLEASED')
    ).toHaveLength(1);
  }, 120_000);

  test('the captured Mechanoid protests at every taking', async () => {
    const played = await onTalk(async () => {
      const route = await armed(CAPTURED_MECHANOID);
      // He is held in the Mechanoid briefing room, whose briefing goes first.
      route.session.teleport(room(MECHANOID_BRIEFING));
      route.advance(90);
      const lines = new Lines(route);
      for (let time = 0; time < 2; time++) {
        route.run(
          { action: 'take', kind: 'reach', slot: CAPTURED_MECHANOID },
          60
        );
        lines.advance(15);
        route.session.drop(CAPTURED_MECHANOID);
        lines.advance(2);
      }
      return lines;
    });
    expect(
      played.lines.filter(line => line === 'THE MECHANOID DEMANDS')
    ).toHaveLength(2);
  }, 120_000);

  test('a buyer who lets the hire lapse still gets the job offer', async () => {
    const lines = await (async () => {
      const route = await armed(DART, true);
      setCredits(route, 1_500_000);
      route.session.carry(ANTENNA);
      route.session.teleport(room(SHIP_RENTAL));
      new Lines(route).until('DO YOU WANT TO HIRE?').advance(20);
      route.session.teleport(room(UNDERGROUND));
      route.advance(5);
      boardDart(route);
      route.session.leaveCraft();
      route.session.teleport(room(UNDERGROUND));
      return new Lines(route).advance(40).lines;
    })();
    // Benson Script 2 cleared flag 1 when the hire lapsed, so Benson Script 1
    // took the buyer for a thief. The port keeps the two apart, so this one
    // has no Benson record to match.
    expect(lines).toContain('MESSAGE FROM PALYARS');
    expect(lines).not.toContain('HE IS NOT TOO PLEASED');
  }, 120_000);
});
