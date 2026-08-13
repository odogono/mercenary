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
