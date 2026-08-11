import XCTest

@testable import MacExperienceCore

final class InputRouterTests: XCTestCase {
  func testKeyboardAndSelectedControllerActionsAreMerged() {
    var router = InputRouter(
      keyboardProfile: .modernKeyboard,
      controllerProfile: .modernController,
      selectedControllerID: "pad-a"
    )

    router.handle(.press(device: .keyboard, control: .key("w")))
    router.handle(.press(device: .controller("pad-a"), control: .controllerElement("primary")))

    XCTAssertEqual(router.activeActions, [.moveForward, .primaryAction])
  }

  func testUnselectedControllerIsIgnored() {
    var router = InputRouter(
      keyboardProfile: .modernKeyboard,
      controllerProfile: .modernController,
      selectedControllerID: "pad-a"
    )

    router.handle(.press(device: .controller("pad-b"), control: .controllerElement("primary")))

    XCTAssertTrue(router.activeActions.isEmpty)
  }

  func testOSRepeatAndSystemShortcutsDoNotCreateGameplayActions() {
    var router = InputRouter(
      keyboardProfile: .modernKeyboard,
      controllerProfile: .modernController,
      selectedControllerID: nil
    )

    router.handle(.press(device: .keyboard, control: .key("w")))
    router.handle(.repeatEvent(device: .keyboard, control: .key("w")))
    router.handle(.systemShortcut(control: .key("q")))

    XCTAssertEqual(router.activeActions, [.moveForward])
  }

  func testReleaseRemovesOnlyTheReleasedPhysicalInput() {
    var router = InputRouter(
      keyboardProfile: .modernKeyboard,
      controllerProfile: .modernController,
      selectedControllerID: "pad-a"
    )

    router.handle(.press(device: .keyboard, control: .key("w")))
    router.handle(.press(device: .controller("pad-a"), control: .controllerElement("up")))
    router.handle(.release(device: .keyboard, control: .key("w")))

    XCTAssertEqual(router.activeActions, [.moveForward])
  }

  func testBindingReassignmentReturnsTheDisplacedAction() {
    var profile = ControlProfile.modernKeyboard

    let displaced = profile.assign(.key("w"), to: .turnLeft)

    XCTAssertEqual(displaced, .moveForward)
    XCTAssertEqual(profile.action(for: .key("w")), .turnLeft)
  }

  func testEverySemanticActionCanBeBound() {
    var profile = ControlProfile(name: "Custom", deviceKind: .keyboard, bindings: [])

    for (index, action) in SemanticAction.allCases.enumerated() {
      profile.assign(.key("custom-\(index)"), to: action)
    }

    XCTAssertEqual(Set(profile.bindings.map(\.action)), Set(SemanticAction.allCases))
  }

  func testDisconnectingControllerClearsItsHeldActions() {
    var router = InputRouter(
      keyboardProfile: .modernKeyboard,
      controllerProfile: .modernController,
      selectedControllerID: "pad-a"
    )
    router.handle(.press(device: .controller("pad-a"), control: .controllerElement("up")))

    router.disconnectController("pad-a")

    XCTAssertTrue(router.activeActions.isEmpty)
  }

  func testChangingSelectedControllerStopsActionsFromThePreviousController() {
    var router = InputRouter(
      keyboardProfile: .modernKeyboard,
      controllerProfile: .modernController,
      selectedControllerID: "pad-a"
    )
    router.handle(.press(device: .controller("pad-a"), control: .controllerElement("up")))

    router.selectedControllerID = "pad-b"

    XCTAssertTrue(router.activeActions.isEmpty)
  }
}
