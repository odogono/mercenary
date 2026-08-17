import XCTest

@testable import MercenaryCLI

/// The file layer's job is that a divergence reports as a line number rather than as
/// "the bytes differ", and that a manifest records the same file wherever the
/// repository is checked out.
final class TraceFileTests: XCTestCase {
  private func file(records: [Int]) throws -> TraceFile {
    var trace = TraceFile(emitter: "flight", id: "craft-01")
    try trace.header(.object(["schema": .int(1), "dt": .double(1.0 / 60.0)]))
    for step in records {
      try trace.record(.object(["step": .int(step), "speed": .double(Double(step) / 3)]))
    }
    return trace
  }

  func testHeaderThenOneLinePerRecordAndATrailingNewline() throws {
    let bytes = try file(records: [0, 1, 2]).bytes
    let text = String(decoding: bytes, as: UTF8.self)
    XCTAssertTrue(text.hasSuffix("\n"))
    XCTAssertEqual(text.split(separator: "\n").count, 4)
    XCTAssertEqual(try file(records: [0, 1, 2]).recordCount, 3)
  }

  func testTheSameTraceProducesTheSameBytes() throws {
    XCTAssertEqual(try file(records: Array(0..<200)).bytes, try file(records: Array(0..<200)).bytes)
    XCTAssertEqual(
      TraceFile.digest(try file(records: Array(0..<200)).bytes),
      TraceFile.digest(try file(records: Array(0..<200)).bytes))
  }

  func testDigestIsLowercaseHexOfTheWrittenBytes() {
    // The empty string's SHA-256, so the digest is checked against a known value
    // rather than against another call to itself.
    XCTAssertEqual(
      TraceFile.digest(Data()),
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  }

  func testAnIdenticalPairHasNoDivergence() throws {
    let bytes = try file(records: [0, 1, 2]).bytes
    XCTAssertNil(TraceFile.compare(expected: bytes, actual: bytes))
  }

  /// The answer a maintainer wants: which step diverged, and what it did instead.
  func testADivergenceNamesTheLineAndBothRecords() throws {
    var changed = try file(records: [0, 1, 2])
    let original = try file(records: [0, 1, 2]).bytes
    try changed.record(.object(["step": .int(3), "speed": .double(99)]))
    guard let divergence = TraceFile.compare(expected: original, actual: changed.bytes) else {
      return XCTFail("a longer trace should diverge")
    }
    // Header is line 1, so a fourth record is line 5.
    XCTAssertEqual(divergence.line, 5)
    XCTAssertNil(divergence.expected)
    XCTAssertTrue(divergence.actual?.contains("\"step\":3") == true)
  }

  func testADivergenceInTheMiddleReportsTheFirstDifferingStep() throws {
    var drifted = TraceFile(emitter: "flight", id: "craft-01")
    try drifted.header(.object(["schema": .int(1), "dt": .double(1.0 / 60.0)]))
    for step in 0..<5 {
      // Step 3 drifts by one bit, which no rounded readout would show.
      let speed = step == 3 ? (Double(step) / 3).nextUp : Double(step) / 3
      try drifted.record(.object(["step": .int(step), "speed": .double(speed)]))
    }
    let divergence = TraceFile.compare(
      expected: try file(records: Array(0..<5)).bytes, actual: drifted.bytes)
    XCTAssertEqual(divergence?.line, 5, "header plus three good records, so step 3 is line 5")
    XCTAssertTrue(divergence?.description.contains("line 5 differs") == true)
  }

  func testHeaderDivergenceReportsLineOne() throws {
    var other = TraceFile(emitter: "flight", id: "craft-01")
    try other.header(.object(["schema": .int(2), "dt": .double(1.0 / 60.0)]))
    try other.record(.object(["step": .int(0), "speed": .double(0)]))
    XCTAssertEqual(
      TraceFile.compare(expected: try file(records: [0]).bytes, actual: other.bytes)?.line, 1)
  }

  /// An absolute path would make every manifest differ between checkouts, turning a
  /// determinism check into a comparison of where the repository happens to live.
  func testManifestPathsAreRelativeToTheTraceRoot() {
    let root = URL(fileURLWithPath: "/Users/someone/mercenary/traces")
    XCTAssertEqual(
      TraceFile.relative(root.appendingPathComponent("flight/craft-01.jsonl"), to: root),
      "flight/craft-01.jsonl")
  }

  func testAPathOutsideTheRootStaysAbsolute() {
    XCTAssertEqual(
      TraceFile.relative(
        URL(fileURLWithPath: "/tmp/one-off.jsonl"),
        to: URL(fileURLWithPath: "/Users/someone/mercenary/traces")),
      "/tmp/one-off.jsonl")
  }

  func testWritingReportsWhatTheManifestNeeds() throws {
    let root = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("mercenary-trace-tests-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: root) }
    let url = root.appendingPathComponent("flight/craft-01.jsonl")

    let trace = try file(records: [0, 1])
    let written = try trace.write(to: url, relativeTo: root)
    XCTAssertEqual(written.emitter, "flight")
    XCTAssertEqual(written.id, "craft-01")
    XCTAssertEqual(written.path, "flight/craft-01.jsonl")
    XCTAssertEqual(written.records, 2)
    XCTAssertEqual(written.size, trace.bytes.count)
    XCTAssertEqual(written.sha256, TraceFile.digest(trace.bytes))
    XCTAssertEqual(try Data(contentsOf: url), trace.bytes)
  }
}
