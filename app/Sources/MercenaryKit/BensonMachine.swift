import Foundation

/// Pacing for the Benson interpreter, in the spirit of ``WalkLimits``: the
/// Reference Build's own numbers where they carry meaning, tuned where they were
/// an artefact of the hardware.
public struct BensonTunables: Sendable, Equatable {
  /// Video frames per tick of the wait counter, from the payload.
  public var framesPerTick: Int
  /// Frames per second the virtual clock runs at.
  public var framesPerSecond: Double
  /// Scales script time without changing the scripts. Above one runs the
  /// original's waits faster, which is where modernised feel is dialled in.
  public var timeScale: Double
  /// Instructions one advance may run before yielding.
  ///
  /// The original interpreter ran exactly one instruction per frame, so a script
  /// that never blocked still gave the game back its time. Running until blocked
  /// is faster and simpler, but the opening script ends in a loop that polls the
  /// player's craft and never blocks at all — so a budget stands in for the
  /// frame boundary the original had for free.
  public var instructionBudget: Int
  /// How fast the message line reveals text, before ``timeScale``.
  public var messageCharactersPerSecond: Double
  /// How long a revealed message is held to be read. Not scaled by
  /// ``timeScale``: the scale speeds up the Reference Build's pacing, and a
  /// reading pause is the player's time rather than the original's.
  public var messageHoldSeconds: Double

  public init(
    framesPerTick: Int = 50,
    framesPerSecond: Double = 50,
    timeScale: Double = 1,
    instructionBudget: Int = 512,
    messageCharactersPerSecond: Double = MessageTicker.referenceRate,
    messageHoldSeconds: Double = MessageTicker.referenceHold
  ) {
    self.framesPerTick = framesPerTick
    self.framesPerSecond = framesPerSecond
    self.timeScale = timeScale
    self.instructionBudget = instructionBudget
    self.messageCharactersPerSecond = messageCharactersPerSecond
    self.messageHoldSeconds = messageHoldSeconds
  }

  /// Seconds of real time one tick of the wait counter lasts.
  public var secondsPerTick: Double {
    guard framesPerSecond > 0, timeScale > 0 else { return 0 }
    return Double(framesPerTick) / framesPerSecond / timeScale
  }
}

/// One script's execution state.
public struct BensonState: Sendable, Equatable {
  /// The instruction to run next; nil when no script is running.
  public var pc: Int?
  public var callStack: [Int]
  /// The sixteen general registers. 13, 14, and 15 are the map, object, and room
  /// selectors that most instructions read their subject from.
  public var registers: [Int]
  /// Seeded so a random message or test is reproducible in a test.
  public var randomState: UInt64
  /// Set while a wait is pending, holding the tick it may resume after.
  public var resumeAfterTick: Int?

  public static let registerCount = 16
  public static let mapRegister = 13
  public static let objectRegister = 14
  public static let roomRegister = 15

  public init(
    pc: Int? = nil,
    callStack: [Int] = [],
    registers: [Int] = Array(repeating: 0, count: Self.registerCount),
    randomState: UInt64 = 0x9E37_79B9_7F4A_7C15,
    resumeAfterTick: Int? = nil
  ) {
    self.pc = pc
    self.callStack = callStack
    self.registers = registers
    self.randomState = randomState
    self.resumeAfterTick = resumeAfterTick
  }

  public var isRunning: Bool { pc != nil }

  func register(_ index: Int) -> Int {
    registers.indices.contains(index) ? registers[index] : 0
  }

  var object: Int { register(Self.objectRegister) }
  var room: Int { register(Self.roomRegister) }
  var map: Int { register(Self.mapRegister) }
}

/// Runs Benson Scripts against the Host Callout.
///
/// The Reference Build advanced one instruction per video frame, so a script's
/// pace came partly from the hardware. Here a script runs until something
/// genuinely blocks it — a message playing, or a wait for the clock — which
/// leaves the pacing to the message line and the scripts' own waits, both of
/// which the original meant. See ``BensonTunables/instructionBudget`` for the
/// one case where the frame boundary still has to be stood in for.
public enum BensonMachine {
  /// The result of advancing a script.
  public struct Advance: Sendable, Equatable {
    public var state: BensonState
    public var host: BensonHostState
    public var effects: [BensonEffect]
    /// Instructions run. Reaching the budget means the script yielded rather
    /// than blocked, and will pick up where it left off.
    public var executed: Int
  }

  /// Start a script, or refuse when one is already running.
  ///
  /// The Reference Build allowed exactly one script at a time and marked it with
  /// a flag bit the script itself cleared, so refusal is the normal answer while
  /// something is mid-conversation rather than an error.
  public static func start(
    script: Int, of program: BensonProgram, state: BensonState, host: BensonHostState
  ) -> (state: BensonState, host: BensonHostState)? {
    guard !host.isScriptRunning, let entry = program.entry(of: script) else { return nil }
    var state = state
    var host = host
    state.pc = entry
    state.callStack = []
    state.resumeAfterTick = nil
    host.engineFlags |= BensonHostState.scriptRunning
    return (state, host)
  }

  /// Advance the running script until it blocks, finishes, or spends its budget.
  public static func run(
    _ state: BensonState,
    host: BensonHostState,
    program: BensonProgram,
    text: TextTable,
    tunables: BensonTunables = .init()
  ) -> Advance {
    var state = state
    var host = host
    var effects: [BensonEffect] = []
    var executed = 0

    // The Reference Build's step refused to run at all while a message played,
    // which is what makes message pacing the scripts' clock.
    guard !host.messagePlaying, state.pc != nil else {
      return Advance(state: state, host: host, effects: effects, executed: 0)
    }
    // A pending wait is still a block; stepping into it would only re-block, so
    // the clock is checked here and the wait itself is left alone.
    if let resume = state.resumeAfterTick, host.tickCounter < resume {
      return Advance(state: state, host: host, effects: effects, executed: 0)
    }

    while executed < tunables.instructionBudget, let pc = state.pc {
      guard program.instructions.indices.contains(pc) else {
        state.pc = nil
        break
      }
      executed += 1
      let outcome = step(
        program.instructions[pc], at: pc, state: &state, host: &host, text: text, effects: &effects
      )
      if outcome == .blocked { break }
    }
    return Advance(state: state, host: host, effects: effects, executed: executed)
  }

  private enum Outcome {
    case advanced
    case blocked
  }

  private static func step(
    _ instruction: BensonProgram.Instruction,
    at pc: Int,
    state: inout BensonState,
    host: inout BensonHostState,
    text: TextTable,
    effects: inout [BensonEffect]
  ) -> Outcome {
    /// Apply a test the way the interpreter did: take the branch when the test's
    /// answer matches the outcome the instruction branches on.
    func decide(_ answer: Bool, _ condition: BensonProgram.Condition) {
      guard answer == condition.branchOn else {
        state.pc = pc + 1
        return
      }
      switch condition.branch {
      case .jump(let target):
        state.pc = target
      case .call(let target):
        state.callStack.append(pc + 1)
        state.pc = target
      }
    }
    func play(_ message: String?) -> Outcome {
      state.pc = pc + 1
      guard let message else { return .advanced }
      host.messagePlaying = true
      effects.append(.playMessage(message))
      return .blocked
    }

    switch instruction {
    case .message(let tokens):
      let composed = text.compose(tokens, substituting: .init(numbers: host.numberSubstitutions))
      return play(composed)

    case .messageIndexed(let source):
      let index: Int
      switch source {
      case .immediate(let value): index = value
      case .register(let register): index = state.register(register)
      }
      return play(text.message(index, substituting: .init(numbers: host.numberSubstitutions)))

    case .messageRandom(let base, let mask):
      let index = base + Int(next(&state.randomState) & UInt8(truncatingIfNeeded: mask))
      // The original fell through into the key clear when the sum came out zero.
      guard index != 0 else {
        host.pendingKey = nil
        state.pc = pc + 1
        return .advanced
      }
      return play(text.message(index, substituting: .init(numbers: host.numberSubstitutions)))

    case .waitTicks(let ticks, let condition):
      // The original spun inside the handler until the counter moved and only
      // then compared, so a wait always costs at least one tick — which is what
      // makes a poll loop built from one cost time.
      guard let resume = state.resumeAfterTick else {
        state.resumeAfterTick = host.tickCounter + 1
        return .blocked
      }
      guard host.tickCounter >= resume else { return .blocked }
      state.resumeAfterTick = nil
      decide(host.tickCounter >= ticks, condition)
      return .advanced

    case .clearTickCounter:
      host.tickCounter = 0
      state.pc = pc + 1
      return .advanced

    case .testKey(let key, let condition):
      let matched = host.pendingKey == key
      if matched {
        host.pendingKey = nil
        effects.append(.keyAcknowledged)
      }
      // The handler reported a *mismatch* as its answer.
      decide(!matched, condition)
      return .advanced

    case .clearKey:
      host.pendingKey = nil
      state.pc = pc + 1
      return .advanced

    case .testFlags(let mask, let condition):
      decide(host.engineFlags & mask == 0, condition)
      return .advanced

    case .setFlags(let mask):
      host.engineFlags |= mask
      state.pc = pc + 1
      return .advanced

    case .clearFlags(let mask):
      // Clearing the running bit does not stop anything: the Reference Build's
      // step loop never consulted it, only its start did. A script clears it to
      // say it may now be interrupted, and several keep running afterwards —
      // boarding the Dart runs on into its description that way.
      host.engineFlags &= ~mask
      state.pc = pc + 1
      return .advanced

    case .testRoom(let condition):
      decide(state.room != host.currentRoom, condition)
      return .advanced

    case .testInventory(let condition):
      decide(host.inventory.contains(state.object), condition)
      return .advanced

    case .testObjectInRoom(let condition):
      decide(state.room != host.objectRooms[state.object], condition)
      return .advanced

    case .testObjectFlags(let mask, let condition):
      decide((host.objectFlags[state.object] ?? 0) & mask == 0, condition)
      return .advanced

    case .testBlockIntact(let condition):
      decide(!host.destroyedBlocks.contains(state.map), condition)
      return .advanced

    case .testCraft(let craft, let condition):
      decide(craft != host.boardedCraft, condition)
      return .advanced

    case .testRandom(let value, let condition):
      decide(value >= Int(next(&state.randomState)), condition)
      return .advanced

    case .testSymbol(let symbol, let value, let condition):
      decide(value >= host.value(of: symbol), condition)
      return .advanced

    case .loadDecimal(let decimal, let value):
      if host.decimals.indices.contains(decimal) { host.decimals[decimal] = value }
      state.pc = pc + 1
      return .advanced

    case .addDecimal(let decimal, let value):
      host.addDecimal(decimal, value)
      state.pc = pc + 1
      return .advanced

    case .addDecimals(let into, let a, let b):
      if host.decimals.indices.contains(into) {
        host.decimals[into] = (host.decimal(a) + host.decimal(b)) % BensonHostState.decimalLimit
      }
      state.pc = pc + 1
      return .advanced

    case .loadRegister(let register, let value):
      if state.registers.indices.contains(register) { state.registers[register] = value }
      state.pc = pc + 1
      // Writing the map register also moved the Reference Build's location readout.
      if register == BensonState.mapRegister { effects.append(.cityLocationChanged(value)) }
      return .advanced

    case .copyRegister(let source, let target):
      let value = state.register(source)
      if state.registers.indices.contains(target) { state.registers[target] = value }
      state.pc = pc + 1
      if target == BensonState.mapRegister { effects.append(.cityLocationChanged(value)) }
      return .advanced

    case .changeObjectFlags(let mode, let mask):
      let existing = host.objectFlags[state.object] ?? 0
      host.objectFlags[state.object] = mode == .or ? existing | mask : existing & mask
      state.pc = pc + 1
      return .advanced

    case .write(let symbol, let value):
      host.write(symbol, value)
      state.pc = pc + 1
      return .advanced

    case .sound(let symbol, let value):
      effects.append(.sound(symbol: symbol, value: value))
      state.pc = pc + 1
      return .advanced

    case .jump(let target):
      state.pc = target
      return .advanced

    case .call(let target):
      state.callStack.append(pc + 1)
      state.pc = target
      return .advanced

    case .ret:
      if let resume = state.callStack.popLast() {
        state.pc = resume
      } else {
        // The original pushed a stale address before entering a script, so its
        // outermost return left the interpreter idle. Ending here is the same
        // thing said plainly.
        state.pc = nil
        effects.append(.scriptFinished)
      }
      return .advanced
    }
  }

  /// A small deterministic generator, so a seeded state replays exactly.
  ///
  /// One generator for the whole session, as the Reference Build has one: the engine's
  /// own Room setup draws from it too, which is why this is reachable from outside.
  static func nextRandom(_ state: inout UInt64) -> UInt8 {
    next(&state)
  }

  private static func next(_ state: inout UInt64) -> UInt8 {
    state = state &+ 0x9E37_79B9_7F4A_7C15
    var z = state
    z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
    z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
    return UInt8(truncatingIfNeeded: z ^ (z >> 31))
  }
}
