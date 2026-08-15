import XCTest
@testable import MercenaryKit

final class ScenePaletteTests: XCTestCase {
  func testAtariSTPresentationColoursMatchTheReferenceImage() {
    XCTAssertEqual(ScenePalette.sky, RGB8(0x60, 0xA0, 0xE0))
    XCTAssertEqual(ScenePalette.ground, RGB8(0x00, 0x80, 0x00))
    XCTAssertEqual(ScenePalette.blackInk, RGB8(0x00, 0x00, 0x00))
  }

  func testAllSixteenC64ColoursMatchTheLocalViceCapturePalette() {
    let expected = [
      RGB8(0x00, 0x00, 0x00), RGB8(0xFF, 0xFF, 0xFF),
      RGB8(0xAB, 0x3C, 0x65), RGB8(0x87, 0xF0, 0xCB),
      RGB8(0xB2, 0x3D, 0xEF), RGB8(0x5E, 0xD6, 0x38),
      RGB8(0x3A, 0x31, 0xFF), RGB8(0xFF, 0xFF, 0x3B),
      RGB8(0xB7, 0x64, 0x18), RGB8(0x81, 0x4C, 0x00),
      RGB8(0xEA, 0x79, 0xA3), RGB8(0x62, 0x62, 0x62),
      RGB8(0x94, 0x94, 0x94), RGB8(0xB2, 0xFF, 0x8D),
      RGB8(0x81, 0x78, 0xFF), RGB8(0xCD, 0xCD, 0xCD),
    ]

    XCTAssertEqual(C64Palette.colors, expected)
    XCTAssertNil(C64Palette.color(index: -1))
    XCTAssertNil(C64Palette.color(index: 16))
  }

  func testAAIndoorBackdropStartsWithForegroundThenAlternatesFor320Columns() {
    let backdrop = IndoorBackdrop(background: 6, foreground: 14)

    XCTAssertEqual(IndoorBackdrop.columnCount, 320)
    XCTAssertEqual(backdrop.color(atColumn: 0), C64Palette.color(index: 14))
    XCTAssertEqual(backdrop.color(atColumn: 1), C64Palette.color(index: 6))
    XCTAssertEqual(backdrop.color(atColumn: 318), C64Palette.color(index: 14))
    XCTAssertEqual(backdrop.color(atColumn: 319), C64Palette.color(index: 6))
    XCTAssertNil(backdrop.color(atColumn: -1))
    XCTAssertNil(backdrop.color(atColumn: 320))
  }
}
