import MercenaryKit
import SwiftUI

/// C64-derived colours retained for the surrounding status interface. Scene
/// fills and geometry use MercenaryKit's separate Atari ST-inspired palette.
enum InterfacePalette {
  static let black = Color(red: 0, green: 0, blue: 0)
  static let white = Color(red: 1, green: 1, blue: 1)
  static let cyan = Color(red: 0x9A / 255, green: 0xE2 / 255, blue: 0xFE / 255)
  static let lightBlue = Color(red: 0x88 / 255, green: 0x7E / 255, blue: 0xCB / 255)
}

/// Which palette entry each part of the scene uses.
enum SceneStyle {
  static let sky = Color(ScenePalette.sky)
  static let ground = Color(ScenePalette.ground)
  static let enclosed = Color(ScenePalette.enclosed)
  static let whiteInk = Color(ScenePalette.whiteInk)
  static let blackInk = Color(ScenePalette.blackInk)
  static let interfaceAccent = InterfacePalette.lightBlue
  static let statusText = InterfacePalette.cyan
  static let statusBackground = InterfacePalette.black
  /// The game's own message line, which the original renders in white.
  static let messageText = InterfacePalette.white
}

private extension Color {
  init(_ rgb: RGB8) {
    self.init(
      red: Double(rgb.red) / 255,
      green: Double(rgb.green) / 255,
      blue: Double(rgb.blue) / 255
    )
  }
}
