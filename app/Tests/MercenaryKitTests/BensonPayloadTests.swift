import XCTest

@testable import MercenaryKit

/// Loading benson.json from a payload directory, alongside the text it needs.
final class BensonPayloadTests: XCTestCase {
  private var directory: URL!

  override func setUpWithError() throws {
    directory = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("payload-\(UUID().uuidString)")
  }

  override func tearDownWithError() throws {
    try? FileManager.default.removeItem(at: directory)
  }

  private static let text = """
    {"schemaVersion":1,
     "words":[{"index":0,"text":"ED","suffix":true,"unused":false},
              {"index":1,"text":"LOCK","suffix":false,"unused":false}],
     "messages":[{"index":0,"tokens":[{"kind":"word","word":1},{"kind":"word","word":0}],"text":"LOCKED"}],
     "unresolvedCodes":[],"counts":{"messages":1}}
    """

  private static let benson = """
    {"schemaVersion":1,
     "scripts":[{"id":0,"entry":0}],
     "instructions":[
       {"op":"msg","tokens":[{"kind":"word","word":1},{"kind":"word","word":0}]},
       {"op":"loadi","register":14,"value":7},
       {"op":"clrf","mask":64},
       {"op":"ret"}],
     "decimalSeeds":{"8":9000},
     "framesPerTick":50,
     "counts":{"scripts":1,"instructions":4},
     "symbols":{"reads":[],"writes":[],"keys":[],"sounds":[],"opcodes":["msg"]}}
    """

  private func write(text: String? = text, benson: String? = benson) throws {
    try PayloadFixture.write(into: directory)
    if let text {
      try text.write(to: directory.appendingPathComponent("text.json"), atomically: true, encoding: .utf8)
    }
    if let benson {
      try benson.write(to: directory.appendingPathComponent("benson.json"), atomically: true, encoding: .utf8)
    }
  }

  func testAPayloadWithoutScriptsStillLoads() throws {
    try write(benson: nil)

    XCTAssertNil(try Payload.load(from: directory).benson)
  }

  func testScriptsAreLoadedWhenPresent() throws {
    try write()

    let bundle = try Payload.load(from: directory)
    let document = try XCTUnwrap(bundle.benson)
    let program = try BensonProgram(document: document)

    XCTAssertEqual(program.scriptCount, 1)
    XCTAssertEqual(program.entry(of: 0), 0)
    XCTAssertEqual(program.decimalSeeds, [8: 9000])
    XCTAssertEqual(program.instructions.last, .ret)
  }

  func testAFutureScriptSchemaIsRejected() throws {
    try write(benson: Self.benson.replacingOccurrences(of: "\"schemaVersion\":1", with: "\"schemaVersion\":2"))

    XCTAssertThrowsError(try Payload.load(from: directory)) { error in
      XCTAssertEqual(error as? Payload.LoadError, .unsupportedSchema("benson.json", 2))
    }
  }

  func testScriptsWithoutTheirTextAreRejected() throws {
    // Inline messages are word indices, so scripts without the dictionary would
    // render as nothing rather than fail visibly.
    try write(text: nil)

    XCTAssertThrowsError(try Payload.load(from: directory)) { error in
      guard case Payload.LoadError.missingFile(let name) = error else {
        return XCTFail("expected missingFile, got \(error)")
      }
      XCTAssertTrue(name.contains("text.json"))
    }
  }

  func testTheSeededHostStartsWithTheOpeningBalance() throws {
    try write()
    let program = try BensonProgram(document: try XCTUnwrap(try Payload.load(from: directory).benson))

    let host = BensonHostState(seeding: program)

    XCTAssertEqual(host.decimal(BensonHostState.firstNumberDecimal), 9000)
  }

  func testAnInlineMessageRendersThroughTheTextTable() throws {
    try write()
    let bundle = try Payload.load(from: directory)
    let program = try BensonProgram(document: try XCTUnwrap(bundle.benson))
    let table = TextTable(document: try XCTUnwrap(bundle.text))

    let started = try XCTUnwrap(
      BensonMachine.start(script: 0, of: program, state: .init(), host: .init())
    )
    let advance = BensonMachine.run(
      started.state, host: started.host, program: program, text: table
    )

    XCTAssertEqual(advance.effects, [.playMessage("LOCKED")])
  }
}
