import type { Vector3 } from '../orientation/index.ts';
import type { DoorwayRules } from '../payload/documents.ts';
import type { Room } from '../world/index.ts';

/// What a Room's walls do, and how walking into one is the first half of walking through a
/// Doorway.
///
/// Both are one routine in the Reference Build (`$939E`), and the order matters more than either
/// part: it clamps the player back inside the Room, counts how many axes it had to move, and
/// hands that count to the caller. The walking path treats a count of zero as the end of the
/// frame. Nothing looks for a Doorway on a frame where the player did not touch a wall.
///
/// That is not an optimisation. It is why a Doorway needs walking *into* rather than merely
/// standing in, and it is the sort of thing a later reader would take for a bug and remove, so it
/// is stated here and asserted by name in the tests.
///
/// The predicate that reads a Doorway, and the traversal that takes one, belong to the session
/// gate rather than this one: the Mover needs the walls and nothing else (#94).

/// The bounds of one Room, as the literal byte arithmetic the Reference Build does.
///
/// The near bound is a whole position compared against a low byte, and the far one is the last
/// whole cell plus a low byte. They are written that way rather than as "32 in from each wall"
/// because that is the shape the two immediates are in; the tests assert the tidier derived form
/// so nobody has to take this on trust.
export class Containment {
  /// How far from the near wall the player may stand, on either axis.
  readonly near: number;
  /// The furthest the player may stand on each axis. The two differ because a Room's extents do,
  /// and both are one unit short of a whole cell from the far wall.
  readonly farX: number;
  readonly farZ: number;

  /// A Room's extent and the two immediates are all the walls are made of, so those are all this
  /// asks for: the whole `Room` and the whole rules record satisfy it, and a test does not have
  /// to build either to say where a wall is.
  constructor(
    room: Pick<Room, 'bounds'>,
    rules: Pick<DoorwayRules, 'farMargin' | 'nearMargin'>
  ) {
    this.near = rules.nearMargin;
    this.farX = far(room.bounds.max.x, rules.farMargin);
    this.farZ = far(room.bounds.max.z, rules.farMargin);
  }

  /// Put the player back inside the Room, and say how many axes had to move.
  ///
  /// A nonzero count is wall contact. Two means a corner, which the Reference Build counts as two
  /// and treats the same as one. The altitude is untouched: a Room has walls and no floor.
  clamp(position: Vector3): {
    readonly contacts: number;
    readonly position: Vector3;
  } {
    const x = axis(position.x, this.near, this.farX);
    const z = axis(position.z, this.near, this.farZ);
    return {
      contacts: x.contact + z.contact,
      position: { x: x.value, y: position.y, z: z.value }
    };
  }
}

const far = (extent: number, farMargin: number): number => {
  // A Room's extent is a whole number of cells, and the engine compares the position's high byte
  // against that count after incrementing it — so the last cell is the last one the player may
  // stand in, and only up to the far margin.
  const cells = Math.max(1, Math.floor(extent / 256));
  return (cells - 1) * 256 + farMargin;
};

const axis = (
  value: number,
  near: number,
  farBound: number
): { readonly contact: number; readonly value: number } => {
  // Deliberately `>=` and not `>`: the Reference Build's own test is "in bounds if the low byte is
  // below the far margin", so a player pinned against the far wall is out of bounds by that test
  // every frame and keeps reporting contact. The near wall does not behave that way, because
  // standing exactly on the near margin passes. Both are the literal readings of the two compares.
  if (value < near) {
    return { contact: 1, value: near };
  }
  if (value >= farBound) {
    return { contact: 1, value: farBound };
  }
  return { contact: 0, value };
};
