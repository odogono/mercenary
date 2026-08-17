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
  }

  static let knownFlags: Set<String> = [
    "--benson-trace", "--script", "--seconds", "--time-scale", "--press", "--board",
    "--walk-to", "--take",
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
      var reached = false

      let step = 1.0 / 60
      var elapsed: Double = 0
      var shown = ""
      var presses = options.presses.sorted { $0.at < $1.at }
      var boarding = options.boarding.sorted { $0.at < $1.at }
      print("script \(options.script), \(program.instructions.count) instructions, \(session.snapshot.credits) credits")

      while elapsed < options.seconds {
        while let next = presses.first, next.at <= elapsed {
          presses.removeFirst()
          print(String(format: "%7.2f  » press %@", elapsed, next.key.map(\.rawValue) ?? "any key"))
          session.press(next.key)
        }
        while let next = boarding.first, next.at <= elapsed {
          boarding.removeFirst()
          print(String(format: "%7.2f  » board craft %d", elapsed, next.craft))
          session.board(craft: next.craft)
        }

        // Walk toward the target and reach for it on arrival, so the whole loop
        // is exercised rather than the boarding being asserted from outside. The
        // reaching itself is the session's, so this exercises the same path the
        // interactive shell takes rather than a second copy of it.
        if let target, !reached {
          let position = SIMD3<Double>(target.origin)
          let (outcome, _) = session.reach(for: options.walkAction, only: target.slot)
          if outcome == .nothingInReach {
            session.intent = steer(from: session.game.player, to: position)
          } else {
            reached = true
            session.intent = .idle
            print(String(format: "%7.2f  » %@", elapsed, String(describing: outcome)))
          }
        }

        for event in session.advance(by: step).events {
          guard case .script(let effect) = event else { continue }
          print(String(format: "%7.2f  · %@", elapsed, String(describing: effect)))
        }
        // Report each message as it starts, so the trace reads as the sequence of
        // things said rather than as a per-frame log.
        if let text = session.scripts?.ticker?.text, text != shown {
          shown = text
          print(String(format: "%7.2f  %@", elapsed, text.isEmpty ? "[blank line]" : text))
        }
        elapsed += step
        if session.scripts?.isRunning != true { break }
      }

      print(
        session.scripts?.isRunning == true
          ? String(format: "%7.2f  [still running — parked, waiting on the player]", elapsed)
          : String(format: "%7.2f  [script finished]", elapsed)
      )
      print("credits \(session.snapshot.credits)")
      return 0
    } catch {
      return fail(String(describing: error))
    }
  }

  /// Turn toward a point and walk at it, the way a player would.
  private static func steer(from player: PlayerState, to target: SIMD3<Double>) -> Intent {
    let wanted = atan2(target.x - player.position.x, target.z - player.position.z)
    let turn = GameCore.wrapPitch(wanted - player.heading)
    // Walk once roughly facing the target, so the path is a turn and a stride
    // rather than a spiral.
    let aligned = abs(turn) < 0.05
    return Intent(turn: aligned ? 0 : (turn > 0 ? 1 : -1), walk: aligned ? 1 : 0)
  }

  private static func fail(_ message: String) -> Int32 {
    FileHandle.standardError.write(Data("error: \(message)\n".utf8))
    return 1
  }
}
