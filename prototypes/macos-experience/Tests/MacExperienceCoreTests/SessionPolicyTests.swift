import XCTest

@testable import MacExperienceCore

final class SessionPolicyTests: XCTestCase {
  func testFocusLossMinimizationAndLiveResizeDoNotSuspendSimulation() {
    var session = PrototypeSession()

    session.handleHostEvent(.focusChanged(false))
    session.handleHostEvent(.minimized(true))
    session.handleHostEvent(.liveResize(true))
    session.advance(by: 1)

    XCTAssertEqual(session.simulationTime, 1)
  }

  func testSystemSleepSuspendsWithoutWallClockCatchUp() {
    var session = PrototypeSession()

    session.handleHostEvent(.systemSleep)
    session.advance(by: 120)
    session.handleHostEvent(.systemWake)
    session.advance(by: 1)

    XCTAssertEqual(session.simulationTime, 1)
  }

  func testExplicitPauseStopsSimulation() {
    var session = PrototypeSession()

    session.togglePause()
    session.advance(by: 1)

    XCTAssertTrue(session.isPaused)
    XCTAssertEqual(session.simulationTime, 0)
  }

  func testControllerDisconnectKeepsSimulationAndKeyboardAvailable() {
    var session = PrototypeSession()

    session.handleHostEvent(.controllerDisconnected("pad-a"))
    session.advance(by: 1)

    XCTAssertEqual(session.simulationTime, 1)
    XCTAssertEqual(
      session.hostNotice, "Controller disconnected. Keyboard controls remain available.")
  }
}
