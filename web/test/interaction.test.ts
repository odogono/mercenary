import { describe, expect, test } from 'bun:test';

import {
  Interaction,
  type Candidate,
  type Reach
} from '../src/interaction/index.ts';
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

const interaction = new Interaction(document, {
  antigravSlot: 27,
  sinkSlot: 47
});
const origin = { x: 0, y: 0, z: 0 };
const candidate = (
  slot: number,
  position: { x: number; y: number; z: number }
): Candidate => ({
  position,
  slot
});

/// A world carrying the given slots, with the given object flags.
const world = (
  options: {
    readonly boarded?: number;
    readonly carried?: readonly number[];
    readonly flags?: Readonly<Record<number, number>>;
  } = {}
): Reach => {
  const carried = options.carried ?? [];
  return {
    boarded: options.boarded,
    carriedCount: carried.length,
    carries: slot => carried.includes(slot),
    flags: slot => options.flags?.[slot] ?? 0
  };
};

const take = (reach: Reach) =>
  interaction.attempt('take', origin, [candidate(20, origin)], reach);

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
    expect(
      interaction.attempt(
        'take',
        origin,
        [
          candidate(20, { x: 400, y: 0, z: 0 }),
          candidate(21, { x: 100, y: 0, z: 0 })
        ],
        world()
      )
    ).toEqual({ kind: 'took', slot: 21 });
  });
});

describe('taking', () => {
  test('takes a loose object', () => {
    expect(take(world())).toEqual({ kind: 'took', slot: 20 });
  });

  test('a fixed object stays where it is', () => {
    expect(take(world({ flags: { 20: interaction.fixedMask } }))).toEqual({
      kind: 'fixedInPlace',
      slot: 20
    });
  });

  test('the inventory is bounded', () => {
    const carried = Array.from({ length: 10 }, (_, index) => 100 + index);
    expect(take(world({ carried }))).toEqual({ kind: 'handsFull' });
  });

  test('the Sink bypasses fixed and heavy checks but not capacity', () => {
    const flags = { 20: interaction.fixedMask | interaction.heavyMask };
    expect(take(world({ carried: [47], flags }))).toEqual({
      kind: 'took',
      slot: 20
    });
    const full = [47, 100, 101, 102, 103, 104, 105, 106, 107, 108];
    expect(take(world({ carried: full, flags }))).toEqual({
      kind: 'handsFull'
    });
  });

  test('the Antigrav bypasses heavy but not fixed', () => {
    expect(
      take(world({ carried: [27], flags: { 20: interaction.heavyMask } }))
    ).toEqual({ kind: 'took', slot: 20 });
    expect(
      take(world({ carried: [27], flags: { 20: interaction.fixedMask } }))
    ).toEqual({ kind: 'fixedInPlace', slot: 20 });
  });
});

describe('boarding', () => {
  test('only the low slots are craft', () => {
    expect(interaction.isCraft(0)).toBeTrue();
    expect(interaction.isCraft(7)).toBeTrue();
    expect(interaction.isCraft(8)).toBeFalse();
    expect(
      interaction.attempt('board', origin, [candidate(20, origin)], world())
    ).toEqual({ kind: 'notACraft', slot: 20 });
  });

  test('boards a craft in reach', () => {
    expect(
      interaction.attempt('board', origin, [candidate(1, origin)], world())
    ).toEqual({ kind: 'boarded', slot: 1 });
  });

  test('cannot board while already aboard', () => {
    expect(
      interaction.attempt(
        'board',
        origin,
        [candidate(1, origin)],
        world({ boarded: 7 })
      )
    ).toEqual({ kind: 'alreadyAboard' });
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
