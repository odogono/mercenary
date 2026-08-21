import { describe, expect, test } from 'bun:test';

import { BensonProgram, BensonSession } from '../src/benson/index.ts';
import { playerState } from '../src/gameCore/index.ts';
import type { BensonInstruction } from '../src/payload/documents.ts';
import { GameplaySession } from '../src/session/index.ts';
import {
  SAVE_JSON_CODE_UNIT_LIMIT,
  SAVE_SCHEMA_VERSION,
  SaveCodecError,
  decodeSave,
  encodeSave,
  type SaveEnvelope
} from '../src/session/save.ts';
import { TextTable } from '../src/text/index.ts';
import { emptyContent, environment } from './fixtures/save.ts';

const content = emptyContent();

const raw = (
  op: string,
  fields: Partial<BensonInstruction> = {}
): BensonInstruction => ({ op, ...fields });

const program = BensonProgram.fromDocument({
  counts: {},
  decimalSeeds: { '8': 4000 },
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

const scripts = (): BensonSession => new BensonSession(program, text);

const envelope = (session: GameplaySession): SaveEnvelope => ({
  environment,
  location: { id: 3, kind: 'room' },
  savedAt: '2026-08-20T12:34:56.000Z',
  schemaVersion: SAVE_SCHEMA_VERSION,
  snapshot: session.captureSaveSnapshot()
});

describe('a Save Snapshot', () => {
  test('round-trips hidden session state and continues identically', () => {
    const original = new GameplaySession(
      content,
      playerState({
        heading: -0,
        position: { x: 1000, y: 128, z: 2000 }
      }),
      scripts()
    );
    original.scripts!.start(0);
    original.scripts!.showText('A MESSAGE IN PROGRESS');
    original.advance(0.375);

    const encoded = encodeSave(envelope(original));
    const decoded = decodeSave(encoded, environment);
    const restored = GameplaySession.restore(
      content,
      scripts(),
      decoded.snapshot
    );

    expect(Object.is(restored.snapshot.player.heading, -0)).toBeTrue();
    expect(restored.snapshot).toEqual(original.snapshot);
    expect(restored.captureSaveSnapshot()).toEqual(
      original.captureSaveSnapshot()
    );

    const originalNext = original.advance(0.5);
    const restoredNext = restored.advance(0.5);
    expect(restoredNext).toEqual(originalNext);
    expect(restored.captureSaveSnapshot()).toEqual(
      original.captureSaveSnapshot()
    );
  });

  test('is deterministic and rejects unknown, stale, or mismatched data', () => {
    const session = new GameplaySession(
      content,
      playerState({ position: { x: 0, y: 0, z: 0 } }),
      scripts()
    );
    const save = envelope(session);

    expect(encodeSave(save)).toBe(encodeSave(save));
    expect(() => decodeSave('{', environment)).toThrow(SaveCodecError);
    expect(() =>
      decodeSave(
        JSON.stringify({ ...save, schemaVersion: SAVE_SCHEMA_VERSION + 1 }),
        environment
      )
    ).toThrow('unsupported Save schemaVersion');
    expect(() =>
      decodeSave(JSON.stringify({ ...save, surprise: true }), environment)
    ).toThrow('unexpected field');
    expect(() =>
      decodeSave(encodeSave(save), {
        ...environment,
        payload: { ...environment.payload, sourceCoreDigest: 'different' }
      })
    ).toThrow('does not match the current environment');
  });

  test('bounds input before parsing and refuses impossible ticker progress', () => {
    const session = new GameplaySession(
      content,
      playerState({ position: { x: 0, y: 0, z: 0 } }),
      scripts()
    );
    session.scripts!.showText('SHORT');
    const save = envelope(session);
    const impossible = {
      ...save,
      snapshot: {
        ...save.snapshot,
        benson: {
          ...save.snapshot.benson!,
          ticker: {
            ...save.snapshot.benson!.ticker!,
            revealed: 6
          }
        }
      }
    };

    expect(() =>
      decodeSave(' '.repeat(SAVE_JSON_CODE_UNIT_LIMIT + 1), environment)
    ).toThrow('exceeds');
    expect(() => decodeSave(encodeSave(impossible), environment)).toThrow(
      'revealed'
    );
    expect(() =>
      decodeSave(
        encodeSave({
          ...save,
          snapshot: {
            ...save.snapshot,
            benson: {
              ...save.snapshot.benson!,
              host: { ...save.snapshot.benson!.host, engineFlags: 256 }
            }
          }
        }),
        environment
      )
    ).toThrow('engineFlags');
    expect(() =>
      decodeSave(
        encodeSave({
          ...save,
          snapshot: {
            ...save.snapshot,
            benson: {
              ...save.snapshot.benson!,
              state: { ...save.snapshot.benson!.state, callStack: [-1] }
            }
          }
        }),
        environment
      )
    ).toThrow('callStack');
  });
});
