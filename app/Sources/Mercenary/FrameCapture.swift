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
    var position: SIMD3<Double> = SIMD3(32_000, 320, 32_000)
    var heading: Double = .pi / 4
    var pitch: Double = 0
    var cellRadius: Int = 3
  }

  static func run(_ options: Options) -> Int32 {
    guard let directory = PayloadLocator.locate() else {
      FileHandle.standardError.write(Data("error: no Data Payload found\n".utf8))
      return 1
    }
    do {
      let world = World(bundle: try Payload.load(from: directory))
      let camera = Camera(position: options.position, heading: options.heading, pitch: options.pitch)
      let selector = VisibilitySelector(cellRadius: options.cellRadius)
      let segments = selector.segments(in: world, from: options.position)
      let (image, drawn) = render(world: world, camera: camera, segments: segments, size: options.size)
      try write(image, to: options.output)
      let summary = """
        {"status":"rendered","output":"\(options.output.path)",\
        "candidateSegments":\(segments.count),"drawnLines":\(drawn),\
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
    world: World, camera: Camera, segments: [Segment], size: CGSize
  ) -> (CGImage, Int) {
    let width = Int(size.width)
    let height = Int(size.height)
    let context = CGContext(
      data: nil,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: width * 4,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!
    // Match the on-screen view, whose origin is top-left.
    context.translateBy(x: 0, y: size.height)
    context.scaleBy(x: 1, y: -1)

    context.setFillColor(rgb(0, 0, 0))
    context.fill(CGRect(origin: .zero, size: size))

    let focal = Double(size.height) / (2 * tan(camera.verticalFieldOfView / 2))
    let horizon = max(0, min(Double(size.height), Double(size.height) / 2 + tan(camera.pitch) * focal))
    if horizon < Double(size.height) {
      context.setFillColor(rgb(0x50, 0x45, 0x9B))
      context.fill(CGRect(x: 0, y: horizon, width: size.width, height: Double(size.height) - horizon))
      context.setStrokeColor(rgb(0x88, 0x7E, 0xCB))
      context.setLineWidth(1)
      context.move(to: CGPoint(x: 0, y: horizon))
      context.addLine(to: CGPoint(x: size.width, y: horizon))
      context.strokePath()
    }

    var drawn = 0
    for ink in [Ink.black, Ink.white] {
      context.setStrokeColor(ink == .white ? rgb(255, 255, 255) : rgb(0x8B, 0x8B, 0x8B))
      context.setLineWidth(1)
      var any = false
      for segment in segments where segment.ink == ink {
        guard let line = camera.project(segment: segment, size: size) else { continue }
        context.move(to: CGPoint(x: Double(line.x1), y: Double(line.y1)))
        context.addLine(to: CGPoint(x: Double(line.x2), y: Double(line.y2)))
        any = true
        drawn += 1
      }
      if any { context.strokePath() }
    }
    return (context.makeImage()!, drawn)
  }

  private static func rgb(_ r: Int, _ g: Int, _ b: Int) -> CGColor {
    CGColor(red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255, alpha: 1)
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
    if let radius = value("--cell-radius") { options.cellRadius = Int(radius) }
    return options
  }
}
