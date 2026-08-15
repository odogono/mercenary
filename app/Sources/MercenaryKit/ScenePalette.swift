/// An eight-bit sRGB colour shared by the interactive and headless renderers.
public struct RGB8: Equatable, Sendable {
  public let red: UInt8
  public let green: UInt8
  public let blue: UInt8

  public init(_ red: UInt8, _ green: UInt8, _ blue: UInt8) {
    self.red = red
    self.green = green
    self.blue = blue
  }
}

/// Intentional Atari ST-inspired presentation colours sampled from the
/// supplied overhead airstrip reference. These are not decoded C64 colours.
public enum ScenePalette {
  public static let sky = RGB8(0x60, 0xA0, 0xE0)
  public static let ground = RGB8(0x00, 0x80, 0x00)
  public static let blackInk = RGB8(0x00, 0x00, 0x00)
  public static let whiteInk = RGB8(0xFF, 0xFF, 0xFF)
}

/// The local VICE 3.8 C64 PAL palette used to produce the reference captures.
public enum C64Palette {
  public static let colors = [
    RGB8(0x00, 0x00, 0x00), RGB8(0xFF, 0xFF, 0xFF),
    RGB8(0xAB, 0x3C, 0x65), RGB8(0x87, 0xF0, 0xCB),
    RGB8(0xB2, 0x3D, 0xEF), RGB8(0x5E, 0xD6, 0x38),
    RGB8(0x3A, 0x31, 0xFF), RGB8(0xFF, 0xFF, 0x3B),
    RGB8(0xB7, 0x64, 0x18), RGB8(0x81, 0x4C, 0x00),
    RGB8(0xEA, 0x79, 0xA3), RGB8(0x62, 0x62, 0x62),
    RGB8(0x94, 0x94, 0x94), RGB8(0xB2, 0xFF, 0x8D),
    RGB8(0x81, 0x78, 0xFF), RGB8(0xCD, 0xCD, 0xCD),
  ]

  public static func color(index: Int) -> RGB8? {
    colors.indices.contains(index) ? colors[index] : nil
  }
}

/// The Reference Build clears an indoor bitmap with `$AA`: foreground bit first,
/// then background, alternating through all 320 bitmap columns.
public struct IndoorBackdrop: Sendable, Equatable {
  public static let columnCount = 320
  public let background: RGB8
  public let foreground: RGB8

  public init(background: Int, foreground: Int) {
    self.background = C64Palette.color(index: background) ?? ScenePalette.blackInk
    self.foreground = C64Palette.color(index: foreground) ?? ScenePalette.whiteInk
  }

  public func color(atColumn column: Int) -> RGB8? {
    guard 0..<Self.columnCount ~= column else { return nil }
    return column.isMultiple(of: 2) ? foreground : background
  }
}
