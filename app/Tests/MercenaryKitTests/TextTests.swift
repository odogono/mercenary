import XCTest

@testable import MercenaryKit

/// Builds a small text document by hand. The words and messages are invented; only
/// the composition rules under test are real.
enum TextFixture {
  static func word(_ index: Int, _ text: String, suffix: Bool = false) -> Payload.TextDocument.Word {
    .init(index: index, text: text, suffix: suffix, unused: false)
  }

  static func token(_ kind: String, word: Int? = nil, text: String? = nil, slot: Int? = nil)
    -> Payload.TextDocument.Token
  {
    .init(kind: kind, word: word, text: text, slot: slot)
  }

  /// Index 0 is a suffix; the rest are ordinary words.
  static let words: [Payload.TextDocument.Word] = [
    word(0, "ED", suffix: true),
    word(1, "YOU"),
    word(2, "HAVE"),
    word(3, "CREDITS"),
    word(4, "LOCK"),
    word(5, "GOLD"),
  ]

  static func document(messages: [Payload.TextDocument.Message]) -> Payload.TextDocument {
    .init(
      schemaVersion: 1,
      words: words,
      messages: messages,
      unresolvedCodes: ["0x09"],
      counts: ["messages": messages.count]
    )
  }

  static func table(_ tokens: [Payload.TextDocument.Token]...) -> TextTable {
    let messages = tokens.enumerated().map { index, tokens in
      Payload.TextDocument.Message(index: index, tokens: tokens, text: "")
    }
    return TextTable(document: document(messages: messages))
  }
}

final class TextTableTests: XCTestCase {
  func testWordsAreJoinedWithSingleSpaces() {
    let table = TextFixture.table([
      TextFixture.token("word", word: 1),
      TextFixture.token("word", word: 2),
      TextFixture.token("word", word: 3),
    ])

    XCTAssertEqual(table.message(0), "YOU HAVE CREDITS")
  }

  func testASuffixWordJoinsTheWordBeforeIt() {
    let table = TextFixture.table([
      TextFixture.token("word", word: 4),
      TextFixture.token("word", word: 0),
    ])

    XCTAssertEqual(table.message(0), "LOCKED")
  }

  func testALeadingSuffixDoesNotProduceLeadingSpace() {
    let table = TextFixture.table([TextFixture.token("word", word: 0)])

    XCTAssertEqual(table.message(0), "ED")
  }

  func testAnExtraSpaceTokenDoesNotDoubleTheGap() {
    let table = TextFixture.table([
      TextFixture.token("word", word: 1),
      TextFixture.token("space"),
      TextFixture.token("word", word: 2),
    ])

    XCTAssertEqual(table.message(0), "YOU HAVE")
  }

  func testAnInlineLiteralIsSpacedLikeAWord() {
    let table = TextFixture.table([
      TextFixture.token("word", word: 1),
      TextFixture.token("literal", text: "TARG"),
    ])

    XCTAssertEqual(table.message(0), "YOU TARG")
  }

  func testANumberSlotIsFilledFromSubstitutions() {
    let table = TextFixture.table([
      TextFixture.token("word", word: 1),
      TextFixture.token("word", word: 2),
      TextFixture.token("number", slot: 0),
      TextFixture.token("word", word: 3),
    ])

    XCTAssertEqual(
      table.message(0, substituting: .init(numbers: [0: 5000])),
      "YOU HAVE 5000 CREDITS"
    )
  }

  func testAnUnfilledNumberSlotReadsAsZero() {
    let table = TextFixture.table([TextFixture.token("number", slot: 0)])

    XCTAssertEqual(table.message(0), "0")
  }

  func testASubstitutionFallsBackToItsDecodedWord() {
    let table = TextFixture.table([TextFixture.token("substitution", word: 5, slot: 0)])

    XCTAssertEqual(table.message(0), "GOLD")
  }

  func testASubstitutionCanBeOverridden() {
    let table = TextFixture.table([TextFixture.token("substitution", word: 5, slot: 0)])

    XCTAssertEqual(table.message(0, substituting: .init(words: [0: 4])), "LOCK")
  }

  func testAnUnknownTokenKindIsSkippedRatherThanRendered() {
    let table = TextFixture.table([
      TextFixture.token("word", word: 1),
      TextFixture.token("future-token"),
      TextFixture.token("word", word: 2),
    ])

    XCTAssertEqual(table.message(0), "YOU HAVE")
  }

  func testATokenReferencingAnAbsentWordIsSkipped() {
    let table = TextFixture.table([
      TextFixture.token("word", word: 1),
      TextFixture.token("word", word: 99),
    ])

    XCTAssertEqual(table.message(0), "YOU")
  }

  func testAnOutOfRangeMessageIsNil() {
    let table = TextFixture.table([TextFixture.token("word", word: 1)])

    XCTAssertNil(table.message(7))
    XCTAssertEqual(table.messageCount, 1)
  }

  func testWordLookupIsBoundsChecked() {
    let table = TextFixture.table([TextFixture.token("word", word: 1)])

    XCTAssertEqual(table.word(1), "YOU")
    XCTAssertEqual(table.word(-1), "")
    XCTAssertEqual(table.word(99), "")
  }

  func testUnresolvedCodesAreCarriedThroughForVisibility() {
    let table = TextFixture.table([TextFixture.token("word", word: 1)])

    XCTAssertEqual(table.unresolvedCodes, ["0x09"])
  }
}

final class TextPayloadTests: XCTestCase {
  private var directory: URL!

  override func setUpWithError() throws {
    directory = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("text-\(UUID().uuidString)")
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

  func testAPayloadWithoutTextStillLoads() throws {
    try PayloadFixture.write(into: directory)

    XCTAssertNil(try Payload.load(from: directory).text)
  }

  func testTextIsLoadedWhenPresent() throws {
    try PayloadFixture.write(into: directory)
    try Self.text.write(to: directory.appendingPathComponent("text.json"), atomically: true, encoding: .utf8)

    let bundle = try Payload.load(from: directory)
    let table = TextTable(document: try XCTUnwrap(bundle.text))

    XCTAssertEqual(table.message(0), "LOCKED")
  }

  func testAFutureTextSchemaIsRejected() throws {
    try PayloadFixture.write(into: directory)
    try Self.text.replacingOccurrences(of: "\"schemaVersion\":1", with: "\"schemaVersion\":2")
      .write(to: directory.appendingPathComponent("text.json"), atomically: true, encoding: .utf8)

    XCTAssertThrowsError(try Payload.load(from: directory)) { error in
      XCTAssertEqual(error as? Payload.LoadError, .unsupportedSchema("text.json", 2))
    }
  }
}
