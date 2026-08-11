import XCTest

@testable import MacExperienceCore

final class LayoutPolicyTests: XCTestCase {
  func testOrdinaryWindowUsesStackedComposition() {
    let layout = GameSurfaceLayout.resolve(in: .init(width: 900, height: 700))

    XCTAssertEqual(layout.composition, .stacked)
    XCTAssertEqual(layout.logicalCameraSize, .reference)
    XCTAssertEqual(layout.visibleSceneIDs, SyntheticScene.referenceSceneIDs)
  }

  func testWideWindowUsesSideStatusWithoutChangingCameraOrScene() {
    let stacked = GameSurfaceLayout.resolve(in: .init(width: 900, height: 700))
    let wide = GameSurfaceLayout.resolve(in: .init(width: 1_400, height: 800))

    XCTAssertEqual(wide.composition, .wide)
    XCTAssertEqual(wide.logicalCameraSize, stacked.logicalCameraSize)
    XCTAssertEqual(wide.visibleSceneIDs, stacked.visibleSceneIDs)
    XCTAssertEqual(wide.projectionSignature, stacked.projectionSignature)
  }

  func testWindowSizeIsClampedToValidatedMinimum() {
    let layout = GameSurfaceLayout.resolve(in: .init(width: 320, height: 240))

    XCTAssertEqual(layout.containerSize, .minimumUsable)
    XCTAssertGreaterThan(layout.gameplayFrame.width, 0)
    XCTAssertGreaterThan(layout.statusFrame.height, 0)
  }

  func testAccommodationsDoNotChangeProjectionOrVisibleScene() {
    let baseline = GameSurfaceLayout.resolve(
      in: .init(width: 1_400, height: 800),
      accommodations: .default
    )
    let accommodated = GameSurfaceLayout.resolve(
      in: .init(width: 1_400, height: 800),
      accommodations: .maximumPrototypeSet
    )

    XCTAssertEqual(accommodated.projectionSignature, baseline.projectionSignature)
    XCTAssertEqual(accommodated.visibleSceneIDs, baseline.visibleSceneIDs)
  }
}
