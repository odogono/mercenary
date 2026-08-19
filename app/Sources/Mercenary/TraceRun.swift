import CryptoKit
import Foundation
import MercenaryCLI
import MercenaryKit

/// What every Golden Trace in a run shares: the payload it came from, the settings it
/// ran on, and the fixed step it was driven at.
///
/// Held together because a trace is only an oracle in company with these. The same
/// scenario against a re-exported payload or a retuned settings file is a different run
/// that would reproduce differently, and a file that did not say so would look like a
/// regression the next time somebody compared it.
struct TraceRun {
  /// The step every behavioural emitter is driven at, which is the step the existing
  /// diagnostics already use. Recorded in each header so a replay feeds the same one.
  static let dt = 1.0 / 60.0

  let payloadDirectory: URL
  let bundle: Payload.Bundle
  let settings: Settings
  /// Digest of the settings file as it was read, or nil when there is no file and the
  /// defaults applied.
  let settingsDigest: String?
  /// Digest of `payload/manifest.json` as bytes. That file lists every payload file's own
  /// `sha256`, so this one value transitively pins the whole payload without inventing a
  /// second hashing scheme over the content.
  let payloadManifestDigest: String

  init() throws {
    guard let directory = PayloadLocator.locate() else { throw Failure.noPayload }
    payloadDirectory = directory
    bundle = try Payload.load(from: directory)
    settings = try Settings.load()
    settingsDigest = SettingsLocator.locate()
      .flatMap { try? Data(contentsOf: $0) }
      .map { TraceFile.digest($0) }
    payloadManifestDigest = TraceFile.digest(
      try Data(contentsOf: directory.appendingPathComponent("manifest.json"))
    )
  }

  enum Failure: Error, CustomStringConvertible {
    case noPayload
    case noFlight
    case noScripts
    case noRoom(Int)
    case noCraft(Int)
    case noObject(Int)
    case scriptWouldNotStart(Int)
    case unknownKey(String)
    case badSlotKey(String, field: String)
    case badFlagByte(Int, slot: Int)

    var description: String {
      switch self {
      case .noPayload: return "no Data Payload found"
      case .noFlight: return "this Data Payload carries no craft parameters"
      case .noScripts: return "this Data Payload carries no scripts"
      case .noRoom(let id): return "no room \(id) in this payload"
      case .noCraft(let slot): return "no craft in slot \(slot)"
      case .noObject(let slot): return "no object in slot \(slot)"
      case .scriptWouldNotStart(let id): return "script \(id) would not start"
      case .unknownKey(let name): return "'\(name)' is not a key any script tests"
      case .badSlotKey(let key, let field):
        return "\(field) is keyed by object slot, and '\(key)' is not a slot number"
      case .badFlagByte(let value, let slot):
        return "object \(slot)'s flags are one byte, and \(value) does not fit in one"
      }
    }
  }

  var world: World { World(bundle: bundle) }

  var flight: FlightModel? {
    let world = self.world
    return bundle.flight.map {
      settings.flight.model(for: $0, groundExtent: Double(world.groundExtent))
    }
  }

  func scripts(seed: UInt64? = nil, timeScale: Double? = nil) throws -> BensonSession? {
    guard let document = bundle.benson, let text = bundle.text else { return nil }
    let program = try BensonProgram(document: document)
    var tunables = settings.bensonTunables(framesPerTick: program.framesPerTick)
    if let timeScale { tunables.timeScale = timeScale }
    if let seed {
      return BensonSession(
        program: program, text: TextTable(document: text), tunables: tunables, randomSeed: seed)
    }
    return BensonSession(program: program, text: TextTable(document: text), tunables: tunables)
  }

  /// Where the payload came from, taken verbatim from its own manifest rather than
  /// recomputed. `sourceCoreDigest` and `sourceDatasetId` are the payload's own provenance,
  /// so a trace says which extraction it belongs to and not merely that some payload
  /// hashed to something.
  var payloadIdentity: TraceValue {
    .object([
      "sourceDatasetId": .string(bundle.manifest.sourceDatasetId),
      "sourceCoreDigest": .string(bundle.manifest.sourceCoreDigest),
      "decoderVersion": .int(bundle.manifest.decoderVersion),
      "schemaVersion": .int(bundle.manifest.schemaVersion),
      "manifestSha256": .string(payloadManifestDigest),
    ])
  }

  /// The tuned values as they were resolved, not as the file happened to spell them.
  ///
  /// Resolved rather than copied verbatim, because a settings file may name only what it
  /// changes: a verbatim copy of a file that omits `timeScale` would not record the time
  /// scale the run actually used, which is the one number most likely to explain why a trace
  /// moved. This full form goes in the manifest, with the file's own digest beside it.
  var settingsValue: TraceValue {
    .object([
      "digest": settingsDigest.map { .string($0) } ?? .null,
      "message": messageSettings,
      "scripts": scriptSettings,
      "flight": flightSettings,
    ])
  }

  /// The tuning *this* emitter's run actually depends on, and nothing else.
  ///
  /// Narrowed per emitter because the alternative made every trace lie about what could
  /// affect it. With the whole settings block in every header, changing the script time scale
  /// reported all thirty-seven files as differing — including the decode trace, which reads no
  /// setting at all — and the difference it reported was line 1, so the *behavioural*
  /// divergence in the traces that genuinely moved was hidden behind a header nobody could
  /// read. A header that lists only what the emitter consumes makes "this file changed" mean
  /// something: a tuning change now leaves the traces it cannot reach byte-identical.
  ///
  /// The settings file's digest is deliberately *not* here. It changes whenever any value
  /// changes, which would reintroduce exactly the problem this solves; it lives in the
  /// manifest, which is the right place to record what the run as a whole was.
  func settingsValue(for emitter: TraceEmitter) -> TraceValue? {
    var members: [(key: String, value: TraceValue)] = []
    // Anything that builds a FlightModel reads the flight knobs — walking included, since
    // walking runs on the craft control loop (ADR 0016).
    switch emitter {
    case .flight, .gameCore, .session, .navigation:
      members.append((key: "flight", value: flightSettings))
    case .math, .decode, .projection, .benson:
      break
    }
    // Anything that runs scripts reads the script clock and the message pacing, because the
    // message line is what paces the interpreter.
    switch emitter {
    case .benson, .session, .navigation:
      members.append((key: "scripts", value: scriptSettings))
      members.append((key: "message", value: messageSettings))
    case .math, .decode, .projection, .flight, .gameCore:
      break
    }
    return members.isEmpty ? nil : .object(members)
  }

  private var messageSettings: TraceValue {
    .object([
      "holdSeconds": .double(settings.message.holdSeconds),
      "charactersPerSecond": .double(settings.message.charactersPerSecond),
    ])
  }

  private var scriptSettings: TraceValue {
    .object([
      "timeScale": .double(settings.scripts.timeScale),
      "instructionBudget": .int(settings.scripts.instructionBudget),
    ])
  }

  private var flightSettings: TraceValue {
    .object([
      "referenceFrameRate": .double(settings.flight.referenceFrameRate),
      "turnScale": .double(settings.flight.turnScale),
      "pitchScale": .double(settings.flight.pitchScale),
      "speedScale": .double(settings.flight.speedScale),
      "throttleFloorNotch": .int(settings.flight.throttleFloorNotch),
      "runMultiplier": .double(settings.flight.runMultiplier),
      "groundAltitude": settings.flight.groundAltitude.map { .double($0) } ?? .null,
    ])
  }

  /// The first line of every trace.
  ///
  /// `extra` is where an emitter puts the starting state a replay needs before it can
  /// apply a single delta — the whole of the slot-keyed collections, or the decoded
  /// program, depending on the emitter.
  ///
  /// `includesPayload` is off for an emitter that reads no payload. Recording which
  /// extraction such a run belonged to would make a re-export report its trace as
  /// differing, which is the same false signal that narrowing settings per emitter was
  /// introduced to remove: a header should carry what could actually change its records.
  /// The payload's identity is in the manifest either way, so nothing stops being recorded.
  func header(
    for scenario: TraceScenario, dt: Double? = Self.dt, includesPayload: Bool = true,
    extra: [(key: String, value: TraceValue)] = []
  ) -> TraceValue {
    var members: [(key: String, value: TraceValue)] = [
      (key: "schemaVersion", value: .int(TraceRecords.schemaVersion)),
      (key: "emitter", value: .string(scenario.emitter.rawValue)),
      (key: "id", value: .string(scenario.id)),
      (key: "note", value: .string(scenario.note)),
      (key: "scenario", value: TraceScenarioRecords.value(scenario)),
    ]
    if includesPayload { members.append((key: "payload", value: payloadIdentity)) }
    if let settings = settingsValue(for: scenario.emitter) {
      members.append((key: "settings", value: settings))
    }
    if let dt { members.append((key: "dt", value: .double(dt))) }
    return .object(members + extra)
  }
}

/// A scenario as its own trace records it.
///
/// Written into the header so a trace is self-describing: a replay drives from the
/// recorded inputs, but a maintainer reading a diff needs to know which run this was
/// without going back to the catalogue and matching by id.
enum TraceScenarioRecords {
  static func value(_ scenario: TraceScenario) -> TraceValue {
    switch scenario.body {
    case .math(let body):
      return .object(["samples": .int(body.samples)])
    case .decode:
      return .object([])
    case .projection(let body):
      var members: [(key: String, value: TraceValue)] = [
        (key: "width", value: .double(body.width)),
        (key: "height", value: .double(body.height)),
        (key: "x", value: .double(body.x)),
        (key: "z", value: .double(body.z)),
        (key: "eye", value: .double(body.eye)),
        (key: "heading", value: .double(body.heading)),
        (key: "pitch", value: .double(body.pitch)),
        (key: "roll", value: .double(body.roll)),
        (key: "time", value: .double(body.time)),
      ]
      if let room = body.room { members.append((key: "room", value: .int(room))) }
      return .object(members)
    case .flight(let body):
      return .object([
        "craft": .int(body.craft),
        "notch": .int(body.notch),
        "seconds": .double(body.seconds),
        "poweramp": .bool(body.poweramp),
      ])
    case .gameCore(let body):
      return .object([
        "legs": .array(
          body.legs.map {
            .object([
              "turn": .double($0.turn), "pitch": .double($0.pitch), "walk": .double($0.walk),
              "running": .bool($0.running), "seconds": .double($0.seconds),
            ])
          }),
        "craft": body.craft.map { .int($0) } ?? .null,
        "notch": body.notch.map { .int($0) } ?? .null,
        "room": body.room.map { .int($0) } ?? .null,
        "at": body.at.map { .object(["x": .double($0.x), "z": .double($0.z)]) } ?? .null,
      ])
    case .benson(let body):
      return .object([
        "script": .int(body.script),
        "seconds": .double(body.seconds),
        "timeScale": body.timeScale.map { .double($0) } ?? .null,
        "presses": .array(
          body.presses.map {
            .object(["key": $0.key.map { .string($0) } ?? .null, "at": .double($0.at)])
          }),
        "host": .object([
          "room": .int(body.host.room),
          "craft": body.host.craft.map { .int($0) } ?? .null,
          "carrying": .array(body.host.carrying.sorted().map { .int($0) }),
          "objectRooms": .object(body.host.objectRooms.map { (key: $0.key, value: .int($0.value)) }),
          "objectFlags": .object(body.host.objectFlags.map { (key: $0.key, value: .int($0.value)) }),
        ]),
        "writes": .array(body.writes.map(write)),
        "maxInstructions": .int(body.maxInstructions),
      ])
    case .session(let body):
      return .object([
        "script": .int(body.script),
        "seconds": .double(body.seconds),
        "timeScale": body.timeScale.map { .double($0) } ?? .null,
        "presses": .array(
          body.presses.map {
            .object(["key": $0.key.map { .string($0) } ?? .null, "at": .double($0.at)])
          }),
        "boarding": .array(
          body.boarding.map { .object(["craft": .int($0.craft), "at": .double($0.at)]) }),
        "walkTo": body.walkTo.map { .int($0) } ?? .null,
        "take": .bool(body.take),
      ])
    case .navigation(let body):
      return .object([
        "room": .int(body.room),
        "at": body.at.map { .object(["x": .double($0.x), "z": .double($0.z)]) } ?? .null,
        "legs": .array(
          body.legs.map { .object(["heading": .double($0.heading), "seconds": .double($0.seconds)]) }
        ),
        "carrying": .array(body.carrying.sorted().map { .int($0) }),
        "seed": body.seed.map { .int($0) } ?? .null,
      ])
    }
  }

  static func write(_ write: TraceScenario.Benson.Write) -> TraceValue {
    var members: [(key: String, value: TraceValue)] = [(key: "at", value: .double(write.at))]
    if let room = write.room { members.append((key: "room", value: .int(room))) }
    if let craft = write.craft { members.append((key: "craft", value: .int(craft))) }
    if let carrying = write.carrying {
      members.append((key: "carrying", value: .array(carrying.sorted().map { .int($0) })))
    }
    if let rooms = write.objectRooms {
      members.append(
        (key: "objectRooms", value: .object(rooms.map { (key: $0.key, value: .int($0.value)) })))
    }
    if let flags = write.objectFlags {
      members.append(
        (key: "objectFlags", value: .object(flags.map { (key: $0.key, value: .int($0.value)) })))
    }
    return .object(members)
  }
}
