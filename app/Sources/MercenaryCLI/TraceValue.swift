import Foundation

/// A JSON value written for a machine to compare rather than for a human to skim.
///
/// This exists because `JSONEncoder` cannot write the numbers a Golden Trace needs.
/// `Encodable` offers no way to emit a raw number, so a full-precision `Double` would
/// have to go out as a string and stop being a number to whoever parses it; and
/// `JSONEncoder`'s own `Double` formatting is a shortest-round-trip decimal, which is
/// a *different* decimal from the one JavaScript writes for the same bits. Traces are
/// the equivalence instrument for a TypeScript port (ADR 0019), so how a number
/// reaches the file is part of the contract and not an implementation detail.
///
/// This deliberately lives outside `MercenaryKit`, for the reason ``Arguments`` gives:
/// the kit is the surface a browser implementation has to reproduce, and nothing here
/// is reproduced. The browser side *parses* these files; it never writes one.
public enum TraceValue: Sendable, Equatable {
  case int(Int)
  case double(Double)
  case string(String)
  case bool(Bool)
  case null
  case array([TraceValue])
  /// Written with its keys sorted, so a dictionary's iteration order can never reach
  /// the file. Held as an array of pairs rather than a dictionary so a duplicate key
  /// is a programming error that shows up in the output instead of silently winning.
  case object([(key: String, value: TraceValue)])

  public static func == (lhs: TraceValue, rhs: TraceValue) -> Bool {
    switch (lhs, rhs) {
    case (.int(let a), .int(let b)): return a == b
    // Bit-pattern comparison, not `==`: the whole point of the encoding is that a
    // value survives exactly, and `-0 == 0` would call two different files equal.
    case (.double(let a), .double(let b)): return a.bitPattern == b.bitPattern
    case (.string(let a), .string(let b)): return a == b
    case (.bool(let a), .bool(let b)): return a == b
    case (.null, .null): return true
    case (.array(let a), .array(let b)): return a == b
    case (.object(let a), .object(let b)):
      guard a.count == b.count else { return false }
      return zip(a, b).allSatisfy { $0.key == $1.key && $0.value == $1.value }
    default: return false
    }
  }
}

extension TraceValue {
  /// A value JSON cannot carry. Refused rather than encoded: JSON has no NaN and no
  /// infinity, and a trace that quietly wrote `null` for one would claim a run
  /// reproduced when the simulation had actually come apart.
  public struct NotRepresentable: Error, CustomStringConvertible, Equatable {
    public let value: Double
    public let path: String

    public var description: String {
      "\(path) is \(value.isNaN ? "not a number" : "infinite"), which no trace can record"
    }
  }

  /// Full precision, which for a `Double` means seventeen significant digits: the
  /// shortest count that round-trips every binary64 value whatever the writer's
  /// formatting choices, so a reader recovers the exact bits.
  ///
  /// `locale: nil` is load-bearing rather than tidiness. `String(format:)` without it
  /// formats for the current locale, and in a comma-decimal locale `%.17g` writes
  /// `0,10000000000000001` — invalid JSON, and a determinism failure that appears only
  /// on some machines.
  static func digits(_ value: Double) -> String {
    String(format: "%.17g", locale: nil, value)
  }

  /// Serialize to one line, with no whitespace anywhere a diff would have to ignore.
  public func serialized(path: String = "$") throws -> String {
    var output = ""
    try write(into: &output, path: path)
    return output
  }

  private func write(into output: inout String, path: String) throws {
    switch self {
    case .int(let value):
      output += String(value)
    case .double(let value):
      guard value.isFinite else { throw NotRepresentable(value: value, path: path) }
      output += Self.digits(value)
    case .string(let value):
      output += Self.quoted(value)
    case .bool(let value):
      output += value ? "true" : "false"
    case .null:
      output += "null"
    case .array(let values):
      output += "["
      for (index, value) in values.enumerated() {
        if index > 0 { output += "," }
        try value.write(into: &output, path: "\(path)[\(index)]")
      }
      output += "]"
    case .object(let members):
      output += "{"
      for (index, member) in members.sorted(by: { Self.precedes($0.key, $1.key) }).enumerated() {
        if index > 0 { output += "," }
        output += Self.quoted(member.key)
        output += ":"
        try member.value.write(into: &output, path: "\(path).\(member.key)")
      }
      output += "}"
    }
  }

  /// The one key order every object is written in.
  ///
  /// Sorting is unconditionally the writer's job, so that no builder can leak a
  /// dictionary's iteration order into a file by forgetting to sort. But plain text
  /// order puts slot 100 before slot 9, and most objects here are keyed by object slot
  /// or room id, so an all-digit key is compared as the number it is. Shorter numbers
  /// first, then digit by digit: no leading zeros are written, so that is numeric order
  /// without parsing anything that could overflow.
  static func precedes(_ a: String, _ b: String) -> Bool {
    let aNumeric = isNumeric(a)
    let bNumeric = isNumeric(b)
    guard aNumeric == bNumeric else { return aNumeric }
    guard aNumeric, a.count != b.count else { return a < b }
    return a.count < b.count
  }

  private static func isNumeric(_ key: String) -> Bool {
    !key.isEmpty && key.unicodeScalars.allSatisfy { ("0"..."9").contains($0) }
  }

  /// A JSON string. Escapes what RFC 8259 requires and nothing else, so the text a
  /// maintainer reads in a trace is the text the game said.
  static func quoted(_ value: String) -> String {
    var output = "\""
    for scalar in value.unicodeScalars {
      switch scalar {
      case "\"": output += "\\\""
      case "\\": output += "\\\\"
      case "\n": output += "\\n"
      case "\r": output += "\\r"
      case "\t": output += "\\t"
      case "\u{08}": output += "\\b"
      case "\u{0C}": output += "\\f"
      default:
        if scalar.value < 0x20 {
          output += String(format: "\\u%04x", locale: nil, scalar.value)
        } else {
          output.unicodeScalars.append(scalar)
        }
      }
    }
    return output + "\""
  }
}

// MARK: - Building

extension TraceValue {
  /// An object from unsorted members. The writer sorts, so a caller may list members
  /// in whatever order reads best at the call site.
  public static func object(_ members: KeyValuePairs<String, TraceValue>) -> TraceValue {
    .object(members.map { (key: $0.key, value: $0.value) })
  }

  /// A `Float` widened to `Double`, which is exact.
  ///
  /// Used for ``ScreenLine``, whose coordinates are `Float`. The widening loses
  /// nothing, but it does mean the recorded value is a binary32 quantity written in
  /// full binary64 precision — so `0.1` as a `Float` reads as
  /// `0.10000000149011612`. That is not noise, it is the constraint: a port whose
  /// projection carries binary64 precision through to the screen will not reproduce
  /// these values unless it narrows at the same boundary.
  public static func float(_ value: Float) -> TraceValue {
    .double(Double(value))
  }

  /// An integer-keyed map as an object, keys written in numeric order.
  ///
  /// Every unordered collection in the game state is keyed by object slot or room id,
  /// and this is the one place their order is decided. Sorting numerically rather than
  /// by the key's text keeps slot 9 before slot 10, which is what a reader expects.
  public static func slots(_ entries: [Int: TraceValue]) -> TraceValue {
    .object(entries.keys.sorted().map { (key: String($0), value: entries[$0]!) })
  }

  /// A set of integers as a sorted array.
  public static func slots(_ entries: Set<Int>) -> TraceValue {
    .array(entries.sorted().map { .int($0) })
  }

  /// Three components in world order, so a position reads the way the code names it.
  public static func vector(_ value: SIMD3<Double>) -> TraceValue {
    .object(["x": .double(value.x), "y": .double(value.y), "z": .double(value.z)])
  }

  public static func vector(_ value: SIMD3<Float>) -> TraceValue {
    .object(["x": .float(value.x), "y": .float(value.y), "z": .float(value.z)])
  }
}
