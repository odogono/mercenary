import { describe, expect, test } from 'bun:test';

import { BensonHostState } from '../src/benson/host.ts';
import { Interaction, type Candidate } from '../src/interaction/index.ts';
import type { InteractionDocument } from '../src/payload/documents.ts';

const document: InteractionDocument = {
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

const interaction = new Interaction(document);
const origin = { x: 0, y: 0, z: 0 };
const candidate = (
  slot: number,
  position: { x: number; y: number; z: number }
): Candidate => ({
  position,
  slot
});

describe('reach', () => {
  test('is a cube rather than a radius', () => {
    expect(
      interaction.isWithinReach(
        candidate(20, { x: 400, y: 400, z: 400 }),
        origin,
        2
      )
    ).toBeTrue();
  });

  test('board reaches further than take', () => {
    const object = candidate(20, { x: 600, y: 0, z: 0 });
    expect(
      interaction.isWithinReach(object, origin, interaction.takeRange)
    ).toBeFalse();
    expect(
      interaction.isWithinReach(object, origin, interaction.boardRange)
    ).toBeTrue();
  });

  test('the nearest candidate wins', () => {
    const { outcome } = interaction.attempt(
      'take',
      origin,
      [
        candidate(20, { x: 400, y: 0, z: 0 }),
        candidate(21, { x: 100, y: 0, z: 0 })
      ],
      new BensonHostState()
    );
    expect(outcome).toEqual({ kind: 'took', slot: 21 });
  });
});

describe('taking', () => {
  test('carries the object out of the world', () => {
    const { host, outcome } = interaction.attempt(
      'take',
      origin,
      [candidate(20, origin)],
      new BensonHostState()
    );
    expect(outcome).toEqual({ kind: 'took', slot: 20 });
    expect(host.inventory.has(20)).toBeTrue();
    expect((host.objectFlags.get(20) ?? 0) & interaction.carriedMask).toBe(
      interaction.carriedMask
    );
    expect(host.objectRooms.get(20)).toBe(BensonHostState.outOfTheWorld);
  });

  test('a fixed object stays where it is', () => {
    const { host, outcome } = interaction.attempt(
      'take',
      origin,
      [candidate(20, origin)],
      new BensonHostState().withObjectFlag(20, interaction.fixedMask)
    );
    expect(outcome).toEqual({ kind: 'fixedInPlace', slot: 20 });
    expect(host.inventory.size).toBe(0);
  });

  test('the inventory is bounded', () => {
    const inventory = new Set<number>();
    for (let slot = 100; slot < 110; slot++) {
      inventory.add(slot);
    }
    const { host, outcome } = interaction.attempt(
      'take',
      origin,
      [candidate(20, origin)],
      new BensonHostState({ inventory })
    );
    expect(outcome).toEqual({ kind: 'handsFull' });
    expect(host.inventory.has(20)).toBeFalse();
  });
});

describe('boarding', () => {
  test('only the low slots are craft', () => {
    expect(interaction.isCraft(0)).toBeTrue();
    expect(interaction.isCraft(7)).toBeTrue();
    expect(interaction.isCraft(8)).toBeFalse();
    const { host, outcome } = interaction.attempt(
      'board',
      origin,
      [candidate(20, origin)],
      new BensonHostState()
    );
    expect(outcome).toEqual({ kind: 'notACraft', slot: 20 });
    expect(host.boardedCraft).toBe(BensonHostState.onFoot);
  });

  test('leaving puts the craft back on the surface', () => {
    const boarded = interaction.attempt(
      'board',
      origin,
      [candidate(1, origin)],
      new BensonHostState()
    );
    expect(boarded.outcome).toEqual({ kind: 'boarded', slot: 1 });
    const left = interaction.leave(boarded.host);
    expect(left.slot).toBe(1);
    expect(left.host.boardedCraft).toBe(BensonHostState.onFoot);
    expect(left.host.objectRooms.get(1)).toBe(0);
  });
});

describe('what an object says', () => {
  test('the description bits choose between a script and a message', () => {
    expect(interaction.description(1, 0x04)).toEqual({ id: 1, kind: 'script' });
    expect(interaction.description(25, 0x08)).toEqual({
      index: 25,
      kind: 'message'
    });
    expect(interaction.description(30, 0)).toEqual({ kind: 'none' });
  });
});
