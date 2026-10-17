/// Outcome tests for the Targ Talk Scripts. They run on the TS Core, or on
/// the WASM Core when NORTHTALK_WASM names a `talk.wasm` reactor.
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import { createCore as createWasmCore } from '@northtalk/ts/wasm';

import type { BensonHostFields } from '../../src/benson/host.ts';
import { TalkHost, type TalkCore } from './host.ts';
import { seededHost, talkSources } from './sources.ts';

const STATUS_REPORT = [
  'STATUS REPORT',
  'CRASH LANDED ON TARG',
  'PRESTINIUM DESTROYED',
  'STATE OF WAR BETWEEN',
  'PALYARS AND MECHANOIDS',
  'LOCATION NEAR AIRBASE',
  'AIRCRAFT ON PAD',
  'TYPE - DOMINION DART',
  'MESSAGE RECEIVED',
  'CRAFT FOR SALE',
  'PRICE 5000 CREDITS',
  'YOU HAVE 9000 CREDITS'
];

const NAGS = [
  'DO YOU WANT TO BUY?',
  'I THINK YOU SHOULD BUY',
  'DO YOU WANT TO BUY?',
  'IS THIS SENSIBLE',
  'DO YOU WANT TO BUY?',
  'YOU PLAN TO WALK',
  'DO YOU WANT TO BUY?',
  'YOU MUST BE CRAZY'
];

const wasm = process.env.NORTHTALK_WASM;

/// A fresh Core per host, so a restore lands in a Core that never ran the save.
const newCore = async (): Promise<TalkCore | undefined> =>
  wasm === undefined
    ? undefined
    : // WasmGroup has the Group methods the host calls but isn't typed as a Group.
      ((await createWasmCore({
        wasm: readFileSync(wasm)
      })) as unknown as TalkCore);

/// Random byte 2 picks the third verdict, GOOD LANDING, as both script-0 traces do.
const newHost = async (patch: Partial<BensonHostFields> = {}) => {
  const core = await newCore();
  return new TalkHost(talkSources, (await seededHost()).with(patch), {
    ...(core && { core }),
    random: () => 2
  });
};

/// Advances in half-second steps until the predicate holds or the limit passes.
const advanceUntil = (
  host: TalkHost,
  done: () => boolean,
  limit = 900
): void => {
  const until = host.now + limit;
  while (!done()) {
    if (host.now >= until) {
      throw new Error(
        `not reached by ${until} s: ${host.messages.join(' / ')}`
      );
    }
    host.advance(0.5);
  }
};

/// Advances until the message has finished playing, so a key wait that follows it is open.
const afterMessage = (host: TalkHost, message: string, occurrence = 1) =>
  advanceUntil(
    host,
    () =>
      host.messages.filter(m => m === message).length >= occurrence &&
      !host.host.messagePlaying
  );

const aboardShip = () => ({ boardedCraft: 7, currentRoom: 0 });

const errors = (host: TalkHost) =>
  host.reports.filter(
    report =>
      (report.kind === 'run end' && report.outcome !== 'completed') ||
      report.kind === 'call failed' ||
      report.kind === 'host error'
  );

describe('opening', () => {
  test('reports the crash and pitches the Dart to a silent player', async () => {
    const host = await newHost();
    host.start('opening');
    advanceUntil(host, () => host.messages.includes('AM I TALKING TO MYSELF'));
    expect(host.messages).toEqual([
      'CRASH IMMINENT,',
      'RETURNING TO - - -',
      'MANUAL CONTROL',
      'GOOD LANDING,',
      ...STATUS_REPORT,
      ...NAGS,
      'IS ANYBODY THERE',
      'AM I TALKING TO MYSELF'
    ]);
    expect(host.host.objectFlags.get(7)).toBe(4);
    expect(host.host.decimal(8)).toBe(9000);
    expect(errors(host)).toEqual([]);
  });

  test('a player heard during the pitch is told it will be a long walk', async () => {
    const host = await newHost();
    host.start('opening');
    afterMessage(host, 'STATUS REPORT');
    host.press('N');
    advanceUntil(host, () => host.messages.includes('IT WILL BE A LONG WALK'));
    expect(host.messages.slice(-2)).toEqual([
      'YOU MUST BE CRAZY',
      'IT WILL BE A LONG WALK'
    ]);
    host.advance(120);
    expect(host.messages.at(-1)).toBe('IT WILL BE A LONG WALK');
    expect(host.host.decimal(8)).toBe(9000);
  });

  test('answering Y buys the Dart', async () => {
    const host = await newHost();
    host.start('opening');
    afterMessage(host, 'DO YOU WANT TO BUY?', 2);
    host.press('Y');
    host.advance(60);
    expect(host.messages.slice(-4)).toEqual([
      'I THINK YOU SHOULD BUY',
      'DO YOU WANT TO BUY?',
      'TRANSACTION COMPLETED',
      'YOU HAVE 4000 CREDITS'
    ]);
    expect(host.host.decimal(8)).toBe(4000);
  });

  test('calling out ends when any key answers', async () => {
    const host = await newHost();
    host.start('opening');
    afterMessage(host, 'IS ANYBODY THERE');
    host.advance(5);
    host.press('Q');
    advanceUntil(host, () => host.messages.includes('I WILL START AGAIN'));
    expect(host.messages.slice(-4)).toEqual([
      'IS ANYBODY THERE',
      'AH, YOU ARE BACK',
      'NOW YOU ARE HERE - - -',
      'I WILL START AGAIN'
    ]);
  });
});

describe('escape', () => {
  const aboard = { boardedCraft: 7, currentRoom: 0 };

  test('refuses to launch without a Novadrive', async () => {
    const host = await newHost(aboard);
    host.start('escape');
    host.advance(60);
    expect(host.messages).toEqual(['INTERSTELLAR SHIP', 'NOVADRIVE REQUIRED']);
    expect(host.host.endingPhase).toBe(0);
  });

  test('pressing Y with a Novadrive escapes Targ and ends the game', async () => {
    const host = await newHost({ ...aboard, inventory: new Set([25]) });
    host.start('escape');
    afterMessage(host, 'PRESS Y TO LAUNCH');
    host.press('Y');
    host.advance(150);
    expect(host.host.endingPhase).toBe(1);
    expect(host.host.messageInterval).toBe(150);
    expect(host.messages.slice(0, 8)).toEqual([
      'INTERSTELLAR SHIP',
      'PRESS Y TO LAUNCH',
      'THE AUTHOR SENDS YOU',
      'CONGRATULATIONS ON YOUR',
      'ESCAPE FROM TARG',
      'SAVE OUT THE STATUS AND',
      'SEE YOU IN MERCENARY II',
      'GAME OVER'
    ]);
    expect(host.messages.filter(m => m === 'GAME OVER').length).toBeGreaterThan(
      1
    );
    expect(host.effects).toContainEqual({
      sound: { symbol: 'voice2.control', value: 0 }
    });
  });

  test("the Palyar commander's brother-in-law is pleased to see you go", async () => {
    const host = await newHost({
      ...aboard,
      engineFlags: 32 | 4
    });
    host.start('escape');
    afterMessage(host, 'PRESS Y TO LAUNCH');
    host.press('Y');
    host.advance(90);
    expect(host.messages).toContain("IS PLEASED YOU'VE GONE");
  });

  test('a destroyed advert keeps the player on Targ', async () => {
    const host = await newHost({
      ...aboard,
      destroyedBlocks: new Set([50]),
      inventory: new Set([25])
    });
    host.start('escape');
    afterMessage(host, 'PRESS Y TO LAUNCH');
    host.press('Y');
    host.advance(60);
    expect(host.messages.slice(-3)).toEqual([
      "THE AUTHOR WON'T LET",
      'YOU LEAVE UNTIL YOU',
      'FIX HIS ADVERT'
    ]);
    expect(host.host.endingPhase).toBe(0);
  });

  test('leaving the ship abandons the launch', async () => {
    const host = await newHost({ ...aboard, inventory: new Set([25]) });
    host.start('escape');
    afterMessage(host, 'PRESS Y TO LAUNCH');
    host.leaveCraft();
    host.advance(5);
    host.press('Y');
    host.advance(60);
    expect(host.messages).toEqual(['INTERSTELLAR SHIP', 'PRESS Y TO LAUNCH']);
    expect(host.host.endingPhase).toBe(0);
    expect(errors(host)).toEqual([]);
  });
});

describe('concurrent Talk Scripts', () => {
  test('share the Benson Display first come, first served', async () => {
    const host = await newHost();
    host.start('opening');
    afterMessage(host, 'CRASH IMMINENT,');
    // The opening has armed object 7, so boarding it starts the Escape beside it.
    host.board(7);
    advanceUntil(host, () => host.messages.includes('STATUS REPORT'));
    expect(host.messages.slice(0, 6)).toEqual([
      'CRASH IMMINENT,',
      'INTERSTELLAR SHIP',
      'RETURNING TO - - -',
      'NOVADRIVE REQUIRED',
      'MANUAL CONTROL',
      'GOOD LANDING,'
    ]);
    expect(errors(host)).toEqual([]);
  });
});

/// Plays the Escape to its end, optionally restoring into a fresh Core while it waits on Y.
const playEscape = async (restoreMidway: boolean) => {
  const host = await newHost({ ...aboardShip(), inventory: new Set([25]) });
  host.start('escape');
  afterMessage(host, 'PRESS Y TO LAUNCH');
  host.advance(0.25);
  let live = host;
  if (restoreMidway) {
    const saved = host.save();
    live = await newHost();
    live.restore(saved);
    live.effects.push(...host.effects);
  }
  live.press('Y');
  live.advance(90);
  return live;
};

describe('saves', () => {
  test('a save while the Escape waits on Y restores into a fresh Core and finishes the same', async () => {
    const control = await playEscape(false);
    const restored = await playEscape(true);
    expect(restored.messages).toEqual(control.messages);
    expect(restored.host.endingPhase).toBe(1);
    expect(errors(restored)).toEqual([]);
  });

  test('a save while a message is still playing replays that message', async () => {
    const host = await newHost();
    host.start('opening');
    advanceUntil(host, () => host.messages.includes('CRASH IMMINENT,'));
    const saved = host.save();
    const live = await newHost();
    live.restore(saved);
    live.advance(10);
    expect(live.messages[0]).toBe('CRASH IMMINENT,');
  });
});
