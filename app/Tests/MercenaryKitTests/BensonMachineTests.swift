import XCTest

@testable import MercenaryKit

/// The interpreter is exercised against hand-written programs rather than the
/// payload, so each rule is pinned by the smallest script that shows it.
final class BensonMachineTests: XCTestCase {
  private let text = BensonFixture.text

  private func program(_ instructions: [BensonProgram.Instruction]) -> BensonProgram {
    BensonProgram(instructions: instructions, entries: [0])
  }

  private func running(
    _ instructions: [BensonProgram.Instruction],
    host: BensonHostState = .init(),
    state: BensonState = .init(),
    tunables: BensonTunables = .init(),
    observer: BensonObserver? = nil
  ) -> BensonMachine.Advance {
    let program = program(instructions)
    guard let started = BensonMachine.start(script: 0, of: program, state: state, host: host) else {
      XCTFail("a fresh host should let a script start")
      return .init(state: state, host: host, effects: [], executed: 0)
    }
    return BensonMachine.run(
      started.state, host: started.host, program: program, text: text, tunables: tunables,
      observer: observer
    )
  }

  // MARK: - Script lifecycle

  func testStartingAScriptMarksItRunningAndEntersIt() throws {
    let program = program([.ret])
    let started = BensonMachine.start(script: 0, of: program, state: .init(), host: .init())

    XCTAssertEqual(started?.state.pc, 0)
    XCTAssertTrue(started?.host.isScriptRunning == true)
  }

  func testOnlyOneScriptRunsAtATime() throws {
    let program = program([.ret])
    let first = BensonMachine.start(script: 0, of: program, state: .init(), host: .init())!

    XCTAssertNil(BensonMachine.start(script: 0, of: program, state: first.state, host: first.host))
  }

  func testClearingTheRunningFlagDoesNotStopTheScript() throws {
    // The Reference Build's step loop never consulted this flag — only its start
    // did — so clearing it says "I may be interrupted now", not "I am done".
    // Boarding the Dart runs on past its own clear into the craft's description.
    let advance = running([
      .clearFlags(mask: BensonHostState.scriptRunning),
      .setFlags(mask: 0x01),
      .ret,
    ])

    XCTAssertEqual(advance.host.engineFlags & 0x01, 0x01, "the script kept running")
    XCTAssertFalse(advance.host.isScriptRunning)
  }

  func testAClearedRunningFlagLetsAnotherScriptStart() throws {
    let advance = running([.clearFlags(mask: BensonHostState.scriptRunning), .testRandom(value: 0, .init(branchOn: false, branch: .jump(0)))])

    XCTAssertNotNil(
      BensonMachine.start(script: 0, of: program([.ret]), state: advance.state, host: advance.host)
    )
  }

  func testAScriptEndsAtAReturnWithNothingToReturnTo() throws {
    let advance = running([.clearFlags(mask: BensonHostState.scriptRunning), .ret])

    XCTAssertNil(advance.state.pc)
    XCTAssertEqual(advance.effects, [.scriptFinished])
  }

  func testAnOutermostReturnLeavesTheInterpreterIdle() throws {
    let advance = running([.ret])

    XCTAssertNil(advance.state.pc)
    XCTAssertEqual(advance.effects, [.scriptFinished])
  }

  func testACallReturnsToTheFollowingInstruction() throws {
    let advance = running([
      .call(2),
      .clearFlags(mask: BensonHostState.scriptRunning),
      .setFlags(mask: 0x01),
      .ret,
    ])

    XCTAssertEqual(advance.host.engineFlags & 0x01, 0x01)
    XCTAssertEqual(advance.effects, [.scriptFinished])
  }

  // MARK: - Flags

  func testFlagBitsAreSharedWithTheHost() throws {
    // The host sets the input bit; the script tests it and clears it, all in the
    // one byte the Reference Build shared.
    let advance = running(
      [
        .testFlags(mask: BensonHostState.inputDetected, .init(branchOn: false, branch: .jump(2))),
        .clearFlags(mask: BensonHostState.scriptRunning),
        .clearFlags(mask: BensonHostState.inputDetected),
        .clearFlags(mask: BensonHostState.scriptRunning),
      ],
      host: .init(engineFlags: BensonHostState.inputDetected)
    )

    XCTAssertEqual(advance.host.engineFlags & BensonHostState.inputDetected, 0)
  }

  func testAFlagTestReportsAnUnsetMaskAsItsAnswer() throws {
    // The handler answered "no bits set", so a script wanting "bits set" branches
    // on false — the shape every real script uses.
    let taken = running(
      [.testFlags(mask: 0x01, .init(branchOn: false, branch: .jump(2))), .ret, .setFlags(mask: 0x02), .ret],
      host: .init(engineFlags: 0x01)
    )
    XCTAssertEqual(taken.host.engineFlags & 0x02, 0x02)

    let notTaken = running(
      [.testFlags(mask: 0x01, .init(branchOn: false, branch: .jump(2))), .ret, .setFlags(mask: 0x02), .ret]
    )
    XCTAssertEqual(notTaken.host.engineFlags & 0x02, 0)
  }

  // MARK: - Keys

  func testAMatchedKeyIsConsumedAndAcknowledged() throws {
    let advance = running(
      [.testKey(.y, .init(branchOn: false, branch: .jump(2))), .ret, .setFlags(mask: 0x01), .ret],
      host: .init(pendingKey: .y)
    )

    XCTAssertNil(advance.host.pendingKey)
    XCTAssertTrue(advance.effects.contains(.keyAcknowledged))
    XCTAssertEqual(advance.host.engineFlags & 0x01, 0x01, "a matched key should take the branch")
  }

  func testAnUnpressedKeyLeavesTheTestUnsatisfied() throws {
    let advance = running(
      [.testKey(.y, .init(branchOn: false, branch: .jump(2))), .ret, .setFlags(mask: 0x01), .ret]
    )

    XCTAssertFalse(advance.effects.contains(.keyAcknowledged))
    XCTAssertEqual(advance.host.engineFlags & 0x01, 0)
  }

  func testClearingTheKeyDiscardsIt() throws {
    let advance = running([.clearKey, .ret], host: .init(pendingKey: .y))

    XCTAssertNil(advance.host.pendingKey)
  }

  // MARK: - Messages

  func testAMessageBlocksTheScriptUntilTheHostClearsIt() throws {
    let advance = running([.messageIndexed(.immediate(1)), .setFlags(mask: 0x01), .ret])

    XCTAssertTrue(advance.host.messagePlaying)
    XCTAssertEqual(advance.executed, 1, "the script should stop at the message")
    XCTAssertEqual(advance.effects.count, 1)
    XCTAssertEqual(advance.host.engineFlags & 0x01, 0, "the next instruction must wait")

    // Nothing runs while it plays.
    let waiting = BensonMachine.run(
      advance.state, host: advance.host, program: program([.messageIndexed(.immediate(1)), .setFlags(mask: 0x01), .ret]),
      text: text
    )
    XCTAssertEqual(waiting.executed, 0)
  }

  func testAMessageResumesWhenPlaybackFinishes() throws {
    let instructions: [BensonProgram.Instruction] = [
      .messageIndexed(.immediate(1)), .setFlags(mask: 0x01), .ret,
    ]
    let first = running(instructions)
    var host = first.host
    host.messagePlaying = false

    let second = BensonMachine.run(
      first.state, host: host, program: program(instructions), text: text
    )

    XCTAssertEqual(second.host.engineFlags & 0x01, 0x01)
  }

  func testANumberSlotIsFilledFromTheDecimalRegisterWhenTheMessageStarts() throws {
    let advance = running(
      [.messageIndexed(.immediate(1)), .ret],
      host: .init(decimals: {
        var decimals = Array(repeating: 0, count: BensonHostState.decimalCount)
        decimals[BensonHostState.firstNumberDecimal] = 9000
        return decimals
      }())
    )

    XCTAssertEqual(advance.effects, [.playMessage("MESSAGE 9000")])
  }

  func testAnIndexedMessageMayComeFromARegister() throws {
    var state = BensonState()
    state.registers[3] = 2
    let advance = running([.messageIndexed(.register(3)), .ret], state: state)

    XCTAssertEqual(advance.effects.count, 1)
  }

  func testARandomMessageIsReproducibleFromItsSeed() throws {
    let instructions: [BensonProgram.Instruction] = [.messageRandom(base: 1, mask: 3), .ret]
    let first = running(instructions, state: .init(randomState: 42))
    let again = running(instructions, state: .init(randomState: 42))
    let different = running(instructions, state: .init(randomState: 7))

    XCTAssertEqual(first.effects, again.effects)
    XCTAssertEqual(first.state.randomState, again.state.randomState)
    XCTAssertNotEqual(first.state.randomState, different.state.randomState)
  }

  // MARK: - Waits

  func testAWaitCostsATickBeforeItComparesAtAll() throws {
    let instructions: [BensonProgram.Instruction] = [
      .waitTicks(5, .init(branchOn: false, branch: .jump(0))), .setFlags(mask: 0x01), .ret,
    ]
    let advance = running(instructions, host: .init(tickCounter: 9))

    XCTAssertEqual(advance.state.resumeAfterTick, 10)
    XCTAssertEqual(advance.host.engineFlags & 0x01, 0, "the comparison waits for the clock")
  }

  func testAWaitResumesOnceTheClockReachesItsTick() throws {
    let instructions: [BensonProgram.Instruction] = [
      .waitTicks(5, .init(branchOn: false, branch: .jump(0))), .setFlags(mask: 0x01), .ret,
    ]
    let blocked = running(instructions)
    var host = blocked.host
    host.tickCounter = 6

    let advance = BensonMachine.run(
      blocked.state, host: host, program: program(instructions), text: text
    )

    XCTAssertNil(advance.state.resumeAfterTick)
    // The counter has passed the wait, so the poll-again branch is not taken.
    XCTAssertEqual(advance.host.engineFlags & 0x01, 0x01)
  }

  func testAWaitPollsAgainWhileTheClockIsShortOfItsTick() throws {
    let instructions: [BensonProgram.Instruction] = [
      .waitTicks(5, .init(branchOn: false, branch: .jump(0))), .setFlags(mask: 0x01), .ret,
    ]
    let blocked = running(instructions)
    var host = blocked.host
    host.tickCounter = 1

    let advance = BensonMachine.run(
      blocked.state, host: host, program: program(instructions), text: text
    )

    XCTAssertEqual(advance.host.engineFlags & 0x01, 0, "the script should still be waiting")
    XCTAssertNotNil(advance.state.resumeAfterTick)
  }

  func testClearingTheTickCounterRestartsAWait() throws {
    let advance = running([.clearTickCounter, .ret], host: .init(tickCounter: 30))

    XCTAssertEqual(advance.host.tickCounter, 0)
  }

  func testTheTickRateFollowsTheTunables() {
    XCTAssertEqual(BensonTunables().secondsPerTick, 1, accuracy: 0.0001)
    XCTAssertEqual(
      BensonTunables(timeScale: 2).secondsPerTick, 0.5, accuracy: 0.0001,
      "a doubled time scale should halve a wait"
    )
  }

  // MARK: - Decimals

  func testDecimalsLoadAddAndWrapLikePackedDigits() throws {
    let advance = running([
      .loadDecimal(decimal: 8, value: 9000),
      // Scripts subtract by adding a complement, so this is the craft's price.
      .addDecimal(decimal: 8, value: 99_995_000),
      .ret,
    ])

    XCTAssertEqual(advance.host.decimal(8), 4000)
  }

  func testADecimalAddTakesTwoRegistersIntoAThird() throws {
    var host = BensonHostState()
    host.decimals[8] = 1200
    host.decimals[9] = 350
    let advance = running([.addDecimals(into: 10, a: 8, b: 9), .ret], host: host)

    XCTAssertEqual(advance.host.decimal(10), 1550)
  }

  func testADecimalByteReadsOneDigitPair() throws {
    var host = BensonHostState()
    host.decimals[8] = 12_345_678

    XCTAssertEqual(host.value(of: .decimalByte(decimal: 8, byte: 0)), 12)
    XCTAssertEqual(host.value(of: .decimalByte(decimal: 8, byte: 3)), 78)
  }

  func testASymbolTestComparesItsValueAgainstTheHost() throws {
    // The Reference Build's affordability check: branch when the millions pair
    // is not zero.
    let instructions: [BensonProgram.Instruction] = [
      .testSymbol(.decimalByte(decimal: 8, byte: 0), value: 0, .init(branchOn: false, branch: .jump(2))),
      .ret,
      .setFlags(mask: 0x01),
      .ret,
    ]
    var rich = BensonHostState()
    rich.decimals[8] = 1_000_000
    XCTAssertEqual(running(instructions, host: rich).host.engineFlags & 0x01, 0x01)

    var poor = BensonHostState()
    poor.decimals[8] = 9000
    XCTAssertEqual(running(instructions, host: poor).host.engineFlags & 0x01, 0)
  }

  // MARK: - Registers, objects, and writes

  func testLoadingTheMapRegisterReportsTheLocationChange() throws {
    let advance = running([.loadRegister(register: BensonState.mapRegister, value: 50), .ret])

    XCTAssertTrue(advance.effects.contains(.cityLocationChanged(50)))
    XCTAssertEqual(advance.state.registers[BensonState.mapRegister], 50)
  }

  func testLoadingAnyOtherRegisterIsSilent() throws {
    let advance = running([.loadRegister(register: BensonState.objectRegister, value: 7), .ret])

    XCTAssertEqual(advance.effects, [.scriptFinished])
  }

  func testCopyingARegisterMovesItsValue() throws {
    let advance = running([
      .loadRegister(register: 4, value: 12), .copyRegister(source: 4, target: 14), .ret,
    ])

    XCTAssertEqual(advance.state.registers[14], 12)
  }

  func testObjectFlagsChangeThroughTheObjectRegister() throws {
    let advance = running([
      .loadRegister(register: BensonState.objectRegister, value: 7),
      .changeObjectFlags(mode: .or, mask: 0x04),
      .ret,
    ])

    XCTAssertEqual(advance.host.objectFlags[7], 0x04)
  }

  func testAnObjectFlagTestReadsTheSelectedObject() throws {
    var host = BensonHostState()
    host.objectFlags[7] = 0x04
    let advance = running(
      [
        .loadRegister(register: BensonState.objectRegister, value: 7),
        .testObjectFlags(mask: 0x04, .init(branchOn: false, branch: .jump(3))),
        .ret,
        .setFlags(mask: 0x01),
        .ret,
      ],
      host: host
    )

    XCTAssertEqual(advance.host.engineFlags & 0x01, 0x01)
  }

  func testAWriteReachesTheHostThroughItsSymbol() throws {
    let advance = running([
      .write(.objectRoom(slot: 46), value: 1),
      .write(.messageInterval, value: 150),
      .write(.gameComplete, value: 1),
      .ret,
    ])

    XCTAssertEqual(advance.host.objectRooms[46], 1)
    XCTAssertEqual(advance.host.messageInterval, 150)
    XCTAssertTrue(advance.host.gameComplete)
  }

  func testASoundWriteIsOfferedToTheHostRatherThanApplied() throws {
    let advance = running([.sound(symbol: "voice1.control", value: 0), .ret])

    XCTAssertEqual(advance.effects.first, .sound(symbol: "voice1.control", value: 0))
  }

  // MARK: - Yielding

  func testACraftTestReportsAMismatchAsItsAnswer() throws {
    let instructions: [BensonProgram.Instruction] = [
      .testCraft(craft: 1, .init(branchOn: false, branch: .jump(2))), .ret, .setFlags(mask: 0x01), .ret,
    ]

    XCTAssertEqual(running(instructions, host: .init(boardedCraft: 1)).host.engineFlags & 0x01, 0x01)
    XCTAssertEqual(running(instructions).host.engineFlags & 0x01, 0)
  }

  func testANonBlockingLoopYieldsWhenItsBudgetRunsOut() throws {
    // The opening script ends exactly like this, polling for a craft the player
    // has not boarded, and it never blocks on its own.
    let instructions: [BensonProgram.Instruction] = [
      .testCraft(craft: 1, .init(branchOn: false, branch: .jump(2))),
      .jump(0),
      .ret,
    ]
    let advance = running(instructions, tunables: .init(instructionBudget: 10))

    XCTAssertEqual(advance.executed, 10)
    XCTAssertNotNil(advance.state.pc, "the script keeps its place for the next advance")
    XCTAssertTrue(advance.host.isScriptRunning)

    // Boarding the craft releases it.
    var boarded = advance.host
    boarded.boardedCraft = 1
    let released = BensonMachine.run(
      advance.state, host: boarded, program: program(instructions), text: text
    )
    XCTAssertNil(released.state.pc)
  }

  func testAnIdleInterpreterDoesNothing() throws {
    let advance = BensonMachine.run(
      .init(), host: .init(), program: program([.ret]), text: text
    )

    XCTAssertEqual(advance.executed, 0)
    XCTAssertEqual(advance.effects, [])
  }

  // MARK: - The opening shape

  func testAnOpeningShapedScriptReachesItsParkedState() throws {
    // The opening's shape in miniature: say something, offer the craft, take the
    // player's yes, charge them, then wait for them to board.
    let instructions: [BensonProgram.Instruction] = [
      .message([.init(kind: "literal", word: nil, text: "CRASH LANDED ON TARG", slot: nil)]),
      .messageIndexed(.immediate(1)),
      .testKey(.y, .init(branchOn: false, branch: .jump(4))),
      .jump(2),
      .addDecimal(decimal: 8, value: 99_995_000),
      .testCraft(craft: 1, .init(branchOn: false, branch: .jump(7))),
      .jump(5),
      .clearFlags(mask: BensonHostState.scriptRunning),
      .ret,
    ]
    let program = program(instructions)
    var host = BensonHostState()
    host.decimals[8] = 9000
    var (state, hostState) = BensonMachine.start(script: 0, of: program, state: .init(), host: host)!

    // The crash message plays, then the offer.
    var advance = BensonMachine.run(state, host: hostState, program: program, text: text)
    XCTAssertEqual(advance.effects, [.playMessage("CRASH LANDED ON TARG")])
    (state, hostState) = (advance.state, advance.host)
    hostState.messagePlaying = false

    advance = BensonMachine.run(state, host: hostState, program: program, text: text)
    XCTAssertEqual(advance.effects, [.playMessage("MESSAGE 9000")])
    (state, hostState) = (advance.state, advance.host)
    hostState.messagePlaying = false

    // Nobody presses anything, so the offer loop spins and yields.
    advance = BensonMachine.run(
      state, host: hostState, program: program, text: text, tunables: .init(instructionBudget: 8)
    )
    XCTAssertEqual(advance.executed, 8)
    XCTAssertEqual(advance.host.decimal(8), 9000, "no purchase without a keypress")
    (state, hostState) = (advance.state, advance.host)

    // The player presses Y: the credits change and the script parks on the craft.
    hostState.pendingKey = .y
    advance = BensonMachine.run(
      state, host: hostState, program: program, text: text, tunables: .init(instructionBudget: 8)
    )
    XCTAssertEqual(advance.host.decimal(8), 4000)
    XCTAssertTrue(advance.host.isScriptRunning, "the script waits for the player to board")
    (state, hostState) = (advance.state, advance.host)

    // Boarding the Dart finishes it.
    hostState.boardedCraft = 1
    advance = BensonMachine.run(state, host: hostState, program: program, text: text)
    XCTAssertEqual(advance.effects, [.scriptFinished])
    XCTAssertFalse(advance.host.isScriptRunning)
  }

  // MARK: - Watching an execution

  /// The observer exists so the Trace Oracle can record an execution
  /// instruction-by-instruction (ADR 0019). Its whole value rests on the traced run
  /// being the same run, so that is the first thing asserted.
  func testWatchingChangesNothingAboutWhatRuns() throws {
    let instructions: [BensonProgram.Instruction] = [
      .loadDecimal(decimal: 8, value: 9000),
      .setFlags(mask: 0x01),
      .addDecimal(decimal: 8, value: 1),
      .ret,
    ]
    let unwatched = running(instructions)
    var seen = 0
    let watched = running(instructions, observer: { _ in seen += 1 })

    XCTAssertEqual(watched.state, unwatched.state)
    XCTAssertEqual(watched.host, unwatched.host)
    XCTAssertEqual(watched.effects, unwatched.effects)
    XCTAssertEqual(watched.executed, unwatched.executed)
    XCTAssertEqual(seen, unwatched.executed, "one report per instruction run")
  }

  func testEachInstructionIsReportedOnceInOrderWithWhereItWas() throws {
    var steps: [BensonStep] = []
    let advance = running(
      [.clearTickCounter, .setFlags(mask: 0x01), .jump(3), .ret],
      observer: { steps.append($0) }
    )

    XCTAssertEqual(steps.count, advance.executed)
    XCTAssertEqual(steps.map(\.pc), [0, 1, 2, 3])
    XCTAssertEqual(steps.map(\.instruction), [
      .clearTickCounter, .setFlags(mask: 0x01), .jump(3), .ret,
    ])
  }

  /// Each report brackets its own instruction: what went in, and what came out. This
  /// is what stands in for recording the reads, so a gap here would be a hole in the
  /// trace rather than a missing convenience.
  func testTheStateEitherSideBracketsTheInstruction() throws {
    var steps: [BensonStep] = []
    _ = running(
      [.loadDecimal(decimal: 8, value: 9000), .addDecimal(decimal: 8, value: 500), .ret],
      observer: { steps.append($0) }
    )

    XCTAssertEqual(steps[0].hostBefore.decimal(8), 0)
    XCTAssertEqual(steps[0].hostAfter.decimal(8), 9000)
    XCTAssertEqual(steps[1].hostBefore.decimal(8), 9000, "each step starts where the last ended")
    XCTAssertEqual(steps[1].hostAfter.decimal(8), 9500)
    // The program counter either side is how a taken branch shows up.
    XCTAssertEqual(steps[0].stateBefore.pc, 0)
    XCTAssertEqual(steps[0].stateAfter.pc, 1)
  }

  /// Which way a test branched, without a second description of what the test reads.
  func testATakenBranchShowsAsTheProgramCounterMoving() throws {
    var steps: [BensonStep] = []
    _ = running(
      [
        .testFlags(mask: 0x01, .init(branchOn: true, branch: .jump(2))),
        .setFlags(mask: 0x80),
        .ret,
      ],
      observer: { steps.append($0) }
    )

    XCTAssertEqual(steps[0].stateAfter.pc, 2, "no bit set, so the branch was taken over pc 1")
    XCTAssertEqual(steps.map(\.pc), [0, 2], "and pc 1 never ran")
  }

  /// Effects are attributed to the instruction that produced them, not accumulated —
  /// a trace that handed every step the run's whole effect list would say the last
  /// instruction played every message.
  func testEffectsAreAttributedToTheInstructionThatEmittedThem() throws {
    var steps: [BensonStep] = []
    _ = running(
      [.sound(symbol: "voice1Frequency", value: 40), .clearTickCounter, .ret],
      observer: { steps.append($0) }
    )

    XCTAssertEqual(steps[0].effects, [.sound(symbol: "voice1Frequency", value: 40)])
    XCTAssertEqual(steps[1].effects, [], "an instruction that emitted nothing reports nothing")
    XCTAssertEqual(steps[2].effects, [.scriptFinished])
  }

  /// A message blocks the interpreter, and the report says so — which is what tells a
  /// reader why the next instruction is on a later step rather than this one.
  func testABlockingInstructionIsReportedAsBlocked() throws {
    var steps: [BensonStep] = []
    _ = running([.messageIndexed(.immediate(1)), .ret], observer: { steps.append($0) })

    XCTAssertEqual(steps.count, 1, "the run stopped at the message")
    XCTAssertTrue(steps[0].blocked)
    XCTAssertTrue(steps[0].hostAfter.messagePlaying)
    XCTAssertFalse(steps[0].hostBefore.messagePlaying)
  }

  /// The session owns the clock and the message pacing, so an instruction trace has to
  /// be taken through it rather than around it.
  func testASessionReportsTheInstructionsItRuns() throws {
    let program = program([
      .loadDecimal(decimal: 8, value: 9000), .clearTickCounter, .ret,
    ])
    var session = BensonSession(program: program, text: text)
    session.start(script: 0)

    var steps: [BensonStep] = []
    session.advance(by: 1.0 / 60.0, observer: { steps.append($0) })

    XCTAssertEqual(steps.map(\.pc), [0, 1, 2])
    XCTAssertEqual(session.host.decimal(8), 9000)
  }
}
