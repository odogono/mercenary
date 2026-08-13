import Foundation

/// The engine state a Benson Script is allowed to see.
///
/// This is one half of the Host Callout: the seam between the Reference Build's
/// game logic and this app's engine. A script reaches nothing else — the export
/// tool resolved every address the scripts touch into the fields below, so this
/// type is the complete surface, not a convenient subset. The other half is
/// ``BensonEffect``, for the things a script asks the host to *do*.
///
/// It is a value rather than a protocol because the app's simulation seam is
/// already values in and values out. Advancing a script is a pure function of
/// (program, script state, host state), which is what makes it testable without
/// a stand-in host, and what a Lua layer would slot into unchanged.
public struct BensonHostState: Sendable, Equatable {
  /// The engine's flag byte, shared with the scripts exactly as the Reference
  /// Build shared it. Bit 7 is set by the host when the player presses a key and
  /// bit 6 marks a script as running; the low six bits belong to the scripts,
  /// which use them to remember answers. One byte, because scripts set and clear
  /// the host's bits and the host reads theirs.
  public var engineFlags: UInt8
  /// Set while a message is playing. The interpreter refuses to advance until
  /// the host clears it, which is how message pacing drives the scripts.
  public var messagePlaying: Bool
  /// The key the player last pressed, held until a script consumes it.
  public var pendingKey: BensonKey?
  /// Ticks of the wait counter since it was last cleared.
  public var tickCounter: Int
  /// Video frames between message advances. Scripts retime the message line by
  /// writing this; the endgame slows it to a crawl.
  public var messageInterval: Int
  public var currentRoom: Int
  /// The craft the player is aboard, which is that craft's object slot. On foot
  /// is a sentinel rather than zero, because slot zero is a real ship.
  public var boardedCraft: Int
  /// Eight-digit decimal registers. Slot 8 is the bank balance and slot 9 the
  /// cash in the current room; text number slot `n` renders slot `8 + n`.
  public var decimals: [Int]
  /// Object rooms and flags, by object slot.
  public var objectRooms: [Int: Int]
  public var objectFlags: [Int: UInt8]
  public var inventory: Set<Int>
  public var destroyedBlocks: Set<Int>
  /// A ship is attacking the player.
  public var attackingShip: Bool
  /// The player has escaped Targ.
  public var gameComplete: Bool
  /// A hired ship is on its way.
  public var shipInbound: Int
  /// The signed register, which no Reference Build script reads.
  public var signedRegister: Int

  /// What the boarded-craft value holds while the player is walking. The
  /// Reference Build's own on-foot value, and negative as a signed byte, which is
  /// how its boarding check tested for it.
  public static let onFoot = 0x80

  /// The flag bit the host sets when the player presses a key.
  public static let inputDetected: UInt8 = 0x80
  /// The flag bit that marks a script as running. Scripts clear it to finish.
  public static let scriptRunning: UInt8 = 0x40
  public static let decimalCount = 16
  /// The decimal register text number slot zero renders.
  public static let firstNumberDecimal = 8
  /// Decimal registers hold eight digits and wrap, as packed BCD did.
  public static let decimalLimit = 100_000_000
  /// The message interval a conditioned Reference Build starts with.
  public static let defaultMessageInterval = 125

  public init(
    engineFlags: UInt8 = 0,
    messagePlaying: Bool = false,
    pendingKey: BensonKey? = nil,
    tickCounter: Int = 0,
    messageInterval: Int = Self.defaultMessageInterval,
    currentRoom: Int = 0,
    boardedCraft: Int = Self.onFoot,
    decimals: [Int] = Array(repeating: 0, count: Self.decimalCount),
    objectRooms: [Int: Int] = [:],
    objectFlags: [Int: UInt8] = [:],
    inventory: Set<Int> = [],
    destroyedBlocks: Set<Int> = [],
    attackingShip: Bool = false,
    gameComplete: Bool = false,
    shipInbound: Int = 0,
    signedRegister: Int = 0
  ) {
    self.engineFlags = engineFlags
    self.messagePlaying = messagePlaying
    self.pendingKey = pendingKey
    self.tickCounter = tickCounter
    self.messageInterval = messageInterval
    self.currentRoom = currentRoom
    self.boardedCraft = boardedCraft
    self.decimals = decimals
    self.objectRooms = objectRooms
    self.objectFlags = objectFlags
    self.inventory = inventory
    self.destroyedBlocks = destroyedBlocks
    self.attackingShip = attackingShip
    self.gameComplete = gameComplete
    self.shipInbound = shipInbound
    self.signedRegister = signedRegister
  }

  /// A host state seeded with the decimal registers play starts from.
  public init(seeding program: BensonProgram) {
    self.init()
    for (slot, value) in program.decimalSeeds where decimals.indices.contains(slot) {
      decimals[slot] = value
    }
  }

  public var isScriptRunning: Bool { engineFlags & Self.scriptRunning != 0 }

  /// The value a script reads through one named symbol.
  ///
  /// Reads are one byte wide, because the Reference Build's compare was, so a
  /// decimal register is read a digit pair at a time.
  public func value(of symbol: BensonSymbol) -> Int {
    switch symbol {
    case .decimalByte(let decimal, let byte):
      return decimalByte(decimal, byte)
    case .engineFlags: return Int(engineFlags)
    case .currentRoom: return currentRoom
    case .boardedCraft: return boardedCraft
    case .inputKey: return pendingKey?.code ?? 0
    case .signedRegister: return signedRegister
    case .objectRoom(let slot): return objectRooms[slot] ?? 0
    case .objectFlags(let slot): return Int(objectFlags[slot] ?? 0)
    case .messageInterval: return messageInterval
    case .attackingShip: return attackingShip ? 1 : 0
    case .gameComplete: return gameComplete ? 1 : 0
    case .shipInbound: return shipInbound
    }
  }

  public mutating func write(_ symbol: BensonSymbol, _ value: Int) {
    switch symbol {
    case .decimalByte(let decimal, let byte):
      setDecimalByte(decimal, byte, to: value)
    case .engineFlags: engineFlags = UInt8(truncatingIfNeeded: value)
    case .currentRoom: currentRoom = value
    case .boardedCraft: boardedCraft = value
    case .inputKey: if value == 0 { pendingKey = nil }
    case .signedRegister: signedRegister = value
    case .objectRoom(let slot): objectRooms[slot] = value
    case .objectFlags(let slot): objectFlags[slot] = UInt8(truncatingIfNeeded: value)
    case .messageInterval: messageInterval = value
    case .attackingShip: attackingShip = value != 0
    case .gameComplete: gameComplete = value != 0
    case .shipInbound: shipInbound = value
    }
  }

  /// One decimal register's digit pair, counting from the most significant.
  func decimalByte(_ slot: Int, _ byte: Int) -> Int {
    guard decimals.indices.contains(slot), (0..<4).contains(byte) else { return 0 }
    let scale = Int(pow(100.0, Double(3 - byte)))
    return (decimals[slot] / scale) % 100
  }

  mutating func setDecimalByte(_ slot: Int, _ byte: Int, to pair: Int) {
    guard decimals.indices.contains(slot), (0..<4).contains(byte) else { return }
    let scale = Int(pow(100.0, Double(3 - byte)))
    let existing = (decimals[slot] / scale) % 100
    decimals[slot] += (pair % 100 - existing) * scale
  }

  /// Add to a decimal register, wrapping at eight digits the way packed BCD did.
  /// Scripts subtract by adding a complement, so wrapping is load-bearing.
  mutating func addDecimal(_ slot: Int, _ value: Int) {
    guard decimals.indices.contains(slot) else { return }
    decimals[slot] = ((decimals[slot] + value) % Self.decimalLimit + Self.decimalLimit) % Self.decimalLimit
  }

  public func decimal(_ slot: Int) -> Int {
    decimals.indices.contains(slot) ? decimals[slot] : 0
  }

  /// The number-slot values a message composes with, drawn from the decimals the
  /// Reference Build's numeric emitter read.
  public var numberSubstitutions: [Int: Int] {
    var values: [Int: Int] = [:]
    for slot in 0..<(Self.decimalCount - Self.firstNumberDecimal) {
      values[slot] = decimal(Self.firstNumberDecimal + slot)
    }
    return values
  }
}

/// Something a Benson Script asks the host to do, which is not just a change to
/// ``BensonHostState``. The host may ignore any of these; ignoring one is a
/// decision about presentation, never about game state.
public enum BensonEffect: Sendable, Equatable {
  /// Show this message. Number slots are already filled, because they are read
  /// when the message starts rather than when it finishes.
  case playMessage(String)
  /// A script consumed the player's keypress. The Reference Build acknowledged
  /// this with a tone.
  case keyAcknowledged
  /// A sound register write. The Reference Build had no sound opcode; scripts
  /// drove the chip directly, so these arrive raw and may be ignored.
  case sound(symbol: String, value: Int)
  /// The map register changed, which the Reference Build reflected in its
  /// location readout.
  case cityLocationChanged(Int)
  /// The running script returned from its outermost call.
  case scriptFinished
}
