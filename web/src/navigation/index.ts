import type { Vector3 } from '../orientation/index.ts';
import type { Doorway, DoorwayRules } from '../payload/documents.ts';
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
/// The predicate that reads a Doorway lives here with the walls; the Mover still only needs
/// the walls, and the six underground navigation traces are a later gate.

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

/// Whether the player is standing in a Doorway and facing it.
///
/// This is `$9437` written out as the same byte arithmetic it does. Positions are raw
/// Reference Build units throughout: 256 to a cell, no scaling.
export class DoorwayPredicate {
  readonly rules: DoorwayRules;

  constructor(rules: DoorwayRules) {
    this.rules = rules;
  }

  /// The first Doorway in the Room's own order the player could walk through.
  /// Record order matters: the Reference Build takes the first command that matches.
  doorway(
    doorways: readonly Doorway[],
    position: Vector3,
    heading: number
  ): Doorway | undefined {
    return doorways.find(opening => this.accepts(opening, position, heading));
  }

  accepts(doorway: Doorway, position: Vector3, heading: number): boolean {
    const plane = doorway.plane === 'zy' ? 0x80 : 0x00;
    const x = Math.floor(position.x);
    const z = Math.floor(position.z);
    if (x < 0 || z < 0) {
      return false;
    }
    if ((x + plane) >> 8 !== doorway.position.x >> 8) {
      return false;
    }
    if ((z + (plane ^ 0x80)) >> 8 !== doorway.position.z >> 8) {
      return false;
    }
    if (signBit(z - this.rules.depthHalfWindow, plane) !== 1) {
      return false;
    }
    if (signBit(x - this.rules.alongWallBias, plane) !== 0) {
      return false;
    }
    return faces(plane, heading);
  }

  /// The skeleton key opens everything, and it is tested before the lock class is even read.
  opens(doorway: Doorway, carrying: (slot: number) => boolean): boolean {
    if (carrying(this.rules.skeletonKeySlot)) {
      return true;
    }
    if (doorway.lock === undefined) {
      return true;
    }
    return carrying(doorway.lock.requiresObject);
  }
}

const signBit = (value: number, plane: number): number =>
  (((value & 0xff) ^ plane) >> 7) & 1;

/// Whether the player is square-on to the wall.
///
/// The Reference Build rounds the heading to the nearest quarter turn and compares one bit of it
/// against the plane bit. That accepts facing the wall *and* facing directly away from it, which
/// sounds like a bug and is not: which way the player is pushing is already settled by their
/// having hit this wall rather than another (PQ-0007).
///
/// The rounding bias the routine adds is two whole quarter-turns, which cannot change the bit
/// being tested — it is there for a presentation value computed from the same byte further down.
/// So the decoded `headingRounding` is not consulted here, and that is deliberate rather than
/// forgotten.
const faces = (plane: number, heading: number): boolean => {
  const quarter = Math.round(heading / (Math.PI / 2)) & 3;
  return (quarter & 1) === (plane === 0 ? 0 : 1);
};
