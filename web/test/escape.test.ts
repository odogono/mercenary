import { describe, expect, test } from 'bun:test';

import { BensonHostState } from '../src/benson/index.ts';
import { intent } from '../src/gameCore/index.ts';
import { GameplaySession } from '../src/session/index.ts';
import { room } from '../src/world/index.ts';
import { LegalRoute } from './legalCheckpoint.ts';

/// The sole Escape: Benson script 7's dispatcher, reached by both decoded
/// route families and refused by every decoded refusal, exactly as the
/// dossier's predicate says. `gameComplete` moving 0 -> 1 is the one terminal
/// write the Reference Build has; nothing here may invent another.

const CREDITS = BensonHostState.firstNumberDecimal;
const HIRED = 0x04;
const SHIP = 7;
const NOVADRIVE = 25;
const ANTENNA = 30;
const ANTI_TIME_BOMB = 24;
const RENTAL_ROOM = 16;
const HANGAR_ROOM = 5;
const ADVERT_CELL = 0x32;
const CELL = 0x1_00_00;

const phase = (route: LegalRoute): number =>
  route.session.observations().observations['gameComplete'] as number;

const scriptRunning = (route: LegalRoute): boolean =>
  route.session.observations().observations['scriptPc'] !== -1;

/// Presses Y at the launch prompt until the dispatcher answers, or does not.
///
/// Pressing repeatedly is what a player holding the key does, and the script's
/// own `clrk` before the prompt is what makes stale presses harmless.
const launch = (route: LegalRoute, maxSeconds = 60): boolean => {
  for (let half = 0; half < maxSeconds * 2; half++) {
    route.advance(0.5);
    route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
    route.advance(0.5);
    if (phase(route) === 1) {
      return true;
    }
  }
  return false;
};

/// Waits for the running script to give up, then reports the phase.
const refused = (route: LegalRoute): number => {
  route.settle();
  return phase(route);
};

/// Walks to the recovered ship in Room 5 and boards it, which is what starts
/// script 7. Script 7 then never finishes on its own: it spins at its own
/// prompt until it is answered or refused, so nothing here may settle on it.
const recoverAboard = (route: LegalRoute): void => {
  route.session.teleport(room(HANGAR_ROOM));
  route.settle();
  route.run({ action: 'board', kind: 'reach', slot: SHIP }, 60);
  expect(route.session.observations().observations['occupancy']).toBe(SHIP);
};

/// Aboard the recovered ship in Room 5, script 7 already asking.
const aboardInTheHangar = async (options?: {
  readonly novadrive?: boolean;
}): Promise<LegalRoute> => {
  const route = await LegalRoute.open();
  if (options?.novadrive ?? true) {
    route.session.carry(NOVADRIVE);
  }
  recoverAboard(route);
  return route;
};

/// Rides the occupancy-preserving lift up and lets the script catch up.
const surfaceAboard = (route: LegalRoute): void => {
  route.run({ command: { kind: 'rideLift' }, kind: 'command' });
  const after = route.session.observations().observations;
  expect(after['room']).toBe(0);
  expect(after['occupancy']).toBe(SHIP);
};

/// Hired for real through script 2, delivered for real by the native descent.
const deliveredShip = async (): Promise<LegalRoute> => {
  const route = await LegalRoute.open();
  route.session.scripts!.host = route.session.scripts!.host.withDecimal(
    CREDITS,
    1_000_000
  );
  route.session.carry(ANTENNA);
  route.session.teleport(room(RENTAL_ROOM));
  route.advance(20);
  route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
  route.advance(30);
  expect(
    (route.session.observations().observations['engineFlags'] as number) & HIRED
  ).toBe(HIRED);
  // One frame to despatch, then the decoded 779-frame descent.
  route.advance((2 + 779) / 20);
  expect(route.session.observations().observations['shipInbound']).toBe(0);
  route.settle();
  return route;
};

/// Destroys or strikes the author's advert from a craft parked over it.
///
/// Built rather than flown to, like the Site tests: the strike geometry has to
/// be exact for the refusal under test to mean what it says.
const strikeTheAdvert = (route: LegalRoute): void => {
  const session = route.session;
  session.board(1);
  session.game = {
    ...session.game,
    player: {
      ...session.game.player,
      heading: 0,
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
  // The advert's Faction Reaction summons a hostile; what is under test here
  // is the launch predicate, not the encounter, so the alarm is stood down.
  session.scripts!.host = session.scripts!.host.write('attackingShip', 0);
  session.leaveCraft();
};

/// Save and restore, through the whole envelope-free path a Save takes.
const restored = (route: LegalRoute): GameplaySession =>
  GameplaySession.restore(
    route.session.content,
    route.session.scripts,
    route.session.captureSaveSnapshot()
  );

describe('the hired route', () => {
  test('reaches the surface, boards, authorizes without the Novadrive, and dispatches', async () => {
    const route = await deliveredShip();

    // Out of the underground the legal way: lift room 1, then walk the
    // surface to the delivered ship at cell 8:8 and board it.
    route.session.teleport(room(1));
    route.settle();
    route.run({ command: { kind: 'rideLift' }, kind: 'command' });
    expect(route.session.observations().observations['room']).toBe(0);
    route.run({ action: 'board', kind: 'reach', slot: SHIP }, 300);
    route.observe('aboard');

    expect(launch(route)).toBeTrue();
    route.observe('escaped');

    const aboard = route.observationAt('aboard');
    expect(aboard['occupancy']).toBe(SHIP);
    expect((aboard['engineFlags'] as number) & HIRED).toBe(HIRED);
    // The hired arm never needed the Novadrive.
    expect(String(aboard['carriedStack'])).not.toContain(String(NOVADRIVE));
    const escaped = route.observationAt('escaped');
    expect(escaped['gameComplete']).toBe(1);
    expect(escaped['destroyedCells']).toBe('');
  }, 240_000);
});

describe('the recovered route', () => {
  test('survives the indoor lift with Occupancy intact and reaches the same dispatcher', async () => {
    const route = await aboardInTheHangar();

    // Underground the script waits: it will not authorize below the surface.
    route.advance(10);
    route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
    route.advance(10);
    expect(phase(route)).toBe(0);
    expect(scriptRunning(route)).toBeTrue();
    route.observe('waiting below');

    surfaceAboard(route);
    route.observe('surfaced');

    expect(launch(route)).toBeTrue();
    const surfaced = route.observationAt('surfaced');
    expect(surfaced['occupancy']).toBe(SHIP);
    // No hire, no million: the other authorization term carried it.
    expect((surfaced['engineFlags'] as number) & HIRED).toBe(0);
    expect(String(surfaced['carriedStack'])).toContain(String(NOVADRIVE));
  }, 240_000);

  test('holding both authorization terms converges on the same dispatcher', async () => {
    const route = await aboardInTheHangar();
    route.session.scripts!.host = route.session.scripts!.host.write(
      'engineFlags',
      route.session.scripts!.host.engineFlags | HIRED
    );
    surfaceAboard(route);
    expect(launch(route)).toBeTrue();
    expect(phase(route)).toBe(1);
  }, 240_000);
});

describe('the recovered route, walked from the crash site', () => {
  // One continuous run: no Room is teleported into, no position is written,
  // and the lift pad has to be found on foot. What is still handed over is the
  // Novadrive, because reaching where it lies means a seven-key chain whose
  // skeleton key is itself fixed until the Sink is carried in from the far
  // side of the Palyar cluster - a full-game route that belongs with the
  // economy rather than with this predicate.
  test('walks to the pad, rides down, boards, rides up, and escapes', async () => {
    const route = await LegalRoute.open();
    route.session.carry(NOVADRIVE);

    // Lift site 5 serves the hangar, at cell 3:15. Walking onto its pad is
    // the whole test of the pad: the ride is refused anywhere else on the cell.
    route.walkToPoint({ x: 3 * CELL + 0x71_80, z: 15 * CELL + 0x71_80 }, 96);
    route.run({ command: { kind: 'rideLift' }, kind: 'command' });
    expect(route.session.observations().observations['room']).toBe(HANGAR_ROOM);
    route.settle();

    route.run({ action: 'board', kind: 'reach', slot: SHIP }, 120);
    route.observe('recovered');
    expect(scriptRunning(route)).toBeTrue();

    surfaceAboard(route);
    route.observe('surfaced');
    expect(launch(route)).toBeTrue();

    const recovered = route.observationAt('recovered');
    expect(recovered['room']).toBe(HANGAR_ROOM);
    expect(recovered['occupancy']).toBe(SHIP);
    const surfaced = route.observationAt('surfaced');
    expect(surfaced['room']).toBe(0);
    expect(surfaced['occupancy']).toBe(SHIP);
    expect((surfaced['engineFlags'] as number) & HIRED).toBe(0);
    // Surfaced at a craft's resting altitude rather than at eye height, which
    // is what the decoded transition leaves alone.
    expect(surfaced['playerY']).toBe(63);
  }, 600_000);
});

describe('the refusals, each of which resumes', () => {
  test('no authorization: the script asks for the Novadrive and returns to play', async () => {
    const route = await aboardInTheHangar({ novadrive: false });
    surfaceAboard(route);

    expect(refused(route)).toBe(0);

    // Resumption: pick the Novadrive up and ask again, by boarding again.
    route.session.carry(NOVADRIVE);
    route.run({ command: { kind: 'leaveCraft' }, kind: 'command' });
    route.run({ action: 'board', kind: 'reach', slot: SHIP }, 60);
    expect(launch(route)).toBeTrue();
  }, 240_000);

  test('leaving before the recheck refuses, and boarding again resumes', async () => {
    const route = await aboardInTheHangar();
    surfaceAboard(route);

    // Let the prompt arrive, then step out instead of answering.
    route.advance(15);
    route.run({ command: { kind: 'leaveCraft' }, kind: 'command' });
    expect(refused(route)).toBe(0);
    expect(route.session.observations().observations['occupancy']).toBe(
      BensonHostState.onFoot
    );

    route.run({ action: 'board', kind: 'reach', slot: SHIP }, 60);
    expect(launch(route)).toBeTrue();
  }, 240_000);

  test('underground the script waits rather than launches', async () => {
    const route = await aboardInTheHangar();
    route.advance(20);
    route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
    route.advance(20);
    expect(phase(route)).toBe(0);
    expect(scriptRunning(route)).toBeTrue();
  }, 240_000);

  test('the wrong craft refuses at the first test, aboard or on foot', async () => {
    // Script 7's own first instruction tests the craft, so the refusal does
    // not need the ship at all: it needs the script asked from anywhere else.
    for (const aboard of [false, true]) {
      const route = await LegalRoute.open();
      route.session.carry(NOVADRIVE);
      if (aboard) {
        route.session.board(1);
      }
      expect(route.session.start(7)).toBeTrue();
      expect(refused(route)).toBe(0);
      expect(route.session.observations().observations['occupancy']).toBe(
        aboard ? 1 : BensonHostState.onFoot
      );
    }
  }, 240_000);

  test('saying nothing waits at the prompt and dispatches nothing', async () => {
    const route = await aboardInTheHangar();
    surfaceAboard(route);

    // Two minutes of play with the key untouched. The script polls rather than
    // times out, so it neither launches nor gives up.
    route.advance(120);
    expect(phase(route)).toBe(0);
    expect(scriptRunning(route)).toBeTrue();

    // And answering afterwards still works: the wait cost nothing.
    expect(launch(route)).toBeTrue();
  }, 240_000);

  test('a destroyed advert refuses the launch, and the refusal resumes', async () => {
    const route = await LegalRoute.open();
    route.session.carry(NOVADRIVE);

    // Bomb the author's advert before going for the ship, which is the order
    // a player would reach this in: the cell has to be down before the
    // predicate looks at it.
    strikeTheAdvert(route);
    expect(
      String(route.session.observations().observations['destroyedCells'])
    ).toContain('32');

    recoverAboard(route);
    surfaceAboard(route);

    // Every other term of the predicate holds, so this is the advert alone.
    expect(launch(route, 20)).toBeFalse();
    expect(refused(route)).toBe(0);

    // The refusal returned to active play rather than ending anything, so
    // stepping out and boarding again asks again.
    route.run({ command: { kind: 'leaveCraft' }, kind: 'command' });
    route.run({ action: 'board', kind: 'reach', slot: SHIP }, 60);
    expect(scriptRunning(route)).toBeTrue();
    expect(phase(route)).toBe(0);
  }, 240_000);

  test('the Anti Time Bomb restores the advert and re-enables the launch', async () => {
    const route = await LegalRoute.open();
    route.session.carry(NOVADRIVE);

    strikeTheAdvert(route);
    expect(
      String(route.session.observations().observations['destroyedCells'])
    ).toContain('32');

    // Striking it again while carrying the Anti Time Bomb shows the impact
    // and clears the destroyed bit, without moving either faction counter.
    const before = route.session.observations().observations;
    route.session.carry(ANTI_TIME_BOMB);
    strikeTheAdvert(route);
    const after = route.session.observations().observations;
    expect(String(after['destroyedCells'])).not.toContain('32');
    expect(after['palyarDestroyed']).toBe(before['palyarDestroyed']!);
    expect(after['mechanoidDestroyed']).toBe(before['mechanoidDestroyed']!);

    recoverAboard(route);
    surfaceAboard(route);
    expect(launch(route)).toBeTrue();
  }, 240_000);
});

describe('after the dispatch', () => {
  test('the world freezes around the epilogue, which keeps ticking', async () => {
    const route = await aboardInTheHangar();
    surfaceAboard(route);
    expect(launch(route)).toBeTrue();

    const before = route.session.snapshot;
    route.session.intent = intent({ pitch: 1, turn: 1, walk: 1 });
    route.session.throttleNotchValue(10);
    const texts = new Set<string>();
    for (let half = 0; half < 60; half++) {
      route.advance(0.5);
      texts.add(
        String(route.session.observations().observations['messageText'])
      );
    }

    // No Mover ran: the ship is exactly where the dispatch left it.
    expect(route.session.snapshot.player).toEqual(before.player);
    // The epilogue tail is script 7's own and keeps playing; its content is
    // M7.5's to pin, so only that it advances is asserted here.
    expect(texts.size).toBeGreaterThan(1);
    // The phase stays scripted: 255 belongs to the terminal renderer.
    expect(phase(route)).toBe(1);
  }, 240_000);
});

describe('Saves at the decoded checkpoints', () => {
  test('a Save aboard before the lift restores and still escapes', async () => {
    const route = await aboardInTheHangar();
    const revived = restored(route);
    expect(revived.observations().observations['occupancy']).toBe(SHIP);

    surfaceAboard(route);
    expect(launch(route)).toBeTrue();
  }, 240_000);

  test('a Save between the prompt and the recheck restores and dispatches', async () => {
    const route = await aboardInTheHangar();
    surfaceAboard(route);
    route.advance(15);

    const revived = restored(route);
    const observations = revived.observations().observations;
    expect(observations['gameComplete']).toBe(0);
    expect(observations['occupancy']).toBe(SHIP);
    expect(observations['room']).toBe(0);
    // The script is mid-flight in the restored session too.
    expect(observations['scriptPc']).not.toBe(-1);

    for (let half = 0; half < 120; half++) {
      revived.press('keyY');
      revived.advance(0.5);
      if (revived.observations().observations['gameComplete'] === 1) {
        break;
      }
    }
    expect(revived.observations().observations['gameComplete']).toBe(1);
  }, 240_000);
});
