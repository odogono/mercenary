import XCTest
@testable import MercenaryKit

final class ScenePaletteTests: XCTestCase {
  func testAtariSTPresentationColoursMatchTheReferenceImage() {
    XCTAssertEqual(ScenePalette.sky, RGB8(0x60, 0xA0, 0xE0))
    XCTAssertEqual(ScenePalette.ground, RGB8(0x00, 0x80, 0x00))
    XCTAssertEqual(ScenePalette.blackInk, RGB8(0x00, 0x00, 0x00))
  }
}
