import Foundation

/// One running Benson Script, its host state, and the message line it drives.
///
/// This is the host side of the Host Callout, kept here rather than in the app so
/// the whole loop — clock, message pacing, effect handling — stays testable
/// without a window. The app's remaining job is to say which keys were pressed,
/// call ``advance(by:)``, and draw ``messageText``.
public struct BensonSession: Sendable {
  public let program: BensonProgram
  public let text: TextTable
  public var tunables: BensonTunables
  public private(set) var state: BensonState
  public private(set) var host: BensonHostState
  public private(set) var ticker: MessageTicker?

  /// Video frames counted towards the next tick of the wait counter.
  private var frames: Double = 0

  public init(
    program: BensonProgram,
    text: TextTable,
    tunables: BensonTunables? = nil,
    randomSeed: UInt64 = 0x2C69_2ED8_1B7F_0A31
  ) {
    self.program = program
    self.text = text
    // The payload knows how many frames a tick took; the rest is feel.
    self.tunables = tunables ?? BensonTunables(framesPerTick: program.framesPerTick)
    self.state = BensonState(randomState: randomSeed)
    self.host = BensonHostState(seeding: program)
  }

  /// Draw the next byte from the one random stream.
  ///
  /// The Reference Build has a single two-byte generator that both the scripts and the
  /// engine's own Room setup call, so sharing it here is the faithful arrangement
  /// rather than a shortcut: visiting the random Room really does change what the next
  /// script roll produces.
  public mutating func nextRandomByte() -> UInt8 {
    BensonMachine.nextRandom(&state.randomState)
  }

  /// Start a script, if none is running.
  @discardableResult
  public mutating func start(script: Int) -> Bool {
    guard let started = BensonMachine.start(script: script, of: program, state: state, host: host) else {
      return false
    }
    state = started.state
    host = started.host
    return true
  }

  /// Tell the scripts the player pressed something.
  ///
  /// The Reference Build's key scanner raised one flag for *any* keypress and
  /// separately left the code for a script to match, so both happen here: the
  /// opening reads the flag as "this player intends to walk" whatever they
  /// pressed, and matches the key only where it asks a question.
  public mutating func press(_ key: BensonKey?) {
    host.engineFlags |= BensonHostState.inputDetected
    if let key { host.pendingKey = key }
  }

  /// Whether a script is running and therefore owns the message line.
  public var isRunning: Bool { host.isScriptRunning || state.isRunning }

  /// What the message line should show right now.
  public var messageText: String { ticker?.visibleText ?? "" }

  /// Whether the message line has finished revealing its current message.
  public var isMessageComplete: Bool { ticker?.isFinished ?? true }

  /// Reveal the current message immediately.
  public mutating func skipMessage() {
    ticker?.finish()
  }

  /// Advance the message line and the running script by `seconds` of real time.
  ///
  /// Returns the effects the app may want to act on. Everything that only
  /// changes game state has already been applied.
  @discardableResult
  public mutating func advance(by seconds: Double) -> [BensonEffect] {
    guard seconds > 0 else { return [] }

    if var ticker {
      ticker.advance(by: seconds)
      self.ticker = ticker
      // A finished message releases the script, which is how the opening's pace
      // comes from its own text rather than from a frame counter.
      if ticker.isFinished { host.messagePlaying = false }
    }

    frames += seconds * tunables.framesPerSecond * tunables.timeScale
    let framesPerTick = Double(max(1, tunables.framesPerTick))
    while frames >= framesPerTick {
      frames -= framesPerTick
      host.tickCounter += 1
    }

    let advance = BensonMachine.run(
      state, host: host, program: program, text: text, tunables: tunables
    )
    state = advance.state
    host = advance.host

    var remaining: [BensonEffect] = []
    for effect in advance.effects {
      switch effect {
      case .playMessage(let message):
        // The time scale speeds up the original's pacing, the reveal included,
        // since scrolling speed is one of the things it was chosen to fix. The
        // hold is left alone: it is time given to the player to read, and that
        // does not get shorter because the rest of the game runs faster.
        ticker = MessageTicker(
          text: message,
          charactersPerSecond: MessageTicker.rate(
            forInterval: host.messageInterval, base: tunables.messageCharactersPerSecond
          ) * tunables.timeScale,
          holdSeconds: tunables.messageHoldSeconds
        )
      default:
        remaining.append(effect)
      }
    }
    return remaining
  }

  /// The bank balance, for a status readout.
  public var credits: Int { host.decimal(BensonHostState.firstNumberDecimal) }

  /// Report that the player boarded a craft, or left one.
  public mutating func board(craft: Int) {
    host.boardedCraft = craft
  }

  /// Show a message the engine rather than a script has to say.
  ///
  /// The Reference Build played messages from engine code as well as from
  /// scripts — refusing a lift is the engine's own line — and both went to the
  /// same line and blocked the same interpreter.
  public mutating func show(message index: Int) {
    guard let composed = text.message(index, substituting: .init(numbers: host.numberSubstitutions))
    else { return }
    show(text: composed)
  }

  public mutating func show(text composed: String) {
    ticker = MessageTicker(
      text: composed,
      charactersPerSecond: MessageTicker.rate(
        forInterval: host.messageInterval, base: tunables.messageCharactersPerSecond
      ) * tunables.timeScale,
      holdSeconds: tunables.messageHoldSeconds
    )
    host.messagePlaying = true
  }

  /// Apply whatever an object says when the player reaches it. Some objects have
  /// a message, some start a script, and most say nothing at all.
  public mutating func describe(_ description: Interaction.Description) {
    switch description {
    case .none:
      break
    case .message(let index):
      show(message: index)
    case .script(let script):
      start(script: script)
    }
  }

  /// The state a host mutates directly when the player acts on the world.
  public var hostState: BensonHostState {
    get { host }
    set { host = newValue }
  }
}
