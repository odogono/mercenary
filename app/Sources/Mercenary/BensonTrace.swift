import Foundation
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

  static func options(from arguments: [String]) -> Options? {
    guard arguments.contains("--benson-trace") else { return nil }
    var options = Options()
    var index = 0
    while index < arguments.count {
      let argument = arguments[index]
      let value = index + 1 < arguments.count ? arguments[index + 1] : nil
      switch argument {
      case "--script":
        options.script = value.flatMap(Int.init) ?? options.script
      case "--seconds":
        options.seconds = value.flatMap(Double.init) ?? options.seconds
      case "--time-scale":
        options.timeScale = value.flatMap(Double.init) ?? options.timeScale
      case "--press":
        if let parsed = split(value) {
          options.presses.append((key: BensonKey(rawValue: "key" + parsed.name.uppercased()), at: parsed.at))
        }
      case "--board":
        if let parsed = split(value), let craft = Int(parsed.name) {
          options.boarding.append((craft: craft, at: parsed.at))
        }
      case "--walk-to":
        options.walkTo = value.flatMap(Int.init)
      case "--take":
        options.walkTo = value.flatMap(Int.init)
        options.walkAction = .take
      default:
        break
      }
      index += 1
    }
    return options
  }

  /// Parses `name@seconds`.
  private static func split(_ value: String?) -> (name: String, at: Double)? {
    guard let value else { return nil }
    let parts = value.split(separator: "@", maxSplits: 1)
    guard let name = parts.first else { return nil }
    return (String(name), parts.count > 1 ? Double(parts[1]) ?? 0 : 0)
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
      var tunables = try Settings.load().bensonTunables(framesPerTick: program.framesPerTick)
      if let timeScale = options.timeScale { tunables.timeScale = timeScale }
      var session = BensonSession(
        program: program, text: TextTable(document: text), tunables: tunables
      )
      guard session.start(script: options.script) else {
        return fail("script \(options.script) would not start")
      }

      // Walking to something needs the world the player walks through, and the
      // rules for reaching it once there.
      let world = World(bundle: bundle)
      var limits = WalkLimits()
      limits.groundExtent = Double(world.groundExtent)
      var game = GameState(player: OpeningScene.player)
      let interaction = bundle.interaction.map(Interaction.init(document:))
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
      print("script \(options.script), \(program.instructions.count) instructions, \(session.credits) credits")

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
        // is exercised rather than the boarding being asserted from outside.
        if let target, let interaction, !reached {
          let position = SIMD3<Double>(target.origin)
          let candidate = Interaction.Candidate(slot: target.slot, position: position)
          let range = options.walkAction == .board ? interaction.boardRange : interaction.takeRange
          if interaction.isWithinReach(candidate, of: game.player.position, range: range) {
            var host = session.hostState
            let outcome = interaction.attempt(
              options.walkAction, from: game.player.position, among: [candidate], host: &host
            )
            session.hostState = host
            reached = true
            print(String(format: "%7.2f  » %@", elapsed, String(describing: outcome)))
            switch outcome {
            case .took(let slot), .boarded(let slot):
              session.describe(interaction.description(of: slot, flags: host.objectFlags[slot] ?? 0))
            case .tooHeavy:
              session.show(message: interaction.tooHeavyMessage)
            default:
              break
            }
          } else {
            game = GameCore.step(game, intent: steer(from: game.player, to: position), dt: step, limits: limits)
          }
        }

        for effect in session.advance(by: step) {
          print(String(format: "%7.2f  · %@", elapsed, String(describing: effect)))
        }
        // Report each message as it starts, so the trace reads as the sequence of
        // things said rather than as a per-frame log.
        if let text = session.ticker?.text, text != shown {
          shown = text
          print(String(format: "%7.2f  %@", elapsed, text.isEmpty ? "[blank line]" : text))
        }
        elapsed += step
        if !session.isRunning { break }
      }

      print(
        session.isRunning
          ? String(format: "%7.2f  [still running — parked, waiting on the player]", elapsed)
          : String(format: "%7.2f  [script finished]", elapsed)
      )
      print("credits \(session.credits)")
      return 0
    } catch {
      return fail(String(describing: error))
    }
  }

  /// Turn toward a point and walk at it, the way a player would.
  private static func steer(from player: PlayerState, to target: SIMD3<Double>) -> Intent {
    let wanted = atan2(target.x - player.position.x, target.z - player.position.z)
    var turn = wanted - player.heading
    while turn > .pi { turn -= 2 * .pi }
    while turn < -.pi { turn += 2 * .pi }
    // Walk once roughly facing the target, so the path is a turn and a stride
    // rather than a spiral.
    let aligned = abs(turn) < 0.05
    return Intent(forward: aligned ? 1 : 0, turn: aligned ? 0 : (turn > 0 ? 1 : -1))
  }

  private static func fail(_ message: String) -> Int32 {
    FileHandle.standardError.write(Data("error: \(message)\n".utf8))
    return 1
  }
}
