import XCTest

@testable import MercenaryCLI

/// The writer is the one place a Golden Trace can stop being an oracle without
/// anything looking wrong, so these tests are about the encoding rather than about any
/// emitter: a rounded value, a locale-formatted separator, or a dictionary written in
/// hash order all produce a file that reads perfectly and compares as noise.
final class TraceValueTests: XCTestCase {
  func testKeysAreSortedWhateverOrderTheCallerListsThem() throws {
    let value = TraceValue.object(["zulu": .int(1), "alpha": .int(2), "mike": .int(3)])
    XCTAssertEqual(try value.serialized(), #"{"alpha":2,"mike":3,"zulu":1}"#)
  }

  func testNestedObjectsAreSortedToo() throws {
    let value = TraceValue.object([
      "outer": .object(["b": .int(1), "a": .int(2)])
    ])
    XCTAssertEqual(try value.serialized(), #"{"outer":{"a":2,"b":1}}"#)
  }

  /// Seventeen significant digits round-trips every binary64 value. Checked by
  /// parsing the text back rather than by asserting the text, because the property
  /// that matters is recovery of the bits and not any particular spelling.
  func testAwkwardDoublesRoundTripExactly() throws {
    let values: [Double] = [
      0.1, 1.0 / 3.0, 1e300, 1e-300, .leastNormalMagnitude, .leastNonzeroMagnitude,
      .greatestFiniteMagnitude, 0.30000000000000004, 1.0 / 60.0, -0.0, 0.0,
      9_007_199_254_740_993, 559_104.0, .pi,
    ]
    for value in values {
      let text = try TraceValue.double(value).serialized()
      let parsed = Double(text)
      XCTAssertNotNil(parsed, "\(text) did not parse")
      XCTAssertEqual(
        parsed?.bitPattern, value.bitPattern,
        "\(value) written as \(text) came back as \(parsed as Any)")
    }
  }

  /// Thirty seconds of accumulated sixtieths, which is the value a flight trace's
  /// clock actually reaches and the one most likely to be quietly rounded.
  func testAccumulatedClockSurvives() throws {
    var elapsed = 0.0
    for _ in 0..<1800 { elapsed += 1.0 / 60.0 }
    XCTAssertNotEqual(elapsed, 30, "the premise: the accumulated clock is not a round number")
    let text = try TraceValue.double(elapsed).serialized()
    XCTAssertEqual(Double(text)?.bitPattern, elapsed.bitPattern)
  }

  /// ADR 0012's integer-preserving rule. An `Int` never acquires a decimal point,
  /// because a slot number written `12.0` is a different fact about the payload.
  func testIntegersStayIntegers() throws {
    XCTAssertEqual(try TraceValue.int(12).serialized(), "12")
    XCTAssertEqual(try TraceValue.int(0).serialized(), "0")
    XCTAssertEqual(try TraceValue.int(-1).serialized(), "-1")
    XCTAssertEqual(try TraceValue.int(Int.max).serialized(), "9223372036854775807")
  }

  /// A whole-numbered `Double` is still a `Double`. `%.17g` writes it without a
  /// decimal point, which is fine — it parses back to the same bits — but it must not
  /// be mistaken for a reason to route doubles through `Int`.
  func testWholeDoublesRoundTrip() throws {
    XCTAssertEqual(Double(try TraceValue.double(1).serialized()), 1)
    XCTAssertEqual(Double(try TraceValue.double(128).serialized()), 128)
  }

  func testNegativeZeroIsDistinguishedFromZero() throws {
    XCTAssertNotEqual(TraceValue.double(-0.0), TraceValue.double(0.0))
    XCTAssertEqual(Double(try TraceValue.double(-0.0).serialized())?.sign, .minus)
  }

  func testNotANumberIsRefusedRatherThanEncoded() {
    XCTAssertThrowsError(try TraceValue.double(.nan).serialized()) { error in
      XCTAssertTrue(String(describing: error).contains("not a number"))
    }
    XCTAssertThrowsError(try TraceValue.double(.infinity).serialized())
    XCTAssertThrowsError(try TraceValue.double(-.infinity).serialized())
  }

  /// The path in the error names where the bad value was, since a NaN eighteen hundred
  /// records into a nested record is otherwise a needle.
  func testRefusalNamesWhereTheValueWas() {
    let value = TraceValue.object(["player": .object(["speed": .double(.nan)])])
    XCTAssertThrowsError(try value.serialized(path: "record[41]")) { error in
      XCTAssertEqual(
        (error as? TraceValue.NotRepresentable)?.path, "record[41].player.speed")
    }
  }

  /// `String(format:)` formats for the current locale unless told otherwise, and in a
  /// comma-decimal locale that writes `0,1` — invalid JSON, and a determinism failure
  /// that only shows up on some machines. Asserted by spelling out what the current
  /// locale would have done.
  func testFormattingIgnoresTheCurrentLocale() throws {
    let localized = String(format: "%.17g", locale: Locale(identifier: "de_DE"), 0.1)
    XCTAssertTrue(localized.contains(","), "the premise: this locale uses a comma")
    XCTAssertFalse(try TraceValue.double(0.1).serialized().contains(","))
    XCTAssertEqual(TraceValue.digits(0.1), "0.10000000000000001")
  }

  func testSlotKeyedMapsAreWrittenInNumericOrder() throws {
    let value = TraceValue.slots([10: .int(1), 9: .int(2), 100: .int(3), 1: .int(4)])
    XCTAssertEqual(try value.serialized(), #"{"1":4,"9":2,"10":1,"100":3}"#)
  }

  /// Numeric keys sort as numbers and named keys as text, and the two never interleave
  /// unpredictably — a slot-keyed object and a named object are different shapes, and
  /// nothing in a trace mixes them, but the order has to be total anyway.
  func testKeyOrderIsTotalAcrossNumericAndNamedKeys() throws {
    let value = TraceValue.object([
      "2": .int(1), "alpha": .int(2), "10": .int(3), "beta": .int(4),
    ])
    XCTAssertEqual(try value.serialized(), #"{"2":1,"10":3,"alpha":2,"beta":4}"#)
  }

  func testSetsAreWrittenSorted() throws {
    XCTAssertEqual(try TraceValue.slots(Set([7, 2, 19, 2])).serialized(), "[2,7,19]")
  }

  /// A `Float` widened to `Double` is exact, and reads as the binary32 quantity it is.
  /// That long tail is the `Math.fround` constraint made visible, not a rounding bug.
  func testFloatsWidenExactlyAndShowTheirBinary32Origin() throws {
    XCTAssertEqual(try TraceValue.float(0.1).serialized(), "0.10000000149011612")
    XCTAssertEqual(Float(try TraceValue.float(0.1).serialized()), 0.1)
  }

  func testStringsEscapeWhatJSONRequiresAndNothingElse() throws {
    XCTAssertEqual(try TraceValue.string("say \"hi\"").serialized(), #""say \"hi\"""#)
    XCTAssertEqual(try TraceValue.string("a\\b").serialized(), #""a\\b""#)
    XCTAssertEqual(try TraceValue.string("one\ntwo").serialized(), #""one\ntwo""#)
    XCTAssertEqual(try TraceValue.string("\t").serialized(), #""\t""#)
    XCTAssertEqual(try TraceValue.string("\u{08}").serialized(), #""\b""#)
    XCTAssertEqual(try TraceValue.string("\u{0C}").serialized(), #""\f""#)
    XCTAssertEqual(try TraceValue.string("\r").serialized(), #""\r""#)
    // A control character with no short escape goes out as a \u sequence.
    XCTAssertEqual(try TraceValue.string("\u{01}").serialized(), "\"\\u0001\"")
    // Message text is the Reference Build's own, and reads better unescaped.
    XCTAssertEqual(
      try TraceValue.string("ITS VERY DARK IN HERE").serialized(),
      #""ITS VERY DARK IN HERE""#)
  }

  func testEverythingIsOnOneLine() throws {
    let value = TraceValue.object([
      "a": .array([.int(1), .object(["b": .string("x")])]),
      "c": .null,
      "d": .bool(true),
    ])
    let text = try value.serialized()
    XCTAssertFalse(text.contains("\n"))
    XCTAssertEqual(text, #"{"a":[1,{"b":"x"}],"c":null,"d":true}"#)
  }

  /// Serialization is what a trace compares, so equal output from unequal input would
  /// be a false pass. This is the writer's own consistency check.
  func testSameValueSerializesIdenticallyAcrossCalls() throws {
    let value = TraceValue.object([
      "slots": .slots([3: .double(0.1), 1: .double(1e300)]),
      "text": .string("a\tb"),
    ])
    XCTAssertEqual(try value.serialized(), try value.serialized())
  }
}
