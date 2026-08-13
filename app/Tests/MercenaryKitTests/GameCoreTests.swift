import XCTest

@testable import MercenaryKit

final class GameCoreTests: XCTestCase {
  private let limits = WalkLimits()

  private func start() -> GameState {
    GameState(player: PlayerState(position: SIMD3(10_000, 320, 10_000), heading: 0, pitch: 0))
  }

  func testSameInputsProduceTheSameState() {
    let intent = Intent(forward: 1, strafe: -0.5, turn: 0.25, lookUp: 0.5, running: true)
    var first = start()
    var second = start()
    for _ in 0..<120 {
      first = GameCore.step(first, intent: intent, dt: 1.0 / 60.0, limits: limits)
      second = GameCore.step(second, intent: intent, dt: 1.0 / 60.0, limits: limits)
    }

    XCTAssertEqual(first, second)
  }

  func testAStepIsUnaffectedByHowItIsSubdivided() {
    let intent = Intent(forward: 1, turn: 0.4)
    let whole = GameCore.step(start(), intent: intent, dt: GameCore.maximumStep, limits: limits)
    var halves = start()
    for _ in 0..<2 {
      halves = GameCore.step(halves, intent: intent, dt: GameCore.maximumStep / 2, limits: limits)
    }

    // Turning integrates before translation, so halving is not bit-identical;
    // it must stay close and must not diverge in direction.
    XCTAssertEqual(whole.player.position.x, halves.player.position.x, accuracy: 12)
    XCTAssertEqual(whole.player.position.z, halves.player.position.z, accuracy: 12)
    XCTAssertEqual(whole.elapsed, halves.elapsed, accuracy: 1e-12)
  }

  func testALongFrameIsBrokenIntoBoundedSteps() {
    let intent = Intent(forward: 1)
    let stalled = GameCore.step(start(), intent: intent, dt: 1.0, limits: limits)
    let travelled = stalled.player.position.z - 10_000

    // One second of walking, not one second teleported in a single integration.
    XCTAssertEqual(travelled, limits.walkSpeed, accuracy: 1)
    XCTAssertEqual(stalled.elapsed, 1.0, accuracy: 1e-9)
  }

  func testDiagonalMovementIsNotFasterThanCardinal() {
    let forward = GameCore.step(start(), intent: Intent(forward: 1), dt: 1.0, limits: limits)
    let diagonal = GameCore.step(start(), intent: Intent(forward: 1, strafe: 1), dt: 1.0, limits: limits)

    func distance(_ state: GameState) -> Double {
      let dx = state.player.position.x - 10_000
      let dz = state.player.position.z - 10_000
      return (dx * dx + dz * dz).squareRoot()
    }

    XCTAssertEqual(distance(forward), distance(diagonal), accuracy: 1)
  }

  func testHeadingZeroWalksTowardIncreasingZ() {
    let moved = GameCore.step(start(), intent: Intent(forward: 1), dt: 0.5, limits: limits)

    XCTAssertEqual(moved.player.position.x, 10_000, accuracy: 0.001)
    XCTAssertGreaterThan(moved.player.position.z, 10_000)
  }

  func testAQuarterTurnWalksTowardIncreasingX() {
    var state = start()
    state.player.heading = .pi / 2
    let moved = GameCore.step(state, intent: Intent(forward: 1), dt: 0.5, limits: limits)

    XCTAssertGreaterThan(moved.player.position.x, 10_000)
    XCTAssertEqual(moved.player.position.z, 10_000, accuracy: 0.001)
  }

  func testPitchIsClampedBothWays() {
    var up = start()
    var down = start()
    for _ in 0..<600 {
      up = GameCore.step(up, intent: Intent(lookUp: 1), dt: 1.0 / 60.0, limits: limits)
      down = GameCore.step(down, intent: Intent(lookUp: -1), dt: 1.0 / 60.0, limits: limits)
    }

    XCTAssertEqual(up.player.pitch, limits.pitchLimit, accuracy: 1e-9)
    XCTAssertEqual(down.player.pitch, -limits.pitchLimit, accuracy: 1e-9)
  }

  func testHeadingStaysWithinOneTurn() {
    var state = start()
    for _ in 0..<2000 {
      state = GameCore.step(state, intent: Intent(turn: 1), dt: 1.0 / 60.0, limits: limits)
    }

    XCTAssertTrue((0..<(2 * Double.pi)).contains(state.player.heading))
  }

  func testWalkingIsHeldInsideTheWorld() {
    var state = start()
    state.player.position = SIMD3(10, 320, 10)
    state.player.heading = .pi  // toward decreasing Z
    for _ in 0..<600 {
      state = GameCore.step(state, intent: Intent(forward: 1), dt: 1.0 / 60.0, limits: limits)
    }

    XCTAssertGreaterThanOrEqual(state.player.position.z, 0)
    XCTAssertLessThanOrEqual(state.player.position.z, limits.groundExtent)
  }

  func testRunningIsFasterThanWalkingByTheMultiplier() {
    let walk = GameCore.step(start(), intent: Intent(forward: 1), dt: 1.0, limits: limits)
    let run = GameCore.step(start(), intent: Intent(forward: 1, running: true), dt: 1.0, limits: limits)

    XCTAssertEqual(
      run.player.position.z - 10_000,
      (walk.player.position.z - 10_000) * limits.runMultiplier,
      accuracy: 1
    )
  }

  func testEyeHeightIsHeldConstant() {
    var state = start()
    state.player.position.y = 999_999
    let settled = GameCore.step(state, intent: .idle, dt: 1.0 / 60.0, limits: limits)

    XCTAssertEqual(settled.player.position.y, limits.eyeHeight, accuracy: 1e-9)
  }

  func testDefaultEyeHeightMatchesTheReferenceOpeningHeight() {
    XCTAssertEqual(WalkLimits().eyeHeight, 128)
  }

  func testNonPositiveOrNonFiniteStepsAreIgnored() {
    let state = start()

    XCTAssertEqual(GameCore.step(state, intent: Intent(forward: 1), dt: 0), state)
    XCTAssertEqual(GameCore.step(state, intent: Intent(forward: 1), dt: -1), state)
    XCTAssertEqual(GameCore.step(state, intent: Intent(forward: 1), dt: .nan), state)
  }

  func testIntentAxesAreClampedOnConstruction() {
    let wild = Intent(forward: 12, strafe: -9, turn: .infinity, lookUp: .nan)

    XCTAssertEqual(wild.forward, 1)
    XCTAssertEqual(wild.strafe, -1)
    XCTAssertEqual(wild.turn, 0)
    XCTAssertEqual(wild.lookUp, 0)
  }

  func testAnOversizedIntentCannotOutrunTheSpeedLimit() {
    // Axes are clamped, so the fastest possible intent still walks at most
    // `walkSpeed * runMultiplier` in a second.
    let cheat = GameCore.step(start(), intent: Intent(forward: 50, strafe: 50, running: true), dt: 1.0, limits: limits)
    let dx = cheat.player.position.x - 10_000
    let dz = cheat.player.position.z - 10_000

    XCTAssertLessThanOrEqual((dx * dx + dz * dz).squareRoot(), limits.walkSpeed * limits.runMultiplier + 1)
  }
}
