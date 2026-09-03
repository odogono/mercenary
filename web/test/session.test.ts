import { describe, expect, test } from 'bun:test';

import { BensonProgram, BensonSession } from '../src/benson/index.ts';
import { playerState } from '../src/gameCore/index.ts';
import type { BensonInstruction } from '../src/payload/documents.ts';
import { GameplaySession, type SessionContent } from '../src/session/index.ts';
import { TextTable } from '../src/text/index.ts';
import { foldStates, type TraceObject } from '../src/trace/index.ts';
import { sessionGate } from './replay/sessionGate.ts';

const IDS = ['opening', 'opening-loop', 'opening-walk-to-craft'] as const;

await sessionGate({
  coverage: traces => {
    const walk = traces.get('opening-walk-to-craft')!;
    expect(
      walk.records.some(record => {
        const note = record['note'];
        return (
          typeof note === 'object' &&
          note !== null &&
          !Array.isArray(note) &&
          'reached' in note
        );
      })
    ).toBeTrue();

    const loop = traces.get('opening-loop')!;
    const states = foldStates(loop) as TraceObject[];
    const final = states.at(-1)!;
    expect(final['credits']).toBe(4000);
    expect(final['location']).toEqual({ room: 1 });
    expect(final['occupancy']).toBe('onFoot');
    expect(final['mode']).toBe('grounded');
    expect(final['indoor']).toEqual({
      background: 2,
      dark: false,
      foreground: 10,
      lineColour: 1
    });
    expect(
      states.some(
        state =>
          state['mode'] === 'flying' &&
          Object.is((state['occupancy'] as TraceObject)?.['craft'], 1)
      )
    ).toBeTrue();
    expect(
      loop.records.some(record =>
        (record['events'] as unknown[] | undefined)?.some(
          event =>
            typeof event === 'object' &&
            event !== null &&
            'touchdown' in event &&
            event.touchdown === 'landed'
        )
      )
    ).toBeTrue();
    const dart = (final['residence'] as TraceObject)['1'] as TraceObject;
    const parked = dart['surface'] as TraceObject;
    expect(Math.trunc((parked['x'] as number) / 65_536)).toBe(9);
    expect(Math.trunc((parked['z'] as number) / 65_536)).toBe(6);
  },
  ids: IDS,
  recordCounts: [7202, 6296, 7201],
  title: 'the session Replay Gate'
});

const raw = (
  op: string,
  fields: Partial<BensonInstruction> = {}
): BensonInstruction => ({
  op,
  ...fields
});

const scripts = (): BensonSession => {
  const program = BensonProgram.fromDocument({
    counts: {},
    decimalSeeds: { '8': 9000 },
    framesPerTick: 50,
    instructions: [raw('ret')],
    schemaVersion: 1,
    scripts: [{ entry: 0, id: 0 }]
  });
  const text = new TextTable({
    counts: {},
    messages: [],
    schemaVersion: 1,
    unresolvedCodes: [],
    words: []
  });
  return new BensonSession(program, text);
};

const content = (): SessionContent => ({
  cellSize: 65_536,
  doorwayRules: undefined,
  flight: undefined,
  interaction: undefined,
  objects: [],
  rooms: new Map(),
  underground: undefined
});

describe('the Host Callout is a projection', () => {
  test('the host sees the room a teleport took the player to', () => {
    const session = new GameplaySession(
      content(),
      playerState({ position: { x: 1000, y: 0, z: 1000 } }),
      scripts()
    );
    expect(session.scripts?.host.currentRoom).toBe(0);
    session.teleport({ id: 3, kind: 'room' });
    expect(session.location).toEqual({ id: 3, kind: 'room' });
    expect(session.scripts?.host.currentRoom).toBe(3);
    session.advance(1 / 60);
    expect(session.scripts?.host.currentRoom).toBe(3);
  });

  test('boarding by fiat updates occupancy and the host together', () => {
    const session = new GameplaySession(
      content(),
      playerState({ position: { x: 1000, y: 0, z: 1000 } }),
      scripts()
    );
    session.board(1);
    expect(session.occupancy).toEqual({ kind: 'aboard', slot: 1 });
    expect(session.scripts?.host.boardedCraft).toBe(1);
  });
});
