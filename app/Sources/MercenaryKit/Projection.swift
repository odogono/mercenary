import Foundation

/// A projected line ready to stroke, in view pixels.
public struct ScreenLine: Sendable, Equatable {
  public var x1: Float
  public var y1: Float
  public var x2: Float
  public var y2: Float
  public var ink: Ink
}

/// Perspective projection from world space to view pixels.
///
/// Kept in the kit rather than the renderer so the maths is unit-testable without
/// a window: the clip behaviour at the near plane is the part most likely to go
/// subtly wrong.
public struct Camera: Sendable, Equatable {
  public var position: SIMD3<Double>
  public var heading: Double
  public var pitch: Double
  public var verticalFieldOfView: Double
  public var nearPlane: Double
  public var farPlane: Double

  public init(
    position: SIMD3<Double>,
    heading: Double,
    pitch: Double,
    verticalFieldOfView: Double = 1.05,
    nearPlane: Double = 24,
    farPlane: Double = 320_000
  ) {
    self.position = position
    self.heading = heading
    self.pitch = pitch
    self.verticalFieldOfView = verticalFieldOfView
    self.nearPlane = nearPlane
    self.farPlane = farPlane
  }

  public init(player: PlayerState) {
    self.init(position: player.position, heading: player.heading, pitch: player.pitch)
  }

  /// Transform a world point into view space: +X right, +Y up, +Z forward.
  public func viewSpace(_ world: SIMD3<Float>) -> SIMD3<Double> {
    let relative = SIMD3<Double>(
      Double(world.x) - position.x,
      Double(world.y) - position.y,
      Double(world.z) - position.z
    )
    let sinHeading = sin(heading)
    let cosHeading = cos(heading)
    // Yaw about the vertical axis, with heading measured clockwise from +Z.
    let x = relative.x * cosHeading - relative.z * sinHeading
    let forward = relative.x * sinHeading + relative.z * cosHeading
    let sinPitch = sin(pitch)
    let cosPitch = cos(pitch)
    let y = relative.y * cosPitch - forward * sinPitch
    let z = relative.y * sinPitch + forward * cosPitch
    return SIMD3(x, y, z)
  }

  /// Project a clipped view-space point into pixels for a view of `size`.
  public func project(_ view: SIMD3<Double>, size: CGSize) -> CGPoint {
    let focal = Double(size.height) / (2 * tan(verticalFieldOfView / 2))
    let scale = focal / view.z
    return CGPoint(
      x: Double(size.width) / 2 + view.x * scale,
      y: Double(size.height) / 2 - view.y * scale
    )
  }

  /// Clip a segment to the near plane, returning nil when it is wholly behind.
  public func clipToNearPlane(
    _ a: SIMD3<Double>, _ b: SIMD3<Double>
  ) -> (SIMD3<Double>, SIMD3<Double>)? {
    let aVisible = a.z >= nearPlane
    let bVisible = b.z >= nearPlane
    if aVisible && bVisible { return (a, b) }
    if !aVisible && !bVisible { return nil }
    let t = (nearPlane - a.z) / (b.z - a.z)
    let crossing = a + (b - a) * t
    return aVisible ? (a, crossing) : (crossing, b)
  }

  /// Project one world segment, or nil when it is clipped away entirely.
  public func project(segment: Segment, size: CGSize) -> ScreenLine? {
    let a = viewSpace(segment.a)
    let b = viewSpace(segment.b)
    guard a.z <= farPlane || b.z <= farPlane else { return nil }
    guard let (near, far) = clipToNearPlane(a, b) else { return nil }
    let first = project(near, size: size)
    let second = project(far, size: size)
    guard first.x.isFinite, first.y.isFinite, second.x.isFinite, second.y.isFinite else { return nil }
    return ScreenLine(
      x1: Float(first.x), y1: Float(first.y), x2: Float(second.x), y2: Float(second.y), ink: segment.ink
    )
  }
}

/// Selects the world geometry worth projecting this frame.
public struct VisibilitySelector: Sendable {
  /// How many grid cells away from the camera to consider. The world is 16×16
  /// cells, so three rings keeps the segment count low without a visible pop-in
  /// at the sizes structures occupy.
  public var cellRadius: Int
  public var includeObjects: Bool
  public var includeRoads: Bool

  public init(cellRadius: Int = 3, includeObjects: Bool = true, includeRoads: Bool = true) {
    self.cellRadius = cellRadius
    self.includeObjects = includeObjects
    self.includeRoads = includeRoads
  }

  /// Gather candidate segments near the camera. Frustum rejection is left to the
  /// projection step, which has to compute view space anyway.
  public func segments(in world: World, from position: SIMD3<Double>) -> [Segment] {
    let column = Int((position.x / Double(world.cellSize)).rounded(.down))
    let row = Int((position.z / Double(world.cellSize)).rounded(.down))
    var result: [Segment] = []
    for dz in -cellRadius...cellRadius {
      for dx in -cellRadius...cellRadius {
        let candidate = (column + dx, row + dz)
        guard candidate.0 >= 0, candidate.0 < world.cellsPerAxis,
          candidate.1 >= 0, candidate.1 < world.cellsPerAxis,
          let cell = world.cell(column: candidate.0, row: candidate.1)
        else { continue }
        result.append(contentsOf: cell.segments)
      }
    }
    if includeRoads { result.append(contentsOf: world.roads) }
    if includeObjects { result.append(contentsOf: world.objects) }
    return result
  }
}
