import Foundation
import MercenaryCLI
import MercenaryKit

/// Fly a craft without a window, so the control loop can be checked against the
/// decoded parameters rather than by eye.
///
/// It prints the Craft Parameter Blocks as real numbers and then flies one: a
/// take-off run, a climb, a turn, and a descent back onto the ground. What comes
/// out is the shape of the flight, which is the thing worth reading in a trace.
enum FlightTrace {
  struct Options {
    var craft: Int
    var notch: Int
    var seconds: Double
    var poweramp: Bool
    /// Where to write the Golden Trace, when one was asked for. The printed report is
    /// unaffected either way: this adds a machine-comparable record of the same flight
    /// rather than replacing the one a human reads.
    var trace: URL?

    var scenario: TraceScenario {
      var body = TraceScenario.Flight()
      body.craft = craft
      body.notch = notch
      body.seconds = seconds
      body.poweramp = poweramp
      return TraceScenario(
        emitter: .flight, id: "craft-\(craft)-notch-\(notch)\(poweramp ? "-poweramp" : "")",
        note: "written by --flight-trace", body: .flight(body))
    }
  }

  static let knownFlags: Set<String> = [
    "--flight-trace", "--craft", "--notch", "--seconds", "--poweramp", "--trace",
  ]

  static func options(from arguments: [String]) throws -> Options? {
    let arguments = Arguments(arguments)
    guard arguments.isPresent("--flight-trace") else { return nil }
    try arguments.rejectUnknownFlags(besides: knownFlags)
    return Options(
      craft: try arguments.int("--craft", expected: "a craft slot") ?? 1,
      notch: try arguments.int("--notch", expected: "a throttle notch") ?? 10,
      seconds: try arguments.double("--seconds") ?? 30,
      poweramp: arguments.isPresent("--poweramp"),
      trace: try arguments.trace()
    )
  }

  static func run(_ options: Options) -> Int32 {
    guard let directory = PayloadLocator.locate() else {
      return fail("no Data Payload found")
    }
    do {
      let bundle = try Payload.load(from: directory)
      guard let parameters = bundle.flight else {
        return fail("this Data Payload has no flight.json; export one with --run")
      }
      let world = World(bundle: bundle)
      let settings = try Settings.load()
      let flight = settings.flight.model(
        for: parameters, groundExtent: Double(world.groundExtent)
      )

      print(blocks(parameters))
      print("")
      print(rules(parameters.rules))
      print("")

      guard parameters.blocks.indices.contains(options.craft) else {
        return fail("no craft in slot \(options.craft)")
      }
      // The session owns the state even here, so a trace cannot drift from the
      // game: this drives the same transitions the interactive path does.
      var session = GameplaySession(
        content: GameplaySession.Content(world: world, bundle: bundle, flight: flight),
        player: OpeningScene.player
      )
      session.board(craft: options.craft)
      session.fitPoweramp(options.poweramp)
      session.throttle(notch: options.notch)

      let block = flight.block(for: session.game)
      print(
        "flying slot \(options.craft) (\(block.handler.rawValue)) at notch \(options.notch)"
          + (options.poweramp ? " with a poweramp" : "")
          + ", \(flight.limits.referenceFrameRate) frames per second")
      print("  time  mode      altitude     speed   pitch    roll   heading")

      // A circuit rather than a fixed script: each leg ends when the craft has
      // done the thing, so the trace shows take-off, cruise, turn and landing
      // whatever the craft's own rates happen to be. ``FlightCircuit`` owns the rule,
      // so the printed report and the Golden Trace fly the same aircraft.
      let step = TraceRun.dt
      var circuit = FlightCircuit(rules: parameters.rules, notch: options.notch)
      var elapsed = 0.0
      var mode = session.game.mode
      var reported = -1.0
      var flying = true
      // Only when a trace was asked for: this re-reads the payload the same way, so a
      // plain `--flight-trace` pays nothing for the option existing.
      var recorder: CoreTrace.Recorder? =
        options.trace == nil
        ? nil
        : try CoreTrace.Recorder(
          run: try TraceRun(), scenario: options.scenario, session: session)
      print(String(format: "%6.2f  · %@", elapsed, circuit.leg.rawValue))

      while elapsed < options.seconds && flying {
        if let entered = circuit.enterNextLeg(at: elapsed, player: session.game.player) {
          // Throttle back for the descent, as a pilot would before landing.
          if entered == .descending { session.throttle(notch: circuit.landingNotch) }
          print(String(format: "%6.2f  · %@", elapsed, entered.rawValue))
        }

        session.intent = circuit.intent(for: session.game.player)
        let update = session.advance(by: step)
        try recorder?.record(
          session: session, events: update.events, elapsed: elapsed,
          note: TraceValue.object(["leg": .string(circuit.leg.rawValue)]))

        if session.game.mode != mode {
          mode = session.game.mode
          print(String(format: "%6.2f  → %@", elapsed, mode == .flying ? "airborne" : "on the ground"))
        }
        for event in update.events {
          guard case .touchdown(let touchdown) = event else { continue }
          print(String(format: "%6.2f  → %@", elapsed, String(describing: touchdown)))
          print(line(elapsed, session.game))
          flying = false
        }
        if elapsed - reported >= 1 {
          reported = elapsed
          print(line(elapsed, session.game))
        }
        elapsed += step
      }
      print(line(elapsed, session.game))
      if let output = options.trace, let recorder {
        try recorder.trace.write(to: output)
        print("wrote \(output.path)")
      }
      print(
        "{\"status\":\"flown\",\"craft\":\(options.craft),"
          + "\"mode\":\"\(session.game.mode == .flying ? "flying" : "grounded")\","
          + "\"altitude\":\(Int(session.game.player.position.y)),"
          + "\"speed\":\(Int(session.game.player.speed))}")
      return 0
    } catch {
      return fail(String(describing: error))
    }
  }

  /// The circuit as a Golden Trace, with nothing printed.
  ///
  /// Shares ``FlightCircuit`` with ``run(_:)`` rather than reimplementing the legs, so a
  /// trace is of the flight the printed report describes. What differs is only what comes
  /// out: the report rounds for reading, and this records the inputs and full precision.
  static func emit(
    _ run: TraceRun, scenario: TraceScenario, body: TraceScenario.Flight
  ) throws -> TraceFile {
    guard let parameters = run.bundle.flight, let flight = run.flight else {
      throw TraceRun.Failure.noFlight
    }
    guard parameters.blocks.indices.contains(body.craft) else {
      throw TraceRun.Failure.noCraft(body.craft)
    }
    var session = GameplaySession(
      content: GameplaySession.Content(world: run.world, bundle: run.bundle, flight: flight),
      player: OpeningScene.player
    )
    session.board(craft: body.craft)
    session.fitPoweramp(body.poweramp)
    session.throttle(notch: body.notch)

    var circuit = FlightCircuit(rules: parameters.rules, notch: body.notch)
    var recorder = try CoreTrace.Recorder(run: run, scenario: scenario, session: session)
    try recorder.command(
      .object([
        "board": .int(body.craft), "throttle": .int(body.notch),
        "poweramp": .bool(body.poweramp),
      ]), elapsed: 0)

    let step = TraceRun.dt
    var elapsed = 0.0
    var flying = true
    while elapsed < body.seconds && flying {
      if let entered = circuit.enterNextLeg(at: elapsed, player: session.game.player) {
        if entered == .descending {
          session.throttle(notch: circuit.landingNotch)
          try recorder.command(
            .object(["throttle": .int(circuit.landingNotch)]), elapsed: elapsed)
        }
      }
      session.intent = circuit.intent(for: session.game.player)
      let update = session.advance(by: step)
      try recorder.record(
        session: session, events: update.events, elapsed: elapsed,
        note: .object(["leg": .string(circuit.leg.rawValue)]))
      if update.events.contains(where: { if case .touchdown = $0 { true } else { false } }) {
        flying = false
      }
      elapsed += step
    }
    return recorder.trace
  }

  private static func line(_ elapsed: Double, _ state: GameState) -> String {
    String(
      format: "%6.2f  %@ %9d %9.1f  %6.2f  %6.2f    %6.2f",
      elapsed, pad(state.mode == .flying ? "flying" : "grounded", 9),
      Int(state.player.position.y), state.player.speed,
      state.player.pitch, state.player.roll, state.player.heading)
  }

  /// `String(format:)` will not pad a Swift string through `%@` — the width is
  /// ignored, as `--flight-trace` shows the moment it is relied on — so pad here.
  private static func pad(_ text: String, _ width: Int) -> String {
    text + String(repeating: " ", count: max(0, width - text.count))
  }

  private static func blocks(_ document: Payload.FlightDocument) -> String {
    var rows = ["Craft Parameter Blocks", ""]
    rows.append(
      " #  handler   mode      yawDamp  yawAuth  pitch  roll     lift  spdDamp  ceiling      gain")
    for block in document.blocks {
      rows.append(
        String(
          format: "%3d  %@ %@ %7.5f %8.3f %6d %5.0f %8.4f %8.4f %8d %9.6f",
          block.index, pad(block.handler.rawValue, 9), pad(block.mode ?? "-", 9),
          block.yawDamping, block.yawAuthority, block.pitchStep, block.rollCoupling,
          block.liftFactor, block.speedDamping, block.ceiling, block.throttleGain))
    }
    return rows.joined(separator: "\n")
  }

  private static func rules(_ rules: Payload.FlightDocument.Rules) -> String {
    """
    Control-loop rules

      level pitch       \(rules.levelPitch) of \(rules.angleUnitsPerTurn) units per turn
      ground            altitude \(rules.groundAltitude), band \(rules.groundBand)
      take-off speed    \(rules.takeoffSpeed)
      crash above       descent \(rules.crashDescentRate), pitch \(rules.crashPitch)
      ceiling unit      \(rules.ceilingUnit)
      throttle          \(rules.throttleNotches.map { String(Int($0)) }.joined(separator: ", "))
      throttle limit    \(Int(rules.throttleLimit))
      poweramp          craft \(rules.poweramp.craft), throttle x\(rules.poweramp.throttleScale), ceiling \(rules.poweramp.ceiling)
    """
  }

  private static func fail(_ message: String) -> Int32 {
    FileHandle.standardError.write(Data("error: \(message)\n".utf8))
    return 1
  }
}
