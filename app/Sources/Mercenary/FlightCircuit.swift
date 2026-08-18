import MercenaryCLI
import MercenaryKit

/// The circuit ``FlightTrace`` flies: a take-off run, a climb, a turn, and a descent back
/// onto the ground.
///
/// A circuit rather than a fixed script, because each leg ends when the craft has done the
/// thing: the trace shows take-off, cruise, turn and landing whatever the craft's own
/// rates happen to be. That makes it a feedback loop, and a feedback loop is exactly what
/// a Golden Trace must not ask a replay to reproduce — so the trace records the intent
/// this produced on each step rather than the rule that produced it, and a replay feeds
/// those intents back without owning any of this.
///
/// Extracted so that the printed diagnostic and its trace are driven by one copy. Two
/// copies would eventually fly differently, and then the trace would be of a flight the
/// maintainer never read.
struct FlightCircuit {
  enum Leg: String, Sendable {
    case climbing, levelling, turning, descending
  }

  private(set) var leg = Leg.climbing
  private var legStarted = 0.0
  /// Altitude the climb is aiming for.
  let cruise: Double
  /// The notch the scenario asked for, which the descent throttles back from.
  let notch: Int

  init(rules: Payload.FlightDocument.Rules, notch: Int) {
    self.cruise = Double(rules.ceilingUnit) / 16
    self.notch = notch
  }

  /// The notch to throttle back to before landing, as a pilot would.
  var landingNotch: Int { max(1, notch - 4) }

  /// Move on to the next leg if this one is done, and say which was entered.
  ///
  /// The elapsed time is passed in rather than counted here, so the circuit shares the
  /// caller's clock instead of keeping a second one that could disagree with it.
  mutating func enterNextLeg(at elapsed: Double, player: PlayerState) -> Leg? {
    let held = elapsed - legStarted
    switch leg {
    case .climbing where player.position.y >= cruise: return enter(.levelling, at: elapsed)
    case .levelling where abs(player.pitch) < 0.02 && held > 1: return enter(.turning, at: elapsed)
    case .turning where held > 4: return enter(.descending, at: elapsed)
    default: return nil
    }
  }

  private mutating func enter(_ next: Leg, at elapsed: Double) -> Leg {
    leg = next
    legStarted = elapsed
    return next
  }

  /// Set a craft up and say what was done to it, so the printed report and the Golden Trace
  /// board, fit and throttle identically.
  ///
  /// The commands are an *input*: a replay that boarded a different craft or opened the
  /// throttle to a different notch would diverge from the first step, so they belong in the
  /// trace beside the intents rather than being implied by the scenario.
  static func prepare(
    _ session: inout GameplaySession, craft: Int, notch: Int, poweramp: Bool
  ) -> TraceValue {
    session.board(craft: craft)
    session.fitPoweramp(poweramp)
    session.throttle(notch: notch)
    return .object([
      "board": .int(craft), "throttle": .int(notch), "poweramp": .bool(poweramp),
    ])
  }

  /// Fly toward the leg's attitude rather than holding a stick down, so a trace shows an
  /// attitude being held and not one running away.
  func intent(for player: PlayerState) -> Intent {
    let attitude: Double
    switch leg {
    case .climbing: attitude = 0.45
    case .descending: attitude = -0.25
    default: attitude = 0
    }
    let error = attitude - player.pitch
    let pitch: Double = abs(error) < 0.01 ? 0 : (error > 0 ? 1 : -1)
    return Intent(turn: leg == .turning ? 1 : 0, pitch: pitch)
  }
}
