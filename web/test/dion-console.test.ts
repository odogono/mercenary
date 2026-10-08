import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import {
  dionMessageTranscript,
  executeDionConsoleCommand,
  parseDionConsoleCommand,
  type DionConsoleHost
} from '../src/dion/console.ts';
import { DionSession, type DionAction } from '../src/dion/session.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import { IDLE } from '../src/gameCore/index.ts';
import type { PreferencesStore } from '../src/shell/preferences.ts';
import type { SavePersistence } from '../src/shell/saves.ts';
import { dionContent } from './dion-documents.ts';
import { frames } from './dion-journey.ts';

const tourcraft = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});

const host = (
  session: TourcraftSession,
  overrides: Partial<DionConsoleHost> = {}
): DionConsoleHost => ({
  persistence: {
    disarm: () => undefined,
    load: () => ({ kind: 'done' }),
    save: () => ({ kind: 'done' })
  } as unknown as SavePersistence,
  preferences: {
    update: () => undefined
  } as unknown as PreferencesStore,
  session: () => session,
  typeface: () => undefined,
  ...overrides
});

const run = (session: DionSession | TourcraftSession, line: string) =>
  executeDionConsoleCommand(
    parseDionConsoleCommand(line)!,
    // The clocks are the D1 session's own, which the clock tests restore from edited Saves.
    host(session as TourcraftSession)
  )[0];

describe('Dion console clocks', () => {
  test('sets Body Time and daylight while leaving the panel clock independent', async () => {
    const content = await dionContent();
    const session = new DionSession(content);
    const clock = session.snapshot.clock;
    for (const value of ['0:00:00', '12:00:00', '23-59-59', '9:01:02']) {
      expect(run(session, `time ${value}`)).toBe(
        `time ${value.replaceAll('-', ':').padStart(8, '0')}`
      );
      expect(session.snapshot.clock).toEqual(clock);
      expect(run(session, 'time')).toBe(
        `time ${value.replaceAll('-', ':').padStart(8, '0')}`
      );
      expect(
        run(new DionSession(content, session.captureResume()), 'time')
      ).toBe(run(session, 'time'));
    }
    run(session, 'time 12:00');
    expect(session.snapshot.day).toBe(true);
    run(session, 'time 0:00');
    expect(session.snapshot.day).toBe(false);
    const saved = session.captureResume();
    const east = new DionSession(content, {
      ...saved,
      snapshot: {
        ...saved.snapshot,
        eye: [
          saved.snapshot.eye[0] + 0x4_00_00,
          saved.snapshot.eye[1],
          saved.snapshot.eye[2]
        ]
      }
    });
    expect(
      (east.bodyTime() - session.bodyTime() + 86_400) % 86_400
    ).toBeCloseTo(86_400 / 1024, 4);
  });

  test('sets and restores the panel clock, preserving its day, fraction and sky', async () => {
    const content = await dionContent();
    const session = new DionSession(content);
    const before = session.snapshot;
    expect(run(session, 'clock 23-59-59')).toBe('clock 23:59:59');
    expect(run(session, 'clock')).toBe('clock 23:59:59');
    expect(session.snapshot.phase).toBe(before.phase);
    expect(session.snapshot.clock.accumulator).toBe(before.clock.accumulator);
    expect(session.snapshot.clock.day).toBe(before.clock.day);
    const restored = new DionSession(content, session.captureResume());
    session.advance(1);
    restored.advance(1);
    expect(restored.snapshot).toEqual(session.snapshot);
    expect(run(restored, 'clock')).toBe('clock 00:00:00');
    expect(restored.snapshot.clock.day).toBe(before.clock.day + 1);
  });

  test('reports the pads the browser lists', async () => {
    const session = new TourcraftSession(tourcraft);
    const pad = {
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, (_, index) => ({
        pressed: index === 0,
        value: index === 0 ? 1 : 0
      })),
      connected: true,
      id: 'Test Pad',
      index: 0,
      mapping: 'standard'
    };
    const lines = executeDionConsoleCommand(
      parseDionConsoleCommand('pads')!,
      host(session, { pads: () => [pad] })
    );
    expect(lines[0]).toBe('pad 0 · Test Pad');
    expect(lines).toContain('  held: A');
    expect(() => parseDionConsoleCommand('pads 1')).toThrow();
  });

  test('reads the shared command set, and its own clock', () => {
    expect(parseDionConsoleCommand('  TIME 9-01-02 ')).toEqual({
      kind: 'setTime',
      secondsOfDay: 32_462
    });
    expect(parseDionConsoleCommand('clock 9:01')).toEqual({
      kind: 'setClock',
      secondsOfDay: 32_460
    });
    expect(parseDionConsoleCommand('')).toBeUndefined();
    for (const [line, kind] of [
      ['where', 'where'],
      ['inventory', 'inventory'],
      ['get', 'getObject'],
      ['drop', 'dropObject'],
      ['save 1', 'save'],
      ['load 2', 'load'],
      ['set typeface damocles', 'set']
    ] as const) {
      expect(parseDionConsoleCommand(line)?.kind).toBe(kind);
    }
    for (const line of [
      'clock 24:00',
      'clock 1:60',
      'clock 1:02-03',
      'clock 1:00 extra',
      'impact',
      'save 4'
    ]) {
      expect(() => parseDionConsoleCommand(line)).toThrow();
    }
  });

  test('answers verbs it has not ported, rather than doing something adjacent', () => {
    const session = new TourcraftSession(tourcraft);
    for (const line of ['goto 1 2', 'fetch 3', 'floor 1', 'switch metis']) {
      expect(run(session, line)).toMatch(/not ported to Mercenary III/);
    }
    expect(run(session, 'get 104')).toMatch(/only what is in reach/);
  });
});

const at = (session: TourcraftSession, frame: number) => {
  while (session.snapshot.frame < frame - 1) {
    frames(session);
    session.drainSound();
  }
};
const act = (session: TourcraftSession, frame: number, action: DionAction) => {
  at(session, frame);
  session.press(action);
  frames(session);
};
const stack = (session: TourcraftSession) =>
  session.snapshot.tourcraft!.carry.stack;

describe('Dion console play', () => {
  test('where and inventory report the opening', () => {
    const session = new TourcraftSession(tourcraft);
    const where = executeDionConsoleCommand(
      parseDionConsoleCommand('where')!,
      host(session)
    );
    expect(where[0]).toMatch(/^METIS \d+-\d+$/);
    expect(where.at(-1)).toBe('on foot');
    expect(
      executeDionConsoleCommand(
        parseDionConsoleCommand('inventory')!,
        host(session)
      )
    ).toEqual(['(104) TAXICARD', '(103) BUS PASS', '(135) ACME UNIVERSAL']);
  });

  test("get and drop press the keys on R1's opening route", () => {
    const session = new TourcraftSession(tourcraft);
    act(session, 20, 'activate');
    at(session, 80);
    session.intent = { ...IDLE, walk: 1 };
    at(session, 124);
    session.intent = IDLE;
    at(session, 161);
    expect(run(session, 'drop bus')).toBe("carried head does not match 'bus'");
    expect(run(session, 'drop taxi')).toBe('drop TAXICARD');
    frames(session);
    expect(stack(session)).toEqual([103, 135]);
    at(session, 191);
    expect(run(session, 'get')).toBe('take TAXICARD');
    frames(session);
    expect(stack(session)).toEqual([104, 103, 135]);
  });

  test('a message is logged as Benson', () => {
    expect(dionMessageTranscript('   WELCOME TO METIS   ')).toEqual([
      'BENSON · WELCOME TO METIS'
    ]);
    expect(dionMessageTranscript('   ')).toEqual([]);
  });
});
