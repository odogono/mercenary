import Foundation
import MercenaryCLI
import MercenaryKit

/// `--emit-traces`: regenerate the Golden Traces, or check that they reproduce.
///
/// Traces are derived from the Data Payload exactly as the payload is derived from the
/// Reference Build, so they are regenerated on demand and never tracked (ADR 0019). This is
/// the command that does it, and `--verify` is the one that can actually assert what #66
/// asks for: that the same payload, settings and inputs produce byte-identical files.
enum EmitTracesCommand {
  /// Bumped when the manifest's own shape changes.
  ///
  /// 2: records the maintainer's acceptance of the scenario set, or `null` if there is none.
  static let manifestVersion = 2

  struct Options {
    var only: TraceEmitter?
    var scenario: String?
    /// Re-emit and compare instead of writing.
    var verify = false
    /// Where the traces live. Not a flag: `/traces/` beside the payload is the one place
    /// they belong, and a command that could write them anywhere would make the manifest's
    /// relative paths meaningless.
    var root: URL
  }

  static let knownFlags: Set<String> = [
    "--emit-traces", "--only", "--scenario", "--verify",
  ]

  static func options(from arguments: [String]) throws -> Options? {
    let arguments = Arguments(arguments)
    guard arguments.isPresent("--emit-traces") else { return nil }
    try arguments.rejectUnknownFlags(besides: knownFlags)
    var only: TraceEmitter?
    if let name = try arguments.string("--only", expected: "an emitter name") {
      guard let emitter = TraceEmitter(rawValue: name) else {
        throw Failure.unknownEmitter(name)
      }
      only = emitter
    }
    return Options(
      only: only,
      scenario: try arguments.string("--scenario", expected: "a scenario id"),
      verify: arguments.isPresent("--verify"),
      root: try root()
    )
  }

  enum Failure: Error, CustomStringConvertible {
    case unknownEmitter(String)
    case nothingSelected(emitter: TraceEmitter?, id: String?)
    case notEmitted(String)

    var description: String {
      switch self {
      case .unknownEmitter(let name):
        return
          "'\(name)' is not an emitter; the emitters are "
          + TraceEmitter.allCases.map(\.rawValue).joined(separator: ", ")
      case .nothingSelected(let emitter, let id):
        let what = [emitter?.rawValue, id].compactMap { $0 }.joined(separator: "/")
        return "no scenario matches \(what.isEmpty ? "that selection" : what)"
      case .notEmitted(let path):
        return "\(path) has not been emitted yet, so there is nothing to verify against"
      }
    }
  }

  /// `/traces/` at the repository root, found the way the payload is found.
  private static func root() throws -> URL {
    guard let payload = PayloadLocator.locate() else { throw TraceRun.Failure.noPayload }
    return payload.deletingLastPathComponent().appendingPathComponent("traces", isDirectory: true)
  }

  static func run(_ options: Options) -> Int32 {
    do {
      let run = try TraceRun()
      let catalogue = try TraceScenarios.load()
      let selected = catalogue.selected(emitter: options.only, id: options.scenario)
      guard !selected.isEmpty else {
        throw Failure.nothingSelected(emitter: options.only, id: options.scenario)
      }

      // Whether a maintainer has accepted what this set pins, and whether that acceptance
      // still applies. Said before anything is written, because it changes what the files
      // that follow are worth.
      switch catalogue.accepted {
      case .none:
        print(
          "note: no acceptance recorded in \(TraceScenarioLocator.fileName), so these traces "
            + "pin behaviour nobody has signed off (#66, ADR 0016)")
      case .some(let accepted)
      where accepted.isStale(
        against: run.bundle.manifest.sourceCoreDigest,
        traceSchemaVersion: TraceRecords.schemaVersion):
        print(
          "note: the acceptance of \(accepted.on) was given for payload "
            + "\(accepted.payloadCoreDigest.prefix(16))… at trace schema "
            + "\(accepted.traceSchemaVersion); this is payload "
            + "\(run.bundle.manifest.sourceCoreDigest.prefix(16))… at schema "
            + "\(TraceRecords.schemaVersion), so it no longer covers what is being emitted")
      case .some(let accepted):
        print("accepted \(accepted.on) — \(accepted.note)")
      }

      // Emit everything first, whether writing or verifying, so both paths run exactly the
      // same emitters over exactly the same scenarios.
      var records: [TraceFile.Written] = []
      var divergences: [String] = []
      for scenario in selected {
        let trace = try emit(run, scenario: scenario)
        let url = options.root
          .appendingPathComponent(scenario.emitter.directory, isDirectory: true)
          .appendingPathComponent("\(scenario.id).jsonl")
        let path = TraceFile.relative(url, to: options.root)

        if options.verify {
          guard let existing = try? Data(contentsOf: url) else {
            throw Failure.notEmitted(path)
          }
          if let divergence = TraceFile.compare(expected: existing, actual: trace.bytes) {
            divergences.append(path)
            print("✗ \(path)")
            print("  " + divergence.description.replacingOccurrences(of: "\n", with: "\n  "))
          } else {
            print("✓ \(path) — \(trace.recordCount) records reproduce")
          }
          records.append(
            TraceFile.Written(
              emitter: scenario.emitter.rawValue, id: scenario.id, path: path,
              sha256: TraceFile.digest(trace.bytes), size: trace.bytes.count,
              records: trace.recordCount))
        } else {
          let record = try trace.write(to: url, relativeTo: options.root)
          records.append(record)
          print("wrote \(record.path) — \(record.records) records, \(record.size) bytes")
        }
      }

      // A partial run describes part of the set, so it must not touch a manifest that
      // claims to describe all of it — nor be judged against one.
      let whole = options.only == nil && options.scenario == nil
      let bytes = try manifest(run, catalogue: catalogue, files: records)

      guard options.verify else {
        guard whole else {
          print("manifest.json left alone, because this run wrote only part of the set")
          return 0
        }
        try bytes.write(to: manifestURL(options.root), options: .atomic)
        print("wrote manifest.json — \(records.count) traces")
        return 0
      }

      // The manifest carries every trace's digest, so comparing it is a second, independent
      // check on the same claim: it would catch a trace whose bytes were compared against a
      // file the manifest never described.
      if whole {
        guard let expected = try? Data(contentsOf: manifestURL(options.root)) else {
          throw Failure.notEmitted("manifest.json")
        }
        if let divergence = TraceFile.compare(expected: expected, actual: bytes) {
          divergences.append("manifest.json")
          print("✗ manifest.json")
          print("  " + divergence.description.replacingOccurrences(of: "\n", with: "\n  "))
        } else {
          print("✓ manifest.json reproduces")
        }
      }

      guard divergences.isEmpty else {
        let plural = divergences.count == 1 ? "" : "s"
        let message =
          "error: \(divergences.count) file\(plural) did not reproduce: "
          + divergences.joined(separator: ", ") + "\n"
        FileHandle.standardError.write(Data(message.utf8))
        return 1
      }
      print(
        "\(records.count) trace\(records.count == 1 ? "" : "s")"
          + "\(whole ? " and the manifest" : "") reproduce byte-for-byte")
      return 0
    } catch {
      FileHandle.standardError.write(Data("error: \(error)\n".utf8))
      return 1
    }
  }

  private static func manifestURL(_ root: URL) -> URL {
    root.appendingPathComponent("manifest.json")
  }

  /// Drive whichever emitter a scenario names.
  static func emit(_ run: TraceRun, scenario: TraceScenario) throws -> TraceFile {
    switch scenario.body {
    case .math(let body):
      return try MathTrace.emit(run, scenario: scenario, body: body)
    case .decode:
      return try DecodeTrace.emit(run, scenario: scenario)
    case .projection(let body):
      return try ProjectionTrace.emit(run, scenario: scenario, body: body)
    case .flight(let body):
      return try FlightTrace.emit(run, scenario: scenario, body: body)
    case .gameCore(let body):
      return try CoreTrace.emit(run, scenario: scenario, body: body)
    case .benson(let body):
      return try ScriptTrace.emit(run, scenario: scenario, body: body)
    case .session(let body):
      return try BensonTrace.emit(run, scenario: scenario, body: body)
    case .navigation(let body):
      return try RoomTrace.emit(run, scenario: scenario, body: body)
    }
  }

  /// What the run as a whole was.
  ///
  /// The payload's identity is taken verbatim from its own manifest rather than recomputed,
  /// and the settings are the resolved ones, so a diff to this file answers the first
  /// question a moved trace raises: was it the code, the payload, or the tuning?
  private static func manifest(
    _ run: TraceRun, catalogue: TraceScenarios, files: [TraceFile.Written]
  ) throws -> Data {
    var members: [(key: String, value: TraceValue)] = [
      (key: "manifestVersion", value: .int(manifestVersion)),
      (key: "traceSchemaVersion", value: .int(TraceRecords.schemaVersion)),
      (key: "scenarioSchemaVersion", value: .int(catalogue.schemaVersion)),
      (key: "payload", value: run.payloadIdentity),
      (key: "settings", value: run.settingsValue),
      (key: "dt", value: .double(TraceRun.dt)),
      (
        key: "accepted",
        value: catalogue.accepted.map { accepted in
          .object([
            "on": .string(accepted.on),
            "payloadCoreDigest": .string(accepted.payloadCoreDigest),
            "traceSchemaVersion": .int(accepted.traceSchemaVersion),
            "note": .string(accepted.note),
          ])
        } ?? .null
      ),
      (
        key: "scenarios",
        value: .object(
          TraceEmitter.allCases.compactMap { emitter in
            let count = catalogue.selected(emitter: emitter).count
            return count == 0 ? nil : (key: emitter.rawValue, value: .int(count))
          })
      ),
    ]
    let described: [TraceValue] = files.sorted { $0.path < $1.path }.map { file in
      .object([
        "emitter": .string(file.emitter),
        "id": .string(file.id),
        "path": .string(file.path),
        "sha256": .string(file.sha256),
        "size": .int(file.size),
        "records": .int(file.records),
      ])
    }
    members.append((key: "files", value: .array(described)))
    return Data((try TraceValue.object(members).serialized(path: "manifest") + "\n").utf8)
  }
}
