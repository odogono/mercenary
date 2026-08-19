import { describe, expect, test } from 'bun:test';

import { Containment } from '../src/navigation/index.ts';

/// A Room's walls: where they are, and the fact that touching one is counted.
///
/// The count is the part worth guarding. The walking path treats a count of zero as the end of
/// the frame, so nothing looks for a Doorway on a frame where the player did not touch a wall —
/// which is why a Doorway needs walking *into* rather than merely standing in. A later reader
/// would take that for a bug and remove it, so it is asserted here by name.

/// The two immediates the walls are made of, as our own image decodes them.
const rules = { farMargin: 0xdf, nearMargin: 0x20 };

/// A Room `cellsX` by `cellsZ` cells. Only its extent reaches the walls.
const walls = (cellsX = 16, cellsZ = 8): Containment =>
  new Containment(
    {
      bounds: {
        max: { x: cellsX * 256, y: 1024, z: cellsZ * 256 },
        min: { x: 0, y: 0, z: 0 }
      }
    },
    rules
  );

describe('where a Room ends', () => {
  test('a Room is walkable from thirty-two in to thirty-three short of the far wall', () => {
    // The tidier derived form of the two immediates, which the implementation is deliberately
    // not written as: it does the byte arithmetic the Reference Build does, and this is the
    // second reading that says what that arithmetic comes to.
    const room = walls(16, 8);

    expect(room.near).toBe(32);
    expect(room.farX).toBe(16 * 256 - 33);
    expect(room.farZ).toBe(8 * 256 - 33);
  });

  test('the two axes are bounded separately because a Room is not square', () => {
    const room = walls(16, 8);
    const contained = room.clamp({ x: 3000, y: 0, z: 3000 });

    expect(contained.contacts).toBe(1);
    expect(contained.position.x).toBe(3000);
    expect(contained.position.z).toBe(8 * 256 - 33);
  });

  test('a Room of one cell still has somewhere to stand', () => {
    // The far bound is written from the last whole cell, so a Room of one cell must not produce
    // a bound below the near one and trap the player between them.
    const room = walls(1, 1);

    expect(room.farX).toBeGreaterThan(room.near);
    expect(room.farX).toBe(0xdf);
  });
});

describe('walking into a wall', () => {
  test('stops at it and reports contact', () => {
    const contained = walls().clamp({ x: -500, y: 0, z: 1000 });

    expect(contained.contacts).toBe(1);
    expect(contained.position.x).toBe(32);
  });

  test('a corner is two contacts and both axes move', () => {
    // Two is what the Reference Build counts, and it treats it the same as one.
    const contained = walls().clamp({ x: -500, y: 0, z: 999_999 });

    expect(contained.contacts).toBe(2);
    expect(contained.position.x).toBe(32);
    expect(contained.position.z).toBe(8 * 256 - 33);
  });

  test('standing well inside touches nothing', () => {
    const contained = walls().clamp({ x: 1000, y: 0, z: 1000 });

    expect(contained.contacts).toBe(0);
    expect(contained.position).toEqual({ x: 1000, y: 0, z: 1000 });
  });

  test('the near wall can be stood on and the far wall cannot', () => {
    // Not a symmetry to tidy up. The near test passes at exactly the margin and the far test
    // does not, so a player pinned against the far wall reports contact every frame while one
    // against the near wall reports it only on the frame they pushed. Both readings are literal.
    const room = walls();
    const onTheNearWall = room.clamp({ x: room.near, y: 0, z: 1000 });
    const onTheFarWall = room.clamp({ x: room.farX, y: 0, z: 1000 });

    expect(onTheNearWall.contacts).toBe(0);
    expect(onTheFarWall.contacts).toBe(1);
    expect(onTheFarWall.position.x).toBe(room.farX);
  });

  test('a Room has walls and no floor, so the altitude is left where it was', () => {
    const contained = walls().clamp({ x: -500, y: 128, z: 999_999 });

    expect(contained.position.y).toBe(128);
  });
});
