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
import {
  decodeTourcraftRecord,
  encodeTourcraftRecord
} from '../src/dion/tourcraftSave.ts';
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
  test('the playable session keeps console clocks through Save/Resume and the next frame', () => {
    for (const [elapsed, time] of [
      [0, '12:00:00'],
      [0, '00:00:00'],
      [1, '12:00:00'],
      [1, '00:00:00']
    ] as const) {
      const session = new TourcraftSession(tourcraft);
      session.advance(elapsed);
      run(session, `time ${time}`);
      run(session, 'clock 9-01-02');
      const restored = new TourcraftSession(
        tourcraft,
        decodeTourcraftRecord(
          encodeTourcraftRecord(tourcraft, session.captureResume(), 'METIS'),
          tourcraft
        ).snapshot
      );
      expect(run(restored, 'clock')).toBe('clock 09:01:02');
      expect(run(restored, 'time')).toBe(`time ${time}`);
      for (const current of [session, restored]) {
        current.advance(11 / 50);
      }
      expect(restored.snapshot).toEqual(session.snapshot);
      expect(run(restored, 'time')!.slice(0, 11)).toBe(
        `time ${time.slice(0, 6)}`
      );
    }
  });

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

  test('answers the atlas, rather than doing something adjacent', () => {
    const session = new TourcraftSession(tourcraft);
    expect(run(session, 'atlas')).toBe('The Gamma Atlas belongs to Damocles');
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

  test('goto, get, fetch and switch move through the session and survive Save/Resume', () => {
    const restore = (session: TourcraftSession) =>
      new TourcraftSession(
        tourcraft,
        decodeTourcraftRecord(
          encodeTourcraftRecord(tourcraft, session.captureResume(), 'TEST'),
          tourcraft
        ).snapshot
      );
    const settled = (session: TourcraftSession) => {
      session.advance(16 / 50);
      session.drainSound();
    };
    const resident = (session: TourcraftSession, slot: number) =>
      session.snapshot.tourcraft!.residents.find(r => r.slot === slot)!;

    // The opening has not run its first frame yet, so a move would leave the
    // opening owners incoherent in a Save.
    const opening = new TourcraftSession(tourcraft);
    expect(run(opening, 'goto 5 5')).toMatch(/goto refused:/);
    expect(run(opening, 'switch tolosa')).toMatch(/switch declined:/);

    const session = new TourcraftSession(tourcraft);
    settled(session);

    // goto a cell, at the walk eye height or at a named height.
    expect(run(session, 'goto 5 5')).toBe('moved to cell 05-05');
    expect(session.snapshot.cell).toBe(85);
    expect(session.snapshot.eye).toEqual([
      (2527 + 5) * 65_536 + 32_768,
      63,
      (1066 + 5) * 65_536 + 32_768
    ]);
    expect(run(session, 'goto 5 5 1000')).toBe(
      'moved to cell 05-05 at height 1000'
    );
    expect(session.snapshot.eye[1]).toBe(1000);
    expect(run(session, 'goto 5 5')).toBe('moved to cell 05-05');
    let restored = restore(session);
    expect(restored.snapshot.cell).toBe(85);
    for (const current of [session, restored]) {
      current.advance(11 / 50);
      current.drainSound();
    }
    expect(restored.snapshot).toEqual(session.snapshot);

    // goto a region of the bound structure, the Mercenary III room.
    expect(run(session, 'goto 2 6')).toBe('moved to cell 02-06');
    expect(run(session, 'goto room 3')).toBe('moved to region 3');
    expect(session.snapshot.region).toBe(3);
    expect(run(session, 'goto room 99')).toMatch(/goto refused:/);
    expect(run(restore(session), 'where')).toMatch(/^METIS 2-6$/);

    // goto an object, on this Body and on the other promoted Body.
    expect(run(session, 'goto object 165')).toBe(
      'moved to object 165 on METIS'
    );
    expect(session.snapshot.cell).toBe(resident(session, 165).cell);
    expect(run(session, 'goto object 104')).toBe('object 104 is being carried');
    expect(run(session, 'goto object 74')).toBe(
      'object 74 is not in the world'
    );
    expect(run(session, 'goto object 255')).toBe('there is no object 255');
    expect(run(session, 'goto object 174')).toBe(
      'moved to object 174 on TOLOSA'
    );
    expect(session.snapshot.location).toBe(100);
    expect(session.snapshot.cell).toBe(resident(session, 174).cell);
    restored = restore(session);
    expect(restored.snapshot.location).toBe(100);
    expect(restored.snapshot.cell).toBe(session.snapshot.cell);

    // switch back, as a Body switch in its own right.
    const switched = executeDionConsoleCommand(
      parseDionConsoleCommand('switch metis')!,
      host(session)
    );
    expect(switched[0]).toBe('switched to METIS');
    expect(session.snapshot.location).toBe(60);
    expect(session.snapshot.tourcraft!.flight).toBeNull();
    expect(restore(session).snapshot.location).toBe(60);
    expect(run(session, 'switch tolosa')).toBe('switched to TOLOSA');
    expect(session.snapshot.tourcraft!.flight?.mode).toBe('foot');
    expect(run(session, 'goto 1 1')).toBe('moved to cell 01-01');
    restored = restore(session);
    for (const current of [session, restored]) {
      current.advance(11 / 50);
      current.drainSound();
    }
    expect(restored.snapshot).toEqual(session.snapshot);
    expect(run(session, 'switch metis')).toBe('switched to METIS');
    expect(run(session, 'switch space')).toMatch(/switch declined:/);
    expect(run(session, 'switch nowhere')).toBe(
      "switch declined: no Body or Pose named 'nowhere'"
    );

    // A remote Take, with the Take handler's own refusals.
    settled(session);
    expect(run(session, 'get 165')).toBe('took object 165');
    expect(stack(session)[0]).toBe(165);
    expect(restore(session).snapshot.tourcraft!.carry.stack[0]).toBe(165);
    settled(session);
    expect(run(session, 'get 165')).toBe('object 165 is already carried');
    expect(run(session, 'get 10')).toBe('object 10 is fixed in place');
    expect(run(session, 'get 3')).toBe('object 03 is too heavy');
    expect(run(session, 'get 74')).toBe('object 74 is not in the world');
    expect(run(session, 'get 255')).toBe('there is no object 255');
    expect(run(session, 'get 0')).toBe('there is no object 00');
    for (const slot of [124, 181, 219, 220, 236, 240]) {
      settled(session);
      expect(run(session, `get ${slot}`)).toBe(`took object ${slot}`);
    }
    settled(session);
    expect(stack(session)).toHaveLength(10);
    expect(run(session, 'get 99')).toBe('inventory is full');
    expect(restore(session).snapshot.tourcraft!.carry.stack).toEqual(
      stack(session)
    );

    // An upper Floor does not follow a goto into a cell that binds none.
    const floored = new TourcraftSession(tourcraft);
    settled(floored);
    expect(run(floored, 'goto 4 0')).toBe('moved to cell 04-00');
    expect(run(floored, 'floor 2')).toBe('moved to Floor 2');
    expect(run(floored, 'goto 5 5')).toBe('moved to cell 05-05');
    expect(floored.snapshot.tourcraft!.lift.floor).toBe(0);
    expect(restore(floored).snapshot.cell).toBe(85);

    // Fetch brings a resident to the player's feet, without carrying it.
    const fetching = new TourcraftSession(tourcraft);
    settled(fetching);
    const eye = fetching.snapshot.eye;
    expect(run(fetching, 'fetch 165')).toBe('fetched object 165');
    expect(resident(fetching, 165).position).toEqual([
      eye[0],
      eye[1] - 63,
      eye[2]
    ]);
    expect(resident(fetching, 165).cell).toBe(fetching.snapshot.cell);
    expect(stack(fetching)).not.toContain(165);
    expect(
      restore(fetching).snapshot.tourcraft!.residents.find(r => r.slot === 165)!
        .position
    ).toEqual(resident(fetching, 165).position);
    expect(run(fetching, 'fetch 3')).toBe('fetched object 03');
    expect(run(fetching, 'fetch 104')).toBe(
      'object 104 is already carried; use drop'
    );
    expect(run(fetching, 'fetch 10')).toBe('object 10 is fixed in place');
    expect(run(fetching, 'fetch 74')).toBe('object 74 is not in the world');
    expect(run(fetching, 'fetch 255')).toBe('there is no object 255');
  });

  test('the ported verbs refuse aboard, and floor refuses outside its Floors', () => {
    class Aboard extends TourcraftSession {
      boardTaxi() {
        this.state = {
          ...this.state,
          taxi: { ...this.state.taxi, passenger: true }
        };
      }
    }
    const session = new Aboard(tourcraft);
    session.advance(11 / 50);
    session.drainSound();
    expect(run(session, 'floor 1')).toMatch(/floor refused:/);
    session.boardTaxi();
    for (const line of [
      'goto 1 1',
      'goto room 1',
      'goto object 165',
      'get 165',
      'fetch 165',
      'switch tolosa',
      'floor 1'
    ]) {
      expect(run(session, line)).toMatch(/aboard/);
    }
  });

  test('a message is logged as Benson', () => {
    expect(dionMessageTranscript('   WELCOME TO METIS   ')).toEqual([
      'BENSON · WELCOME TO METIS'
    ]);
    expect(dionMessageTranscript('   ')).toEqual([]);
  });
});
