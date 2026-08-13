import Foundation

/// A key a Benson Script can test for. The Reference Build's prompts only ever
/// offer a yes key and time out otherwise, so this is a small set by nature.
public enum BensonKey: String, Sendable, Equatable, CaseIterable {
  case y = "keyY"

  /// The Reference Build's own code for this key, which its scanner masked to six
  /// bits. Kept so the engine value a script may read is the real one.
  public var code: Int {
    switch self {
    case .y: return 0x19
    }
  }
}

/// Engine state a Benson Script reads. These are the app's own values; the
/// export tool resolved the Reference Build's addresses into these names, so the
/// interpreter never handles a machine address.
public enum BensonSymbol: Sendable, Equatable {
  /// One packed-BCD byte of a decimal register, most significant pair first.
  case decimalByte(decimal: Int, byte: Int)
  case engineFlags
  case currentRoom
  case boardedCraft
  case inputKey
  case signedRegister
  /// One object's room, by slot.
  case objectRoom(slot: Int)
  /// One object's flag byte, by slot.
  case objectFlags(slot: Int)
  /// Video frames between message advances: the script retiming the message line.
  case messageInterval
  case attackingShip
  case gameComplete
  case shipInbound
}

/// A validated Benson program: the payload document with every operand resolved
/// and every target checked, so the interpreter can assume it is well formed.
public struct BensonProgram: Sendable, Equatable {
  /// Where control goes when a conditional's branch is taken.
  public enum Branch: Sendable, Equatable {
    case jump(Int)
    /// Continues at the target and returns to the following instruction.
    case call(Int)
  }

  /// Which message an indexed play selects.
  public enum MessageSource: Sendable, Equatable {
    case immediate(Int)
    case register(Int)
  }

  /// How an object's flag byte changes.
  public enum MaskMode: Sendable, Equatable {
    case and
    case or
  }

  /// A conditional's test, and what a taken branch does.
  ///
  /// The Reference Build's interpreter left every test's answer in the carry flag
  /// and took the branch when that answer matched a bit in the opcode, so
  /// `branchOn` is the outcome the branch fires on rather than a negation.
  public struct Condition: Sendable, Equatable {
    public var branchOn: Bool
    public var branch: Branch
  }

  public enum Instruction: Sendable, Equatable {
    /// Message text carried inside the instruction itself.
    case message([Payload.TextDocument.Token])
    case messageIndexed(MessageSource)
    /// Plays `base + (random & mask)`, and clears the pending key when that
    /// lands on message zero — a fall-through in the original dispatch.
    case messageRandom(base: Int, mask: Int)

    /// Waits for the next tick of the wait counter, then tests whether the
    /// counter has reached `ticks`.
    case waitTicks(Int, Condition)
    case clearTickCounter

    case testKey(BensonKey, Condition)
    case clearKey

    /// True when no bit of `mask` is set in the engine flags.
    case testFlags(mask: UInt8, Condition)
    case setFlags(mask: UInt8)
    case clearFlags(mask: UInt8)

    /// True when the room register does *not* match the player's room.
    case testRoom(Condition)
    /// True when the object register's object is in the player's inventory.
    case testInventory(Condition)
    /// True when the object register's object is *not* in the room register's room.
    case testObjectInRoom(Condition)
    /// True when no bit of `mask` is set in the object register's flags.
    case testObjectFlags(mask: UInt8, Condition)
    /// True when the map register's block is *not* destroyed.
    case testBlockIntact(Condition)
    /// True when the boarded craft is *not* `craft`; zero means on foot.
    case testCraft(craft: Int, Condition)
    /// True when `value` is at least a freshly drawn random byte.
    case testRandom(value: Int, Condition)
    /// True when `value` is at least the byte held by `symbol`.
    case testSymbol(BensonSymbol, value: Int, Condition)

    case loadDecimal(decimal: Int, value: Int)
    case addDecimal(decimal: Int, value: Int)
    case addDecimals(into: Int, a: Int, b: Int)
    case loadRegister(register: Int, value: Int)
    case copyRegister(source: Int, target: Int)
    case changeObjectFlags(mode: MaskMode, mask: UInt8)

    case write(BensonSymbol, value: Int)
    case sound(symbol: String, value: Int)

    case jump(Int)
    case call(Int)
    case ret
  }

  public let instructions: [Instruction]
  /// Instruction index each script starts at, by script id.
  public let entries: [Int]
  /// Decimal registers play starts with, by slot.
  public let decimalSeeds: [Int: Int]
  public let framesPerTick: Int

  /// Build a program directly. The payload route validates into this; a test or
  /// a future scripting layer can assemble instructions without a document.
  public init(
    instructions: [Instruction],
    entries: [Int],
    decimalSeeds: [Int: Int] = [:],
    framesPerTick: Int = 50
  ) {
    self.instructions = instructions
    self.entries = entries
    self.decimalSeeds = decimalSeeds
    self.framesPerTick = framesPerTick
  }

  public init(document: Payload.BensonDocument) throws {
    var decoded: [Instruction] = []
    decoded.reserveCapacity(document.instructions.count)
    let count = document.instructions.count
    for (index, raw) in document.instructions.enumerated() {
      decoded.append(try Self.decode(raw, at: index, of: count))
    }
    self.instructions = decoded

    var entries = Array(repeating: 0, count: document.scripts.count)
    for script in document.scripts {
      guard document.scripts.indices.contains(script.id) else {
        throw BensonError.badScript(script.id)
      }
      guard decoded.indices.contains(script.entry) else {
        throw BensonError.badTarget(instruction: -1, target: script.entry)
      }
      entries[script.id] = script.entry
    }
    self.entries = entries

    var seeds: [Int: Int] = [:]
    for (slot, value) in document.decimalSeeds {
      guard let index = Int(slot) else { throw BensonError.badField("decimalSeeds", -1) }
      seeds[index] = value
    }
    self.decimalSeeds = seeds
    guard document.framesPerTick > 0 else { throw BensonError.badField("framesPerTick", -1) }
    self.framesPerTick = document.framesPerTick
  }

  public var scriptCount: Int { entries.count }

  public func entry(of script: Int) -> Int? {
    entries.indices.contains(script) ? entries[script] : nil
  }
}

/// A payload the interpreter refuses to run, reported the way payload load
/// errors are: what is wrong, and where.
public enum BensonError: Error, CustomStringConvertible, Equatable {
  case unknownOperation(String, instruction: Int)
  case badField(String, Int)
  case badTarget(instruction: Int, target: Int)
  case unknownSymbol(String, instruction: Int)
  case unknownKey(String, instruction: Int)
  case badScript(Int)

  public var description: String {
    switch self {
    case .unknownOperation(let op, let instruction):
      return "Benson instruction \(instruction) has operation '\(op)', which this interpreter does not implement."
    case .badField(let field, let instruction):
      return "Benson instruction \(instruction) is missing or misuses its '\(field)' field."
    case .badTarget(let instruction, let target):
      return "Benson instruction \(instruction) branches to \(target), which is not an instruction."
    case .unknownSymbol(let symbol, let instruction):
      return "Benson instruction \(instruction) names engine state '\(symbol)', which the host does not provide."
    case .unknownKey(let key, let instruction):
      return "Benson instruction \(instruction) tests key '\(key)', which is not bound."
    case .badScript(let id):
      return "Benson script \(id) is outside the script table."
    }
  }
}

extension BensonProgram {
  fileprivate static func decode(
    _ raw: Payload.BensonDocument.Instruction, at index: Int, of count: Int
  ) throws -> Instruction {
    func integer(_ value: Int?, _ field: String) throws -> Int {
      guard let value else { throw BensonError.badField(field, index) }
      return value
    }
    func mask(_ value: Int?, _ field: String) throws -> UInt8 {
      let value = try integer(value, field)
      guard let byte = UInt8(exactly: value) else { throw BensonError.badField(field, index) }
      return byte
    }
    func target(_ value: Int?, _ field: String) throws -> Int {
      let value = try integer(value, field)
      guard (0..<count).contains(value) else { throw BensonError.badTarget(instruction: index, target: value) }
      return value
    }
    func condition() throws -> Condition {
      guard let branchOn = raw.branchOn, let taken = raw.onTaken else {
        throw BensonError.badField("onTaken", index)
      }
      let destination = try target(taken.target, "onTaken.target")
      let branch: Branch
      switch taken.kind {
      case "jmp": branch = .jump(destination)
      case "call": branch = .call(destination)
      default: throw BensonError.badField("onTaken.kind", index)
      }
      return Condition(branchOn: branchOn, branch: branch)
    }
    func symbol() throws -> BensonSymbol {
      guard let name = raw.symbol else { throw BensonError.badField("symbol", index) }
      switch name {
      case "decimalByte":
        return .decimalByte(decimal: try integer(raw.decimal, "decimal"), byte: try integer(raw.byte, "byte"))
      case "objectRoom": return .objectRoom(slot: try integer(raw.slot, "slot"))
      case "objectFlags": return .objectFlags(slot: try integer(raw.slot, "slot"))
      case "engineFlags": return .engineFlags
      case "currentRoom": return .currentRoom
      case "boardedCraft": return .boardedCraft
      case "inputKey": return .inputKey
      case "signedRegister": return .signedRegister
      case "messageInterval": return .messageInterval
      case "attackingShip": return .attackingShip
      case "gameComplete": return .gameComplete
      case "shipInbound": return .shipInbound
      default: throw BensonError.unknownSymbol(name, instruction: index)
      }
    }

    switch raw.op {
    case "msg":
      guard let tokens = raw.tokens else { throw BensonError.badField("tokens", index) }
      return .message(tokens)
    case "msgi":
      switch raw.source {
      case "immediate": return .messageIndexed(.immediate(try integer(raw.index, "index")))
      case "register": return .messageIndexed(.register(try integer(raw.register, "register")))
      default: throw BensonError.badField("source", index)
      }
    case "msgr":
      return .messageRandom(base: try integer(raw.base, "base"), mask: try integer(raw.mask, "mask"))
    case "wfr": return .waitTicks(try integer(raw.ticks, "ticks"), try condition())
    case "cfr": return .clearTickCounter
    case "tstk":
      guard let name = raw.key else { throw BensonError.badField("key", index) }
      guard let key = BensonKey(rawValue: name) else { throw BensonError.unknownKey(name, instruction: index) }
      return .testKey(key, try condition())
    case "clrk": return .clearKey
    case "tstf": return .testFlags(mask: try mask(raw.mask, "mask"), try condition())
    case "setf": return .setFlags(mask: try mask(raw.mask, "mask"))
    case "clrf": return .clearFlags(mask: try mask(raw.mask, "mask"))
    case "room": return .testRoom(try condition())
    case "tsti": return .testInventory(try condition())
    case "inrm": return .testObjectInRoom(try condition())
    case "tsto": return .testObjectFlags(mask: try mask(raw.mask, "mask"), try condition())
    case "tstb": return .testBlockIntact(try condition())
    case "tstc": return .testCraft(craft: try integer(raw.craft, "craft"), try condition())
    case "rand": return .testRandom(value: try integer(raw.value, "value"), try condition())
    case "cmp": return .testSymbol(try symbol(), value: try integer(raw.value, "value"), try condition())
    case "ldr": return .loadDecimal(decimal: try integer(raw.decimal, "decimal"), value: try integer(raw.value, "value"))
    case "adr": return .addDecimal(decimal: try integer(raw.decimal, "decimal"), value: try integer(raw.value, "value"))
    case "dadd":
      return .addDecimals(
        into: try integer(raw.into, "into"), a: try integer(raw.a, "a"), b: try integer(raw.b, "b")
      )
    case "loadi":
      return .loadRegister(register: try integer(raw.register, "register"), value: try integer(raw.value, "value"))
    case "load":
      return .copyRegister(source: try integer(raw.from, "from"), target: try integer(raw.to, "to"))
    case "modf":
      let mode: MaskMode
      switch raw.mode {
      case "and": mode = .and
      case "or": mode = .or
      default: throw BensonError.badField("mode", index)
      }
      return .changeObjectFlags(mode: mode, mask: try mask(raw.mask, "mask"))
    case "stor": return .write(try symbol(), value: try integer(raw.value, "value"))
    case "sound":
      guard let name = raw.symbol else { throw BensonError.badField("symbol", index) }
      return .sound(symbol: name, value: try integer(raw.value, "value"))
    case "jmp": return .jump(try target(raw.target, "target"))
    case "call": return .call(try target(raw.target, "target"))
    case "ret": return .ret
    default: throw BensonError.unknownOperation(raw.op, instruction: index)
    }
  }
}
