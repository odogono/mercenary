import CoreGraphics
import Foundation
import ImageIO
import MercenaryCLI
import MercenaryKit
import UniformTypeIdentifiers

/// Renders one frame straight to a PNG, with no window.
///
/// This exists so a scene can be inspected without a display — handy for
/// side-by-side fidelity spot-checks against the Reference Build, and for
/// verifying a change in an environment that cannot open a window.
enum FrameCapture {
  struct Options {
    var output: URL
    var size: CGSize = CGSize(width: 1280, height: 800)
    var position: SIMD3<Double> = SIMD3(32_000, 128, 32_000)
    var heading: Double = .pi / 4
    var pitch: Double = 0
    var roll: Double = 0
    var elapsed: Double = 0
    /// Draw one underground room instead of the surface, as the engine does.
    var room: Int?
  }

  static func run(_ options: Options) -> Int32 {
    guard let directory = PayloadLocator.locate() else {
      FileHandle.standardError.write(Data("error: no Data Payload found\n".utf8))
      return 1
    }
    do {
      let world = World(bundle: try Payload.load(from: directory))
      let camera = Camera(
        position: options.position, heading: options.heading, pitch: options.pitch,
        roll: options.roll
      )
      let selector = VisibilitySelector()
      let visible = selector.visible(
        in: world, from: options.position, elapsed: options.elapsed, room: options.room
      )
      // A still has no session behind it, so where the photon emitter is comes
      // straight from the payload's own placement — which is where it is at the start
      // of a game, and the honest answer for a render nobody has played up to.
      let indoor = options.room.flatMap { world.rooms[$0] }.map { room in
        IndoorScene(
          room: room, rules: world.doorwayRules,
          emitter: world.objects.first { $0.slot == world.doorwayRules.photonEmitterSlot }
            .map { $0.room == 0 ? Residence.surface(at: nil) : .room($0.room) }
            ?? .surface(at: nil)
        )
      }
      let (image, drawn) = render(
        world: world, camera: camera, visible: visible, size: options.size, indoor: indoor
      )
      try write(image, to: options.output)
      let summary = """
        {"status":"rendered","output":"\(options.output.path)",\
        "candidateSegments":\(visible.segments.count),"drawnLines":\(drawn),\
        "farPoints":\(visible.points.count),"detailedObjects":\(visible.detailedObjects),\
        "deferredEdges":\(world.deferredEdges)}
        """
      print(summary)
      return 0
    } catch {
      FileHandle.standardError.write(Data("error: \(error)\n".utf8))
      return 1
    }
  }

  private static func render(
    world: World, camera: Camera, visible: VisibilitySelector.Visible, size: CGSize,
    indoor: IndoorScene? = nil
  ) -> (CGImage, Int) {
    let width = Int(size.width)
    let height = Int(size.height)
    let context = CGContext(
      data: nil,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: width * 4,
      space: CGColorSpace(name: CGColorSpace.sRGB)!,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!
    // Match the on-screen view, whose origin is top-left.
    context.translateBy(x: 0, y: size.height)
    context.scaleBy(x: 1, y: -1)

    if let indoor {
      let backdrop = IndoorBackdrop(
        background: indoor.background, foreground: indoor.foreground
      )
      let scale = size.width / CGFloat(IndoorBackdrop.columnCount)
      for column in 0..<IndoorBackdrop.columnCount {
        guard let fill = backdrop.color(atColumn: column) else { continue }
        let x0 = CGFloat(column) * scale
        let x1 = CGFloat(column + 1) * scale
        context.setFillColor(color(fill))
        context.fill(CGRect(x: x0, y: 0, width: x1 - x0, height: size.height))
      }
    } else {
      context.setFillColor(color(ScenePalette.sky))
      context.fill(CGRect(origin: .zero, size: size))
      let (ground, lean) = camera.groundFill(size: size)
      context.setFillColor(color(ScenePalette.ground))
      context.saveGState()
      if lean != 0 { context.concatenate(Camera.leanTransform(lean, size: size)) }
      context.fill(ground)
      context.restoreGState()
    }

    // A dark Room is empty, not dim: the Reference Build zeroes every colour it draws
    // with, so there is nothing on the screen but the cleared backdrop.
    if indoor?.dark == true {
      return (context.makeImage()!, 0)
    }

    var drawn = 0
    for ink in [Ink.black, Ink.white] {
      context.setStrokeColor(color(ink == .white ? ScenePalette.whiteInk : ScenePalette.blackInk))
      context.setLineWidth(1)
      var any = false
      for segment in visible.segments where segment.ink == ink {
        guard let line = camera.project(segment: segment, size: size) else { continue }
        context.move(to: CGPoint(x: Double(line.x1), y: Double(line.y1)))
        context.addLine(to: CGPoint(x: Double(line.x2), y: Double(line.y2)))
        any = true
        drawn += 1
      }
      if any { context.strokePath() }
    }

    // Far objects reduce to a single point, matching the original's look.
    context.setFillColor(color(ScenePalette.whiteInk))
    for origin in visible.points {
      guard let point = camera.project(point: origin, size: size) else { continue }
      context.fill(CGRect(x: point.x, y: point.y, width: 1, height: 1))
    }
    return (context.makeImage()!, drawn)
  }

  private static func color(_ rgb: RGB8) -> CGColor {
    CGColor(
      colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
      components: [
        Double(rgb.red) / 255,
        Double(rgb.green) / 255,
        Double(rgb.blue) / 255,
        1,
      ]
    )!
  }

  private static func write(_ image: CGImage, to url: URL) throws {
    guard
      let destination = CGImageDestinationCreateWithURL(
        url as CFURL, UTType.png.identifier as CFString, 1, nil
      )
    else {
      throw CocoaError(.fileWriteUnknown)
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { throw CocoaError(.fileWriteUnknown) }
  }

  /// Parse `--render-frame <path>` plus optional camera overrides.
  static let knownFlags: Set<String> = [
    "--render-frame", "--output", "--x", "--z", "--eye", "--heading", "--pitch",
    "--roll", "--time", "--room",
  ]

  static func options(from arguments: [String]) throws -> Options? {
    let arguments = Arguments(arguments)
    guard arguments.isPresent("--render-frame") else { return nil }
    try arguments.rejectUnknownFlags(besides: knownFlags)
    var options = Options(output: try arguments.output(default: "/tmp/mercenary-frame.png"))
    if let x = try arguments.double("--x") { options.position.x = x }
    if let z = try arguments.double("--z") { options.position.z = z }
    if let y = try arguments.double("--eye") { options.position.y = y }
    if let heading = try arguments.double("--heading") { options.heading = heading * .pi / 180 }
    if let pitch = try arguments.double("--pitch") { options.pitch = pitch * .pi / 180 }
    if let roll = try arguments.double("--roll") { options.roll = roll * .pi / 180 }
    if let elapsed = try arguments.double("--time") { options.elapsed = max(0, elapsed) }
    if let room = try arguments.int("--room", expected: "a room id") { options.room = room }
    return options
  }
}
