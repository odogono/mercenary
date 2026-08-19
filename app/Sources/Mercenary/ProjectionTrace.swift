import CoreGraphics
import Foundation
import MercenaryCLI
import MercenaryKit

/// The screen lines one camera pose resolves to, as a Golden Trace.
///
/// Segments rather than pixels, deliberately. ADR 0011 already refused raster thresholds,
/// and a PNG comparison between two renderers fails on antialiasing that means nothing
/// while passing a line drawn in the wrong ink. What the port has to reproduce is the
/// list of lines and their ink; how a rasteriser then strokes them is the renderer's
/// business and a maintainer's eye (ADR 0011 again).
///
/// The PNG modes stay exactly as they were, for that visual review.
enum ProjectionTrace {
  static func emit(
    _ run: TraceRun, scenario: TraceScenario, body: TraceScenario.Projection
  ) throws -> TraceFile {
    let world = run.world
    let size = CGSize(width: body.width, height: body.height)
    let position = SIMD3(body.x, body.eye, body.z)
    let radians = { (degrees: Double) in degrees * .pi / 180 }
    let camera = Camera(
      position: position, heading: radians(body.heading), pitch: radians(body.pitch),
      roll: radians(body.roll)
    )
    let visible = VisibilitySelector().visible(
      in: world, from: position, elapsed: body.time, room: body.room
    )
    // A still has no session behind it, so the photon emitter is where the payload put
    // it — which is where it is at the start of a game, and the honest answer for a pose
    // nobody has played up to. Same reasoning as ``FrameCapture``.
    let indoor = body.room.flatMap { world.rooms[$0] }.map { room in
      IndoorScene(
        room: room, rules: world.doorwayRules,
        emitter: world.objects.first { $0.slot == world.doorwayRules.photonEmitterSlot }
          .map { $0.room == 0 ? Residence.surface(at: nil) : .room($0.room) }
          ?? .surface(at: nil)
      )
    }

    var trace = TraceFile(emitter: scenario.emitter.rawValue, id: scenario.id)
    let (ground, lean) = camera.groundFill(size: size)
    try trace.header(
      run.header(
        for: scenario, dt: nil,
        extra: [
          (
            key: "camera",
            value: .object([
              "position": .vector(camera.position),
              "heading": .double(camera.heading),
              "pitch": .double(camera.pitch),
              "roll": .double(camera.roll),
              "verticalFieldOfView": .double(camera.verticalFieldOfView),
              "nearPlane": .double(camera.nearPlane),
              "farPlane": .double(camera.farPlane),
              "mirrored": .bool(camera.mirrored),
              "isInverted": .bool(camera.isInverted),
            ])
          ),
          (
            key: "viewport",
            value: .object([
              "width": .double(body.width), "height": .double(body.height),
            ])
          ),
          // The backdrop, which is drawn before any line and is part of what the port has
          // to get right: a horizon in the wrong place is not a line-list problem.
          (
            key: "backdrop",
            value: indoor.map { scene in
              .object([
                "indoor": TraceRecords.value(scene),
                "columns": .int(IndoorBackdrop.columnCount),
              ])
            }
              ?? .object([
                "horizon": .double(camera.horizon(size: size)),
                "ground": .object([
                  "x": .double(ground.origin.x), "y": .double(ground.origin.y),
                  "width": .double(ground.size.width), "height": .double(ground.size.height),
                  "lean": .double(lean),
                ]),
              ])
          ),
          (
            key: "candidates",
            value: .object([
              "segments": .int(visible.segments.count),
              "points": .int(visible.points.count),
              "detailedObjects": .int(visible.detailedObjects),
            ])
          ),
        ]))

    // A dark Room is empty rather than dim: the Reference Build zeroes every colour it
    // draws with, so there is nothing on screen but the cleared backdrop. Recorded as no
    // line records at all, which is the same claim the renderer makes.
    guard indoor?.dark != true else { return trace }

    // Pipeline order, which is the order the visibility selector produced the segments in
    // — the cell ring, then the map lines, then the objects, and underground the Room's own
    // wireframe and then its objects. Objects are appended last in both paths. The renderer
    // batches these by ink into two passes; that is a renderer's choice about draw calls and
    // not a property of the projection, so it is not what gets pinned here.
    var index = 0
    for segment in visible.segments {
      guard let line = camera.project(segment: segment, size: size) else { continue }
      try trace.record(
        .object([
          "kind": .string("line"), "index": .int(index), "line": TraceRecords.value(line),
        ]))
      index += 1
    }
    // Far objects reduce to a single point, matching the original's look.
    var points = 0
    for origin in visible.points {
      guard let point = camera.project(point: origin, size: size) else { continue }
      try trace.record(
        .object([
          "kind": .string("point"), "index": .int(points),
          "point": .object(["x": .double(point.x), "y": .double(point.y)]),
        ]))
      points += 1
    }
    return trace
  }
}
