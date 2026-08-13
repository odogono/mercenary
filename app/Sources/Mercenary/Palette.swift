import SwiftUI

/// The Commodore 64 hardware palette, as sRGB.
///
/// The wireframe look is the part of the original the pivot keeps verbatim, so
/// the colours come from the machine rather than from taste.
enum C64Palette {
  static let black = Color(red: 0, green: 0, blue: 0)
  static let white = Color(red: 1, green: 1, blue: 1)
  static let cyan = Color(red: 0x9A / 255, green: 0xE2 / 255, blue: 0xFE / 255)
  static let green = Color(red: 0x5C / 255, green: 0xAB / 255, blue: 0x5E / 255)
  static let blue = Color(red: 0x50 / 255, green: 0x45 / 255, blue: 0x9B / 255)
  static let lightBlue = Color(red: 0x88 / 255, green: 0x7E / 255, blue: 0xCB / 255)
  static let grey = Color(red: 0x8B / 255, green: 0x8B / 255, blue: 0x8B / 255)
  static let lightGrey = Color(red: 0xB8 / 255, green: 0xB8 / 255, blue: 0xB8 / 255)
  static let darkGrey = Color(red: 0x58 / 255, green: 0x58 / 255, blue: 0x58 / 255)
}

/// Which palette entry each part of the scene uses.
enum SceneStyle {
  static let sky = C64Palette.black
  static let ground = C64Palette.blue
  /// The bright ink pass of a structure's edges.
  static let whiteInk = C64Palette.white
  /// The dim ink pass. The original alternates two operations over the same
  /// wireframe; rendering the second dimmer keeps that structure visible.
  static let blackInk = C64Palette.grey
  static let horizon = C64Palette.lightBlue
  static let statusText = C64Palette.cyan
  static let statusBackground = C64Palette.black
}
