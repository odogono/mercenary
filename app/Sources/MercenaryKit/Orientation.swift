import Foundation

/// Model-local orientation for the Reference Build's rotatable object slots.
///
/// Slots below `$10` carry three orientation bytes, and the original applies three
/// plane rotations in sequence — about Z, then X, then Y — to the model's local
/// vertices *before* they are placed in the world. Slots at or above `$10` are
/// emitted without model-local rotation.
///
/// Only one slot carries a non-zero orientation in the initial world state, so this
/// changes little on a fresh load; it matters for correctness once the simulation
/// starts moving craft around.
public struct Orientation: Sendable, Equatable {
  /// Rotation about the Z axis, in bytes where 256 is a full turn.
  public var z: Int
  public var x: Int
  public var y: Int

  public static let identity = Orientation(z: 0, x: 0, y: 0)

  public var isIdentity: Bool { z % 256 == 0 && x % 256 == 0 && y % 256 == 0 }

  public init(z: Int, x: Int, y: Int) {
    self.z = z
    self.x = x
    self.y = y
  }

  /// Build from the payload's three orientation bytes, in the order the dataset
  /// records them: `$800A`, `$801A`, `$802A` — rotations about Z, X and Y.
  public init?(bytes: [Int]?) {
    guard let bytes, bytes.count == 3 else { return nil }
    self.init(z: bytes[0], x: bytes[1], y: bytes[2])
  }

  private static func radians(_ byte: Int) -> Double {
    Double(byte & 0xFF) / 256 * 2 * .pi
  }

  /// Apply the three plane rotations in the original's order.
  public func apply(to vertex: SIMD3<Float>) -> SIMD3<Float> {
    var point = SIMD3<Double>(Double(vertex.x), Double(vertex.y), Double(vertex.z))
    point = Orientation.rotate(point, angle: Orientation.radians(z), first: 0, second: 1)
    point = Orientation.rotate(point, angle: Orientation.radians(x), first: 1, second: 2)
    point = Orientation.rotate(point, angle: Orientation.radians(y), first: 2, second: 0)
    return SIMD3(Float(point.x), Float(point.y), Float(point.z))
  }

  /// Rotate within one coordinate plane, leaving the third axis untouched.
  private static func rotate(
    _ point: SIMD3<Double>, angle: Double, first: Int, second: Int
  ) -> SIMD3<Double> {
    guard angle != 0 else { return point }
    let sine = sin(angle)
    let cosine = cos(angle)
    var result = point
    result[first] = point[first] * cosine - point[second] * sine
    result[second] = point[first] * sine + point[second] * cosine
    return result
  }
}
