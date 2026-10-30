import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { GameplaySession } from '../src/session/index.ts';
import {
  SAVE_SCHEMA_VERSION,
  SAVE_TALK_CODE_UNIT_LIMIT,
  decodeSave,
  encodeSave
} from '../src/session/save.ts';
import { OPENING_MILESTONES } from '../src/shell/arrivalScript.ts';
import {
  createWalkabout,
  requiredSettings,
  saveEnvironment
} from '../src/shell/session.ts';
import { OPENING } from '../src/talk/scripts.ts';
import { room } from '../src/world/index.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

/// The opening as a Talk Script (ADR 0080), in place of Benson Script 0.

const bundle = await loadPayload();
const settings = requiredSettings(
  await Bun.file(join(repositoryRoot, 'settings.json')).text()
);
const milestones = OPENING_MILESTONES;

const FRAME = 1 / 20;
const CREDITS = 8;
const DART = 1;
const SHIP = 7;
const CAPTURED_MECHANOID = 12;
const STARTS_SCRIPT = 4;
const BRIEFING = 102;

const newGame = (): GameplaySession =>
  createWalkabout(bundle, settings).session;

const shown = (session: GameplaySession): readonly string[] =>
  session.talk!.shown;

const advanceUntil = (
  session: GameplaySession,
  done: () => boolean,
  limit = 300
): void => {
  for (let left = limit; !done(); left -= FRAME) {
    if (left <= 0) {
      throw new Error(
        `not reached in ${limit} s: ${shown(session).join(' / ')}`
      );
    }
    session.advance(FRAME);
  }
};

const advance = (session: GameplaySession, seconds: number): void => {
  for (let left = seconds; left > 1e-9; left -= FRAME) {
    session.advance(FRAME);
  }
};

/// Until the line has played and the display is free again.
const afterLine = (session: GameplaySession, line: string): void => {
  advanceUntil(
    session,
    () => shown(session).includes(line) && !session.scripts!.messagePlaying
  );
};

/// Until the first offer to buy the Dart has shown and waits for an answer.
const atOffer = (session: GameplaySession): void => {
  afterLine(session, 'DO YOU WANT TO BUY?');
};

/// Boards the Dart as the player does, so its own Benson Script starts.
const boardDart = (session: GameplaySession): void => {
  const dart = session.content.objects.find(object => object.slot === DART)!;
  session.game = {
    ...session.game,
    player: { ...session.game.player, position: { ...dart.origin } }
  };
  expect(session.reach('board', DART).outcome).toMatchObject({
    kind: 'boarded'
  });
};

/// Until Benson itself plays the line.
const untilBenson = (session: GameplaySession, line: string): void => {
  advanceUntil(
    session,
    () => session.scripts!.activeMessageText?.trim() === line
  );
};

const credits = (session: GameplaySession): number =>
  session.observations().observations['credits'] as number;

describe('the opening', () => {
  test('plays the Arrival’s beats, in order, as Benson Script 0 wrote them', () => {
    const session = newGame();
    afterLine(session, milestones.statusReport);
    // Benson's blank lines clear the display between beats.
    const [crash, returning, manual, verdict, status] = shown(session).filter(
      line => line.trim() !== ''
    );
    expect([crash, returning, manual, status]).toEqual([
      milestones.crashImminent,
      milestones.returningTo,
      milestones.manualControl,
      milestones.statusReport
    ]);
    expect(milestones.verdicts).toContain(verdict!);
  });

  test('arms the Dart, the ship and the captured Mechanoid to start their own Benson Scripts', () => {
    const session = newGame();
    session.advance(FRAME);
    const flags = new Map(session.captureSaveSnapshot().objectFlags);
    for (const slot of [DART, SHIP, CAPTURED_MECHANOID]) {
      expect(flags.get(slot)! & STARTS_SCRIPT).toBe(STARTS_SCRIPT);
    }
  });

  test('sells the Dart for a Y, and the Dart’s own script then passes on a job offer', () => {
    const session = newGame();
    const before = credits(session);
    atOffer(session);
    session.input('KeyY');
    afterLine(session, 'TRANSACTION COMPLETED');
    expect(credits(session)).toBe(before - 5000);
    expect(shown(session)).toContain(`YOU HAVE ${before - 5000} CREDITS`);
    expect(session.talk!.reports).toContainEqual(
      expect.objectContaining({ kind: 'run end', outcome: 'completed' })
    );

    boardDart(session);
    untilBenson(session, 'MESSAGE FROM PALYARS');
  });

  test('lets the Dart’s own script scold a player who takes it unpaid', () => {
    const session = newGame();
    atOffer(session);
    boardDart(session);
    untilBenson(session, 'PALYAR SHIP ATTACKING');
  });

  test('tells a player who spoke up but didn’t buy that it will be a long walk', () => {
    const session = newGame();
    atOffer(session);
    advance(session, 6);
    session.input('KeyQ');
    afterLine(session, 'IT WILL BE A LONG WALK');
    expect(shown(session)).not.toContain('IS ANYBODY THERE');
    expect(credits(session)).toBe(credits(newGame()));
  });

  test('calls out to a silent player, and starts again once one answers', () => {
    const session = newGame();
    afterLine(session, 'IS ANYBODY THERE');
    session.input('KeyQ');
    afterLine(session, 'AH, YOU ARE BACK');
    afterLine(session, 'I WILL START AGAIN');
    afterLine(session, 'DO YOU WANT TO BUY?');
  });

  test('leaves Benson free for other scripts once the pitch is over', () => {
    const session = newGame();
    atOffer(session);
    session.input('KeyY');
    afterLine(session, 'TRANSACTION COMPLETED');
    // Benson Script 0 would have held Benson until the player boarded the
    // Dart, refusing the briefing.
    session.teleport(room(BRIEFING));
    afterLine(session, 'MECHANOID BRIEFING ROOM');
  });

  test('restored mid-beat, is still the opening speaking', () => {
    const session = newGame();
    advanceUntil(
      session,
      () =>
        session.scripts!.activeMessageText === milestones.crashImminent &&
        session.scripts!.messagePlaying
    );
    const restored = createWalkabout(
      bundle,
      settings,
      session.captureSaveSnapshot()
    ).session;
    expect(restored.scripts!.activeMessageText).toBe(milestones.crashImminent);
    expect(restored.talk!.speaker).toBe(OPENING);
    afterLine(restored, milestones.statusReport);
  });

  test('saves under the Talk Script bound after ten minutes of calling out', () => {
    const session = newGame();
    const fresh = session.captureSaveSnapshot().talk!.group.length;
    afterLine(session, 'WHERE ARE YOU');
    advance(session, 600);
    const environment = saveEnvironment(bundle, settings);
    const saved = encodeSave({
      environment,
      location: { kind: 'surface' },
      savedAt: '2026-10-18T12:00:00.000Z',
      schemaVersion: SAVE_SCHEMA_VERSION,
      snapshot: session.captureSaveSnapshot()
    });
    const talk = decodeSave(saved, environment).snapshot.talk!;
    // A Save carries every Talk Script's code, so its size is mostly what is
    // loaded; waiting adds little to it.
    expect(talk.group.length - fresh).toBeLessThan(4096);
    expect(talk.group.length).toBeLessThan(SAVE_TALK_CODE_UNIT_LIMIT / 2);
  });
});
