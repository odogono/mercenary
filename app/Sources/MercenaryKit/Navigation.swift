import Foundation

/// What a Room's walls do, and how walking into one is the first half of walking
/// through a Doorway.
///
/// Both are one routine in the Reference Build (`$939E`), and the order matters more
/// than either part: it clamps the player back inside the Room, counts how many axes
/// it had to move, and hands that count to the caller. The walking path treats a
/// count of zero as the end of the frame. Nothing looks for a Doorway on a frame
/// where the player did not touch a wall.
///
/// That is not an optimisation. It is why a Doorway needs walking *into* rather than
/// merely standing in, and it is the sort of thing a later reader would take for a
/// bug and remove, so it is stated here and asserted by name in the tests.
public struct Containment: Sendable, Equatable {
  /// How far from the near wall the player may stand, on either axis.
  public let near: Double
  /// The furthest the player may stand on each axis. The two differ because a Room's
  /// extents do, and both are one unit short of a whole cell from the far wall.
  public let farX: Double
  public let farZ: Double

  /// The bounds of one Room, as the literal byte arithmetic the Reference Build does.
  ///
  /// The near bound is a whole position compared against a low byte, and the far one
  /// is the last whole cell plus a low byte. They are written that way rather than as
  /// "32 in from each wall" because that is the shape the two immediates are in; the
  /// tests assert the tidier derived form so nobody has to take this on trust.
  public init(room: Room, rules: Payload.RoomsDocument.DoorwayRules) {
    near = Double(rules.nearMargin)
    farX = Containment.far(extent: Double(room.bounds.max.x), rules: rules)
    farZ = Containment.far(extent: Double(room.bounds.max.z), rules: rules)
  }

  private static func far(extent: Double, rules: Payload.RoomsDocument.DoorwayRules) -> Double {
    // A Room's extent is a whole number of cells, and the engine compares the
    // position's high byte against that count after incrementing it — so the last
    // cell is the last one the player may stand in, and only up to the far margin.
    let cells = Swift.max(1.0, (extent / 256).rounded(.down))
    return (cells - 1) * 256 + Double(rules.farMargin)
  }

  /// Put the player back inside the Room, and say how many axes had to move.
  ///
  /// A nonzero count is wall contact. Two means a corner, which the Reference Build
  /// counts as two and treats the same as one.
  public func clamp(_ position: inout SIMD3<Double>) -> Int {
    var contacts = 0
    contacts += clamp(&position.x, far: farX)
    contacts += clamp(&position.z, far: farZ)
    return contacts
  }

  private func clamp(_ value: inout Double, far: Double) -> Int {
    // Deliberately `>=` and not `>`: the Reference Build's own test is "in bounds if
    // the low byte is below the far margin", so a player pinned against the far wall
    // is out of bounds by that test every frame and keeps reporting contact. The near
    // wall does not behave that way, because standing exactly on the near margin
    // passes. Both are the literal readings of the two compares.
    if value < near {
      value = near
      return 1
    }
    if value >= far {
      value = far
      return 1
    }
    return 0
  }
}

/// Whether the player is standing in a Doorway and facing it.
///
/// This is `$9437` written out as the same byte arithmetic it does, on purpose. The
/// windows it accepts are describable more tidily — they come out symmetric about the
/// Doorway's own centre once the along-wall bias is accounted for — but the tidy form
/// is a *second* reading to keep in step with this one, and the sign games the
/// routine plays with the plane bit make it easy to get subtly wrong. So the literal
/// version is here and the derived one is asserted in the tests.
///
/// Positions are raw Reference Build units throughout: 256 to a cell, no scaling.
public struct DoorwayPredicate: Sendable {
  public let rules: Payload.RoomsDocument.DoorwayRules

  public init(rules: Payload.RoomsDocument.DoorwayRules) {
    self.rules = rules
  }

  /// The first Doorway in the Room's own order the player could walk through.
  ///
  /// Record order matters: the Reference Build takes the first command that matches
  /// and stops, so two Doorways that overlap resolve to the earlier one.
  public func doorway(
    in room: Room, at position: SIMD3<Double>, heading: Double
  ) -> Payload.RoomsDocument.Room.Doorway? {
    room.doorways.first { accepts($0, at: position, heading: heading) }
  }

  /// Every test `$9437` applies to one command, in its order.
  public func accepts(
    _ doorway: Payload.RoomsDocument.Room.Doorway, at position: SIMD3<Double>, heading: Double
  ) -> Bool {
    // The plane bit is the only bit of the command byte these tests read: they EOR
    // the whole byte and then look at the sign, so the low nibble cannot reach them.
    let plane = doorway.plane == "zy" ? 0x80 : 0x00
    let x = Int(position.x.rounded(.down))
    let z = Int(position.z.rounded(.down))
    guard x >= 0, z >= 0 else { return false }

    // Which cell along each axis, offset by half a cell — on X by the plane bit, on Z
    // by its complement, so a wall's own axis is the one measured from its middle.
    guard (x + plane) >> 8 == doorway.position.x >> 8 else { return false }
    guard (z + (plane ^ 0x80)) >> 8 == doorway.position.z >> 8 else { return false }
    // Then the two within-cell windows. Each subtracts an immediate from a low byte
    // and reads the sign of the result XOR the plane bit, which is how one pair of
    // compares serves both wall orientations.
    guard signBit(z - rules.depthHalfWindow, plane: plane) == 1 else { return false }
    guard signBit(x - rules.alongWallBias, plane: plane) == 0 else { return false }
    return faces(plane: plane, heading: heading)
  }

  /// The sign the Reference Build reads: one byte of arithmetic, XORed with the plane
  /// bit, and only bit seven of the answer looked at.
  private func signBit(_ value: Int, plane: Int) -> Int {
    ((value & 0xFF) ^ plane) >> 7 & 1
  }

  /// Whether the player is square-on to the wall.
  ///
  /// The Reference Build rounds the heading to the nearest quarter turn and compares
  /// one bit of it against the plane bit. That accepts facing the wall *and* facing
  /// directly away from it, which sounds like a bug and is not: which way the player
  /// is pushing is already settled by their having hit this wall rather than another.
  ///
  /// The rounding bias the routine adds is two whole quarter-turns, which cannot
  /// change the bit being tested — it is there for a presentation value computed from
  /// the same byte further down. So `headingRounding` is not consulted here, and that
  /// is deliberate rather than forgotten.
  func faces(plane: Int, heading: Double) -> Bool {
    let quarter = Int((heading / (.pi / 2)).rounded()) & 3
    return quarter & 1 == (plane == 0 ? 0 : 1)
  }

  /// Whether a Doorway's lock lets the player through, given what they are carrying.
  ///
  /// The skeleton key opens everything, and it is tested before the lock class is
  /// even read. A Doorway whose shape is below the boundary has no lock at all.
  public func opens(
    _ doorway: Payload.RoomsDocument.Room.Doorway, carrying carried: (Int) -> Bool
  ) -> Bool {
    if carried(rules.skeletonKeySlot) { return true }
    guard let lock = doorway.lock else { return true }
    return carried(lock.requiresObject)
  }
}

