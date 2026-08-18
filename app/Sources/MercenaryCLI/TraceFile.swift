import CryptoKit
import Foundation

/// One Golden Trace on its way to disk: a header line, then one line per step.
///
/// JSON Lines rather than one JSON document, because the readable diff is the point.
/// A thirty-second flight is eighteen hundred records; as a single pretty-printed
/// document a divergence reports as "the file changed", while one record per line makes
/// a line number the answer — step 412 diverged, and here is the step.
///
/// Records accumulate in memory and are written once. A trace is a few megabytes at
/// worst, and an all-or-nothing write means a failed run leaves no half-file that a
/// later `--verify` would compare against and call a mismatch.
public struct TraceFile {
  public let emitter: String
  public let id: String
  private var lines: [String] = []

  public init(emitter: String, id: String) {
    self.emitter = emitter
    self.id = id
  }

  /// The first line: everything constant for the run, and the full starting state.
  public mutating func header(_ value: TraceValue) throws {
    precondition(lines.isEmpty, "a trace has one header, written before any record")
    lines.append(try value.serialized(path: "header"))
  }

  public mutating func record(_ value: TraceValue) throws {
    precondition(!lines.isEmpty, "a trace's header is written before its records")
    lines.append(try value.serialized(path: "record[\(lines.count - 1)]"))
  }

  /// Records written so far, not counting the header.
  public var recordCount: Int { max(0, lines.count - 1) }

  public var bytes: Data {
    Data((lines.joined(separator: "\n") + "\n").utf8)
  }

  /// What a manifest says about this file once it is written.
  public struct Written: Sendable, Equatable {
    public var emitter: String
    public var id: String
    public var path: String
    public var sha256: String
    public var size: Int
    public var records: Int

    public init(
      emitter: String, id: String, path: String, sha256: String, size: Int, records: Int
    ) {
      self.emitter = emitter
      self.id = id
      self.path = path
      self.sha256 = sha256
      self.size = size
      self.records = records
    }
  }

  @discardableResult
  public func write(to url: URL, relativeTo root: URL? = nil) throws -> Written {
    let bytes = self.bytes
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true
    )
    try bytes.write(to: url, options: .atomic)
    return Written(
      emitter: emitter,
      id: id,
      path: root.map { Self.relative(url, to: $0) } ?? url.path,
      sha256: Self.digest(bytes),
      size: bytes.count,
      records: recordCount
    )
  }

  public static func digest(_ bytes: Data) -> String {
    SHA256.hash(data: bytes).map { String(format: "%02x", locale: nil, $0) }.joined()
  }

  /// A path written relative to the trace root, so a manifest does not record which
  /// machine produced it — an absolute path would make every manifest differ between
  /// checkouts and turn a determinism check into a hostname comparison.
  public static func relative(_ url: URL, to root: URL) -> String {
    let target = url.standardizedFileURL.pathComponents
    let base = root.standardizedFileURL.pathComponents
    guard target.count > base.count, Array(target.prefix(base.count)) == base else {
      return url.path
    }
    return target.dropFirst(base.count).joined(separator: "/")
  }
}

extension TraceFile {
  /// Where two traces of the same scenario first disagree.
  ///
  /// Reported as a line number and the two lines, because that is the shape of the
  /// answer a maintainer wants: a digest comparison says something moved and a byte
  /// offset says where in a file nobody reads by offset, while "line 413" names the
  /// step and the record either side of it names what the step did differently.
  public struct Divergence: Sendable, Equatable {
    /// 1-based, counting the header as line 1.
    public var line: Int
    public var expected: String?
    public var actual: String?

    public var description: String {
      switch (expected, actual) {
      case (.some(let expected), .some(let actual)):
        let (was, now) = Self.around(theFirstDifferenceBetween: expected, and: actual)
        return "line \(line) differs\n  was: \(was)\n  now: \(now)"
      case (.some(let expected), .none):
        return "line \(line) is missing\n  was: \(Self.readable(expected))"
      case (.none, .some(let actual)):
        return "line \(line) is new\n  now: \(Self.readable(actual))"
      case (.none, .none):
        return "line \(line) differs"
      }
    }

    /// A record short enough to read, with the rest accounted for rather than dropped.
    ///
    /// A header can be kilobytes on one line, and printing it whole buries the answer the
    /// report exists to give. Truncating says so and gives the length, so a reader knows to
    /// diff the file itself rather than wondering whether the line ended there.
    static func readable(_ line: String, limit: Int = 220) -> String {
      guard line.count > limit else { return line }
      return line.prefix(limit) + "… (\(line.count) characters; diff the file for the rest)"
    }

    /// The two lines windowed on the character where they first disagree.
    ///
    /// Truncating from the start is worse than useless on a long line: the difference is
    /// usually deep in it, so both halves of the report come out looking identical and the
    /// reader learns nothing. Centring on the first differing character shows the difference
    /// itself, which is the whole reason the line is being printed.
    static func around(
      theFirstDifferenceBetween expected: String, and actual: String, window: Int = 90
    ) -> (was: String, now: String) {
      let was = Array(expected)
      let now = Array(actual)
      var at = 0
      while at < was.count, at < now.count, was[at] == now[at] { at += 1 }
      // Short enough to read whole: show it whole, since context beats a window.
      guard max(was.count, now.count) > window * 2 else { return (expected, actual) }
      let from = max(0, at - window / 2)
      func clip(_ characters: [Character]) -> String {
        guard from < characters.count else { return "(line ends before here)" }
        let text = String(characters[from..<min(characters.count, from + window)])
        return (from > 0 ? "…" : "") + text
          + (from + window < characters.count ? "…" : "")
      }
      return (
        was: "\(clip(was))  [at character \(at) of \(was.count)]",
        now: "\(clip(now))  [at character \(at) of \(now.count)]"
      )
    }
  }

  public static func compare(expected: Data, actual: Data) -> Divergence? {
    guard expected != actual else { return nil }
    let was = lines(of: expected)
    let now = lines(of: actual)
    for index in 0..<max(was.count, now.count) {
      let before = index < was.count ? was[index] : nil
      let after = index < now.count ? now[index] : nil
      guard before != after else { continue }
      return Divergence(line: index + 1, expected: before, actual: after)
    }
    // Equal line by line but unequal as bytes: a trailing-newline difference.
    return Divergence(line: max(was.count, now.count), expected: nil, actual: nil)
  }

  private static func lines(of data: Data) -> [String] {
    let text = String(decoding: data, as: UTF8.self)
    var lines = text.components(separatedBy: "\n")
    if lines.last?.isEmpty == true { lines.removeLast() }
    return lines
  }
}
