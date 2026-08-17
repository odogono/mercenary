import XCTest

@testable import MercenaryCLI

/// Every case here is a mistake the lenient parser accepted and acted on. The point
/// of the strict one is that they are refused with a message instead.
final class ArgumentsTests: XCTestCase {
  private func arguments(_ tokens: String...) -> Arguments {
    // The real first token is the binary's own path, which is never an option.
    Arguments(["/path/to/mercenary"] + tokens)
  }

  // MARK: - The mistakes that were silent

  func testAFlagWhoseValueIsAnotherFlagIsNotAPath() throws {
    // `--render-frame --output x.png` used to write a file called "--output" into
    // the working directory, and report success.
    let arguments = arguments("--inspect-rooms", "--output", "/tmp/rooms.png")

    XCTAssertThrowsError(try arguments.string("--inspect-rooms", expected: "a path")) { error in
      XCTAssertEqual(
        error as? Arguments.Failure,
        .missingValue(flag: "--inspect-rooms", expected: "a path")
      )
    }
  }

  func testAFlagAtTheEndOfTheLineHasNoValue() throws {
    XCTAssertThrowsError(try arguments("--output").string("--output", expected: "a path")) { error in
      XCTAssertEqual(
        error as? Arguments.Failure, .missingValue(flag: "--output", expected: "a path")
      )
    }
  }

  func testAnUnknownFlagIsNamedRatherThanIgnored() throws {
    // `--inspect-room 3 --output x.png` used to ignore --output, because the flag
    // was --out, and write to the default path instead.
    let arguments = arguments("--inspect-room", "3", "--outut", "/tmp/r.png")

    XCTAssertThrowsError(
      try arguments.rejectUnknownFlags(besides: ["--inspect-room", "--output"])
    ) { error in
      XCTAssertEqual(error as? Arguments.Failure, .unknownFlag("--outut", suggestion: "--output"))
    }
  }

  func testAValueThatIsNotANumberIsRefused() throws {
    XCTAssertThrowsError(try arguments("--room", "kitchen").int("--room")) { error in
      XCTAssertEqual(
        error as? Arguments.Failure, .notAnInteger(flag: "--room", value: "kitchen")
      )
    }
  }

  // MARK: - Suggestions

  func testAShortenedFlagSuggestsTheRealOne() {
    XCTAssertEqual(Arguments.nearest(to: "--out", among: ["--output", "--room"]), "--output")
  }

  func testATypoSuggestsTheNearestFlag() {
    XCTAssertEqual(Arguments.nearest(to: "--rom", among: ["--room", "--output"]), "--room")
  }

  func testSomethingUnrelatedSuggestsNothing() {
    XCTAssertNil(Arguments.nearest(to: "--verbose", among: ["--output", "--room"]))
  }

  func testTheSuggestionPrefersTheClosestLengthWhenSeveralMatch() {
    // --in is a prefix of both; the shorter one is the likelier intent.
    XCTAssertEqual(
      Arguments.nearest(to: "--in", among: ["--in-situ", "--inspect-structures"]), "--in-situ"
    )
  }

  // MARK: - Reading values

  func testReadsStringsIntegersAndNumbers() throws {
    let arguments = arguments("--output", "/tmp/x.png", "--room", "48", "--seconds", "2.5")

    XCTAssertEqual(try arguments.string("--output"), "/tmp/x.png")
    XCTAssertEqual(try arguments.int("--room"), 48)
    XCTAssertEqual(try arguments.double("--seconds"), 2.5)
  }

  func testAnAbsentFlagIsNilRatherThanAnError() throws {
    XCTAssertNil(try arguments("--output", "/tmp/x.png").int("--room"))
    XCTAssertFalse(arguments("--output", "/tmp/x.png").isPresent("--room"))
  }

  func testAFlagGivenMoreThanOnceKeepsEveryValue() throws {
    // The trace scenarios press several keys at different times.
    let arguments = arguments("--press", "y@6", "--press", "any@2")

    XCTAssertEqual(try arguments.values(of: "--press"), ["y@6", "any@2"])
  }

  func testOneBadValueAmongSeveralFailsTheWholeRead() throws {
    let arguments = arguments("--press", "y@6", "--press")

    XCTAssertThrowsError(try arguments.values(of: "--press", expected: "a key"))
  }

  func testNegativeNumbersAreValuesRatherThanFlags() throws {
    // A single dash is not a flag, so a negative coordinate still reads.
    XCTAssertEqual(try arguments("--x", "-4096").double("--x"), -4096)
  }

  // MARK: - Output

  func testOutputFallsBackToTheCommandsOwnDefault() throws {
    XCTAssertEqual(
      try arguments("--inspect-rooms").output(default: "/tmp/mercenary-rooms.png").path,
      "/tmp/mercenary-rooms.png"
    )
  }

  func testOutputPrefersWhatWasAskedFor() throws {
    XCTAssertEqual(
      try arguments("--output", "/tmp/mine.png").output(default: "/tmp/theirs.png").path,
      "/tmp/mine.png"
    )
  }

  func testOutputRefusesAFlagAsAPath() throws {
    XCTAssertThrowsError(
      try arguments("--output", "--in-situ").output(default: "/tmp/x.png")
    )
  }

  // MARK: - Flags

  func testOnlyDoubleDashedTokensCountAsFlags() {
    XCTAssertEqual(
      arguments("--inspect-room", "3", "-x", "--in-situ").flags,
      ["--inspect-room", "--in-situ"]
    )
  }

  func testFailuresReadAsSentences() {
    XCTAssertEqual(
      Arguments.Failure.missingValue(flag: "--output", expected: "a path to write to").description,
      "--output needs a path to write to"
    )
    XCTAssertEqual(
      Arguments.Failure.unknownFlag("--out", suggestion: "--output").description,
      "unknown option --out; did you mean --output?"
    )
    XCTAssertEqual(
      Arguments.Failure.unknownFlag("--verbose", suggestion: nil).description,
      "unknown option --verbose"
    )
    XCTAssertEqual(
      Arguments.Failure.notAnInteger(flag: "--room", value: "kitchen").description,
      "--room needs a whole number, not \"kitchen\""
    )
  }

  // MARK: - Golden traces

  /// `--trace` is a second path flag beside `--output`, not a mode of it. The two write
  /// different artifacts for different readers and a command may be asked for both, so
  /// inferring one from the other's file extension is exactly the guess this type refuses.
  func testTraceIsItsOwnPathFlag() throws {
    let arguments = arguments("--room-trace", "--output", "/tmp/report.txt", "--trace", "/tmp/t.jsonl")

    XCTAssertEqual(try arguments.trace()?.path, "/tmp/t.jsonl")
    XCTAssertEqual(try arguments.output(default: "/tmp/fallback").path, "/tmp/report.txt")
  }

  func testNoTraceFlagMeansNoTrace() throws {
    XCTAssertNil(try arguments("--room-trace", "--output", "/tmp/report.txt").trace())
  }

  /// A trace nobody asked for is not written, but a `--trace` with nowhere to write is a
  /// mistake rather than a request for a default: unlike a report, a trace has no sensible
  /// default path, and silently choosing one is how `--output` used to lose files.
  func testTraceWithNoPathIsRefused() throws {
    XCTAssertThrowsError(try arguments("--flight-trace", "--trace").trace()) { error in
      XCTAssertEqual(
        error as? Arguments.Failure,
        .missingValue(flag: "--trace", expected: "a path to write a trace to")
      )
    }
  }

  func testTraceFollowedByAnotherFlagHasNoValue() throws {
    XCTAssertThrowsError(
      try arguments("--flight-trace", "--trace", "--craft", "1").trace()
    ) { error in
      XCTAssertEqual(
        error as? Arguments.Failure,
        .missingValue(flag: "--trace", expected: "a path to write a trace to")
      )
    }
  }

  /// Each diagnostic declares `--trace` for itself, so a command that has not been given a
  /// trace emitter still refuses the flag rather than accepting it and writing nothing.
  func testACommandThatDoesNotEmitTracesStillRefusesTheFlag() throws {
    XCTAssertThrowsError(
      try arguments("--emit-traces", "--trace", "/tmp/t.jsonl")
        .rejectUnknownFlags(besides: ["--emit-traces", "--only", "--scenario", "--verify"])
    ) { error in
      XCTAssertEqual(
        error as? Arguments.Failure, .unknownFlag("--trace", suggestion: nil))
    }
  }
}
