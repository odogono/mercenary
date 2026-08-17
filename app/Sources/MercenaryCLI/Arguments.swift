import Foundation

/// Reads a command line strictly, so a mistyped invocation is refused rather than
/// quietly given a default.
///
/// Every reader here fails on a flag whose value is missing, is another flag, or is
/// not the kind of value the flag wants. That sounds obvious; the reason it is
/// spelled out is that the lenient version of each of these silently did something
/// else instead. Passing `--output` to a command whose flag was `--out` wrote to the
/// default path and reported success. Passing it to a command that took its path as
/// the next token wrote a file *named* `--output` into the working directory. And a
/// `name@seconds` operand written `name:seconds` became "at zero seconds" with no
/// complaint. All three looked like they had worked.
///
/// This deliberately lives outside `MercenaryKit`: reading a command line is host
/// tooling, and the kit is the surface a browser implementation has to reproduce.
public struct Arguments: Sendable {
  public enum Failure: Error, CustomStringConvertible, Equatable {
    /// The flag was last, or the token after it was another flag.
    case missingValue(flag: String, expected: String)
    case notAnInteger(flag: String, value: String)
    case notANumber(flag: String, value: String)
    /// A flag this command does not have, with the nearest one it does.
    case unknownFlag(String, suggestion: String?)

    public var description: String {
      switch self {
      case .missingValue(let flag, let expected):
        return "\(flag) needs \(expected)"
      case .notAnInteger(let flag, let value):
        return "\(flag) needs a whole number, not \(value.debugDescription)"
      case .notANumber(let flag, let value):
        return "\(flag) needs a number, not \(value.debugDescription)"
      case .unknownFlag(let flag, let suggestion):
        guard let suggestion else { return "unknown option \(flag)" }
        return "unknown option \(flag); did you mean \(suggestion)?"
      }
    }
  }

  private let tokens: [String]

  public init(_ tokens: [String]) {
    // The first token is the binary's own path, never an option.
    self.tokens = Array(tokens.dropFirst())
  }

  public func isPresent(_ flag: String) -> Bool {
    tokens.contains(flag)
  }

  /// Every flag-shaped token, in order. A value is never flag-shaped, because a
  /// flag-shaped value is refused as a missing one.
  public var flags: [String] {
    tokens.filter { $0.hasPrefix("--") }
  }

  /// The value after `flag`, or nil when the flag is absent.
  public func string(_ flag: String, expected: String = "a value") throws -> String? {
    guard let value = try values(of: flag, expected: expected).first else { return nil }
    return value
  }

  /// Every value for a flag that may be given more than once.
  public func values(of flag: String, expected: String = "a value") throws -> [String] {
    var found: [String] = []
    for (index, token) in tokens.enumerated() where token == flag {
      let next = index + 1 < tokens.count ? tokens[index + 1] : nil
      guard let next, !next.hasPrefix("--") else {
        throw Failure.missingValue(flag: flag, expected: expected)
      }
      found.append(next)
    }
    return found
  }

  public func int(_ flag: String, expected: String = "a whole number") throws -> Int? {
    guard let value = try string(flag, expected: expected) else { return nil }
    guard let number = Int(value) else { throw Failure.notAnInteger(flag: flag, value: value) }
    return number
  }

  public func double(_ flag: String, expected: String = "a number") throws -> Double? {
    guard let value = try string(flag, expected: expected) else { return nil }
    guard let number = Double(value) else { throw Failure.notANumber(flag: flag, value: value) }
    return number
  }

  /// Where a command should write, from `--output`, or its own default.
  public func output(default fallback: String) throws -> URL {
    let path = try string("--output", expected: "a path to write to") ?? fallback
    return URL(fileURLWithPath: path)
  }

  /// Refuse any flag this command does not have.
  ///
  /// Only called once a command has claimed the invocation, because the entry point
  /// offers the line to each command in turn and the others' flags are not unknown —
  /// they just belong to somebody else.
  public func rejectUnknownFlags(besides known: Set<String>) throws {
    for flag in flags where !known.contains(flag) {
      throw Failure.unknownFlag(flag, suggestion: Self.nearest(to: flag, among: known))
    }
  }

  /// The known flag most likely to have been meant, if one stands out.
  ///
  /// A prefix relation covers the mistake actually made — `--out` for `--output` —
  /// and one edit covers a typo. Anything further apart is not a guess worth making.
  static func nearest(to flag: String, among known: Set<String>) -> String? {
    let byPrefix = known.filter { $0.hasPrefix(flag) || flag.hasPrefix($0) }
    if let closest = byPrefix.min(by: { abs($0.count - flag.count) < abs($1.count - flag.count) }) {
      return closest
    }
    return known.filter { editDistance($0, flag) <= 1 }.sorted().first
  }

  private static func editDistance(_ a: String, _ b: String) -> Int {
    let first = Array(a), second = Array(b)
    var previous = Array(0...second.count)
    for i in 1...max(1, first.count) where !first.isEmpty {
      var row = [i] + Array(repeating: 0, count: second.count)
      for j in 1...max(1, second.count) where !second.isEmpty {
        row[j] = min(
          previous[j] + 1,
          row[j - 1] + 1,
          previous[j - 1] + (first[i - 1] == second[j - 1] ? 0 : 1)
        )
      }
      previous = row
    }
    return previous[second.count]
  }
}
