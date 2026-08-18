import Foundation
import MercenaryCLI
import MercenaryKit

/// The opening rehearsal: the whole session — world, craft parameters, interaction rules
/// and scripts — driven through a scheduled scenario.
///
/// One driver, shared by the printed report ``BensonTrace`` writes and the Golden Trace
/// beside it, for the same reason ``FlightCircuit`` is shared: this is a feedback loop, not
/// an input script. It steers toward a target with an `atan2` and an alignment threshold,
/// and it reaches for things by asking the session whether anything is in reach. A second
/// copy of that would eventually walk a different path, and the trace would then be of a
/// rehearsal nobody had read.
///
/// The trace records the intent this produces on each step, so a replay never has to own
/// any of it.
/// Where a driven run's output goes.
///
/// One shape for every driver here — the opening rehearsal and the underground walk — because
/// the three things a driver has to say are the same in both: a line for a person, a step for
/// a trace, and an input that was not an intent. Two shapes for one clump meant two call sites
/// to keep in step for no difference.
///
/// Every closure is optional in effect: the printed report supplies `say`, the trace supplies
/// `step` and `command`, and either may be absent without the drive behaving differently.
struct TraceSink {
  var say: (String) -> Void = { _ in }
  var step:
    (_ session: GameplaySession, _ events: [PresentationEvent], _ note: TraceValue?) throws ->
      Void = { _, _, _ in }
  var command: (_ command: TraceValue, _ elapsed: Double) throws -> Void = { _, _ in }
}

enum Rehearsal {
  /// Drive the session to the end of the scenario, and say where the clock got to.
  @discardableResult
  static func drive(
    _ session: inout GameplaySession, options: BensonTrace.Options, world: World,
    sink: TraceSink
  ) throws -> Double {
    let target = options.walkTo.flatMap { slot in world.objects.first { $0.slot == slot } }
    var reached = false
    let step = TraceRun.dt
    var elapsed: Double = 0
    var shown = ""
    var presses = options.presses.sorted { $0.at < $1.at }
    var boarding = options.boarding.sorted { $0.at < $1.at }

    while elapsed < options.seconds {
      while let next = presses.first, next.at <= elapsed {
        presses.removeFirst()
        sink.say(String(format: "%7.2f  » press %@", elapsed, next.key.map(\.rawValue) ?? "any key"))
        session.press(next.key)
        try sink.command(
          .object(["press": next.key.map { .string($0.rawValue) } ?? .string("any")]),
          elapsed)
      }
      while let next = boarding.first, next.at <= elapsed {
        boarding.removeFirst()
        sink.say(String(format: "%7.2f  » board craft %d", elapsed, next.craft))
        session.board(craft: next.craft)
        try sink.command(.object(["board": .int(next.craft)]), elapsed)
      }

      // Walk toward the target and reach for it on arrival, so the whole loop is exercised
      // rather than the boarding being asserted from outside. The reaching itself is the
      // session's, so this exercises the same path the interactive shell takes rather than
      // a second copy of it.
      var outcome: Interaction.Outcome?
      if let target, !reached {
        let position = SIMD3<Double>(target.origin)
        let (reachOutcome, _) = session.reach(for: options.walkAction, only: target.slot)
        outcome = reachOutcome
        if reachOutcome == .nothingInReach {
          session.intent = steer(from: session.game.player, to: position)
        } else {
          reached = true
          session.intent = .idle
          sink.say(String(format: "%7.2f  » %@", elapsed, String(describing: reachOutcome)))
        }
      }

      let update = session.advance(by: step)
      for event in update.events {
        guard case .script(let effect) = event else { continue }
        sink.say(String(format: "%7.2f  · %@", elapsed, String(describing: effect)))
      }
      try sink.step(
        session, update.events,
        outcome.flatMap {
          $0 == .nothingInReach ? nil : .object(["reached": TraceRecords.value($0)])
        })

      // Report each message as it starts, so the report reads as the sequence of things
      // said rather than as a per-frame log.
      if let text = session.scripts?.ticker?.text, text != shown {
        shown = text
        sink.say(String(format: "%7.2f  %@", elapsed, text.isEmpty ? "[blank line]" : text))
      }
      elapsed += step
      if session.scripts?.isRunning != true { break }
    }
    return elapsed
  }

  /// Turn toward a point and walk at it, the way a player would.
  static func steer(from player: PlayerState, to target: SIMD3<Double>) -> Intent {
    let wanted = atan2(target.x - player.position.x, target.z - player.position.z)
    let turn = GameCore.wrapPitch(wanted - player.heading)
    // Walk once roughly facing the target, so the path is a turn and a stride rather than
    // a spiral.
    let aligned = abs(turn) < 0.05
    return Intent(turn: aligned ? 0 : (turn > 0 ? 1 : -1), walk: aligned ? 1 : 0)
  }
}
