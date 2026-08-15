import XCTest

@testable import MercenaryKit

/// Craft parameters built in code rather than read from a payload, so these tests
/// state the dynamics they are checking instead of depending on an export.
enum FlightFixture {
  static func block(
    index: Int,
    handler: Payload.FlightDocument.Block.Handler = .standard,
    mode: String? = nil,
    yawDamping: Double = 0.9375,
    yawAuthority: Double = 1,
    pitchStep: Int = 8,
    rollCoupling: Double = 4,
    liftFactor: Double = 0.5,
    speedDamping: Double = 0.5,
    ceiling: Int = 10,
    throttleGain: Double = 0.390625
  ) -> Payload.FlightDocument.Block {
    Payload.FlightDocument.Block(
      index: index, handler: handler, mode: mode, yawDamping: yawDamping,
      yawAuthority: yawAuthority, pitchStep: pitchStep, rollCoupling: rollCoupling,
      liftFactor: liftFactor, speedDamping: speedDamping, ceiling: ceiling,
      throttleGain: throttleGain, tumble: nil
    )
  }

  /// The rules as our own ROM decodes them, so the thresholds under test are real.
  static var rules: Payload.FlightDocument.Rules {
    Payload.FlightDocument.Rules(
      angleUnitsPerTurn: 1024,
      levelPitch: 512,
      groundAltitude: 63,
      groundBand: 64,
      takeoffSpeed: 128,
      crashDescentRate: 256,
      crashPitch: 640,
      ceilingClimbScale: 9.313225746154785e-10,
      ceilingUnit: 65536,
      throttleNotches: (0..<10).map { pow(2, Double(5 + $0)) },
      throttleLimit: 32768,
      poweramp: Payload.FlightDocument.Rules.Poweramp(craft: 1, throttleScale: 2, ceiling: 90),
      walkingBlock: 8
    )
  }

  /// Eight craft then walking, as the Reference Build's table is laid out. Walking
  /// damps its yaw almost to nothing, which is why it turns and stops at once.
  static func model(limits: ControlLimits = ControlLimits()) -> FlightModel {
    var blocks = (0..<8).map { block(index: $0) }
    blocks[2] = block(index: 2, handler: .sinking, pitchStep: 0)
    blocks.append(
      block(
        index: 8, handler: .standard, mode: "grounded", yawDamping: 1.52587890625e-05,
        yawAuthority: 16, pitchStep: 1, liftFactor: 1, speedDamping: 0.25, ceiling: 0,
        throttleGain: 1
      )
    )
    return FlightModel(
      document: Payload.FlightDocument(
        schemaVersion: Payload.supportedFlightSchemaVersion, blocks: blocks,
        // The Reference Build's own on-foot step and turn, per frame.
        walk: Payload.FlightDocument.Walk(step: 80, turnStep: 16),
        rules: rules, counts: [:]
      ),
      limits: limits
    )
  }
}

final class GameCoreTests: XCTestCase {
  private let flight = FlightFixture.model()

  private func start() -> GameState {
    GameState(player: PlayerState(position: SIMD3(10_000, 63, 10_000)))
  }

  /// Boarded, airborne, and moving — the state most flight rules apply to.
  private func flying(craft: Int = 1, altitude: Double = 20_000, notch: Int = 10) -> GameState {
    var state = start()
    state.craft = craft
    state.mode = .flying
    state.player.position.y = altitude
    return GameCore.throttle(state, notch: notch, rules: flight.rules)
  }

  // MARK: - Properties that hold whatever the block

  func testSameInputsProduceTheSameState() {
    let intent = Intent(turn: 0.25, pitch: 0.5, walk: 1, running: true)
    var first = start()
    var second = start()
    for _ in 0..<120 {
      first = GameCore.step(first, intent: intent, dt: 1.0 / 60.0, flight: flight)
      second = GameCore.step(second, intent: intent, dt: 1.0 / 60.0, flight: flight)
    }

    XCTAssertEqual(first, second)
  }

  func testALongFrameIsBrokenIntoBoundedSteps() {
    let stalled = GameCore.step(start(), intent: Intent(walk: 1), dt: 1.0, flight: flight)

    XCTAssertEqual(stalled.elapsed, 1.0, accuracy: 1e-9)
    XCTAssertGreaterThan(stalled.player.position.z, 10_000)
  }

  func testNonPositiveOrNonFiniteStepsAreIgnored() {
    let state = start()

    XCTAssertEqual(GameCore.step(state, intent: Intent(walk: 1), dt: 0, flight: flight), state)
    XCTAssertEqual(GameCore.step(state, intent: Intent(walk: 1), dt: -1, flight: flight), state)
    XCTAssertEqual(GameCore.step(state, intent: Intent(walk: 1), dt: .nan, flight: flight), state)
  }

  func testIntentAxesAreClampedOnConstruction() {
    let wild = Intent(turn: .infinity, pitch: .nan, walk: 12)

    XCTAssertEqual(wild.turn, 0)
    XCTAssertEqual(wild.pitch, 0)
    XCTAssertEqual(wild.walk, 1)
  }

  func testHeadingStaysWithinOneTurn() {
    var state = flying()
    for _ in 0..<2000 {
      state = GameCore.step(state, intent: Intent(turn: 1), dt: 1.0 / 60.0, flight: flight)
    }

    XCTAssertTrue((0..<(2 * Double.pi)).contains(state.player.heading))
  }

  func testMovementIsHeldInsideTheWorld() {
    var state = start()
    state.player.position = SIMD3(10, 63, 10)
    state.player.heading = .pi  // toward decreasing Z
    for _ in 0..<600 {
      state = GameCore.step(state, intent: Intent(walk: 1), dt: 1.0 / 60.0, flight: flight)
    }

    XCTAssertGreaterThanOrEqual(state.player.position.z, 0)
    XCTAssertLessThanOrEqual(state.player.position.z, flight.limits.groundExtent)
  }

  func testHeadingZeroTravelsTowardIncreasingZ() {
    let moved = GameCore.step(start(), intent: Intent(walk: 1), dt: 0.5, flight: flight)

    XCTAssertEqual(moved.player.position.x, 10_000, accuracy: 0.001)
    XCTAssertGreaterThan(moved.player.position.z, 10_000)
  }

  func testAQuarterTurnTravelsTowardIncreasingX() {
    var state = start()
    state.player.heading = .pi / 2
    let moved = GameCore.step(state, intent: Intent(walk: 1), dt: 0.5, flight: flight)

    XCTAssertGreaterThan(moved.player.position.x, 10_000)
    XCTAssertEqual(moved.player.position.z, 10_000, accuracy: 0.001)
  }

  // MARK: - The two filters

  func testTheFilterLandsOnTheReferenceRecurrenceAfterAWholeFrame() {
    // Solving the filter rather than iterating it has to agree with the original
    // at its own rate: one frame of `velocity * damping + authority`.
    let damping = 0.9375
    let authority = 1.0
    let target = ControlLoop.yawFixedPoint(authority: authority, damping: damping)
    var iterated = 0.0
    for _ in 0..<40 { iterated = iterated * damping + authority }
    let solved = ControlLoop.settle(0, toward: target, damping: damping, over: 40)

    XCTAssertEqual(solved, iterated, accuracy: 1e-9)
  }

  func testYawDampsThenTakesItsInputAndSpeedDoesTheOpposite() {
    // The two filters are not the same shape, which is the whole reason the
    // fixed points differ: authority / (1 - d) against throttle * g * d / (1 - d).
    XCTAssertEqual(ControlLoop.yawFixedPoint(authority: 1, damping: 0.9375), 16, accuracy: 1e-9)
    XCTAssertEqual(
      ControlLoop.speedFixedPoint(throttle: 16_384, gain: 0.390625, damping: 0.5),
      6_400, accuracy: 1e-9
    )
  }

  func testYawVelocityBuildsAndThenDecaysRatherThanStoppingDead() {
    var state = flying()
    for _ in 0..<60 {
      state = GameCore.step(state, intent: Intent(turn: 1), dt: 1.0 / 60.0, flight: flight)
    }
    let turning = state.player.yawVelocity
    XCTAssertGreaterThan(turning, 0)

    // Let go: a craft keeps turning for a while, which is the damping at work.
    state = GameCore.step(state, intent: .idle, dt: 1.0 / 60.0, flight: flight)
    XCTAssertLessThan(state.player.yawVelocity, turning)
    XCTAssertGreaterThan(state.player.yawVelocity, 0)
  }

  func testWalkingStopsTurningWithinOneFrameBecauseItsDampingIsAlmostZero() {
    var state = start()
    for _ in 0..<30 {
      state = GameCore.step(state, intent: Intent(turn: 1), dt: 1.0 / 60.0, flight: flight)
    }
    // One whole reference frame is the original's own step, and by the end of it
    // walking has shed effectively all of its turn. A craft would still be turning.
    let frame = 1 / flight.limits.referenceFrameRate
    let released = GameCore.step(state, intent: .idle, dt: frame, flight: flight)

    XCTAssertEqual(released.player.yawVelocity, 0, accuracy: 1e-3)
  }

  func testAWalkerCannotTakeOffHoweverFastTheyAreMoving() {
    // The take-off gate is a speed, and walking can exceed it, so being in a craft
    // has to be a condition of leaving the ground in its own right.
    var state = start()
    for _ in 0..<600 {
      state = GameCore.step(state, intent: Intent(pitch: 1, walk: 1, running: true), dt: 1.0 / 60.0, flight: flight)
    }

    XCTAssertEqual(state.mode, .grounded)
    XCTAssertEqual(state.player.position.y, Double(flight.rules.groundAltitude), accuracy: 1e-9)
  }

  func testTurningRightIsTurningLeftNegated() {
    let left = GameCore.step(flying(), intent: Intent(turn: -1), dt: 0.5, flight: flight)
    let right = GameCore.step(flying(), intent: Intent(turn: 1), dt: 0.5, flight: flight)

    XCTAssertEqual(left.player.yawVelocity, -right.player.yawVelocity, accuracy: 1e-12)
  }

  func testSpeedSettlesOnTheThrottlesFixedPoint() {
    var state = flying(notch: 10)
    for _ in 0..<600 {
      state = GameCore.step(state, intent: .idle, dt: 1.0 / 60.0, flight: flight)
    }
    let block = flight.block(for: state)

    XCTAssertEqual(
      state.player.speed,
      ControlLoop.speedFixedPoint(
        throttle: state.throttle, gain: block.throttleGain, damping: block.speedDamping
      ),
      accuracy: 1e-6
    )
  }

  // MARK: - Throttle

  func testDigitNotchesSetAbsoluteThrottleAndAreEachADoubling() {
    let rules = flight.rules
    let low = GameCore.throttle(start(), notch: 1, rules: rules)
    let next = GameCore.throttle(start(), notch: 2, rules: rules)

    XCTAssertEqual(low.throttle, 32)
    XCTAssertEqual(next.throttle, 64)
    XCTAssertEqual(GameCore.throttle(start(), notch: 10, rules: rules).throttle, 16_384)
  }

  func testAnOutOfRangeNotchIsRefusedRatherThanClamped() {
    let state = GameCore.throttle(start(), notch: 1, rules: flight.rules)

    XCTAssertEqual(GameCore.throttle(state, notch: 0, rules: flight.rules), state)
    XCTAssertEqual(GameCore.throttle(state, notch: 99, rules: flight.rules), state)
  }

  func testRelativeThrottleDoublesAndHalvesAndStopsAtTheEngineLimit() {
    var state = GameCore.throttle(start(), notch: 8, rules: flight.rules)
    XCTAssertEqual(state.throttle, 4_096)
    state = GameCore.throttle(state, step: 1, rules: flight.rules)
    XCTAssertEqual(state.throttle, 8_192)

    // The top notch is the last one below the limit, so doubling it is refused
    // outright rather than clamped — the Reference Build left the value alone.
    let top = GameCore.throttle(start(), notch: 10, rules: flight.rules)
    XCTAssertEqual(GameCore.throttle(top, step: 1, rules: flight.rules).throttle, top.throttle)

    XCTAssertEqual(GameCore.throttle(state, step: -1, rules: flight.rules).throttle, 4_096)
  }

  func testTheThrottleFallsAwayToNothingBelowTheLowestNotch() {
    var state = GameCore.throttle(start(), notch: 1, rules: flight.rules)
    state = GameCore.throttle(state, step: -1, rules: flight.rules)

    XCTAssertEqual(state.throttle, 0)
  }

  func testThePowerampDoublesTheThrottleForOneCraftOnly() {
    let rules = flight.rules
    var dart = flying(craft: rules.poweramp.craft)
    dart.poweramp = true
    var other = flying(craft: 3)
    other.poweramp = true

    XCTAssertEqual(
      flight.effectiveThrottle(for: dart, intent: .idle), dart.throttle * rules.poweramp.throttleScale
    )
    XCTAssertEqual(flight.effectiveThrottle(for: other, intent: .idle), other.throttle)
  }

  // MARK: - Take-off, ceiling, landing

  func testACraftCannotLeaveTheGroundBelowTheTakeoffSpeed() {
    // Nose up on an idle throttle: the vertical step is skipped entirely, so the
    // craft stays put and cannot even be pitched.
    var state = start()
    state.craft = 1
    for _ in 0..<120 {
      state = GameCore.step(state, intent: Intent(pitch: 1), dt: 1.0 / 60.0, flight: flight)
    }

    XCTAssertEqual(state.mode, .grounded)
    XCTAssertEqual(state.player.pitch, 0, accuracy: 1e-12)
    XCTAssertLessThan(state.player.position.y, Double(flight.rules.groundBand))
  }

  func testATakeoffRunFollowedByPitchLeavesTheGround() {
    var state = GameCore.throttle({ var s = start(); s.craft = 1; return s }(), notch: 10, rules: flight.rules)
    // Build speed first, which is what the take-off gate is.
    for _ in 0..<60 {
      state = GameCore.step(state, intent: .idle, dt: 1.0 / 60.0, flight: flight)
    }
    XCTAssertGreaterThanOrEqual(state.player.speed, flight.rules.takeoffSpeed)

    for _ in 0..<120 {
      state = GameCore.step(state, intent: Intent(pitch: 1), dt: 1.0 / 60.0, flight: flight)
    }

    XCTAssertEqual(state.mode, .flying)
    XCTAssertGreaterThan(state.player.position.y, Double(flight.rules.groundBand))
  }

  func testTheCeilingStopsTheClimbWithoutStoppingTheCraft() {
    let ceiling = Double(flight.block(for: flying()).ceiling * flight.rules.ceilingUnit)
    var state = flying(altitude: ceiling + 1)
    for _ in 0..<120 {
      state = GameCore.step(state, intent: Intent(pitch: 1), dt: 1.0 / 60.0, flight: flight)
    }

    XCTAssertEqual(state.player.position.y, ceiling + 1, accuracy: 1)
    XCTAssertGreaterThan(state.player.speed, 0)
  }

  func testThePowerampRaisesTheCeilingForTheCraftItBelongsTo() {
    var dart = flying(craft: flight.rules.poweramp.craft)
    let block = flight.block(for: dart)
    XCTAssertEqual(flight.ceiling(for: dart, block: block), Double(block.ceiling))

    dart.poweramp = true
    XCTAssertEqual(flight.ceiling(for: dart, block: block), Double(flight.rules.poweramp.ceiling))
  }

  func testAGentleTouchdownLandsAndSnapsToTheGround() {
    var state = flying(altitude: Double(flight.rules.groundBand) + 4, notch: 4)
    state.player.pitch = -0.02
    var landed: Touchdown?
    for _ in 0..<600 where landed == nil {
      state = GameCore.step(state, intent: .idle, dt: 1.0 / 60.0, flight: flight)
      landed = state.touchdown
    }

    XCTAssertEqual(landed, .landed)
    XCTAssertEqual(state.mode, .grounded)
    XCTAssertEqual(state.player.position.y, Double(flight.rules.groundAltitude), accuracy: 1e-9)
    XCTAssertEqual(state.player.roll, 0)
  }

  func testDivingIntoTheGroundIsACrash() {
    var state = flying(altitude: Double(flight.rules.groundBand) + 2_000, notch: 10)
    state.player.pitch = -1.2  // well past the pitch the loop tolerates
    var verdict: Touchdown?
    for _ in 0..<600 where verdict == nil {
      state = GameCore.step(state, intent: .idle, dt: 1.0 / 60.0, flight: flight)
      verdict = state.touchdown
    }

    XCTAssertEqual(verdict, .crashed)
  }

  func testTouchdownIsReportedOnceRatherThanEveryFrameAfterward() {
    var state = flying(altitude: Double(flight.rules.groundBand) + 4, notch: 4)
    state.player.pitch = -0.02
    while state.touchdown == nil {
      state = GameCore.step(state, intent: .idle, dt: 1.0 / 60.0, flight: flight)
    }
    let after = GameCore.step(state, intent: .idle, dt: 1.0 / 60.0, flight: flight)

    XCTAssertNil(after.touchdown)
  }

  func testTheReferenceBuildsPitchTestsAreWrittenAroundLevelBeingHalfATurn() {
    let rules = flight.rules
    XCTAssertEqual(GameCore.rawPitch(0, rules: rules), 512, accuracy: 1e-9)
    // Nose down raises the raw value toward the crash threshold; nose up lowers it,
    // which is why the loop lets a nose-high landing through.
    XCTAssertGreaterThan(GameCore.rawPitch(-0.8, rules: rules), Double(rules.crashPitch))
    XCTAssertLessThan(GameCore.rawPitch(0.8, rules: rules), Double(rules.crashPitch))
  }

  // MARK: - Modes and blocks

  func testTheBlockAfterTheCraftIsTheOneALandedCraftTaxisOn() {
    // It is not the on-foot walk, which never reaches the control loop; touchdown
    // installs this so a craft on the ground handles differently from one in the air.
    let grounded = flight.document.block(craft: flight.rules.walkingBlock)

    XCTAssertEqual(grounded.mode, "grounded")
    XCTAssertEqual(grounded.handler, .standard)
  }

  func testBoardingTakesTheCraftsPositionAndHeadingAndItsBlock() {
    let boarded = GameCore.board(
      start(), craft: 3, at: SIMD3(50_000, 0, 60_000), heading: 1.25, flight: flight
    )

    XCTAssertEqual(boarded.craft, 3)
    XCTAssertEqual(flight.block(for: boarded).index, 3)
    XCTAssertEqual(boarded.player.position.x, 50_000)
    XCTAssertEqual(boarded.player.position.z, 60_000)
    XCTAssertEqual(boarded.player.heading, 1.25)
    XCTAssertEqual(boarded.throttle, 0)
    XCTAssertEqual(boarded.mode, .grounded)
  }

  func testLeavingPutsThePlayerBackOnTheWalkingBlockAtGroundLevel() {
    var state = flying()
    state.player.roll = 0.4
    let out = GameCore.leave(state, flight: flight)

    XCTAssertNil(out.craft)
    XCTAssertNil(out.craft)
    XCTAssertEqual(out.player.position.y, Double(flight.rules.groundAltitude), accuracy: 1e-9)
    XCTAssertEqual(out.player.roll, 0)
    XCTAssertEqual(out.mode, .grounded)
  }

  func testACraftBanksIntoItsTurnButAWalkerNeverRolls() {
    var flyer = flying()
    var walker = start()
    for _ in 0..<60 {
      flyer = GameCore.step(flyer, intent: Intent(turn: 1), dt: 1.0 / 60.0, flight: flight)
      walker = GameCore.step(walker, intent: Intent(turn: 1), dt: 1.0 / 60.0, flight: flight)
    }

    XCTAssertNotEqual(flyer.player.roll, 0)
    XCTAssertEqual(walker.player.roll, 0)
  }

  func testTheSinkingCraftCannotBePitchedAndLosesHeight() {
    var state = flying(craft: 2, altitude: 500_000, notch: 10)
    let start = state.player.position.y
    for _ in 0..<60 {
      state = GameCore.step(state, intent: Intent(pitch: 1), dt: 1.0 / 60.0, flight: flight)
    }

    XCTAssertEqual(state.player.pitch, 0, accuracy: 1e-12)
    XCTAssertLessThan(state.player.position.y, start)
  }

  func testOnFootTheAltitudeIsHeldAtTheGroundValue() {
    var state = start()
    state.player.position.y = 999_999
    let settled = GameCore.step(state, intent: .idle, dt: 1.0 / 60.0, flight: flight)

    XCTAssertEqual(settled.player.position.y, Double(flight.rules.groundAltitude), accuracy: 1e-9)
  }

  func testTheGroundAltitudeCanBeOverriddenForFeelWithoutTouchingTheDecode() {
    let raised = FlightFixture.model(limits: ControlLimits(groundAltitude: 128))
    let state = GameCore.step(start(), intent: .idle, dt: 1.0 / 60.0, flight: raised)

    XCTAssertEqual(state.player.position.y, 128, accuracy: 1e-9)
  }

  func testTheReferenceFrameRateSetsThePaceOfEverything() {
    let quick = FlightFixture.model(limits: ControlLimits(referenceFrameRate: 10))
    let slow = FlightFixture.model(limits: ControlLimits(referenceFrameRate: 5))
    let fast = GameCore.step(flying(), intent: Intent(turn: 1), dt: 0.1, flight: quick)
    let steady = GameCore.step(flying(), intent: Intent(turn: 1), dt: 0.1, flight: slow)

    XCTAssertGreaterThan(fast.player.yawVelocity, steady.player.yawVelocity)
  }

  // MARK: - The throttle ladder's window

  func testTheThrottleKeysStartWhereTheWindowSaysAndStopAtTheTop() {
    // The decoded ladder spans 512 to 1, so its bottom rungs are imperceptible
    // whatever the overall speed. The window maps keys to notches and leaves the
    // ladder alone; the top rungs are shared rather than run off the end.
    let windowed = FlightFixture.model(limits: ControlLimits(throttleFloorNotch: 3))

    XCTAssertEqual(windowed.notch(forKey: 1), 3)
    XCTAssertEqual(windowed.notch(forKey: 2), 4)
    XCTAssertEqual(windowed.notch(forKey: 8), 10)
    XCTAssertEqual(windowed.notch(forKey: 10), 10)
  }

  func testAnUnwindowedLadderMapsKeysStraightOntoNotches() {
    let plain = FlightFixture.model(limits: ControlLimits(throttleFloorNotch: 1))

    for key in 1...10 {
      XCTAssertEqual(plain.notch(forKey: key), key)
    }
  }

  func testTheWindowNeverSelectsANotchOffTheLadder() {
    let silly = FlightFixture.model(limits: ControlLimits(throttleFloorNotch: 99))
    let ladder = silly.rules.throttleNotches.count

    XCTAssertEqual(silly.notch(forKey: 1), ladder)
    XCTAssertEqual(FlightFixture.model(limits: ControlLimits(throttleFloorNotch: -5)).notch(forKey: 1), 1)
  }

  func testTheTurnBuildsFourTimesFasterAtFourTimesTheFrameRate() {
    // The frame rate is the knob that fixes both the rate a craft turns at and the
    // lag before it gets there, which a scale alone would leave alone.
    let slow = FlightFixture.model(limits: ControlLimits(referenceFrameRate: 5))
    let quick = FlightFixture.model(limits: ControlLimits(referenceFrameRate: 20))
    func turned(_ flight: FlightModel, after seconds: Double) -> Double {
      var state = flying()
      var elapsed = 0.0
      while elapsed < seconds {
        state = GameCore.step(state, intent: Intent(turn: 1), dt: 1.0 / 60.0, flight: flight)
        elapsed += 1.0 / 60.0
      }
      return state.player.yawVelocity
    }

    XCTAssertGreaterThan(turned(quick, after: 0.5), turned(slow, after: 0.5) * 2)
  }

  // MARK: - The on-foot mover

  func testOnFootTheStepIsFixedAndArrivesAtOnce() {
    // `MOVE` dispatches out of a craft to its own routine: a fixed step and a
    // fixed turn, with no velocity to build and none to shed (ADR 0016).
    let frame = 1 / flight.limits.referenceFrameRate
    let moved = GameCore.step(start(), intent: Intent(walk: 1), dt: frame, flight: flight)

    XCTAssertEqual(moved.player.position.z - 10_000, 80, accuracy: 1e-9)
    XCTAssertEqual(moved.player.speed, 80, accuracy: 1e-9)
  }

  func testOnFootTheTurnIsFixedTooAndLeavesNoVelocityBehind() {
    let frame = 1 / flight.limits.referenceFrameRate
    var state = GameCore.step(start(), intent: Intent(turn: 1), dt: frame, flight: flight)

    XCTAssertEqual(state.player.heading, 16 * flight.radiansPerUnit, accuracy: 1e-9)
    XCTAssertEqual(state.player.yawVelocity, 0)

    // Letting go stops the turn dead, because there was never a velocity.
    state = GameCore.step(state, intent: .idle, dt: frame, flight: flight)
    XCTAssertEqual(state.player.heading, 16 * flight.radiansPerUnit, accuracy: 1e-9)
  }

  func testWalkingBackwardsIsTheStepNegated() {
    let frame = 1 / flight.limits.referenceFrameRate
    let forward = GameCore.step(start(), intent: Intent(walk: 1), dt: frame, flight: flight)
    let back = GameCore.step(start(), intent: Intent(walk: -1), dt: frame, flight: flight)

    XCTAssertEqual(
      forward.player.position.z - 10_000, -(back.player.position.z - 10_000), accuracy: 1e-9
    )
  }

  func testTheOnFootRoutineHasNoVerticalTermAtAll() {
    // Which is the real reason a walker can never leave the ground: the routine
    // this comes from does not touch altitude, whatever the pitch or the speed.
    var state = start()
    for _ in 0..<600 {
      state = GameCore.step(
        state, intent: Intent(pitch: 1, walk: 1, running: true), dt: 1.0 / 60.0, flight: flight
      )
    }

    XCTAssertEqual(state.player.position.y, Double(flight.rules.groundAltitude), accuracy: 1e-9)
    XCTAssertEqual(state.mode, .grounded)
    XCTAssertEqual(state.player.pitch, 0)
  }

  func testRunningMultipliesTheDecodedStepRatherThanChangingIt() {
    // The Reference Build had no run, so this is a Mac Adaptation on a decoded step.
    let frame = 1 / flight.limits.referenceFrameRate
    let walked = GameCore.step(start(), intent: Intent(walk: 1), dt: frame, flight: flight)
    let ran = GameCore.step(
      start(), intent: Intent(walk: 1, running: true), dt: frame, flight: flight
    )

    XCTAssertEqual(
      ran.player.position.z - 10_000,
      (walked.player.position.z - 10_000) * flight.limits.runMultiplier,
      accuracy: 1e-9
    )
  }

  func testSteppingOutOfACraftLeavesNoneOfItsDynamicsBehind() {
    var state = flying()
    state.player.roll = 0.4
    state.player.yawVelocity = 12
    let out = GameCore.step(
      GameCore.leave(state, flight: flight), intent: .idle, dt: 1.0 / 60.0, flight: flight
    )

    XCTAssertEqual(out.player.yawVelocity, 0)
    XCTAssertEqual(out.player.roll, 0)
    XCTAssertEqual(out.player.pitch, 0)
  }

  // MARK: - Going underground

  private static let lift = Payload.UndergroundDocument.Lift(
    ascendRate: 38, descendRate: 6, surfaceAt: 12, submergeAt: 8,
    surfaceMiddle: 113, submergeMiddle: 8, floor: 128, altitudeWrap: 6,
    altitudeWrapSubtract: 7
  )
  private static let entrance = Payload.UndergroundDocument.Entrance(
    site: 1, cell: [9, 6], room: 1
  )

  func testTakingTheLiftDownPutsThePlayerInTheRoomTheSiteNames() {
    let inside = GameCore.enter(
      start(), entrance: Self.entrance, lift: Self.lift, flight: flight
    )

    XCTAssertEqual(inside.room, 1)
    XCTAssertNil(inside.craft)
    XCTAssertEqual(inside.mode, .grounded)
    // Room coordinates are the room's own, so arrival is at the lift's middle.
    XCTAssertEqual(inside.player.position.x, Double(8 << 8))
    XCTAssertEqual(inside.player.position.z, Double(8 << 8))
  }

  func testTakingTheLiftUpPutsThePlayerOnTheCellItServes() {
    let inside = GameCore.enter(start(), entrance: Self.entrance, lift: Self.lift, flight: flight)
    let outside = GameCore.surface(
      inside, entrance: Self.entrance, lift: Self.lift, cellSize: 65_536, flight: flight
    )

    XCTAssertNil(outside.room)
    XCTAssertEqual(outside.player.position.x, 9 * 65_536 + Double(113 << 8))
    XCTAssertEqual(outside.player.position.z, 6 * 65_536 + Double(113 << 8))
  }

  func testUndergroundThePlayerMovesByTheOnFootRoutineWhateverTheyAreIn() {
    // The Reference Build consults the underground flag before anything else, so a
    // craft underground still moves on foot. Ours cannot get one down there, but the
    // dispatch has to agree with the original's all the same.
    var inside = GameCore.enter(start(), entrance: Self.entrance, lift: Self.lift, flight: flight)
    inside.craft = 1
    let frame = 1 / flight.limits.referenceFrameRate
    let moved = GameCore.step(inside, intent: Intent(walk: 1), dt: frame, flight: flight)

    XCTAssertEqual(moved.player.position.z - Double(8 << 8), 80, accuracy: 1e-9)
    XCTAssertEqual(moved.player.speed, 80, accuracy: 1e-9)
  }

  func testEnteringACraftlessRoomClearsWhateverTheCraftWasDoing() {
    var flying = self.flying()
    flying.player.roll = 0.3
    let inside = GameCore.enter(
      flying, entrance: Self.entrance, lift: Self.lift, flight: flight
    )

    XCTAssertNil(inside.craft)
    XCTAssertEqual(inside.throttle, 0)
    XCTAssertEqual(inside.player.roll, 0)
    XCTAssertEqual(inside.player.speed, 0)
  }
}
