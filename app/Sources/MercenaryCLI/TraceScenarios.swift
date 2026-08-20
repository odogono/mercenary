import Foundation

/// Which Golden Trace an emitter produces.
///
/// The order is the port's own dependency order (ADR 0019, #68): each emitter observes
/// only modules at or below its own layer, so a replay gate can go green before the
/// layers above it exist. `math` observes no kit module at all, only the platform's
/// elementary functions; `decode` needs the payload and the world; `benson` needs the
/// interpreter and no world at all; `session` and `navigation` need everything.
public enum TraceEmitter: String, Sendable, Equatable, CaseIterable, Comparable, Decodable {
  case math
  case decode
  case projection
  case flight
  case gameCore = "game-core"
  case benson
  case session
  case navigation

  /// Where this emitter's traces go, under the trace root.
  public var directory: String { rawValue }

  public static func < (lhs: TraceEmitter, rhs: TraceEmitter) -> Bool {
    guard let a = allCases.firstIndex(of: lhs), let b = allCases.firstIndex(of: rhs) else {
      return lhs.rawValue < rhs.rawValue
    }
    return a < b
  }
}

/// The signed-off list of what gets traced.
///
/// Tracked, and hand-edited, for the reason ADR 0016 gives about recording a walk that has
/// been approved rather than one under construction: a Golden Trace pins behaviour a
/// maintainer has accepted, so the set of Trace Scenarios is itself a reviewable record and
/// a diff to this file is the visible moment a new one was accepted. The traces are derived
/// and gitignored; this is not.
/// Deliberately in `MercenaryCLI` rather than the kit, for the reason ``Arguments`` gives:
/// the kit is the surface a browser implementation has to reproduce, and a catalogue of runs
/// to emit is host tooling. The browser reads the traces; it never reads this.
public struct TraceScenarios: Sendable, Equatable, Decodable {
  public var schemaVersion: Int
  /// When the maintainer accepted the behaviour this set pins, and what they accepted it
  /// against. Absent until somebody has.
  public var accepted: Acceptance?
  public var scenarios: [TraceScenario]

  public init(schemaVersion: Int, accepted: Acceptance? = nil, scenarios: [TraceScenario]) {
    self.schemaVersion = schemaVersion
    self.accepted = accepted
    self.scenarios = scenarios
  }

  /// A maintainer's sign-off, recorded rather than remembered.
  ///
  /// #66 asks that a Golden Trace pin behaviour that has been signed off rather than
  /// behaviour under construction, which makes the acceptance a fact about the repository and
  /// not about a conversation. It is here rather than in `/traces/` because the traces are
  /// derived and gitignored: the thing worth tracking is *that* a set was accepted, against
  /// which extraction, on which date.
  ///
  /// Recorded against the payload's own `sourceCoreDigest`, because a sign-off cannot outlive
  /// the thing it was given for. Re-export the payload and these traces change; the
  /// acceptance is then a statement about a payload nobody is running any more, and
  /// ``isStale(against:)`` says so rather than letting it look current.
  public struct Acceptance: Sendable, Equatable, Decodable {
    /// The date the maintainer accepted the set, as `YYYY-MM-DD`.
    public var on: String
    /// The `sourceCoreDigest` of the payload the accepted traces were emitted from.
    public var payloadCoreDigest: String
    /// The trace schema the accepted traces were written in.
    public var traceSchemaVersion: Int
    /// What was actually reviewed, in the maintainer's own terms.
    public var note: String

    enum Keys: String, CodingKey, CaseIterable {
      case on, payloadCoreDigest, traceSchemaVersion, note
    }

    public init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: Keys.self)
      try TraceScenarioKeys.refuseUnknown(
        in: decoder, known: Keys.names, context: "the acceptance record")
      on = try container.decode(String.self, forKey: .on)
      payloadCoreDigest = try container.decode(String.self, forKey: .payloadCoreDigest)
      traceSchemaVersion = try container.decode(Int.self, forKey: .traceSchemaVersion)
      note = try container.decodeIfPresent(String.self, forKey: .note) ?? ""
    }

    /// Whether this sign-off was given for a different payload or a different trace schema
    /// than the one in front of us.
    public func isStale(against payloadCoreDigest: String, traceSchemaVersion: Int) -> Bool {
      self.payloadCoreDigest != payloadCoreDigest
        || self.traceSchemaVersion != traceSchemaVersion
    }
  }

  public enum LoadError: Error, CustomStringConvertible, Equatable {
    case notFound
    case unreadable(String)
    case duplicate(emitter: TraceEmitter, id: String)

    public var description: String {
      switch self {
      case .notFound:
        return "no \(TraceScenarioLocator.fileName) found"
      case .unreadable(let detail):
        return "\(TraceScenarioLocator.fileName) is not readable: \(detail)"
      case .duplicate(let emitter, let id):
        return
          "two \(emitter.rawValue) scenarios are called '\(id)', so one would overwrite the other"
      }
    }
  }

  public static func load(
    at url: URL? = TraceScenarioLocator.locate(),
    read: (URL) throws -> Data = { try Data(contentsOf: $0) }
  ) throws -> TraceScenarios {
    guard let url else { throw LoadError.notFound }
    let loaded: TraceScenarios
    do {
      loaded = try JSONDecoder().decode(TraceScenarios.self, from: try read(url))
    } catch let error as LoadError {
      throw error
    } catch {
      throw LoadError.unreadable(String(describing: error))
    }
    // An id collides only within its emitter, since that is the pair a path is built
    // from. Caught here rather than at write time, where the first trace would already
    // have been overwritten by the second.
    var seen: Set<String> = []
    for scenario in loaded.scenarios {
      guard seen.insert("\(scenario.emitter.rawValue)/\(scenario.id)").inserted else {
        throw LoadError.duplicate(emitter: scenario.emitter, id: scenario.id)
      }
    }
    return loaded
  }

  /// The scenarios an invocation asked for, in emitter order then id order, so a run
  /// writes its traces in the same sequence however the file happens to be arranged.
  public func selected(emitter: TraceEmitter? = nil, id: String? = nil) -> [TraceScenario] {
    scenarios
      .filter { emitter == nil || $0.emitter == emitter }
      .filter { id == nil || $0.id == id }
      .sorted { ($0.emitter, $0.id) < ($1.emitter, $1.id) }
  }
}

/// One trace to emit: which emitter, what to call it, and how to drive it.
public struct TraceScenario: Sendable, Equatable {
  public var emitter: TraceEmitter
  public var id: String
  /// A sentence for a reader of the catalogue, and of the trace's own header.
  public var note: String
  public var body: Body

  /// Build one directly, for a command line that has just described a run of its own.
  ///
  /// A single diagnostic invoked with `--trace` writes the same kind of file the catalogue
  /// does, so it needs the same kind of scenario — assembled from its flags rather than
  /// read from the file.
  public init(emitter: TraceEmitter, id: String, note: String = "", body: Body) {
    self.emitter = emitter
    self.id = id
    self.note = note
    self.body = body
  }

  public enum Body: Sendable, Equatable {
    case math(Math)
    /// The whole payload, which needs no scenario of its own.
    case decode
    case projection(Projection)
    case flight(Flight)
    case gameCore(GameCore)
    case benson(Benson)
    case session(Session)
    case navigation(Navigation)
  }

  /// How densely to sample the elementary functions the kit calls.
  ///
  /// The domains themselves live in the emitter rather than here, because they are derived
  /// from what the kit's own wrappers can produce rather than chosen: a scenario that could
  /// name an arbitrary angle would invite pinning one no `wrap` can return, which is work
  /// the port would owe for a case that cannot arise.
  public struct Math: Sendable, Equatable {
    /// Samples per uniform sweep. The landmark and discrete sets are added whatever this is,
    /// so a small number still pins the quadrant boundaries and `tan`'s pole.
    public var samples: Int = 256

    public init() {}
  }

  /// A camera pose, and the viewport its screen lines are resolved against.
  ///
  /// The size is explicit because a ``ScreenLine`` is in pixels: the same pose against a
  /// different viewport is a different trace, and a default nobody wrote down is exactly
  /// the sort of thing that changes without anybody deciding to change it.
  public struct Projection: Sendable, Equatable {
    public var width: Double = 1280
    public var height: Double = 800
    public var x: Double = 32_000
    public var z: Double = 32_000
    public var eye: Double = 128
    /// Degrees, as the command line takes them.
    public var heading: Double = 45
    public var pitch: Double = 0
    public var roll: Double = 0
    public var time: Double = 0
    /// An underground Room to draw instead of the surface.
    public var room: Int?

    public init() {}
  }

  public struct Flight: Sendable, Equatable {
    public var craft: Int = 1
    public var notch: Int = 10
    public var seconds: Double = 30
    public var poweramp: Bool = false

    public init() {}
  }

  /// A script-free run of the control loop: intents in, state out.
  ///
  /// Held as legs of held input rather than as a feedback loop, so the inputs belong to
  /// the scenario and the trace pins the mover rather than the driver that flew it.
  public struct GameCore: Sendable, Equatable {
    public struct Leg: Sendable, Equatable {
      public var turn: Double = 0
      public var pitch: Double = 0
      public var walk: Double = 0
      public var running: Bool = false
      public var seconds: Double = 1

      public init() {}
    }

    public var legs: [Leg] = []
    /// A craft to board before the first leg, or nil to stay on foot.
    public var craft: Int?
    public var notch: Int?
    /// A Room to start in, or nil for the surface.
    public var room: Int?
    public var at: Position?

    public init() {}
  }

  /// A key pressed at a named time.
  ///
  /// Shared by the interpreter and the whole-session rehearsal, which schedule keypresses
  /// the same way. Two copies meant two decoders to keep in step for no difference.
  public struct Press: Sendable, Equatable {
    /// A key name, or nil for "any key", which the opening reads as intent to walk.
    public var key: String?
    public var at: Double = 0

    public init() {}
  }

  /// The interpreter with no world behind it.
  public struct Benson: Sendable, Equatable {
    /// A change the world would have made to the Host Callout, applied at a named time.
    ///
    /// Without these, the tests a script runs against engine state — which Room, which
    /// craft, what is held — always answer the same way with no world present, and the
    /// trace would only ever pin one path through each script.
    public struct Write: Sendable, Equatable {
      public var at: Double = 0
      public var room: Int?
      public var craft: Int?
      public var carrying: [Int]?
      public var objectRooms: [String: Int]?
      public var objectFlags: [String: Int]?

      public init() {}
    }

    /// The Host Callout as the world would have left it before the script starts.
    public struct Host: Sendable, Equatable {
      public var room: Int = 0
      /// An object slot, or nil for on foot.
      public var craft: Int?
      public var carrying: [Int] = []
      public var objectRooms: [String: Int] = [:]
      public var objectFlags: [String: Int] = [:]

      public init() {}
    }

    public var script: Int = 0
    public var seconds: Double = 240
    public var timeScale: Double?
    public var presses: [TraceScenario.Press] = []
    public var host = Host()
    public var writes: [Write] = []
    /// How many instructions this trace may record before it stops.
    ///
    /// Needed because a parked script spins rather than idles: the Reference Build's own
    /// scripts end on a jump to themselves, and the interpreter spends its whole
    /// instruction budget on that jump every step for as long as the scenario runs. Script
    /// 1 traced for two minutes is three and a half million records of `jmp 94`, which is
    /// a faithful record of nothing.
    ///
    /// When the limit is reached the trace says so in a final record and stops. It is never
    /// silently truncated: a trace that quietly stopped early would compare clean against a
    /// port that stopped early for a different reason.
    public var maxInstructions: Int = 20_000

    public init() {}
  }

  /// The whole opening rehearsal: world, craft parameters and scripts together.
  public struct Session: Sendable, Equatable {
    public struct Boarding: Sendable, Equatable {
      public var craft: Int = 1
      public var at: Double = 0

      public init() {}
    }

    /// The authentic route that carries the opening beyond boarding: fly to one decoded lift
    /// site, land, leave the craft and descend. The craft itself remains `walkTo`, because the
    /// replay has to earn boarding through the same reach rule as the shorter rehearsal.
    public struct OpeningLoop: Sendable, Equatable {
      public var liftSite: Int = 1
      public var notch: Int = 10

      public init() {}
    }

    public var script: Int = 0
    public var seconds: Double = 240
    public var timeScale: Double?
    public var presses: [TraceScenario.Press] = []
    public var boarding: [Boarding] = []
    /// An object slot to walk to and reach for, rather than boarding by fiat.
    public var walkTo: Int?
    /// `take` rather than `board`, for a scenario that picks something up.
    public var take: Bool = false
    public var openingLoop: OpeningLoop?

    public init() {}
  }

  /// A walk through the underground, as ``RoomTrace`` drives it.
  public struct Navigation: Sendable, Equatable {
    public struct Leg: Sendable, Equatable {
      /// Degrees.
      public var heading: Double = 0
      public var seconds: Double = 1

      public init() {}
    }

    public var room: Int = 3
    public var at: Position?
    public var legs: [Leg] = []
    public var carrying: [Int] = []
    /// The random stream's seed, so the Room that picks at random can be made to pick
    /// something else without the trace stopping being reproducible.
    public var seed: Int?

    public init() {}
  }

  public struct Position: Sendable, Equatable {
    public var x: Double = 0
    public var z: Double = 0

    public init() {}
  }
}

// MARK: - Decoding
//
// Every field has a default, so a scenario names only what it changes — which is the
// arrangement the kit's `Settings` uses, and for the same reason. It needs writing out by hand
// because a synthesized `Decodable` does not consult a property's default: it reports the
// key as missing instead, so a scenario would have to spell out every field it does not
// care about. The known-key lists are derived from the coding keys rather than written
// twice, since a hand-kept copy that drifted would silently re-open the hole that
// ``TraceScenarioKeys`` exists to close.

extension TraceScenario.Math: Decodable {
  enum Keys: String, CodingKey, CaseIterable {
    case samples
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    self.init()
    samples = try container.decodeIfPresent(Int.self, forKey: .samples) ?? samples
  }
}

extension TraceScenario.Projection: Decodable {
  enum Keys: String, CodingKey, CaseIterable {
    case width, height, x, z, eye, heading, pitch, roll, time, room
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    self.init()
    width = try container.decodeIfPresent(Double.self, forKey: .width) ?? width
    height = try container.decodeIfPresent(Double.self, forKey: .height) ?? height
    x = try container.decodeIfPresent(Double.self, forKey: .x) ?? x
    z = try container.decodeIfPresent(Double.self, forKey: .z) ?? z
    eye = try container.decodeIfPresent(Double.self, forKey: .eye) ?? eye
    heading = try container.decodeIfPresent(Double.self, forKey: .heading) ?? heading
    pitch = try container.decodeIfPresent(Double.self, forKey: .pitch) ?? pitch
    roll = try container.decodeIfPresent(Double.self, forKey: .roll) ?? roll
    time = try container.decodeIfPresent(Double.self, forKey: .time) ?? time
    room = try container.decodeIfPresent(Int.self, forKey: .room)
  }
}

extension TraceScenario.Flight: Decodable {
  enum Keys: String, CodingKey, CaseIterable {
    case craft, notch, seconds, poweramp
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    self.init()
    craft = try container.decodeIfPresent(Int.self, forKey: .craft) ?? craft
    notch = try container.decodeIfPresent(Int.self, forKey: .notch) ?? notch
    seconds = try container.decodeIfPresent(Double.self, forKey: .seconds) ?? seconds
    poweramp = try container.decodeIfPresent(Bool.self, forKey: .poweramp) ?? poweramp
  }
}

extension TraceScenario.GameCore.Leg: Decodable {
  enum Keys: String, CodingKey, CaseIterable {
    case turn, pitch, walk, running, seconds
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    try TraceScenarioKeys.refuseUnknown(in: decoder, known: Keys.names, context: "a game-core leg")
    self.init()
    turn = try container.decodeIfPresent(Double.self, forKey: .turn) ?? turn
    pitch = try container.decodeIfPresent(Double.self, forKey: .pitch) ?? pitch
    walk = try container.decodeIfPresent(Double.self, forKey: .walk) ?? walk
    running = try container.decodeIfPresent(Bool.self, forKey: .running) ?? running
    seconds = try container.decodeIfPresent(Double.self, forKey: .seconds) ?? seconds
  }
}

extension TraceScenario.GameCore: Decodable {
  enum Keys: String, CodingKey, CaseIterable {
    case legs, craft, notch, room, at
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    self.init()
    legs = try container.decodeIfPresent([Leg].self, forKey: .legs) ?? legs
    craft = try container.decodeIfPresent(Int.self, forKey: .craft)
    notch = try container.decodeIfPresent(Int.self, forKey: .notch)
    room = try container.decodeIfPresent(Int.self, forKey: .room)
    at = try container.decodeIfPresent(TraceScenario.Position.self, forKey: .at)
  }
}

extension TraceScenario.Press: Decodable {
  enum Keys: String, CodingKey, CaseIterable {
    case key, at
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    try TraceScenarioKeys.refuseUnknown(in: decoder, known: Keys.names, context: "a keypress")
    self.init()
    key = try container.decodeIfPresent(String.self, forKey: .key)
    at = try container.decodeIfPresent(Double.self, forKey: .at) ?? at
  }
}

extension TraceScenario.Benson.Write: Decodable {
  enum Keys: String, CodingKey, CaseIterable {
    case at, room, craft, carrying, objectRooms, objectFlags
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    try TraceScenarioKeys.refuseUnknown(in: decoder, known: Keys.names, context: "a host write")
    self.init()
    at = try container.decodeIfPresent(Double.self, forKey: .at) ?? 0
    room = try container.decodeIfPresent(Int.self, forKey: .room)
    craft = try container.decodeIfPresent(Int.self, forKey: .craft)
    carrying = try container.decodeIfPresent([Int].self, forKey: .carrying)
    objectRooms = try container.decodeIfPresent([String: Int].self, forKey: .objectRooms)
    objectFlags = try container.decodeIfPresent([String: Int].self, forKey: .objectFlags)
  }
}

extension TraceScenario.Benson.Host: Decodable {
  enum Keys: String, CodingKey, CaseIterable {
    case room, craft, carrying, objectRooms, objectFlags
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    try TraceScenarioKeys.refuseUnknown(in: decoder, known: Keys.names, context: "a synthetic host")
    self.init()
    room = try container.decodeIfPresent(Int.self, forKey: .room) ?? room
    craft = try container.decodeIfPresent(Int.self, forKey: .craft)
    carrying = try container.decodeIfPresent([Int].self, forKey: .carrying) ?? carrying
    objectRooms =
      try container.decodeIfPresent([String: Int].self, forKey: .objectRooms) ?? objectRooms
    objectFlags =
      try container.decodeIfPresent([String: Int].self, forKey: .objectFlags) ?? objectFlags
  }
}

extension TraceScenario.Benson: Decodable {
  enum Keys: String, CodingKey, CaseIterable {
    case script, seconds, timeScale, presses, host, writes, maxInstructions
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    self.init()
    script = try container.decodeIfPresent(Int.self, forKey: .script) ?? script
    seconds = try container.decodeIfPresent(Double.self, forKey: .seconds) ?? seconds
    timeScale = try container.decodeIfPresent(Double.self, forKey: .timeScale)
    presses = try container.decodeIfPresent([TraceScenario.Press].self, forKey: .presses) ?? presses
    host = try container.decodeIfPresent(Host.self, forKey: .host) ?? host
    writes = try container.decodeIfPresent([Write].self, forKey: .writes) ?? writes
    maxInstructions =
      try container.decodeIfPresent(Int.self, forKey: .maxInstructions) ?? maxInstructions
  }
}

extension TraceScenario.Session.Boarding: Decodable {
  enum Keys: String, CodingKey, CaseIterable {
    case craft, at
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    try TraceScenarioKeys.refuseUnknown(in: decoder, known: Keys.names, context: "a boarding")
    self.init()
    craft = try container.decode(Int.self, forKey: .craft)
    at = try container.decodeIfPresent(Double.self, forKey: .at) ?? 0
  }
}

extension TraceScenario.Session.OpeningLoop: Decodable {
  enum Keys: String, CodingKey, CaseIterable {
    case liftSite, notch
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    try TraceScenarioKeys.refuseUnknown(
      in: decoder, known: Keys.names, context: "an opening loop")
    self.init()
    liftSite = try container.decode(Int.self, forKey: .liftSite)
    notch = try container.decode(Int.self, forKey: .notch)
    guard liftSite > 0 else {
      throw DecodingError.dataCorruptedError(
        forKey: .liftSite, in: container, debugDescription: "liftSite must be positive")
    }
    guard (1...10).contains(notch) else {
      throw DecodingError.dataCorruptedError(
        forKey: .notch, in: container, debugDescription: "notch must be between 1 and 10")
    }
  }
}

extension TraceScenario.Session: Decodable {
  enum Keys: String, CodingKey, CaseIterable {
    case script, seconds, timeScale, presses, boarding, walkTo, take, openingLoop
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    self.init()
    script = try container.decodeIfPresent(Int.self, forKey: .script) ?? script
    seconds = try container.decodeIfPresent(Double.self, forKey: .seconds) ?? seconds
    timeScale = try container.decodeIfPresent(Double.self, forKey: .timeScale)
    presses = try container.decodeIfPresent([TraceScenario.Press].self, forKey: .presses) ?? presses
    boarding = try container.decodeIfPresent([Boarding].self, forKey: .boarding) ?? boarding
    walkTo = try container.decodeIfPresent(Int.self, forKey: .walkTo)
    take = try container.decodeIfPresent(Bool.self, forKey: .take) ?? take
    openingLoop = try container.decodeIfPresent(OpeningLoop.self, forKey: .openingLoop)
    if openingLoop != nil && walkTo == nil {
      throw DecodingError.dataCorruptedError(
        forKey: .walkTo, in: container,
        debugDescription: "walkTo is required when openingLoop is present")
    }
  }
}

extension TraceScenario.Navigation.Leg: Decodable {
  enum Keys: String, CodingKey, CaseIterable {
    case heading, seconds
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    try TraceScenarioKeys.refuseUnknown(in: decoder, known: Keys.names, context: "a walk leg")
    self.init()
    heading = try container.decode(Double.self, forKey: .heading)
    seconds = try container.decode(Double.self, forKey: .seconds)
  }
}

extension TraceScenario.Navigation: Decodable {
  enum Keys: String, CodingKey, CaseIterable {
    case room, at, legs, carrying, seed
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    self.init()
    room = try container.decodeIfPresent(Int.self, forKey: .room) ?? room
    at = try container.decodeIfPresent(TraceScenario.Position.self, forKey: .at)
    legs = try container.decodeIfPresent([Leg].self, forKey: .legs) ?? legs
    carrying = try container.decodeIfPresent([Int].self, forKey: .carrying) ?? carrying
    seed = try container.decodeIfPresent(Int.self, forKey: .seed)
  }
}

extension TraceScenario.Position: Decodable {
  enum Keys: String, CodingKey, CaseIterable {
    case x, z
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    try TraceScenarioKeys.refuseUnknown(in: decoder, known: Keys.names, context: "a position")
    self.init()
    x = try container.decode(Double.self, forKey: .x)
    z = try container.decode(Double.self, forKey: .z)
  }
}

extension TraceScenario: Decodable {
  private enum Keys: String, CodingKey, CaseIterable {
    case emitter, id, note
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: Keys.self)
    emitter = try container.decode(TraceEmitter.self, forKey: .emitter)
    id = try container.decode(String.self, forKey: .id)
    note = try container.decodeIfPresent(String.self, forKey: .note) ?? ""

    // A scenario carries its emitter's fields inline rather than under a nested object,
    // so the catalogue reads as a list of runs rather than as a list of wrappers. The
    // cost is that a scenario's known-key set is its emitter's plus these three.
    let shared = Keys.names
    let context = "a \(emitter.rawValue) scenario"
    switch emitter {
    case .math:
      try TraceScenarioKeys.refuseUnknown(
        in: decoder, known: shared + Math.Keys.names, context: context)
      body = .math(try Math(from: decoder))
    case .decode:
      try TraceScenarioKeys.refuseUnknown(in: decoder, known: shared, context: context)
      body = .decode
    case .projection:
      try TraceScenarioKeys.refuseUnknown(
        in: decoder, known: shared + Projection.Keys.names, context: context)
      body = .projection(try Projection(from: decoder))
    case .flight:
      try TraceScenarioKeys.refuseUnknown(
        in: decoder, known: shared + Flight.Keys.names, context: context)
      body = .flight(try Flight(from: decoder))
    case .gameCore:
      try TraceScenarioKeys.refuseUnknown(
        in: decoder, known: shared + GameCore.Keys.names, context: context)
      body = .gameCore(try GameCore(from: decoder))
    case .benson:
      try TraceScenarioKeys.refuseUnknown(
        in: decoder, known: shared + Benson.Keys.names, context: context)
      body = .benson(try Benson(from: decoder))
    case .session:
      try TraceScenarioKeys.refuseUnknown(
        in: decoder, known: shared + Session.Keys.names, context: context)
      body = .session(try Session(from: decoder))
    case .navigation:
      try TraceScenarioKeys.refuseUnknown(
        in: decoder, known: shared + Navigation.Keys.names, context: context)
      body = .navigation(try Navigation(from: decoder))
    }
  }
}

extension CaseIterable where Self: RawRepresentable, RawValue == String {
  /// Every case's name, for checking a decoded object's keys against the ones that exist.
  static var names: [String] { allCases.map(\.rawValue) }
}

/// Refusing a field nobody reads.
///
/// `JSONDecoder` ignores a key it has no property for, which for a catalogue like this is
/// the failure mode ``Arguments`` was rewritten to stop: a scenario whose `craft` was
/// written `crafts` would trace the *default* craft and report success. A scenario file is
/// the same kind of instruction as a command line, so it is read the same way — strictly,
/// naming the nearest field that does exist.
public enum TraceScenarioKeys {
  public struct Unknown: Error, CustomStringConvertible, Equatable {
    public let field: String
    public let context: String
    public let known: [String]

    public var description: String {
      let suggestion = known.filter { field.hasPrefix($0) || $0.hasPrefix(field) }.sorted().first
      let tail = suggestion.map { "; did you mean '\($0)'?" } ?? ""
      return "\(context) has field '\(field)', which nothing reads\(tail)"
    }
  }

  private struct AnyKey: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { nil }
  }

  static func refuseUnknown(in decoder: Decoder, known: [String], context: String) throws {
    let container = try decoder.container(keyedBy: AnyKey.self)
    for key in container.allKeys.map(\.stringValue).sorted() where !known.contains(key) {
      throw Unknown(field: key, context: context, known: known)
    }
  }
}

/// Finds the scenario catalogue, exactly as the kit's `SettingsLocator` finds the settings.
///
/// Same shape on purpose: both are tracked, hand-edited files the app reads out of the
/// repository it lives in, and two different discovery rules for two files sitting beside
/// each other would be a trap. The duplication is deliberate — copying twenty lines is the
/// price of this target not depending on the kit.
public enum TraceScenarioLocator {
  public static let environmentKey = "MERCENARY_TRACE_SCENARIOS"
  public static let fileName = "trace-scenarios.json"

  public static func locate(
    environment: [String: String] = ProcessInfo.processInfo.environment,
    startingAt start: URL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath),
    fileExists: (URL) -> Bool = { FileManager.default.fileExists(atPath: $0.path) }
  ) -> URL? {
    if let override = environment[environmentKey], !override.isEmpty {
      let url = URL(fileURLWithPath: override)
      return fileExists(url) ? url : nil
    }
    // Walk up from the working directory, as the payload and the settings do: `swift run`
    // starts inside app/, while a built binary usually starts at the repository root.
    var directory = start.standardizedFileURL
    while true {
      let candidate = directory.appendingPathComponent(fileName)
      if fileExists(candidate) { return candidate }
      let parent = directory.deletingLastPathComponent().standardizedFileURL
      if parent == directory { return nil }
      directory = parent
    }
  }
}
