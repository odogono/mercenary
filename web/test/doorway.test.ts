import { describe, expect, test } from 'bun:test';

import { DoorwayPredicate } from '../src/navigation/index.ts';
import type { Doorway, DoorwayRules } from '../src/payload/documents.ts';

const rules: DoorwayRules = {
  alongWallBias: 0x28,
  colonyCraftArrival: { x: 0x08_67_c0, y: 0x40_f8_80, z: 0x08_70_00 },
  colonyCraftSlot: 0x3f,
  cooldownFrames: 0x0a,
  darkMessage: 1,
  depthHalfWindow: 0x40,
  farMargin: 0xdf,
  headingRounding: 2,
  keySlotBias: 8,
  lineColour: 1,
  lockBoundary: 8,
  lockedMessage: 0,
  nearMargin: 0x20,
  photonEmitterSlot: 0x10,
  randomRoom: 0x72,
  skeletonKeySlot: 0x30,
  stepInterlock: 2,
  transitionColours: [],
  wallThudSound: 0x14,
  worldFlipCooldownFrames: 0x1f,
  worldFlipInputRemap: [],
  worldFlipRoom: 0x7f
};

const doorway = (fields: Partial<Doorway> = {}): Doorway => ({
  arrival: { x: 512, z: 1664 },
  arrivalCommandIndex: 0,
  arrivalWithinDestination: true,
  destination: { room: 48 },
  index: 0,
  plane: 'zy',
  position: { x: 4096, z: 1536 },
  shape: 2,
  ...fields
});

const predicate = new DoorwayPredicate(rules);
const facingTheWall = Math.PI / 2;
const opening = doorway();

const accepts = (x: number, z: number, heading = facingTheWall): boolean =>
  predicate.accepts(opening, { x, y: 128, z }, heading);

describe('DoorwayPredicate', () => {
  test('accepts the player at the Doorway itself', () => {
    expect(accepts(4063, 1664)).toBeTrue();
  });

  test('the window along the wall is where the Doorway is and not beside', () => {
    expect(accepts(4063, 1599)).toBeFalse();
    expect(accepts(4063, 1600)).toBeTrue();
    expect(accepts(4063, 1727)).toBeTrue();
    expect(accepts(4063, 1728)).toBeFalse();
  });

  test('only a heading square-on to the wall opens it', () => {
    expect(accepts(4063, 1664, Math.PI / 2)).toBeTrue();
    expect(accepts(4063, 1664, (3 * Math.PI) / 2)).toBeTrue();
    expect(accepts(4063, 1664, 0)).toBeFalse();
    expect(accepts(4063, 1664, Math.PI)).toBeFalse();
  });

  test('the first Doorway in record order wins', () => {
    const first = doorway({ destination: { room: 48 }, index: 0 });
    const second = doorway({ destination: { room: 99 }, index: 1 });
    const chosen = predicate.doorway(
      [first, second],
      { x: 4063, y: 128, z: 1664 },
      facingTheWall
    );
    expect(chosen?.destination).toEqual({ room: 48 });
  });

  test('the skeleton key opens a locked Doorway', () => {
    const locked = doorway({
      lock: { class: 1, requiresObject: 20 }
    });
    expect(predicate.opens(locked, () => false)).toBeFalse();
    expect(predicate.opens(locked, slot => slot === 20)).toBeTrue();
    expect(predicate.opens(locked, slot => slot === rules.skeletonKeySlot)).toBeTrue();
  });
});
