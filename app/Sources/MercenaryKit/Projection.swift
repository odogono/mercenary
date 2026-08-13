import Foundation

/// A projected line ready to stroke, in view pixels.
public struct ScreenLine: Sendable, Equatable {
  public var x1: Float
  public var y1: Float
  public var x2: Float
  public var y2: Float
  public var ink: Ink
}

/// The Reference Build's projection target: a 160-by-136 viewport centred at
/// (80, 68). Adopting its aspect and centre means objects subtend the angles they
/// did originally once the frustum is scaled to the window.
///
/// The focal length is *not* recovered from the original — only the viewport
/// dimensions and centre are. It is expressed here in reference pixels so that a
/// future decode can replace one constant.
public struct ReferenceViewport: Sendable {
  public static let width: Double = 160
  public static let height: Double = 136
  public static let centre = (x: 80.0, y: 68.0)
  /// Half-height focal length in reference pixels. Chosen to frame the world
  /// comfortably; the original's value is still unknown.
  public static let focalPixels: Double = 124

  public var size: CGSize

  public init(size: CGSize) {
    self.size = size
  }

  /// Uniform scale from reference pixels to view pixels, preserving aspect.
  public var scale: Double {
    min(Double(size.width) / ReferenceViewport.width, Double(size.height) / ReferenceViewport.height)
  }

  /// Where the reference viewport's centre lands in view pixels.
  public var centre: CGPoint {
    CGPoint(x: Double(size.width) / 2, y: Double(size.height) / 2)
  }

  /// Focal length in view pixels.
  public var focalLength: Double { ReferenceViewport.focalPixels * scale }

  /// Vertical field of view implied by the reference frustum.
  public var verticalFieldOfView: Double {
    2 * atan(ReferenceViewport.height / 2 / ReferenceViewport.focalPixels)
  }
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
    verticalFieldOfView: Double = ReferenceViewport(size: CGSize(width: 160, height: 136)).verticalFieldOfView,
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
  ///
  /// The frustum comes from the reference viewport, so the projection keeps the
  /// original's aspect and centre whatever the window size.
  public func project(_ view: SIMD3<Double>, size: CGSize) -> CGPoint {
    let viewport = ReferenceViewport(size: size)
    let scale = viewport.focalLength / view.z
    let centre = viewport.centre
    return CGPoint(x: centre.x + view.x * scale, y: centre.y - view.y * scale)
  }

  /// Where the horizon sits in view pixels for this camera.
  public func horizon(size: CGSize) -> Double {
    let viewport = ReferenceViewport(size: size)
    return viewport.centre.y + tan(pitch) * viewport.focalLength
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

  /// What the renderer should draw this frame: line segments plus any objects
  /// reduced to a single point by the detail rule.
  public struct Visible: Sendable {
    public var segments: [Segment]
    /// Origins of objects outside the detail cube, drawn as points.
    public var points: [SIMD3<Float>]
    public var detailedObjects: Int
  }

  /// Gather what is worth projecting near the camera. Frustum rejection is left to
  /// the projection step, which has to compute view space anyway.
  ///
  /// Surface cells are culled by a fixed radius. Objects beyond their detail cube
  /// collapse to a point, which the original does too — the doc calls that
  /// transition part of its look.
  ///
  /// Roads are all drawn. How the Reference Build selects them is unresolved: a
  /// capture of the original at grid 8:8 shows a road running to the horizon at
  /// altitude zero, while the dataset records no road owned by that cell, so
  /// neither cell ownership nor an altitude radius explains what it draws.
  public func visible(in world: World, from position: SIMD3<Double>) -> Visible {
    let column = Int((position.x / Double(world.cellSize)).rounded(.down))
    let row = Int((position.z / Double(world.cellSize)).rounded(.down))
    var segments: [Segment] = []
    for dz in -cellRadius...cellRadius {
      for dx in -cellRadius...cellRadius {
        guard let cell = world.cell(column: column + dx, row: row + dz) else { continue }
        segments.append(contentsOf: cell.segments)
      }
    }

    if includeRoads {
      segments.append(contentsOf: world.roads.map(\.segment))
    }

    var points: [SIMD3<Float>] = []
    var detailed = 0
    if includeObjects {
      for object in world.objects where object.isDrawable {
        if object.isDetailed(from: position) {
          segments.append(contentsOf: object.segments)
          detailed += 1
        } else if object.drawsFarAsPoint {
          points.append(object.origin)
        }
      }
    }
    return Visible(segments: segments, points: points, detailedObjects: detailed)
  }
}

extension Camera {
  /// Project a single world point, or nil when it is behind the near plane.
  public func project(point world: SIMD3<Float>, size: CGSize) -> CGPoint? {
    let view = viewSpace(world)
    guard view.z >= nearPlane, view.z <= farPlane else { return nil }
    let projected = project(view, size: size)
    guard projected.x.isFinite, projected.y.isFinite else { return nil }
    return projected
  }
}
