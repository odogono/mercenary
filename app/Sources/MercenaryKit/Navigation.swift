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
