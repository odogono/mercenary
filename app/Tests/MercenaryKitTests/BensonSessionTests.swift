import XCTest

@testable import MercenaryKit

/// The host loop: the clock, message pacing, and the effects an app acts on.
final class BensonSessionTests: XCTestCase {
  private func session(
    _ instructions: [BensonProgram.Instruction], tunables: BensonTunables? = nil
  ) -> BensonSession {
    var session = BensonSession(
      program: BensonProgram(instructions: instructions, entries: [0], decimalSeeds: [8: 9000]),
      text: BensonFixture.text,
      tunables: tunables
    )
    session.start(script: 0)
    return session
  }

  func testStartsFromTheOpeningBalance() {
    XCTAssertEqual(session([.ret]).credits, 9000)
  }

  func testAMessageRevealsOverTimeAndThenReleasesTheScript() {
    var session = session([
      .message([.init(kind: "literal", word: nil, text: "CRASH", slot: nil)]),
      .setFlags(mask: 0x01),
      .ret,
    ])

    session.advance(by: 1.0 / 60)
    XCTAssertEqual(session.messageText, "", "the line starts empty and fills")

    // At the reference rate these five characters take two and a half seconds.
    session.advance(by: 1.0)
    XCTAssertEqual(session.messageText, "CR")
    XCTAssertEqual(session.host.engineFlags & 0x01, 0, "the script waits for the line")

    session.advance(by: 2.0)
    XCTAssertEqual(session.messageText, "CRASH")
    XCTAssertEqual(session.host.engineFlags & 0x01, 0, "revealed, but still being read")

    session.advance(by: MessageTicker.referenceHold)
    XCTAssertEqual(session.host.engineFlags & 0x01, 0x01, "the hold expiring releases the script")
  }

  func testSkippingAMessageReleasesTheScriptImmediately() {
    var session = session([
      .message([.init(kind: "literal", word: nil, text: "CRASH LANDED ON TARG", slot: nil)]),
      .setFlags(mask: 0x01),
      .ret,
    ])
    session.advance(by: 1.0 / 60)

    session.skipMessage()
    session.advance(by: 1.0 / 60)

    XCTAssertEqual(session.messageText, "CRASH LANDED ON TARG")
    XCTAssertEqual(session.host.engineFlags & 0x01, 0x01)
  }

  func testTheWaitClockAdvancesFromRealTime() {
    // One tick per fifty frames at fifty frames a second: one tick a second.
    var session = session([.waitTicks(2, .init(branchOn: false, branch: .jump(0))), .setFlags(mask: 0x01), .ret])

    session.advance(by: 0.5)
    XCTAssertEqual(session.host.tickCounter, 0)
    session.advance(by: 0.6)
    XCTAssertEqual(session.host.tickCounter, 1)
    XCTAssertEqual(session.host.engineFlags & 0x01, 0, "still short of the second tick")

    session.advance(by: 1.0)
    XCTAssertEqual(session.host.tickCounter, 2)
    XCTAssertEqual(session.host.engineFlags & 0x01, 0x01)
  }

  func testTheTimeScaleShortensAWaitWithoutTouchingTheScript() {
    let instructions: [BensonProgram.Instruction] = [
      .waitTicks(2, .init(branchOn: false, branch: .jump(0))), .setFlags(mask: 0x01), .ret,
    ]
    var ordinary = session(instructions)
    var quick = session(instructions, tunables: BensonTunables(timeScale: 4))

    for _ in 0..<2 { ordinary.advance(by: 0.6) }
    for _ in 0..<2 { quick.advance(by: 0.6) }

    XCTAssertGreaterThan(quick.host.tickCounter, ordinary.host.tickCounter)
    XCTAssertEqual(quick.host.engineFlags & 0x01, 0x01, "the scaled clock has passed the wait")
    XCTAssertEqual(ordinary.host.engineFlags & 0x01, 0, "the unscaled one has not")
  }

  func testAPressedKeyRaisesTheFlagAndLatchesTheCode() {
    var session = session([.ret])

    session.press(nil)
    XCTAssertEqual(session.host.engineFlags & BensonHostState.inputDetected, BensonHostState.inputDetected)
    XCTAssertNil(session.host.pendingKey, "an unmatched key is presence only")

    session.press(.y)
    XCTAssertEqual(session.host.pendingKey, .y)
  }

  func testAnAcknowledgedKeyIsHandedToTheApp() {
    var session = session([
      .testKey(.y, .init(branchOn: false, branch: .jump(2))), .ret, .setFlags(mask: 0x01), .ret,
    ])
    session.press(.y)

    let effects = session.advance(by: 1.0 / 60)

    XCTAssertTrue(effects.contains(.keyAcknowledged))
  }

  func testAMessageIsHandledHereRatherThanPassedOn() {
    var session = session([.messageIndexed(.immediate(1)), .ret])

    let effects = session.advance(by: 1.0 / 60)

    XCTAssertTrue(effects.isEmpty, "the session owns the message line")
    XCTAssertFalse(session.isMessageComplete, "the line is mid-reveal, not handed off")
    XCTAssertTrue(session.host.messagePlaying)
  }

  func testASoundIsPassedOnForTheAppToIgnoreOrPlay() {
    var session = session([.sound(symbol: "voice1.control", value: 33), .ret])

    let effects = session.advance(by: 1.0 / 60)

    XCTAssertTrue(effects.contains(.sound(symbol: "voice1.control", value: 33)))
  }

  func testARetimedLineChangesTheRateOfLaterMessages() {
    var session = session([
      .write(.messageInterval, value: BensonHostState.defaultMessageInterval * 2),
      .message([.init(kind: "literal", word: nil, text: "SLOWLY", slot: nil)]),
      .ret,
    ])

    session.advance(by: 1.0 / 60)

    let rate = try? XCTUnwrap(session.ticker).charactersPerSecond
    XCTAssertEqual(rate ?? 0, MessageTicker.referenceRate / 2, accuracy: 0.0001)
  }

  func testTheOpeningShapeRunsThroughToItsParkedState() {
    // Crash, offer, purchase, then wait for the player to board — the opening
    // script's own shape, driven only by elapsed time and one keypress.
    var session = session([
      .message([.init(kind: "literal", word: nil, text: "CRASH", slot: nil)]),
      .messageIndexed(.immediate(1)),
      .testKey(.y, .init(branchOn: false, branch: .jump(4))),
      .jump(2),
      .addDecimal(decimal: 8, value: 99_995_000),
      .testCraft(craft: 1, .init(branchOn: false, branch: .jump(7))),
      .jump(5),
      .clearFlags(mask: BensonHostState.scriptRunning),
    ])

    // Let both messages reveal and be held.
    for _ in 0..<900 { session.advance(by: 1.0 / 60) }
    XCTAssertEqual(session.messageText, "MESSAGE 9000", "the balance is read when the line starts")
    XCTAssertEqual(session.credits, 9000)

    session.press(.y)
    session.advance(by: 1.0 / 60)
    XCTAssertEqual(session.credits, 4000, "buying the craft costs five thousand")

    // Parked on the craft test, and still responsive.
    XCTAssertTrue(session.isRunning)
    for _ in 0..<60 { session.advance(by: 1.0 / 60) }
    XCTAssertTrue(session.isRunning)

    session.board(craft: 1)
    session.advance(by: 1.0 / 60)
    XCTAssertFalse(session.isRunning, "boarding the craft finishes the opening")
  }
}
