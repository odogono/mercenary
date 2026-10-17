/// Outcome tests for the Targ Talk Scripts, run in a real Gameplay Session
/// with every Benson Script refused. They run on the TS Core, or on the WASM
/// Core when NORTHTALK_WASM names a `talk.wasm` reactor.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import { createCore as createWasmCore } from '@northtalk/ts/wasm';

import { BensonHostState } from '../../src/benson/host.ts';
import { SURFACE, room } from '../../src/world/index.ts';
import { LegalRoute } from '../../test/legalCheckpoint.ts';
import { loadPayload } from '../../test/replay/artifacts.ts';
import type { TalkCore } from './host.ts';
import {
  openTalkSession,
  type TalkSession,
  type TalkSessionOptions
} from './session.ts';

const STEP = 1 / 50;
const CREDITS = BensonHostState.firstNumberDecimal;
const SHIP = 7;
const NOVADRIVE = 25;
const HANGAR = 5;
const BRIEFING = 102;
const CELL = 0x1_00_00;

const rules = (await loadPayload()).endgame.combat.siteDestruction;

const wasm = process.env.NORTHTALK_WASM;

/// A fresh Core per host, so a restore lands in a Core that never ran the save.
const newCore = async (): Promise<TalkCore | undefined> =>
  wasm === undefined
    ? undefined
    : // WasmGroup has the Group methods the host calls but isn't typed as a Group.
      ((await createWasmCore({
        wasm: readFileSync(wasm)
      })) as unknown as TalkCore);

/// Random byte 2 picks the third verdict, GOOD LANDING, as both script-0
/// traces do, and is low enough to send a Faction Reaction's ship.
const open = async (options: TalkSessionOptions = {}): Promise<TalkSession> => {
  const core = await newCore();
  return openTalkSession({
    ...(core && { core }),
    random: () => 2,
    ...options
  });
};

/// Advances frame by frame until the predicate holds or the limit passes.
const advanceUntil = (
  session: TalkSession,
  done: () => boolean,
  limit = 900
): void => {
  for (let left = limit; !done(); left -= STEP) {
    if (left <= 0) {
      throw new Error(
        `not reached in ${limit} s: ${session.talk.messages.join(' / ')}`
      );
    }
    session.advance(STEP);
  }
};

const advance = (session: TalkSession, seconds: number): void => {
  for (let left = seconds; left > 1e-9; left -= STEP) {
    session.advance(Math.min(STEP, left));
  }
};

/// Advances until the message has begun to play.
const untilShown = (session: TalkSession, message: string): void =>
  advanceUntil(session, () => session.talk.messages.includes(message));

/// Advances until the message has played and the display has gone quiet, so
/// the wait that follows it has begun. With nothing waiting after it, that is
/// whenever the Talk Scripts next pause, not the moment the message ends.
const afterMessage = (session: TalkSession, message: string): void =>
  advanceUntil(
    session,
    () =>
      session.talk.messages.includes(message) &&
      !session.benson.host.messagePlaying
  );

/// Runs that failed. A World Event whose Guard doesn't match ends its Run as
/// `unhandled`, and a Queueing Policy can end one as `dropped`: both are the
/// Talk Scripts choosing not to act, not failures.
const errors = (session: TalkSession) =>
  session.talk.reports.filter(
    report =>
      (report.kind === 'run end' &&
        !['completed', 'dropped', 'unhandled'].includes(report.outcome)) ||
      report.kind === 'call failed' ||
      report.kind === 'host error'
  );

const credits = (session: TalkSession): number =>
  session.benson.host.decimal(CREDITS);

const events = (session: TalkSession) =>
  session.talk.delivered.map(entry => entry.event);

/// In the hangar aboard the recovered ship, as `test/escape.test.ts` starts.
const aboardInTheHangar = async (novadrive = true): Promise<TalkSession> => {
  const session = await open({ scripts: ['escape'] });
  if (novadrive) {
    session.carry(NOVADRIVE);
  }
  session.teleport(room(HANGAR));
  LegalRoute.resume(session).run(
    { action: 'board', kind: 'reach', slot: SHIP },
    60
  );
  expect(session.occupancy).toEqual({ kind: 'aboard', slot: SHIP });
  return session;
};

const rideLift = (session: TalkSession): void => {
  LegalRoute.resume(session).run({
    command: { kind: 'rideLift' },
    kind: 'command'
  });
};

/// A Dart over one cell, set up as `test/site-destruction.test.ts` does.
const overCell = (cell: number, roll: number): Promise<TalkSession> =>
  open({
    player: {
      heading: Math.PI,
      pitch: 0,
      position: {
        x: (cell & 0x0f) * CELL + 0x70_00,
        y: 0,
        z: (cell >> 4) * CELL + 0x70_00
      },
      roll: 0,
      speed: 0,
      yawVelocity: 0
    },
    random: () => roll,
    scripts: ['reaction']
  }).then(session => {
    session.board(1);
    return session;
  });

const bomb = (session: TalkSession): void => {
  session.fire();
  session.advance(1 / 20);
};

/// A faction's generic installation: the cell whose Site has the faction's
/// shared low id (2 Palyar, 3 Mechanoid), which Benson Scripts 34 and 35 answer.
const installation = (faction: 'mechanoid' | 'palyar'): number =>
  rules.initialTable.findIndex(
    byte =>
      (byte & rules.neutralMask) === 0 &&
      (byte & rules.lowIdMask) === (faction === 'palyar' ? 2 : 3)
  );

describe('the opening', () => {
  test('plays the crash and the status report on the Benson Display', async () => {
    const session = await open({ scripts: ['opening'] });
    untilShown(session, 'YOU HAVE 9000 CREDITS');
    expect(session.talk.messages.slice(0, 6)).toEqual([
      'CRASH IMMINENT,',
      'RETURNING TO - - -',
      'MANUAL CONTROL',
      'GOOD LANDING,',
      'STATUS REPORT',
      'CRASH LANDED ON TARG'
    ]);
    // The line reaches the player through the session's own Benson Display.
    advanceUntil(
      session,
      () =>
        session.snapshot.bensonMessage?.completedText ===
        'YOU HAVE 9000 CREDITS',
      30
    );
    expect(errors(session)).toEqual([]);
  });

  test('Y at the first offer buys the Dart', async () => {
    const session = await open({ scripts: ['opening'] });
    afterMessage(session, 'DO YOU WANT TO BUY?');
    session.press('keyY');
    afterMessage(session, 'YOU HAVE 4000 CREDITS');
    expect(credits(session)).toBe(4000);
    expect(session.talk.messages.slice(-2)).toEqual([
      'TRANSACTION COMPLETED',
      'YOU HAVE 4000 CREDITS'
    ]);
  });

  test('a key pressed outside the offers means a long walk', async () => {
    const session = await open({ scripts: ['opening'] });
    untilShown(session, 'STATUS REPORT');
    session.press('keyY');
    untilShown(session, 'IT WILL BE A LONG WALK');
    expect(credits(session)).toBe(9000);
  });

  test('silence brings Benson calling out', async () => {
    const session = await open({ scripts: ['opening'] });
    afterMessage(session, 'IS ANYBODY THERE');
    expect(session.talk.messages).not.toContain('IT WILL BE A LONG WALK');
  });
});

describe('the Escape', () => {
  test('boarding the ship is a World Event standing in for Benson Script 7', async () => {
    const session = await aboardInTheHangar();
    afterMessage(session, 'INTERSTELLAR SHIP');
    expect(session.benson.refused).toContain(SHIP);
    expect(events(session)).toContainEqual({ craft: 'ship', kind: 'boarded' });
  });

  test('surfacing aboard with a Novadrive and pressing Y escapes', async () => {
    const session = await aboardInTheHangar();
    afterMessage(session, 'INTERSTELLAR SHIP');
    rideLift(session);
    afterMessage(session, 'PRESS Y TO LAUNCH');
    session.press('keyY');
    afterMessage(session, 'SEE YOU IN MERCENARY II');
    // The Talk Script writes phase 1; the engine's Ending field then moves it on.
    expect(session.ending.kind).toBe('escape');
    expect(session.talk.messages).toContain('ESCAPE FROM TARG');
    expect(errors(session)).toEqual([]);
  });

  test('without a Novadrive the ship refuses', async () => {
    const session = await aboardInTheHangar(false);
    rideLift(session);
    afterMessage(session, 'NOVADRIVE REQUIRED');
    expect(session.talk.messages).not.toContain('PRESS Y TO LAUNCH');
    expect(session.benson.host.endingPhase).toBe(0);
  });

  test('leaving the ship before Y abandons the launch', async () => {
    const session = await aboardInTheHangar();
    rideLift(session);
    afterMessage(session, 'PRESS Y TO LAUNCH');
    session.leaveCraft();
    advance(session, 1);
    session.press('keyY');
    advance(session, 10);
    expect(events(session)).toContainEqual({ craft: 'ship', kind: 'left' });
    expect(session.benson.host.endingPhase).toBe(0);
  });
});

describe('the Mechanoid briefing', () => {
  test('entering Room 102 plays the whole briefing', async () => {
    const session = await open({ scripts: ['briefing'] });
    session.teleport(room(BRIEFING));
    afterMessage(session, 'BRIEFING ENDS');
    expect(session.benson.refused).toContain(13);
    expect(session.talk.messages).toEqual([
      'MECHANOID BRIEFING ROOM',
      'WE WILL PAY',
      'FOR PALYAR REQUIREMENTS',
      'WHEN DELIVERED TO OUR',
      'CONTROL IN THIS COMPLEX',
      'WE MAY ALSO PAY FOR',
      'DESTRUCTION OF SELECTED',
      'PALYAR INSTALLATIONS',
      'BRIEFING ENDS'
    ]);
  });

  test('leaving during the first part cuts the rest', async () => {
    const session = await open({ scripts: ['briefing'] });
    session.teleport(room(BRIEFING));
    untilShown(session, 'WE WILL PAY');
    session.teleport(SURFACE);
    advance(session, 60);
    expect(session.talk.messages.at(-1)).toBe('CONTROL IN THIS COMPLEX');
  });

  test('walking back in while it plays doesn’t start it again', async () => {
    const session = await open({ scripts: ['briefing'] });
    session.teleport(room(BRIEFING));
    untilShown(session, 'WE WILL PAY');
    session.teleport(SURFACE);
    advance(session, 1);
    session.teleport(room(BRIEFING));
    advance(session, 120);
    expect(
      session.talk.messages.filter(line => line === 'MECHANOID BRIEFING ROOM')
    ).toHaveLength(1);
    expect(session.talk.reports).toContainEqual(
      expect.objectContaining({ kind: 'run end', outcome: 'dropped' })
    );
    expect(session.talk.messages.at(-1)).toBe('BRIEFING ENDS');
  });
});

describe('Faction Reactions', () => {
  test('destroying a Mechanoid installation can send its ship', async () => {
    const session = await overCell(installation('mechanoid'), 2);
    bomb(session);
    afterMessage(session, 'MECHANOID SHIP ATTACK');
    expect(session.benson.refused).toContain(35);
    expect(session.benson.host.attackingShip).toBe(true);
    expect(events(session)).toContainEqual({
      faction: 'mechanoid',
      kind: 'destroyed',
      site: 'installation'
    });
  });

  test('a high roll sends nothing', async () => {
    const session = await overCell(installation('palyar'), 200);
    bomb(session);
    advance(session, 10);
    expect(session.benson.refused).toContain(34);
    expect(events(session)).toContainEqual({
      faction: 'palyar',
      kind: 'destroyed',
      site: 'installation'
    });
    expect(session.talk.messages).toEqual([]);
    expect(session.benson.host.attackingShip).toBe(false);
  });
});

describe('Talk Scripts together', () => {
  test('the briefing and the opening share the display a line at a time', async () => {
    const session = await open();
    untilShown(session, 'STATUS REPORT');
    session.teleport(room(BRIEFING));
    afterMessage(session, 'BRIEFING ENDS');
    const lines = session.talk.messages;
    expect(lines).toContain('CONTROL IN THIS COMPLEX');
    expect(lines).toContain('PRICE 5000 CREDITS');
    expect(errors(session)).toEqual([]);
  });
});

describe('saves', () => {
  test('a save while the Escape waits on Y restores and finishes the same', async () => {
    const play = async (restoreMidway: boolean): Promise<string[]> => {
      const session = await aboardInTheHangar();
      rideLift(session);
      afterMessage(session, 'PRESS Y TO LAUNCH');
      advance(session, 0.5);
      const before = session.talk.messages.length;
      if (restoreMidway) {
        const core = await newCore();
        session.restoreTalk(session.talk.save(), core && { core });
      }
      session.press('keyY');
      afterMessage(session, 'SEE YOU IN MERCENARY II');
      expect(session.ending.kind).toBe('escape');
      expect(errors(session)).toEqual([]);
      return session.talk.messages.slice(restoreMidway ? 0 : before);
    };
    expect(await play(true)).toEqual(await play(false));
  });
});
