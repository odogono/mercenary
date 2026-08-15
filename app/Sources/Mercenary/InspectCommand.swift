import CoreGraphics
import Foundation
import ImageIO
import MercenaryKit
import UniformTypeIdentifiers

/// The headless half of the geometry debug mode.
///
/// Renders a subject in isolation and prints its decoded numbers, so "some
/// geometry looks wrong" becomes a named defect. The contact sheet puts every
/// object on one page, which is the fastest way to spot a malformed model.
enum InspectCommand {
  enum Mode {
    case objectSheet(URL)
    case structureSheet(URL)
    case object(slot: Int, output: URL, inSitu: Bool)
    case cell(index: Int, output: URL)
    case room(id: Int, output: URL)
    case roomSheet(URL)
  }

  static func mode(from arguments: [String]) -> Mode? {
    func value(_ flag: String) -> String? {
      guard let at = arguments.firstIndex(of: flag), arguments.count > at + 1 else { return nil }
      return arguments[at + 1]
    }
    let output = URL(fileURLWithPath: value("--out") ?? "/tmp/mercenary-inspect.png")
    if let sheet = value("--inspect-objects") {
      return .objectSheet(URL(fileURLWithPath: sheet))
    }
    if let sheet = value("--inspect-structures") {
      return .structureSheet(URL(fileURLWithPath: sheet))
    }
    if let slot = value("--inspect-object").flatMap({ Int($0, radix: 10) }) {
      return .object(slot: slot, output: output, inSitu: arguments.contains("--in-situ"))
    }
    if let index = value("--inspect-cell").flatMap({ Int($0, radix: 10) }) {
      return .cell(index: index, output: output)
    }
    if let sheet = value("--inspect-rooms") {
      return .roomSheet(URL(fileURLWithPath: sheet))
    }
    if let id = value("--inspect-room").flatMap({ Int($0, radix: 10) }) {
      return .room(id: id, output: output)
    }
    return nil
  }

  static func run(_ mode: Mode) -> Int32 {
    guard let directory = PayloadLocator.locate() else {
      FileHandle.standardError.write(Data("error: no Data Payload found\n".utf8))
      return 1
    }
    do {
      let world = World(bundle: try Payload.load(from: directory))
      let inspector = Inspector(world: world)
      switch mode {
      case .objectSheet(let url):
        try contactSheet(
          items: inspector.objectSlots.map { (String(format: "%02X", $0), .object(slot: $0)) },
          columns: 8, inspector: inspector, to: url)
        print(Inspector.table(inspector.objectRows(), title: "objects"))
        print("{\"status\":\"inspected\",\"output\":\"\(url.path)\",\"objects\":\(world.objects.count)}")
      case .structureSheet(let url):
        let identities = inspector.structureIdentities
        try contactSheet(
          items: identities.map {
            ($0.replacingOccurrences(of: "surface-structure:", with: "").uppercased(), .structure(id: $0))
          },
          columns: 10, inspector: inspector, to: url)
        print(Inspector.table(inspector.structureRows(), title: "surface structures"))
        print(
          "{\"status\":\"inspected\",\"output\":\"\(url.path)\","
            + "\"structures\":\(identities.count),\"roadWorkspaceEdges\":\(world.deferredEdges)}")
      case .object(let slot, let url, let inSitu):
        guard let object = inspector.object(slot: slot) else {
          FileHandle.standardError.write(Data("error: no surface object in slot \(slot)\n".utf8))
          return 1
        }
        let camera =
          inSitu
          ? Camera(
            position: SIMD3(
              Double(object.origin.x), Double(object.origin.y) + 400,
              Double(object.origin.z) - Double(object.detailCube) / 8),
            heading: 0, pitch: -0.1)
          : inspector.canonicalCamera(for: .object(slot: slot))
        try render(
          segments: inSitu
            ? inspector.world.objects.flatMap(\.segments) : object.segments,
          camera: try require(camera), size: CGSize(width: 900, height: 760), to: url)
        print(Inspector.table(inspector.objectRows().filter { $0.subject.hasSuffix(String(format: "%02X", slot)) }, title: "object \(slot)"))
        print("{\"status\":\"inspected\",\"output\":\"\(url.path)\",\"inSitu\":\(inSitu)}")
      case .cell(let index, let url):
        guard let cell = inspector.cell(index: index) else {
          FileHandle.standardError.write(Data("error: no cell \(index)\n".utf8))
          return 1
        }
        try render(
          segments: cell.segments(at: 0),
          camera: try require(inspector.canonicalCamera(for: .cell(index: index))),
          size: CGSize(width: 900, height: 760), to: url)
        print(Inspector.table(inspector.cellRows().filter { $0.subject.contains("\(index)") }, title: "cell \(index)"))
        print("{\"status\":\"inspected\",\"output\":\"\(url.path)\",\"edges\":\(cell.segments(at: 0).count)}")
      case .room(let id, let url):
        guard let room = world.rooms[id] else {
          FileHandle.standardError.write(Data("error: no underground room \(id)\n".utf8))
          return 1
        }
        try render(
          segments: room.segments,
          camera: try require(inspector.canonicalCamera(for: .room(id: id))),
          size: CGSize(width: 900, height: 760), to: url)
        print(
          Inspector.table(
            inspector.roomRows().filter { $0.subject == String(format: "room %02X", id) },
            title: "room \(id)"))
        print(
          "{\"status\":\"inspected\",\"output\":\"\(url.path)\","
            + "\"edges\":\(room.segments.count),\"portals\":\(room.portals.count)}")
      case .roomSheet(let url):
        let rooms = world.rooms.keys.sorted().compactMap { world.rooms[$0] }
        try contactSheet(
          items: rooms.map { (String(format: "%02X", $0.id), .room(id: $0.id)) },
          columns: 16, inspector: inspector, to: url)
        print(Inspector.table(inspector.roomRows(), title: "underground rooms"))
        print(
          "{\"status\":\"inspected\",\"output\":\"\(url.path)\",\"rooms\":\(rooms.count),"
            + "\"roomEdges\":\(rooms.reduce(0) { $0 + $1.segments.count })}")
      }
      return 0
    } catch {
      FileHandle.standardError.write(Data("error: \(error)\n".utf8))
      return 1
    }
  }

  private static func require(_ camera: Camera?) throws -> Camera {
    guard let camera else { throw CocoaError(.featureUnsupported) }
    return camera
  }

  /// Subjects as canonical tiles on one page, each framed to its own bounds.
  private static func contactSheet(
    items: [(label: String, subject: Inspector.Subject)], columns: Int,
    inspector: Inspector, to url: URL
  ) throws {
    let rows = max(1, (items.count + columns - 1) / columns)
    let tile = CGSize(width: 220, height: 190)
    let size = CGSize(width: tile.width * Double(columns), height: tile.height * Double(rows))
    let context = try bitmap(size: size)
    context.setFillColor(gray(0.04))
    context.fill(CGRect(origin: .zero, size: size))

    for (position, item) in items.enumerated() {
      let column = position % columns
      let row = position / columns
      // Bitmap origin is bottom-left; lay the sheet out top-down.
      let frame = CGRect(
        x: Double(column) * tile.width,
        y: size.height - Double(row + 1) * tile.height,
        width: tile.width, height: tile.height)
      context.saveGState()
      context.clip(to: frame)
      context.setStrokeColor(gray(0.22))
      context.setLineWidth(1)
      context.stroke(frame.insetBy(dx: 0.5, dy: 0.5))

      if let camera = inspector.canonicalCamera(for: item.subject) {
        let segments = inspector.segments(for: item.subject)
        for segment in segments {
          guard let line = camera.project(segment: segment, size: frame.size) else { continue }
          context.setStrokeColor(segment.ink == .white ? gray(1) : gray(0.45))
          context.beginPath()
          context.move(to: CGPoint(x: frame.minX + Double(line.x1), y: frame.maxY - Double(line.y1)))
          context.addLine(to: CGPoint(x: frame.minX + Double(line.x2), y: frame.maxY - Double(line.y2)))
          context.strokePath()
        }
      }
      draw(label: item.label, in: frame, context: context)
      context.restoreGState()
    }
    try write(context.makeImage()!, to: url)
  }

  private static func draw(label: String, in frame: CGRect, context: CGContext) {
    // A tiny 5x7 stroke font would be overkill; a slot marker is enough to index
    // the tile against the printed table.
    context.setFillColor(gray(0.75))
    let unit = 3.0
    for (index, character) in label.enumerated() {
      let bits = digits[character] ?? []
      for (rowIndex, mask) in bits.enumerated() {
        for column in 0..<3 where mask & (1 << (2 - column)) != 0 {
          context.fill(
            CGRect(
              x: frame.minX + 6 + Double(index) * (unit * 4) + Double(column) * unit,
              y: frame.minY + 6 + Double(4 - rowIndex) * unit,
              width: unit, height: unit))
        }
      }
    }
  }

  /// A 3x5 bitmap per hex digit, for labelling tiles without a font.
  private static let digits: [Character: [Int]] = [
    "0": [0b111, 0b101, 0b101, 0b101, 0b111], "1": [0b010, 0b010, 0b010, 0b010, 0b010],
    "2": [0b111, 0b001, 0b111, 0b100, 0b111], "3": [0b111, 0b001, 0b111, 0b001, 0b111],
    "4": [0b101, 0b101, 0b111, 0b001, 0b001], "5": [0b111, 0b100, 0b111, 0b001, 0b111],
    "6": [0b111, 0b100, 0b111, 0b101, 0b111], "7": [0b111, 0b001, 0b001, 0b001, 0b001],
    "8": [0b111, 0b101, 0b111, 0b101, 0b111], "9": [0b111, 0b101, 0b111, 0b001, 0b111],
    "A": [0b111, 0b101, 0b111, 0b101, 0b101], "B": [0b110, 0b101, 0b110, 0b101, 0b111],
    "C": [0b111, 0b100, 0b100, 0b100, 0b111], "D": [0b110, 0b101, 0b101, 0b101, 0b110],
    "E": [0b111, 0b100, 0b111, 0b100, 0b111], "F": [0b111, 0b100, 0b111, 0b100, 0b100],
  ]

  private static func render(
    segments: [Segment], camera: Camera, size: CGSize, to url: URL
  ) throws {
    let context = try bitmap(size: size)
    context.setFillColor(gray(0.04))
    context.fill(CGRect(origin: .zero, size: size))
    context.setStrokeColor(gray(1))
    context.setLineWidth(1)
    var drew = false
    for segment in segments {
      guard let line = camera.project(segment: segment, size: size) else { continue }
      context.move(to: CGPoint(x: Double(line.x1), y: size.height - Double(line.y1)))
      context.addLine(to: CGPoint(x: Double(line.x2), y: size.height - Double(line.y2)))
      drew = true
    }
    if drew { context.strokePath() }
    try write(context.makeImage()!, to: url)
  }

  private static func bitmap(size: CGSize) throws -> CGContext {
    guard
      let context = CGContext(
        data: nil, width: Int(size.width), height: Int(size.height),
        bitsPerComponent: 8, bytesPerRow: Int(size.width) * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { throw CocoaError(.featureUnsupported) }
    return context
  }

  private static func gray(_ level: Double) -> CGColor {
    CGColor(red: level, green: level, blue: level, alpha: 1)
  }

  private static func write(_ image: CGImage, to url: URL) throws {
    guard
      let destination = CGImageDestinationCreateWithURL(
        url as CFURL, UTType.png.identifier as CFString, 1, nil)
    else { throw CocoaError(.fileWriteUnknown) }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { throw CocoaError(.fileWriteUnknown) }
  }
}
