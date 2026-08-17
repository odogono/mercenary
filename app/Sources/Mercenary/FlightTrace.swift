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
  }

  static let knownFlags: Set<String> = [
    "--flight-trace", "--craft", "--notch", "--seconds", "--poweramp",
  ]

  static func options(from arguments: [String]) throws -> Options? {
    let arguments = Arguments(arguments)
    guard arguments.isPresent("--flight-trace") else { return nil }
    try arguments.rejectUnknownFlags(besides: knownFlags)
    return Options(
      craft: try arguments.int("--craft", expected: "a craft slot") ?? 1,
      notch: try arguments.int("--notch", expected: "a throttle notch") ?? 10,
      seconds: try arguments.double("--seconds") ?? 30,
      poweramp: arguments.isPresent("--poweramp")
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
      // whatever the craft's own rates happen to be.
      enum Leg: String { case climbing, levelling, turning, descending }
      let step = 1.0 / 60.0
      let cruise = Double(parameters.rules.ceilingUnit) / 16
      var elapsed = 0.0
      var mode = session.game.mode
      var reported = -1.0
      var leg = Leg.climbing
      var legStarted = 0.0
      var flying = true
      func enter(_ next: Leg) {
        leg = next
        legStarted = elapsed
        // Throttle back for the descent, as a pilot would before landing.
        if next == .descending {
          session.throttle(notch: max(1, options.notch - 4))
        }
        print(String(format: "%6.2f  · %@", elapsed, next.rawValue))
      }
      print(String(format: "%6.2f  · %@", elapsed, leg.rawValue))

      while elapsed < options.seconds && flying {
        let held = elapsed - legStarted
        switch leg {
        case .climbing where session.game.player.position.y >= cruise: enter(.levelling)
        case .levelling where abs(session.game.player.pitch) < 0.02 && held > 1: enter(.turning)
        case .turning where held > 4: enter(.descending)
        default: break
        }

        let attitude: Double
        switch leg {
        case .climbing: attitude = 0.45
        case .descending: attitude = -0.25
        default: attitude = 0
        }
        // Fly toward the leg's attitude rather than holding a stick down, so the
        // trace shows an attitude being held and not one running away.
        let error = attitude - session.game.player.pitch
        let pitch: Double = abs(error) < 0.01 ? 0 : (error > 0 ? 1 : -1)
        session.intent = Intent(turn: leg == .turning ? 1 : 0, pitch: pitch)
        let update = session.advance(by: step)

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
