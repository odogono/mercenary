import XCTest

@testable import MercenaryKit

/// Fixtures are hand-built documents, so the validation these tests exercise is
/// the same load-time gate a real payload passes through.
enum BensonFixture {
  static func instruction(
    _ op: String,
    tokens: [Payload.TextDocument.Token]? = nil,
    target: Int? = nil,
    branchOn: Bool? = nil,
    onTaken: Payload.BensonDocument.Branch? = nil,
    symbol: String? = nil,
    key: String? = nil,
    mask: Int? = nil,
    mode: String? = nil,
    register: Int? = nil,
    value: Int? = nil,
    source: String? = nil,
    from: Int? = nil,
    to: Int? = nil,
    index: Int? = nil,
    base: Int? = nil,
    ticks: Int? = nil,
    craft: Int? = nil,
    decimal: Int? = nil,
    byte: Int? = nil,
    slot: Int? = nil,
    a: Int? = nil,
    b: Int? = nil,
    into: Int? = nil
  ) -> Payload.BensonDocument.Instruction {
    Payload.BensonDocument.Instruction(
      op: op, tokens: tokens, target: target, branchOn: branchOn, onTaken: onTaken,
      symbol: symbol, key: key, mask: mask, mode: mode, register: register, value: value,
      source: source, from: from, to: to, index: index, base: base, ticks: ticks, craft: craft,
      decimal: decimal, byte: byte, slot: slot, a: a, b: b, into: into
    )
  }

  static func document(
    _ instructions: [Payload.BensonDocument.Instruction],
    entries: [Int] = [0],
    decimalSeeds: [String: Int] = [:],
    schemaVersion: Int = Payload.supportedBensonSchemaVersion
  ) -> Payload.BensonDocument {
    Payload.BensonDocument(
      schemaVersion: schemaVersion,
      scripts: entries.enumerated().map { .init(id: $0.offset, entry: $0.element) },
      instructions: instructions,
      decimalSeeds: decimalSeeds,
      framesPerTick: 50,
      counts: [:]
    )
  }

  static func branch(_ target: Int, kind: String = "jmp") -> Payload.BensonDocument.Branch {
    .init(kind: kind, target: target)
  }

  /// A word dictionary and message table wide enough for the message tests.
  static var text: TextTable {
    let words = [
      Payload.TextDocument.Word(index: 0, text: "ED", suffix: true, unused: false),
      Payload.TextDocument.Word(index: 1, text: "YOU", suffix: false, unused: false),
      Payload.TextDocument.Word(index: 2, text: "HAVE", suffix: false, unused: false),
      Payload.TextDocument.Word(index: 3, text: "CREDITS", suffix: false, unused: false),
    ]
    let messages = (0..<8).map { index in
      Payload.TextDocument.Message(
        index: index,
        tokens: [
          .init(kind: "literal", word: nil, text: "MESSAGE", slot: nil),
          .init(kind: "number", word: nil, text: nil, slot: 0),
        ],
        text: "MESSAGE {number0}"
      )
    }
    return TextTable(
      document: .init(
        schemaVersion: 1, words: words, messages: messages, unresolvedCodes: [], counts: [:]
      )
    )
  }
}

final class BensonProgramTests: XCTestCase {
  func testDecodesEveryOperationTheReferenceBuildUses() throws {
    let document = BensonFixture.document([
      BensonFixture.instruction("msg", tokens: []),
      BensonFixture.instruction("msgi", source: "immediate", index: 3),
      BensonFixture.instruction("msgi", register: 14, source: "register"),
      BensonFixture.instruction("msgr", mask: 3, base: 4),
      BensonFixture.instruction("cfr"),
      BensonFixture.instruction("clrk"),
      BensonFixture.instruction("setf", mask: 1),
      BensonFixture.instruction("clrf", mask: 64),
      BensonFixture.instruction("loadi", register: 14, value: 7),
      BensonFixture.instruction("load", from: 4, to: 13),
      BensonFixture.instruction("modf", mask: 4, mode: "or"),
      BensonFixture.instruction("ldr", value: 9000, decimal: 8),
      BensonFixture.instruction("adr", value: 99_995_000, decimal: 8),
      BensonFixture.instruction("dadd", a: 8, b: 9, into: 8),
      BensonFixture.instruction("sound", symbol: "voice1.control", value: 0),
      BensonFixture.instruction("stor", symbol: "objectRoom", value: 1, slot: 46),
      BensonFixture.instruction("wfr", branchOn: false, onTaken: BensonFixture.branch(0), ticks: 5),
      BensonFixture.instruction("tstk", branchOn: false, onTaken: BensonFixture.branch(0), key: "keyY"),
      BensonFixture.instruction("tstf", branchOn: false, onTaken: BensonFixture.branch(0), mask: 1),
      BensonFixture.instruction("room", branchOn: true, onTaken: BensonFixture.branch(0)),
      BensonFixture.instruction("tsti", branchOn: true, onTaken: BensonFixture.branch(0)),
      BensonFixture.instruction("inrm", branchOn: true, onTaken: BensonFixture.branch(0)),
      BensonFixture.instruction("tsto", branchOn: false, onTaken: BensonFixture.branch(0), mask: 4),
      BensonFixture.instruction("tstb", branchOn: true, onTaken: BensonFixture.branch(0)),
      BensonFixture.instruction("tstc", branchOn: false, onTaken: BensonFixture.branch(0), craft: 1),
      BensonFixture.instruction("rand", branchOn: false, onTaken: BensonFixture.branch(0), value: 64),
      BensonFixture.instruction(
        "cmp", branchOn: false, onTaken: BensonFixture.branch(0), symbol: "decimalByte",
        value: 0, decimal: 8, byte: 0
      ),
      BensonFixture.instruction("jmp", target: 0),
      BensonFixture.instruction("call", target: 0),
      BensonFixture.instruction("ret"),
    ])

    let program = try BensonProgram(document: document)

    XCTAssertEqual(program.instructions.count, document.instructions.count)
    XCTAssertEqual(program.instructions[1], .messageIndexed(.immediate(3)))
    XCTAssertEqual(program.instructions[2], .messageIndexed(.register(14)))
    XCTAssertEqual(program.instructions[9], .copyRegister(source: 4, target: 13))
    XCTAssertEqual(program.instructions[15], .write(.objectRoom(slot: 46), value: 1))
    XCTAssertEqual(program.instructions[29], .ret)
  }

  func testCarriesTheEntryPointsAndSeeds() throws {
    let document = BensonFixture.document(
      [BensonFixture.instruction("ret"), BensonFixture.instruction("clrk")],
      entries: [1, 0],
      decimalSeeds: ["8": 9000]
    )

    let program = try BensonProgram(document: document)

    XCTAssertEqual(program.entry(of: 0), 1)
    XCTAssertEqual(program.entry(of: 1), 0)
    XCTAssertEqual(program.decimalSeeds, [8: 9000])
    XCTAssertEqual(program.framesPerTick, 50)
  }

  func testKeepsABranchOutcomeAndItsKind() throws {
    let document = BensonFixture.document([
      BensonFixture.instruction("room", branchOn: true, onTaken: BensonFixture.branch(1, kind: "call")),
      BensonFixture.instruction("ret"),
    ])

    let program = try BensonProgram(document: document)

    guard case .testRoom(let condition) = program.instructions[0] else {
      return XCTFail("expected a room test")
    }
    XCTAssertTrue(condition.branchOn)
    XCTAssertEqual(condition.branch, .call(1))
  }

  func testRejectsAnOperationItDoesNotImplement() {
    let document = BensonFixture.document([BensonFixture.instruction("func", target: 0)])

    XCTAssertThrowsError(try BensonProgram(document: document)) { error in
      XCTAssertEqual(error as? BensonError, .unknownOperation("func", instruction: 0))
      XCTAssertTrue("\(error)".contains("does not implement"))
    }
  }

  func testRejectsAMissingOperand() {
    let document = BensonFixture.document([BensonFixture.instruction("setf")])

    XCTAssertThrowsError(try BensonProgram(document: document)) { error in
      XCTAssertEqual(error as? BensonError, .badField("mask", 0))
    }
  }

  func testRejectsABranchToNothing() {
    let document = BensonFixture.document([
      BensonFixture.instruction("room", branchOn: false, onTaken: BensonFixture.branch(7))
    ])

    XCTAssertThrowsError(try BensonProgram(document: document)) { error in
      XCTAssertEqual(error as? BensonError, .badTarget(instruction: 0, target: 7))
    }
  }

  func testRejectsAnUnknownSymbol() {
    let document = BensonFixture.document([
      BensonFixture.instruction("stor", symbol: "somethingElse", value: 1)
    ])

    XCTAssertThrowsError(try BensonProgram(document: document)) { error in
      XCTAssertEqual(error as? BensonError, .unknownSymbol("somethingElse", instruction: 0))
      XCTAssertTrue("\(error)".contains("the host does not provide"))
    }
  }

  func testRejectsAnUnboundKey() {
    let document = BensonFixture.document([
      BensonFixture.instruction("tstk", branchOn: false, onTaken: BensonFixture.branch(0), key: "keyQ")
    ])

    XCTAssertThrowsError(try BensonProgram(document: document)) { error in
      XCTAssertEqual(error as? BensonError, .unknownKey("keyQ", instruction: 0))
    }
  }

  func testRejectsAScriptEnteringNothing() {
    let document = BensonFixture.document([BensonFixture.instruction("ret")], entries: [4])

    XCTAssertThrowsError(try BensonProgram(document: document)) { error in
      XCTAssertEqual(error as? BensonError, .badTarget(instruction: -1, target: 4))
    }
  }
}
