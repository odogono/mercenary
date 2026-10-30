import { describe, expect, test } from 'bun:test';

import { BensonChannel } from '../src/benson/channel.ts';
import { playerState } from '../src/gameCore/index.ts';
import { Interaction } from '../src/interaction/index.ts';
import { IDENTITY } from '../src/orientation/index.ts';
import { endingStateOf } from '../src/session/ending.ts';
import { GameplaySession, type SessionContent } from '../src/session/index.ts';
import {
  SAVE_JSON_CODE_UNIT_LIMIT,
  SAVE_SCHEMA_VERSION,
  SaveCodecError,
  decodeSave,
  encodeSave,
  type SaveEnvelope
} from '../src/session/save.ts';
import { TextTable } from '../src/text/index.ts';
import type { ObjectPlacement } from '../src/world/index.ts';
import { emptyContent, environment } from './fixtures/save.ts';
import type { BensonInstruction } from './oracle/documents.ts';
import { BensonProgram } from './oracle/index.ts';

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

const scripts = (): BensonChannel => new BensonChannel(text);

const placedObject: ObjectPlacement = {
  detailCube: 1024,
  drawsFarAsPoint: true,
  edges: [],
  faces: [],
  id: 'parcel',
  model: 'test',
  orientation: IDENTITY,
  origin: { x: 10, y: 20, z: 30 },
  placement: 'surface',
  room: 0,
  slot: 20,
  stateFlags: 4,
  vertices: [],
  withinWorld: true
};

const objectContent = (): SessionContent => ({
  ...emptyContent(),
  dropRules: {
    carriedExemptionSlot: 56,
    carriedMask: 0x80,
    copiesCurrentRoomAndPosition: true,
    emptyInventory: 'return',
    inventorySelection: 'last-carried',
    keyCode: 0x12,
    requiresCarriedExemptionOrFlightState: true
  },
  interaction: new Interaction({
    boardKey: 0x1c,
    boardRange: 2,
    carriedMask: 0x80,
    counts: {},
    craftSlotBound: 8,
    descriptionMask: 0x0c,
    fixedMask: 0x10,
    heavyMask: 0x20,
    inventoryLimit: 10,
    rangeUnit: 256,
    removedFromWorld: 0xff,
    schemaVersion: 1,
    takeKey: 0x16,
    takeRange: 1,
    tooHeavyMessage: 2
  }),
  objects: [placedObject]
});

const envelope = (session: GameplaySession): SaveEnvelope => ({
  environment,
  location: { id: 3, kind: 'room' },
  savedAt: '2026-08-20T12:34:56.000Z',
  schemaVersion: SAVE_SCHEMA_VERSION,
  snapshot: session.captureSaveSnapshot()
});

describe('a Save Snapshot', () => {
  test('uses schema v14 and stores object authority only at the session level', () => {
    const gameplay = new GameplaySession(
      content,
      playerState({ position: { x: 0, y: 0, z: 0 } }),
      scripts()
    );
    const snapshot = gameplay.captureSaveSnapshot();

    expect(SAVE_SCHEMA_VERSION).toBe(23);
    expect(snapshot).toHaveProperty('carriedStack');
    expect(snapshot).toHaveProperty('deliverySeconds');
    expect(snapshot).toHaveProperty('objectFlags');
    // No Benson host state is saved since v23 (#924): the session owns it all.
    expect(snapshot.benson).not.toHaveProperty('host');
  });

  test('round-trips every Ending phase value the Reference Build has', () => {
    // The phase byte reads 0, 1 and 255 apart (notes/decode/endgame.md,
    // "Ending phases"); a Save that collapsed 255 into truth would restore a
    // finished terminal presentation as a fresh dispatch.
    for (const phase of [0, 1, 255]) {
      const gameplay = new GameplaySession(
        content,
        playerState({ position: { x: 0, y: 0, z: 0 } }),
        scripts()
      );
      const saved = envelope(gameplay);
      const decoded = decodeSave(
        encodeSave({
          ...saved,
          snapshot: { ...saved.snapshot, endingPhase: phase }
        }),
        environment
      );
      expect(decoded.snapshot.endingPhase).toBe(phase);
      expect(
        GameplaySession.restore(content, scripts(), decoded.snapshot).ending
      ).toEqual(endingStateOf(phase));
    }
  });

  test('carries no terminal presentation while play continues', () => {
    const gameplay = new GameplaySession(
      content,
      playerState({ position: { x: 0, y: 0, z: 0 } }),
      scripts()
    );
    const decoded = decodeSave(encodeSave(envelope(gameplay)), environment);
    expect(decoded.snapshot.ending).toBeNull();
  });

  test('refuses a Save written before schema 17', () => {
    const gameplay = new GameplaySession(
      content,
      playerState({ position: { x: 0, y: 0, z: 0 } }),
      scripts()
    );
    const stale = JSON.parse(encodeSave(envelope(gameplay))) as {
      schemaVersion: number;
    };

    // No migration: before schema 17 a Save carried the Benson interpreter's
    // continuation, which nothing now reads.
    for (const version of [10, 11, 15, 16]) {
      stale.schemaVersion = version;
      expect(() => decodeSave(JSON.stringify(stale), environment)).toThrow(
        `unsupported Save schemaVersion ${version}`
      );
    }
  });

  test('names a malformed terminal presentation at its own field', () => {
    const gameplay = new GameplaySession(
      content,
      playerState({ position: { x: 0, y: 0, z: 0 } }),
      scripts()
    );
    const written = JSON.parse(encodeSave(envelope(gameplay))) as {
      snapshot: { ending: unknown };
    };
    written.snapshot.ending = { colourDelay: 3 };

    expect(() => decodeSave(JSON.stringify(written), environment)).toThrow(
      'snapshot.ending'
    );
  });

  test('round-trips the special transition flag as the byte it is', () => {
    // $FA is $FF on the Colony Craft; a Save taken on the deck must restore
    // there rather than at an ordinary surface moment.
    const gameplay = new GameplaySession(
      content,
      playerState({ position: { x: 0, y: 0, z: 0 } }),
      scripts()
    );
    gameplay.game = { ...gameplay.game, colonyCraftFlag: 0xff };
    const decoded = decodeSave(encodeSave(envelope(gameplay)), environment);
    expect(decoded.snapshot.game.colonyCraftFlag).toBe(0xff);
  });

  test('round-trips hidden session state and continues identically', () => {
    const original = new GameplaySession(
      content,
      playerState({
        heading: -0,
        position: { x: 1000, y: 128, z: 2000 }
      }),
      scripts()
    );
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

    const v1 = JSON.parse(encodeSave(save));
    v1.schemaVersion = 1;
    expect(() => decodeSave(JSON.stringify(v1), environment)).toThrow(
      'unsupported Save schemaVersion 1'
    );
    const unidentified = JSON.parse(encodeSave(save));
    delete unidentified.environment.payload.endgameSchemaVersion;
    expect(() => decodeSave(JSON.stringify(unidentified), environment)).toThrow(
      'endgameSchemaVersion'
    );
  });

  test('strictly validates the complete census and carrying agreement before restore', () => {
    const current = new GameplaySession(
      objectContent(),
      playerState({ position: { x: 0, y: 0, z: 0 } }),
      scripts()
    );
    current.carry(20);
    const snapshot = current.captureSaveSnapshot();
    const before = current.snapshot;

    expect(() =>
      GameplaySession.restore(objectContent(), scripts(), {
        ...snapshot,
        residence: []
      })
    ).toThrow('incomplete or extra object census');
    expect(() =>
      GameplaySession.restore(objectContent(), scripts(), {
        ...snapshot,
        carriedStack: [20, 20]
      })
    ).toThrow('must be unique');
    expect(() =>
      GameplaySession.restore(objectContent(), scripts(), {
        ...snapshot,
        residence: [[20, { kind: 'surface' }]]
      })
    ).toThrow('carrying representations disagree');
    expect(() =>
      GameplaySession.restore(objectContent(), scripts(), {
        ...snapshot,
        carriedStack: [],
        objectFlags: [[20, 4]],
        residence: [[20, { id: 99, kind: 'room' }]]
      })
    ).toThrow('missing Room 99');
    expect(current.snapshot).toEqual(before);
  });

  test('bounds input before parsing and refuses impossible display progress', () => {
    const session = new GameplaySession(
      content,
      playerState({ position: { x: 0, y: 0, z: 0 } }),
      scripts()
    );
    session.scripts!.showText('SHORT');
    const save = envelope(session);
    expect(save.snapshot.benson?.activeMessageText).toBe('SHORT');
    const impossible = {
      ...save,
      snapshot: {
        ...save.snapshot,
        benson: {
          ...save.snapshot.benson!,
          display: {
            ...save.snapshot.benson!.display,
            sourceIndex: 6
          }
        }
      }
    };

    expect(() =>
      decodeSave(' '.repeat(SAVE_JSON_CODE_UNIT_LIMIT + 1), environment)
    ).toThrow('exceeds');
    expect(() => decodeSave(encodeSave(impossible), environment)).toThrow(
      'sourceIndex'
    );
    expect(() =>
      decodeSave(
        encodeSave({
          ...save,
          snapshot: {
            ...save.snapshot,
            benson: {
              ...save.snapshot.benson!,
              activeMessageText: null
            }
          }
        }),
        environment
      )
    ).toThrow('active together');
    expect(() =>
      decodeSave(
        encodeSave({
          ...save,
          snapshot: {
            ...save.snapshot,
            benson: {
              ...save.snapshot.benson!,
              display: {
                ...save.snapshot.benson!.display,
                readingHoldProgress: 1
              }
            }
          }
        }),
        environment
      )
    ).toThrow('reading-hold progress');
    const initial = scripts().captureSaveSnapshot();
    expect(() =>
      decodeSave(
        encodeSave({
          ...save,
          snapshot: {
            ...save.snapshot,
            benson: {
              ...initial,
              display: {
                ...initial.display,
                cells: ['X', ...initial.display.cells.slice(1)]
              }
            }
          }
        }),
        environment
      )
    ).toThrow('initial blank display');
    expect(() =>
      decodeSave(
        encodeSave({
          ...save,
          snapshot: {
            ...save.snapshot,
            benson: {
              ...save.snapshot.benson!,
              display: {
                ...save.snapshot.benson!.display,
                completionPhase: 'readingHold'
              }
            }
          }
        }),
        environment
      )
    ).toThrow('readingHold');
    // Benson's host state is no longer saved (#924).
    const retired = { host: {} };
    expect(() =>
      decodeSave(
        encodeSave({
          ...save,
          snapshot: {
            ...save.snapshot,
            benson: { ...save.snapshot.benson!, ...retired }
          }
        }),
        environment
      )
    ).toThrow('host');
  });
});
