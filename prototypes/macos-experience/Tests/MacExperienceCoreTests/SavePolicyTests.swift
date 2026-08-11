import XCTest

@testable import MacExperienceCore

final class SavePolicyTests: XCTestCase {
  func testQuickSlotsAcceptExactlyZeroThroughNine() {
    XCTAssertEqual(QuickSlot.allCases.map(\.rawValue), Array(0...9))
    XCTAssertNil(QuickSlot(rawValue: -1))
    XCTAssertNil(QuickSlot(rawValue: 10))
  }

  func testUnavailableSemanticGateBlocksDocumentsAndQuickSlots() {
    let policy = SavePolicy(availability: .unavailable("Evidence-pending state"), isDirty: true)

    XCTAssertFalse(policy.canSaveDocument)
    XCTAssertFalse(policy.canLoadDocument)
    XCTAssertFalse(policy.canUseQuickSlots)
  }

  func testDirtyLoadAndCloseRequireSaveDiscardCancelDecision() {
    let policy = SavePolicy(availability: .available, isDirty: true)

    XCTAssertEqual(policy.requiredDecision(for: .load), .saveDiscardOrCancel)
    XCTAssertEqual(policy.requiredDecision(for: .close), .saveDiscardOrCancel)
    XCTAssertEqual(policy.requiredDecision(for: .quit), .saveDiscardOrCancel)
  }

  func testCleanLoadNeedsNoDestructiveDecision() {
    let policy = SavePolicy(availability: .available, isDirty: false)

    XCTAssertEqual(policy.requiredDecision(for: .load), .none)
  }

  func testPrototypeNeverCreatesSemanticAutosave() {
    XCTAssertFalse(SavePolicy.supportsSemanticAutosave)
  }
}
