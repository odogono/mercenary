import { describe, expect, test } from 'bun:test';

import { BensonProgram, BensonSession } from '../src/benson/index.ts';
import { playerState } from '../src/gameCore/index.ts';
import { Interaction } from '../src/interaction/index.ts';
import { IDENTITY } from '../src/orientation/index.ts';
import type {
  BensonInstruction,
  EndgameDropRules,
  InteractionDocument
} from '../src/payload/documents.ts';
import { GameplaySession, type SessionContent } from '../src/session/index.ts';
import {
  SEMANTIC_OBSERVATION_SCHEMA_VERSION,
  type ObservationValue
} from '../src/session/observations.ts';
import { TextTable } from '../src/text/index.ts';
import type { ObjectPlacement } from '../src/world/index.ts';

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
    object(20, 'surface', 0),
    object(21, 'room', 3),
    object(22, 'room', 0xff)
  ],
  rooms: new Map([[3, { id: 3 } as never]]),
  underground: undefined
});

const raw = (
  op: string,
  fields: Partial<BensonInstruction> = {}
): BensonInstruction => ({ op, ...fields });

const scripts = (
  instructions: readonly BensonInstruction[],
  decimalSeeds: Record<string, number> = {}
): BensonSession =>
  new BensonSession(
    BensonProgram.fromDocument({
      counts: {},
      decimalSeeds,
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
    playerState({ position: { x: 0, y: 0, z: 0 } })
  );

describe('the semantic observations a Gameplay Session answers with', () => {
  test('carries the schema version the lab decodes against', () => {
    expect(session().observations().schemaVersion).toBe(
      SEMANTIC_OBSERVATION_SCHEMA_VERSION
    );
    expect(SEMANTIC_OBSERVATION_SCHEMA_VERSION).toBe(1);
  });

  test('answers only values the lab can hold', () => {
    const { observations } = session().observations();
    for (const [id, value] of Object.entries(observations)) {
      expect(
        typeof value === 'boolean' ||
          typeof value === 'number' ||
          typeof value === 'string'
      ).toBeTrue();
      expect(id.length).toBeGreaterThan(0);
    }
  });

  test('describes an opening session', () => {
    const { observations } = session().observations();
    expect(observations['room']).toBe(0);
    expect(observations['occupancy']).toBe(0x80);
    expect(observations['credits']).toBe(0);
    expect(observations['engineFlags']).toBe(0);
    expect(observations['shipInbound']).toBe(0);
    expect(observations['attackingShip']).toBeFalse();
    expect(observations['gameComplete']).toBeFalse();
    expect(observations['carriedStack']).toBe('');
    expect(observations['scriptPc']).toBe(-1);
    expect(observations['scriptStack']).toBe('');
    expect(observations['messagePlaying']).toBeFalse();
  });

  test('names every payload slot once, in ascending order', () => {
    const { observations } = session().observations();
    const slots = Object.keys(observations)
      .filter(id => id.startsWith('objectRoom.'))
      .map(id => Number(id.slice('objectRoom.'.length)));
    expect(slots).toEqual([20, 21, 22]);
    for (const slot of slots) {
      expect(observations[`objectFlags.${slot}`]).toBeDefined();
    }
    // Room membership uses the Host Callout's encoding, not the Residence kind.
    expect(observations['objectRoom.20']).toBe(0);
    expect(observations['objectRoom.21']).toBe(3);
    expect(observations['objectRoom.22']).toBe(0xff);
  });

  test('reports carried objects in the order they were picked up', () => {
    const gameplay = session();
    gameplay.carry(21);
    gameplay.carry(20);
    const { observations } = gameplay.observations();
    expect(observations['carriedStack']).toBe('21,20');
    expect(observations['objectRoom.21']).toBe(0xff);
  });

  test('reads the balance and flags the scripts own', () => {
    const gameplay = session();
    gameplay.scripts = scripts([raw('ret')], { '8': 9000 });
    expect(gameplay.observations().observations['credits']).toBe(9000);
  });

  test('reports the script program counter and call stack while running', () => {
    const gameplay = session();
    gameplay.scripts = scripts([
      raw('call', { target: 2 }),
      raw('ret'),
      raw('wfr', {
        branchOn: false,
        onTaken: { kind: 'jmp', target: 2 },
        ticks: 60
      }),
      raw('ret')
    ]);
    gameplay.start(0);
    gameplay.advance(0.1);
    const { observations } = gameplay.observations();
    expect(observations['scriptPc']).toBe(2);
    expect(observations['scriptStack']).toBe('1');
  });

  test('is deterministic and leaves the session alone', () => {
    const gameplay = session();
    gameplay.carry(21);
    const before = gameplay.snapshot;
    const first = gameplay.observations();
    const second = gameplay.observations();
    expect(second).toEqual(first);
    expect(gameplay.snapshot).toEqual(before);
  });

  test('does not leak into the Session Snapshot', () => {
    const keys = Object.keys(session().snapshot);
    for (const leaked of [
      'attackingShip',
      'engineFlags',
      'gameComplete',
      'observations',
      'shipInbound'
    ]) {
      expect(keys).not.toContain(leaked);
    }
  });
});

// Type-level: the map's value domain is the lab's, no wider.
const _domain: ObservationValue[] = [true, 1, 'a'];
void _domain;
