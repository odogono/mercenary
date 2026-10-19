import { describe, expect, test } from 'bun:test';

import { playerState } from '../src/gameCore/index.ts';
import { Interaction } from '../src/interaction/index.ts';
import { IDENTITY } from '../src/orientation/index.ts';
import type {
  EndgameDropRules,
  InteractionDocument
} from '../src/payload/documents.ts';
import { GameplaySession, type SessionContent } from '../src/session/index.ts';
import { TextTable } from '../src/text/index.ts';
import type { ObjectPlacement } from '../src/world/index.ts';
import type { BensonInstruction } from './oracle/documents.ts';
import { BensonProgram, BensonSession } from './oracle/index.ts';

const interactionDocument: InteractionDocument = {
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
};

const dropRules: EndgameDropRules = {
  carriedExemptionSlot: 56,
  carriedMask: 0x80,
  copiesCurrentRoomAndPosition: true,
  emptyInventory: 'return',
  inventorySelection: 'last-carried',
  keyCode: 0x12,
  requiresCarriedExemptionOrFlightState: true
};

const object = (
  slot: number,
  placement: 'room' | 'surface',
  room: number,
  stateFlags = 0
): ObjectPlacement => ({
  detailCube: 1024,
  drawsFarAsPoint: true,
  edges: [],
  id: `object-${slot}`,
  model: 'test',
  orientation: IDENTITY,
  origin: { x: slot * 10, y: 64, z: slot * 20 },
  placement,
  room,
  slot,
  stateFlags,
  vertices: [],
  withinWorld: true
});

const content = (): SessionContent => ({
  cellSize: 65_536,
  doorwayRules: undefined,
  dropRules,
  flight: undefined,
  interaction: new Interaction(interactionDocument),
  objects: [
    object(20, 'surface', 0, 0x04),
    object(21, 'room', 3, 0x08),
    object(22, 'room', 0xff, 0x10),
    object(56, 'surface', 0)
  ],
  rooms: new Map([[3, { id: 3 } as never]]),
  underground: undefined
});

const raw = (
  op: string,
  fields: Partial<BensonInstruction> = {}
): BensonInstruction => ({ op, ...fields });

const scripts = (instructions: readonly BensonInstruction[]): BensonSession =>
  new BensonSession(
    BensonProgram.fromDocument({
      counts: {},
      decimalSeeds: {},
      framesPerTick: 1,
      instructions,
      schemaVersion: 1,
      scripts: [{ entry: 0, id: 0 }]
    }),
    new TextTable({
      counts: {},
      messages: [],
      schemaVersion: 1,
      unresolvedCodes: [],
      words: []
    })
  );

const session = (): GameplaySession =>
  new GameplaySession(
    content(),
    playerState({ position: { x: 1000, y: 0x12_ff, z: 3000 } })
  );

describe('complete mutable object state', () => {
  test('starts with a complete payload-slot census', () => {
    const snapshot = session().snapshot;
    expect([...snapshot.objectFlags]).toEqual([
      [20, 0x04],
      [21, 0x08],
      [22, 0x10],
      [56, 0]
    ]);
    expect([...snapshot.residence]).toEqual([
      [20, { kind: 'surface' }],
      [21, { id: 3, kind: 'room' }],
      [22, { kind: 'gone' }],
      [56, { kind: 'surface' }]
    ]);
    expect(snapshot.carriedStack).toEqual([]);
  });

  test('carry appends only once and keeps all three representations aligned', () => {
    const gameplay = session();
    gameplay.carry(21);
    gameplay.carry(20);
    gameplay.carry(21);

    expect(gameplay.snapshot.carriedStack).toEqual([21, 20]);
    expect(gameplay.snapshot.residence.get(21)).toEqual({ kind: 'carried' });
    expect(gameplay.snapshot.objectFlags.get(21)! & 0x80).toBe(0x80);
  });

  test('retains valid Benson flag and Residence writes across crossings', () => {
    const benson = scripts([
      raw('stor', { slot: 20, symbol: 'objectFlags', value: 0x14 }),
      raw('stor', { slot: 20, symbol: 'objectRoom', value: 3 }),
      raw('ret')
    ]);
    const gameplay = new GameplaySession(
      content(),
      playerState({ position: { x: 0, y: 0, z: 0 } }),
      benson
    );
    gameplay.start(0);

    gameplay.advance(1 / 60);
    expect(gameplay.snapshot.objectFlags.get(20)).toBe(0x14);
    expect(gameplay.snapshot.residence.get(20)).toEqual({
      id: 3,
      kind: 'room'
    });
    gameplay.advance(1 / 60);
    expect(gameplay.snapshot.objectFlags.get(20)).toBe(0x14);
    expect(gameplay.snapshot.residence.get(20)).toEqual({
      id: 3,
      kind: 'room'
    });
  });

  test('rejects a Benson carrying disagreement transactionally', () => {
    const benson = scripts([
      raw('stor', { slot: 20, symbol: 'objectFlags', value: 0x84 }),
      raw('ret')
    ]);
    const gameplay = new GameplaySession(
      content(),
      playerState({ position: { x: 0, y: 0, z: 0 } }),
      benson
    );
    gameplay.start(0);
    const before = gameplay.captureSaveSnapshot();

    expect(() => gameplay.advance(1 / 60)).toThrow(
      'carrying representations disagree'
    );
    expect(gameplay.captureSaveSnapshot()).toEqual(before);
  });
});

describe('Drop', () => {
  test('removes a selected carried object without disturbing acquisition order', () => {
    const gameplay = session();
    gameplay.carry(21);
    gameplay.carry(20);

    expect(gameplay.drop(21)).toEqual({
      events: ['tone'],
      outcome: { kind: 'dropped', slot: 21 }
    });
    expect(gameplay.snapshot.carriedStack).toEqual([20]);
    expect(gameplay.snapshot.residence.get(21)).toEqual({
      at: { x: 1000, y: 0x12_00, z: 3000 },
      kind: 'surface'
    });
  });

  test('removes the tail and places it at full current coordinates', () => {
    const gameplay = session();
    gameplay.carry(21);
    gameplay.carry(20);

    expect(gameplay.drop()).toEqual({
      events: ['tone'],
      outcome: { kind: 'dropped', slot: 20 }
    });
    expect(gameplay.snapshot.carriedStack).toEqual([21]);
    expect(gameplay.snapshot.objectFlags.get(20)! & 0x80).toBe(0);
    expect(gameplay.snapshot.residence.get(20)).toEqual({
      at: { x: 1000, y: 0x12_00, z: 3000 },
      kind: 'surface'
    });
  });

  test('does nothing when the Carried Stack is empty', () => {
    const gameplay = session();
    const before = gameplay.snapshot;

    expect(gameplay.drop()).toEqual({
      events: [],
      outcome: { kind: 'emptyInventory' }
    });
    expect(gameplay.snapshot.objectFlags).toEqual(before.objectFlags);
    expect(gameplay.snapshot.residence).toEqual(before.residence);
  });

  test('places a dropped object inside the current Room', () => {
    const gameplay = session();
    gameplay.teleport({ id: 3, kind: 'room' });
    gameplay.carry(20);

    expect(gameplay.drop().outcome).toEqual({ kind: 'dropped', slot: 20 });
    expect(gameplay.snapshot.residence.get(20)).toEqual({
      at: { x: 1000, y: 0x12_00, z: 3000 },
      id: 3,
      kind: 'room'
    });
  });

  test('makes a dropped object visible and reachable at its displaced position', () => {
    const gameplay = new GameplaySession(
      content(),
      playerState({ position: { x: 9000, y: 64, z: 8000 } }),
      scripts([raw('ret')])
    );
    gameplay.carry(20);
    gameplay.drop();

    expect(gameplay.reach('take', 20).outcome).toEqual({
      kind: 'took',
      slot: 20
    });
    expect(gameplay.snapshot.carriedStack).toEqual([20]);
  });

  test('refuses an airborne Drop without mutation unless Pyramid is carried', () => {
    const gameplay = session();
    gameplay.carry(20);
    gameplay.game = { ...gameplay.game, mode: 'flying' };
    const before = gameplay.snapshot;

    expect(gameplay.drop()).toEqual({
      events: [],
      outcome: { kind: 'airborneRefused' }
    });
    expect(gameplay.snapshot.carriedStack).toEqual(before.carriedStack);
    expect(gameplay.snapshot.residence).toEqual(before.residence);

    gameplay.carry(56);
    expect(gameplay.drop().outcome).toEqual({ kind: 'dropped', slot: 56 });
  });
});
