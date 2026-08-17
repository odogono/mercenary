import Foundation
import MercenaryCLI
import MercenaryKit

/// Runs a Benson Script against the real Data Payload and prints what it says.
///
/// Same reason as ``FrameCapture``: the opening loop should be checkable without
/// sitting through it, and without a window. The scheduled input is what makes it
/// a whole rehearsal rather than a smoke test — the opening asks a question, and
/// its answer changes where it ends up.
enum BensonTrace {
  struct Options {
    var script = 0
    var seconds: Double = 240
    /// Overrides the settings file's script timing, so a trace can be hurried
    /// along without changing what the app will do.
    var timeScale: Double?
    /// Keys to press, and when.
    var presses: [(key: BensonKey?, at: Double)] = []
    /// Craft to board, and when.
    var boarding: [(craft: Int, at: Double)] = []
    /// An object slot to walk to and reach for, rather than boarding by fiat.
    var walkTo: Int?
    var walkAction: InteractionAction = .board
    /// Where to write a Golden Trace of the same rehearsal, when one was asked for.
    var trace: URL?

    var scenario: TraceScenario {
      var body = TraceScenario.Session()
      body.script = script
      body.seconds = seconds
      body.timeScale = timeScale
      body.presses = presses.map {
        var press = TraceScenario.Session.Press()
        // Written back as the name the flag takes, not the engine's own `keyY`.
        press.key = $0.key.map { String($0.rawValue.dropFirst(3)) }
        press.at = $0.at
        return press
      }
      body.boarding = boarding.map {
        var boarding = TraceScenario.Session.Boarding()
        boarding.craft = $0.craft
        boarding.at = $0.at
        return boarding
      }
      body.walkTo = walkTo
      body.take = walkAction == .take
      return TraceScenario(
        emitter: .session, id: "script-\(script)", note: "written by --benson-trace",
        body: .session(body))
    }
  }

  static let knownFlags: Set<String> = [
    "--benson-trace", "--script", "--seconds", "--time-scale", "--press", "--board",
    "--walk-to", "--take", "--trace",
  ]

  static func options(from arguments: [String]) throws -> Options? {
    let arguments = Arguments(arguments)
    guard arguments.isPresent("--benson-trace") else { return nil }
    try arguments.rejectUnknownFlags(besides: knownFlags)
    var options = Options()
    if let script = try arguments.int("--script", expected: "a script id") { options.script = script }
    if let seconds = try arguments.double("--seconds") { options.seconds = seconds }
    options.timeScale = try arguments.double("--time-scale") ?? options.timeScale
    for value in try arguments.values(of: "--press", expected: "a key, as name@seconds") {
      let when = try split(value, flag: "--press")
      options.presses.append(
        (key: BensonKey(rawValue: "key" + when.name.uppercased()), at: when.at)
      )
    }
    for value in try arguments.values(of: "--board", expected: "a craft, as slot@seconds") {
      let when = try split(value, flag: "--board")
      guard let craft = Int(when.name) else {
        throw Arguments.Failure.notAnInteger(flag: "--board", value: when.name)
      }
      options.boarding.append((craft: craft, at: when.at))
    }
    if let slot = try arguments.int("--walk-to", expected: "an object slot") {
      options.walkTo = slot
    }
    if let slot = try arguments.int("--take", expected: "an object slot") {
      options.walkTo = slot
      options.walkAction = .take
    }
    options.trace = try arguments.trace()
    return options
  }

  /// Parses `name@seconds`.
  ///
  /// The separator is checked rather than assumed: writing `name:seconds` used to
  /// parse as "name, at zero", which looked like it had worked and silently ran a
  /// different scenario.
  private static func split(_ value: String, flag: String) throws -> (name: String, at: Double) {
    let parts = value.split(separator: "@", maxSplits: 1)
    guard let name = parts.first, !name.isEmpty else {
      throw Arguments.Failure.missingValue(flag: flag, expected: "a value before the @")
    }
    guard parts.count == 2 else {
      // Deliberately not echoing what was written back as the example: the mistake
      // here is the separator, and "written any:2@seconds" reads as advice to keep it.
      throw Arguments.Failure.missingValue(flag: flag, expected: "a time, written NAME@SECONDS")
    }
    guard let at = Double(parts[1]) else {
      throw Arguments.Failure.notANumber(flag: flag, value: String(parts[1]))
    }
    return (String(name), at)
  }

  static func run(_ options: Options) -> Int32 {
    guard let directory = PayloadLocator.locate() else {
      return fail("no Data Payload found")
    }
    do {
      let bundle = try Payload.load(from: directory)
      guard let document = bundle.benson, let text = bundle.text else {
        return fail("this Data Payload carries no scripts; export one with --run")
      }
      let program = try BensonProgram(document: document)
      // The same settings the app runs on, so a trace is representative.
      let settings = try Settings.load()
      var tunables = settings.bensonTunables(framesPerTick: program.framesPerTick)
      if let timeScale = options.timeScale { tunables.timeScale = timeScale }
      // Walking to something needs the world the player walks through, and the
      // rules for reaching it once there.
      let world = World(bundle: bundle)
      var session = GameplaySession(
        content: GameplaySession.Content(
          world: world,
          bundle: bundle,
          // Walking runs on the craft parameters too, so without them nothing moves.
          flight: bundle.flight.map { parameters in
            settings.flight.model(for: parameters, groundExtent: Double(world.groundExtent))
          }
        ),
        player: OpeningScene.player,
        scripts: BensonSession(
          program: program, text: TextTable(document: text), tunables: tunables
        )
      )
      guard session.start(script: options.script) else {
        return fail("script \(options.script) would not start")
      }
      let target = options.walkTo.flatMap { slot in
        world.objects.first { $0.slot == slot }
      }
      if let target {
        print(
          String(
            format: "walking to slot %d at %.0f, %.0f", target.slot,
            Double(target.origin.x), Double(target.origin.z)
          )
        )
      }
      var sink = Rehearsal.Sink()
      sink.say = { print($0) }
      var recorder: CoreTrace.Recorder? =
        options.trace == nil
        ? nil
        : try CoreTrace.Recorder(
          run: try TraceRun(), scenario: options.scenario, session: session)
      sink.step = { session, events, elapsed, note in
        try recorder?.record(session: session, events: events, elapsed: elapsed, note: note)
      }
      sink.command = { command, elapsed in
        try recorder?.command(command, elapsed: elapsed)
      }
      print("script \(options.script), \(program.instructions.count) instructions, \(session.snapshot.credits) credits")

      let elapsed = try Rehearsal.drive(
        &session, options: options, world: world, sink: sink)

      print(
        session.scripts?.isRunning == true
          ? String(format: "%7.2f  [still running — parked, waiting on the player]", elapsed)
          : String(format: "%7.2f  [script finished]", elapsed)
      )
      print("credits \(session.snapshot.credits)")
      if let output = options.trace, let recorder {
        try recorder.trace.write(to: output)
        print("wrote \(output.path)")
      }
      return 0
    } catch {
      return fail(String(describing: error))
    }
  }

  /// The rehearsal as a Golden Trace, with nothing printed.
  ///
  /// The top layer: everything is behind this one — decode, projection, the mover, the
  /// interpreter and the interaction rules — so it is the last replay gate the browser port
  /// can turn green, and the one that says the whole opening loop agrees.
  static func emit(
    _ run: TraceRun, scenario: TraceScenario, body: TraceScenario.Session
  ) throws -> TraceFile {
    guard try run.scripts(timeScale: body.timeScale) != nil else {
      throw TraceRun.Failure.noScripts
    }
    let world = run.world
    var session = GameplaySession(
      content: GameplaySession.Content(world: world, bundle: run.bundle, flight: run.flight),
      player: OpeningScene.player,
      scripts: try run.scripts(timeScale: body.timeScale)
    )
    guard session.start(script: body.script) else {
      throw TraceRun.Failure.scriptWouldNotStart(body.script)
    }

    var options = Options()
    options.script = body.script
    options.seconds = body.seconds
    options.timeScale = body.timeScale
    options.presses = try body.presses.map { press in
      let key = try press.key.map { name -> BensonKey in
        guard let key = BensonKey(rawValue: name) ?? BensonKey(rawValue: "key" + name.uppercased())
        else { throw TraceRun.Failure.unknownKey(name) }
        return key
      }
      return (key: key, at: press.at)
    }
    options.boarding = body.boarding.map { (craft: $0.craft, at: $0.at) }
    options.walkTo = body.walkTo
    options.walkAction = body.take ? .take : .board
    if let slot = body.walkTo, world.objects.first(where: { $0.slot == slot }) == nil {
      throw TraceRun.Failure.noObject(slot)
    }

    var recorder = try CoreTrace.Recorder(run: run, scenario: scenario, session: session)
    var sink = Rehearsal.Sink()
    sink.step = { session, events, elapsed, note in
      try recorder.record(session: session, events: events, elapsed: elapsed, note: note)
    }
    sink.command = { command, elapsed in
      try recorder.command(command, elapsed: elapsed)
    }
    try Rehearsal.drive(&session, options: options, world: world, sink: sink)
    return recorder.trace
  }

  private static func fail(_ message: String) -> Int32 {
    FileHandle.standardError.write(Data("error: \(message)\n".utf8))
    return 1
  }
}
