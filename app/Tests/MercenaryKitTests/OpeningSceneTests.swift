import XCTest

@testable import MercenaryKit

final class OpeningSceneTests: XCTestCase {
  func testOpeningSceneStartsInCellEightEightFacingTheReferenceCheckpoint() {
    let player = OpeningScene.player

    XCTAssertEqual(player.position, SIMD3(559_104, 128, 559_104))
    XCTAssertEqual(Int(player.position.x) >> 16, 8)
    XCTAssertEqual(Int(player.position.z) >> 16, 8)
    XCTAssertEqual(OpeningScene.focus.z, player.position.z)
    XCTAssertEqual(player.heading, 0)
    XCTAssertEqual(player.pitch, 0)
  }
}
