import Foundation
import MercenaryCLI
import MercenaryKit

/// Walks the underground against the real Data Payload and prints every Doorway it
/// goes through.
///
/// The rare states — a one-way link, a locked Doorway, a dark Room, the random Room
/// and the flipped world — are reachable in a playthrough only by finding the right
/// keys and walking a long way. This makes each of them a scenario: start in a named
/// Room, carry named objects, walk a named sequence, and read what happened.
///
/// It is deterministic on purpose. The walk is a list of instructions rather than a
/// steering loop, and the random Room's selector runs on the session's one seeded
/// stream, so the same command line always produces the same trace and a change in
/// the navigation code shows up as a diff (ADR 0019).
enum RoomTrace {
  struct Options {
    /// The Room to start in.
    var room = 3
    /// Where in it to stand. Nil means the middle, which is where the lift arrives.
    var at: (x: Double, z: Double)?
    /// What to walk, in order: a heading in degrees and how long to hold it.
    var legs: [(heading: Double, seconds: Double)] = []
    /// Object slots to start out carrying, for the locked and dark Rooms.
    var carrying: [Int] = []
    var output: URL?
    /// Where to write a Golden Trace of the same walk, when one was asked for. Orthogonal
    /// to `--output`: that writes the report a maintainer reads, this writes the record a
    /// replay compares, and a run may be asked for both.
    var trace: URL?
    /// The random stream's seed, so the Room that picks at random can be made to pick
    /// something else without the trace stopping being reproducible.
    var seed: UInt64 = 0x2C69_2ED8_1B7F_0A31

    var scenario: TraceScenario {
      var body = TraceScenario.Navigation()
      body.room = room
      body.at = at.map {
        var position = TraceScenario.Position()
        position.x = $0.x
        position.z = $0.z
        return position
      }
      body.legs = legs.map {
        var leg = TraceScenario.Navigation.Leg()
        leg.heading = $0.heading
        leg.seconds = $0.seconds
        return leg
      }
      body.carrying = carrying
      body.seed = Int(bitPattern: UInt(seed))
      return TraceScenario(
        emitter: .navigation, id: "room-\(room)", note: "written by --room-trace",
        body: .navigation(body))
    }
  }

  static let knownFlags: Set<String> = [
    "--room-trace", "--room", "--at", "--walk", "--carry", "--seed", "--output", "--trace",
  ]

  static func options(from arguments: [String]) throws -> Options? {
    let arguments = Arguments(arguments)
    guard arguments.isPresent("--room-trace") else { return nil }
    try arguments.rejectUnknownFlags(besides: knownFlags)
    var options = Options()
    if let room = try arguments.int("--room", expected: "a room id") { options.room = room }
    if let at = try arguments.string("--at", expected: "a position, as X,Z") {
      let parts = at.split(separator: ",", maxSplits: 1)
      guard parts.count == 2, let x = Double(parts[0]), let z = Double(parts[1]) else {
        throw Arguments.Failure.missingValue(flag: "--at", expected: "a position, written X,Z")
      }
      options.at = (x, z)
    }
    for value in try arguments.values(of: "--walk", expected: "a leg, as DEGREES@SECONDS") {
      let parts = value.split(separator: "@", maxSplits: 1)
      guard parts.count == 2, let heading = Double(parts[0]), let seconds = Double(parts[1]) else {
        throw Arguments.Failure.missingValue(
          flag: "--walk", expected: "a heading and a time, written DEGREES@SECONDS"
        )
      }
      options.legs.append((heading, seconds))
    }
    for value in try arguments.values(of: "--carry", expected: "an object slot") {
      guard let slot = Int(value) else {
        throw Arguments.Failure.notAnInteger(flag: "--carry", value: value)
      }
      options.carrying.append(slot)
    }
    if let seed = try arguments.int("--seed", expected: "a seed") {
      options.seed = UInt64(bitPattern: Int64(seed))
    }
    options.output = arguments.isPresent("--output")
      ? try arguments.output(default: "") : nil
    options.trace = try arguments.trace()
    return options
  }

  static func run(_ options: Options) -> Int32 {
    guard let directory = PayloadLocator.locate() else {
      return fail("no Data Payload found")
    }
    do {
      let bundle = try Payload.load(from: directory)
      guard let parameters = bundle.flight else {
        return fail("this Data Payload carries no craft parameters, so nobody can walk")
      }
      let settings = try Settings.load()
      let world = World(bundle: bundle)
      guard let start = world.rooms[options.room] else {
        return fail("no room \(options.room) in this payload")
      }
      // Scripts come along because a Room's entry reaction is half of what arriving
      // in one does, and without them the trace would show the Doorways and none of
      // what the Rooms said.
      var scripts: BensonSession?
      if let document = bundle.benson, let text = bundle.text {
        let program = try BensonProgram(document: document)
        scripts = BensonSession(
          program: program, text: TextTable(document: text),
          tunables: settings.bensonTunables(framesPerTick: program.framesPerTick),
          randomSeed: options.seed
        )
      }
      var session = GameplaySession(
        content: GameplaySession.Content(
          world: world, bundle: bundle,
          flight: settings.flight.model(
            for: parameters, groundExtent: Double(world.groundExtent)
          )
        ),
        player: OpeningScene.player,
        scripts: scripts,
        randomSeed: options.seed
      )
      session.teleport(to: .room(options.room))
      // The middle of the Room, which is where the lift leaves the player.
      let middle = (start.bounds.min + start.bounds.max) / 2
      session.place(
        at: SIMD3(
          options.at?.x ?? Double(middle.x), session.game.player.position.y,
          options.at?.z ?? Double(middle.z)
        )
      )
      for slot in options.carrying { session.carry(slot) }

      var lines: [String] = []
      func say(_ line: String) {
        lines.append(line)
      }

      say("room \(options.room), \(start.doorways.count) doorways, extent \(Int(start.bounds.max.x))x\(Int(start.bounds.max.z))")
      if !options.carrying.isEmpty {
        say("carrying \(options.carrying.map(String.init).joined(separator: ", "))")
      }
      say(describe(session, in: world))
      say(objects(session, in: world))

      var recorder: CoreTrace.Recorder? =
        options.trace == nil
        ? nil
        : try CoreTrace.Recorder(
          run: try TraceRun(), scenario: options.scenario, session: session)
      var sink = TraceSink()
      sink.say = say
      sink.step = { session, events, note in
        try recorder?.record(session: session, events: events, note: note)
      }
      sink.command = { command, elapsed in try recorder?.command(command, elapsed: elapsed) }
      let elapsed = try walk(&session, options: options, world: world, sink: sink)

      say(String(format: "%7.2f  [finished]", elapsed))
      say(describe(session, in: world))

      let report = lines.joined(separator: "\n") + "\n"
      if let output = options.output {
        try report.write(to: output, atomically: true, encoding: .utf8)
        print("wrote \(output.path)")
      } else {
        print(report, terminator: "")
      }
      if let output = options.trace, let recorder {
        try recorder.trace.write(to: output)
        print("wrote \(output.path)")
      }
      return 0
    } catch {
      return fail(String(describing: error))
    }
  }

  /// Walk the legs, reporting what happened to whoever asked.
  ///
  /// One driver for the printed report and the Golden Trace, so a change to how the walk is
  /// steered cannot move one without moving the other. Deterministic by construction: the
  /// legs are instructions rather than a steering loop, and the random Room's selector runs
  /// on the session's one seeded stream.
  @discardableResult
  static func walk(
    _ session: inout GameplaySession, options: Options, world: World, sink: TraceSink
  ) throws -> Double {
    let step = TraceRun.dt
    var elapsed: Double = 0
    var lastMessage = ""
    if !options.carrying.isEmpty {
      try sink.command(
        .object(["carry": .array(options.carrying.sorted().map { .int($0) })]), elapsed)
    }
    for (index, leg) in options.legs.enumerated() {
      session.place(at: session.game.player.position, facing: leg.heading * .pi / 180)
      sink.say(
        String(
          format: "%7.2f  » leg %d: heading %.0f for %.1fs", elapsed, index + 1, leg.heading,
          leg.seconds))
      // Facing is an input, not an outcome: a replay has to turn the player the same way
      // before it walks, or every step after this diverges.
      try sink.command(
        .object(["face": .double(leg.heading * .pi / 180), "leg": .int(index + 1)]), elapsed)
      var remaining = leg.seconds
      session.intent = Intent(walk: 1)
      while remaining > 0 {
        let update = session.advance(by: step)
        for event in update.events {
          switch event {
          case .arrived(let location):
            sink.say(
              String(
                format: "%7.2f  · through a doorway into %@", elapsed, String(describing: location)))
            sink.say(describe(session, in: world))
          case .wall(let sound):
            sink.say(String(format: "%7.2f  · wall (sound %d)", elapsed, sound))
          case .worldFlipped(let flipped):
            sink.say(String(format: "%7.2f  · the world is %@", elapsed, flipped ? "mirrored" : "back"))
          default:
            break
          }
        }
        try sink.step(session, update.events, .object(["leg": .int(index + 1)]))
        // The whole message as it starts, rather than a line per character revealed: this
        // is a record of what was said, not of the typing.
        if let message = session.scripts?.ticker?.text, message != lastMessage {
          lastMessage = message
          sink.say(String(format: "%7.2f  %@", elapsed, message))
        }
        elapsed += step
        remaining -= step
      }
    }
    return elapsed
  }

  /// The walk as a Golden Trace, with nothing printed.
  static func emit(
    _ run: TraceRun, scenario: TraceScenario, body: TraceScenario.Navigation
  ) throws -> TraceFile {
    guard let flight = run.flight else { throw TraceRun.Failure.noFlight }
    let world = run.world
    guard let start = world.rooms[body.room] else { throw TraceRun.Failure.noRoom(body.room) }
    var options = Options()
    options.room = body.room
    options.at = body.at.map { (x: $0.x, z: $0.z) }
    options.legs = body.legs.map { (heading: $0.heading, seconds: $0.seconds) }
    options.carrying = body.carrying
    if let seed = body.seed { options.seed = UInt64(bitPattern: Int64(seed)) }

    var session = GameplaySession(
      content: GameplaySession.Content(world: world, bundle: run.bundle, flight: flight),
      player: OpeningScene.player,
      scripts: try run.scripts(seed: options.seed),
      randomSeed: options.seed
    )
    session.teleport(to: .room(options.room))
    let middle = (start.bounds.min + start.bounds.max) / 2
    session.place(
      at: SIMD3(
        options.at?.x ?? Double(middle.x), session.game.player.position.y,
        options.at?.z ?? Double(middle.z)))
    for slot in options.carrying { session.carry(slot) }

    var recorder = try CoreTrace.Recorder(run: run, scenario: scenario, session: session)
    var sink = TraceSink()
    sink.step = { session, events, note in
      try recorder.record(session: session, events: events, note: note)
    }
    sink.command = { command, elapsed in try recorder.command(command, elapsed: elapsed) }
    try walk(&session, options: options, world: world, sink: sink)
    return recorder.trace
  }

  /// What is standing in the Room with the player. Room objects were undrawable and
  /// unreachable before this work, so a trace that did not name them would not show
  /// the difference.
  private static func objects(_ session: GameplaySession, in world: World) -> String {
    let here = world.objects.filter {
      $0.isDrawable(in: session.location, residence: session.snapshot.residence[$0.slot])
    }
    guard !here.isEmpty else { return "          nothing else here" }
    return "          here: "
      + here.map { String(format: "slot %d at %.0f,%.0f", $0.slot, $0.origin.x, $0.origin.z) }
        .joined(separator: "; ")
  }

  private static func describe(_ session: GameplaySession, in world: World) -> String {
    let player = session.game.player
    let where_ = session.location.room.map { "room \($0)" } ?? "the surface"
    let dark = session.snapshot.indoor?.dark == true ? ", dark" : ""
    let mirrored = session.snapshot.worldFlipped ? ", mirrored" : ""
    let rewired = session.location.room.flatMap { session.rewired[$0] }
      .map { ", first doorway now leads to room \($0.room)" } ?? ""
    return String(
      format: "          at %.0f, %.0f facing %.0f° in %@%@%@%@",
      player.position.x, player.position.z,
      player.heading * 180 / .pi, where_, dark, mirrored, rewired
    )
  }

  private static func fail(_ message: String) -> Int32 {
    FileHandle.standardError.write(Data("error: \(message)\n".utf8))
    return 1
  }
}
