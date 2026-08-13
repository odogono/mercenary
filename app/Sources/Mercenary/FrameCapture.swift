import CoreGraphics
import Foundation
import ImageIO
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
    var elapsed: Double = 0
  }

  static func run(_ options: Options) -> Int32 {
    guard let directory = PayloadLocator.locate() else {
      FileHandle.standardError.write(Data("error: no Data Payload found\n".utf8))
      return 1
    }
    do {
      let world = World(bundle: try Payload.load(from: directory))
      let camera = Camera(position: options.position, heading: options.heading, pitch: options.pitch)
      let selector = VisibilitySelector()
      let visible = selector.visible(in: world, from: options.position, elapsed: options.elapsed)
      let (image, drawn) = render(world: world, camera: camera, visible: visible, size: options.size)
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
    world: World, camera: Camera, visible: VisibilitySelector.Visible, size: CGSize
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

    context.setFillColor(color(ScenePalette.sky))
    context.fill(CGRect(origin: .zero, size: size))

    let horizon = max(0, min(Double(size.height), camera.horizon(size: size)))
    if horizon < Double(size.height) {
      context.setFillColor(color(ScenePalette.ground))
      context.fill(CGRect(x: 0, y: horizon, width: size.width, height: Double(size.height) - horizon))
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
  static func options(from arguments: [String]) -> Options? {
    guard let index = arguments.firstIndex(of: "--render-frame"), arguments.count > index + 1 else {
      return nil
    }
    var options = Options(output: URL(fileURLWithPath: arguments[index + 1]))
    func value(_ flag: String) -> Double? {
      guard let at = arguments.firstIndex(of: flag), arguments.count > at + 1 else { return nil }
      return Double(arguments[at + 1])
    }
    if let x = value("--x") { options.position.x = x }
    if let z = value("--z") { options.position.z = z }
    if let y = value("--eye") { options.position.y = y }
    if let heading = value("--heading") { options.heading = heading * .pi / 180 }
    if let pitch = value("--pitch") { options.pitch = pitch * .pi / 180 }
    if let elapsed = value("--time") { options.elapsed = max(0, elapsed) }
    return options
  }
}
