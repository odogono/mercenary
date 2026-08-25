import { describe, expect, test } from 'bun:test';

import { BensonHostState } from '../src/benson/index.ts';
import { intent } from '../src/gameCore/index.ts';
import { GameplaySession } from '../src/session/index.ts';
import { room } from '../src/world/index.ts';
import { LegalRoute } from './legalCheckpoint.ts';

/// The sole Escape: Benson script 7's dispatcher, reached by both decoded
/// route families and refused by every decoded refusal, exactly as the
/// dossier's predicate says. the Ending phase moving 0 -> 1 is the one terminal
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

/// The engine flag script 7's one optional arm tests. Set by stealing the Dart,
/// destroying object 0, or destroying cell `$97`; it changes what the epilogue
/// says and nothing else.
const OPTIONAL_EPILOGUE = 0x20;

/// Every Benson Message the epilogue completes, in order.
///
/// A Benson Message is one complete occurrence, so this counts the moment the
/// line stops revealing rather than sampling the text as it grows — a partially
/// revealed prefix is not a Message, and two identical lines are two occurrences.
const revealed = (route: LegalRoute, quarters: number): string[] => {
  const lines: string[] = [];
  // A line counts once it has stopped growing — the hold the Reference Build
  // keeps a finished Message on screen for. A prefix that is replaced while
  // still revealing was never a Message and is not recorded as one.
  let previous = '';
  let held: string | undefined;
  const close = (): void => {
    if (held !== undefined) {
      lines.push(held);
      held = undefined;
    }
  };
  for (let quarter = 0; quarter < quarters; quarter++) {
    route.advance(0.25);
    const text = String(
      route.session.observations().observations['messageText']
    );
    if (text === '' || !text.startsWith(previous)) {
      close();
    }
    if (text !== '' && text === previous) {
      held = text;
    }
    previous = text;
  }
  close();
  return lines;
};

const phase = (route: LegalRoute): number =>
  route.session.observations().observations['endingPhase'] as number;

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

/// The same, handed back as a route so the continuation can be played rather
/// than merely inspected.
const resumed = (route: LegalRoute): LegalRoute =>
  LegalRoute.resume(restored(route));

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
    expect(escaped['endingPhase']).toBe(1);
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

  test('the Novadrive dropped between prompt and recheck refuses, and picking it up resumes', async () => {
    const route = await aboardInTheHangar();
    surfaceAboard(route);

    // Let the prompt arrive, then put the authorization down and answer it.
    // The predicate is rechecked rather than remembered, so the term that was
    // true when the script asked has to still be true when it is answered.
    route.advance(15);
    expect(route.session.drop().outcome.kind).toBe('dropped');
    route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
    expect(refused(route)).toBe(0);

    // Resumption: step out, pick it back up, and board again — which is what
    // restarts the script.
    route.run({ command: { kind: 'leaveCraft' }, kind: 'command' });
    route.run({ action: 'take', kind: 'reach', slot: NOVADRIVE }, 60);
    expect(
      String(route.session.observations().observations['carriedStack'])
    ).toContain(String(NOVADRIVE));
    route.run({ action: 'board', kind: 'reach', slot: SHIP }, 60);
    expect(launch(route)).toBeTrue();
  }, 240_000);

  test('the hire cleared between prompt and recheck refuses, and re-authorizing resumes', async () => {
    const route = await deliveredShip();
    route.session.teleport(room(1));
    route.settle();
    route.run({ command: { kind: 'rideLift' }, kind: 'command' });
    route.run({ action: 'board', kind: 'reach', slot: SHIP }, 300);

    // The prompt arrived on a hired ship; the hire is withdrawn before it is
    // answered, leaving the craft and the Location alone so the authorization
    // term is the only one that moved.
    route.advance(15);
    const host = route.session.scripts!.host;
    route.session.scripts!.host = host.write(
      'engineFlags',
      host.engineFlags & ~HIRED
    );
    route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
    expect(refused(route)).toBe(0);

    // Resumption: the hire back, and the same dispatcher answers.
    const refusedHost = route.session.scripts!.host;
    route.session.scripts!.host = refusedHost.write(
      'engineFlags',
      refusedHost.engineFlags | HIRED
    );
    route.run({ command: { kind: 'leaveCraft' }, kind: 'command' });
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
    // The Snapshot names it: one Escape, at the phase its presentation has
    // reached. What draws the Ending reads this rather than the phase byte.
    expect(route.session.snapshot.ending).toEqual({
      kind: 'escape',
      phase: 255
    });
  }, 240_000);

  test('the terminal presentation runs, and matures the Ending itself', async () => {
    const route = await aboardInTheHangar();
    surfaceAboard(route);
    expect(launch(route)).toBeTrue();

    // The field is up on the first loop after the dispatch, with all 21 points.
    const entry = route.session.snapshot.escapePresentation;
    expect(entry?.points).toHaveLength(21);
    expect(phase(route)).toBe(1);

    // Nothing but the field's own colour sequence moves the phase, and it does
    // so on the decoded loop rather than on a timer of our own: 114 loops at 50
    // a second is a little under two and a third seconds. `launch` can leave up
    // to half a second of loops behind it, so the window is checked either side
    // of that rather than to the loop.
    route.advance(1);
    expect(phase(route)).toBe(1);
    route.advance(2);
    expect(phase(route)).toBe(255);
    expect(route.session.snapshot.ending).toEqual({
      kind: 'escape',
      phase: 255
    });

    // The points keep moving, and the pair the sequence settled on stays put.
    const settled = route.session.snapshot.escapePresentation;
    route.advance(1);
    const later = route.session.snapshot.escapePresentation;
    expect(later?.points).not.toEqual(settled?.points);
    expect(later?.colourPair).toEqual(settled?.colourPair);
    expect(later?.points).toHaveLength(21);
  }, 240_000);

  test('presents the epilogue the decoded tail asks for', async () => {
    const route = await aboardInTheHangar();
    surfaceAboard(route);
    expect(launch(route)).toBeTrue();

    // The tail retimes the message line before it says anything, which is what
    // makes the epilogue read more slowly than play does.
    expect(route.session.scripts?.host.messageInterval).toBe(150);

    const texts = revealed(route, 300);
    const upToTheLabel = texts.slice(0, texts.indexOf('GAME OVER') + 1);
    expect(upToTheLabel).toEqual([
      'THE AUTHOR SENDS YOU',
      'CONGRATULATIONS ON YOUR',
      'ESCAPE FROM TARG',
      'SAVE OUT THE STATUS AND',
      'SEE YOU IN MERCENARY II',
      'GAME OVER'
    ]);
    // And then the label alone, over and over.
    expect(new Set(texts.slice(upToTheLabel.length))).toEqual(
      new Set(['GAME OVER'])
    );
  }, 240_000);

  test('repeats the terminal label, asking for silence each time', async () => {
    const route = await aboardInTheHangar();
    surfaceAboard(route);
    expect(launch(route)).toBeTrue();

    const sounds: string[] = [];
    let labels = 0;
    let last = '';
    for (let quarter = 0; quarter < 300; quarter++) {
      const { events } = route.session.advance(0.25);
      const text = String(
        route.session.observations().observations['messageText']
      );
      if (text === 'GAME OVER' && last !== 'GAME OVER') {
        labels++;
      }
      last = text;
      for (const event of events) {
        if (typeof event === 'object' && 'script' in event) {
          const effect = event.script;
          if (typeof effect === 'object' && 'sound' in effect) {
            sounds.push(effect.sound.symbol);
          }
        }
      }
    }

    // The loop repeats: wait, one label, and silence asked of both voices. The
    // SID writes stay presentation requests — there is no audio behind them.
    expect(labels).toBeGreaterThan(1);
    // Two writes per repeat, give or take the one whose label landed inside the
    // window but whose writes had not been asked for yet.
    expect(sounds.length % 2).toBe(0);
    expect(sounds.length / 2).toBeLessThanOrEqual(labels);
    expect(sounds.length / 2).toBeGreaterThanOrEqual(labels - 1);
    for (const [index, symbol] of sounds.entries()) {
      expect(symbol).toBe(
        index % 2 === 0 ? 'voice1.control' : 'voice2.control'
      );
    }
  }, 240_000);

  test('the optional arm is a second presentation of one Ending', async () => {
    const clear = await aboardInTheHangar();
    surfaceAboard(clear);
    expect(launch(clear)).toBeTrue();
    const withoutArm = revealed(clear, 300);

    const set = await aboardInTheHangar();
    set.session.scripts!.host = set.session.scripts!.host.write(
      'engineFlags',
      set.session.scripts!.host.engineFlags | OPTIONAL_EPILOGUE
    );
    surfaceAboard(set);
    expect(launch(set)).toBeTrue();
    const withArm = revealed(set, 300);

    // One Ending either way — the flag changes what is said, never the outcome.
    expect(phase(clear)).toBe(phase(set));
    expect(clear.session.snapshot.ending).toEqual(set.session.snapshot.ending);
    expect(withArm).not.toEqual(withoutArm);
    // The arm adds to the sequence rather than replacing it.
    for (const line of new Set(withoutArm)) {
      expect(withArm).toContain(line);
    }
    expect(withArm).toContain("THE PALYAR COMMANDER'S");
  }, 240_000);

  test('two sessions restored from one Save present the same field', async () => {
    const route = await aboardInTheHangar();
    surfaceAboard(route);
    expect(launch(route)).toBeTrue();
    route.advance(3);

    // Restored where it was, not begun again: the field the Save carried is
    // mid-sequence, and it has to pick up from there.
    const revived = restored(route);
    expect(revived.snapshot.escapePresentation).toEqual(
      route.session.snapshot.escapePresentation
    );

    // And it continues the same way the original does, loop for loop.
    for (let quarter = 0; quarter < 20; quarter++) {
      route.advance(0.25);
      revived.advance(0.25);
      expect(revived.snapshot.escapePresentation).toEqual(
        route.session.snapshot.escapePresentation
      );
      expect(revived.snapshot.ending).toEqual(route.session.snapshot.ending);
    }
  }, 240_000);
});

describe('Saves at the decoded checkpoints', () => {
  test('a Save aboard before the lift restores and still escapes', async () => {
    const route = await aboardInTheHangar();
    const revived = resumed(route);
    const observations = revived.session.observations().observations;
    expect(observations['occupancy']).toBe(SHIP);
    expect(observations['room']).toBe(HANGAR_ROOM);

    // The restored session is the one that rides the lift and escapes: a
    // Save that only restores, while the original carries on, is evidence of
    // nothing.
    surfaceAboard(revived);
    expect(launch(revived)).toBeTrue();
  }, 240_000);

  test('a Save aboard after the lift restores and still escapes', async () => {
    const route = await aboardInTheHangar();
    surfaceAboard(route);

    const revived = resumed(route);
    const observations = revived.session.observations().observations;
    expect(observations['occupancy']).toBe(SHIP);
    expect(observations['room']).toBe(0);
    expect(launch(revived)).toBeTrue();
  }, 240_000);

  test('a Save between the prompt and the recheck restores and dispatches', async () => {
    const route = await aboardInTheHangar();
    surfaceAboard(route);
    route.advance(15);

    const revived = restored(route);
    const observations = revived.observations().observations;
    expect(observations['endingPhase']).toBe(0);
    expect(observations['occupancy']).toBe(SHIP);
    expect(observations['room']).toBe(0);
    // The script is mid-flight in the restored session too.
    expect(observations['scriptPc']).not.toBe(-1);

    for (let half = 0; half < 120; half++) {
      revived.press('keyY');
      revived.advance(0.5);
      if (revived.observations().observations['endingPhase'] === 1) {
        break;
      }
    }
    expect(revived.observations().observations['endingPhase']).toBe(1);
  }, 240_000);
});
