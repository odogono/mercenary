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
  private struct OpeningLoopDrive {
    enum Phase: String {
      case awaitingPurchase, walkingToCraft, boarded, climbing, cruising, descending
      case landed, walkingToLift, arrived, complete
    }

    enum Failure: Error, CustomStringConvertible {
      case crashed
      case couldNotBoard(Int, Interaction.Outcome)
      case liftRefused(Int)
      case purchaseDidNotComplete
      case routeDidNotComplete(Phase)
      case unresolved(craft: Int, liftSite: Int)

      var description: String {
        switch self {
        case .crashed: return "the opening-loop rehearsal crashed instead of landing"
        case .couldNotBoard(let craft, let outcome):
          return "the opening-loop rehearsal could not board craft \(craft): \(outcome)"
        case .liftRefused(let site): return "lift site \(site) refused the opening-loop rehearsal"
        case .purchaseDidNotComplete:
          return "the opening-loop rehearsal reached its route before the 5,000-credit purchase completed"
        case .routeDidNotComplete(let phase):
          return "the opening-loop rehearsal timed out while \(phase.rawValue)"
        case .unresolved(let craft, let liftSite):
          return "the opening-loop rehearsal could not resolve craft \(craft) and lift site \(liftSite)"
        }
      }
    }

    let craft: ObjectPlacement
    let entrance: Payload.UndergroundDocument.Entrance
    let pad: Payload.UndergroundDocument.Pad
    let cellSize: Double
    let flight: FlightModel
    let takeoffNotch: Int
    let padPosition: SIMD3<Double>
    var phase = Phase.awaitingPurchase

    init?(
      options: BensonTrace.Options, session: GameplaySession, objects: [ObjectPlacement]
    ) {
      guard let route = options.openingLoop, let slot = options.walkTo,
        let craft = objects.first(where: { $0.slot == slot }),
        let underground = session.content.underground,
        let entrance = underground.entrances.first(where: { $0.site == route.liftSite }),
        entrance.cell.count == 2,
        let flight = session.content.flight
      else { return nil }
      self.craft = craft
      self.entrance = entrance
      self.pad = underground.pad
      self.cellSize = session.content.cellSize
      self.flight = flight
      self.takeoffNotch = route.notch
      self.padPosition = SIMD3(
        Double(entrance.cell[0]) * session.content.cellSize
          + Rehearsal.padCentre(underground.pad.x, shift: underground.pad.shift),
        flight.groundAltitude,
        Double(entrance.cell[1]) * session.content.cellSize
          + Rehearsal.padCentre(underground.pad.z, shift: underground.pad.shift))
    }

    var finished: Bool { phase == .complete }

    mutating func prepare(
      _ session: inout GameplaySession, elapsed: Double, sink: TraceSink
    ) throws -> TraceValue? {
      session.intent = .idle
      switch phase {
      case .awaitingPurchase:
        if session.snapshot.credits == 4_000 { phase = .walkingToCraft }
      case .walkingToCraft:
        guard session.snapshot.credits == 4_000 else { throw Failure.purchaseDidNotComplete }
        let (outcome, _) = session.reach(for: .board, only: craft.slot)
        if outcome == .nothingInReach {
          session.intent = Self.steer(
            from: session.game.player, to: SIMD3<Double>(craft.origin), running: true)
        } else {
          guard outcome == .boarded(slot: craft.slot) else {
            throw Failure.couldNotBoard(craft.slot, outcome)
          }
          phase = .boarded
          return .object(["reached": TraceRecords.value(outcome)])
        }
      case .boarded:
        session.throttle(notch: takeoffNotch)
        try sink.command(.object(["throttleNotch": .int(takeoffNotch)]), elapsed)
        phase = .climbing
      case .climbing:
        session.intent = Self.fly(
          from: session.game.player, to: padPosition, pitch: 0.25)
        let cruise = Double(flight.rules.ceilingUnit) / 16
        if session.game.player.position.y >= cruise { phase = .cruising }
      case .cruising:
        session.intent = Self.fly(from: session.game.player, to: padPosition, pitch: 0)
        if Self.horizontalDistance(from: session.game.player.position, to: padPosition) <= 45_000 {
          let landingNotch = max(1, takeoffNotch - 6)
          session.throttle(notch: landingNotch)
          try sink.command(.object(["throttleNotch": .int(landingNotch)]), elapsed)
          phase = .descending
        }
      case .descending:
        session.intent = Self.fly(
          from: session.game.player, to: padPosition, pitch: -0.25)
      case .landed:
        session.shutThrottle()
        try sink.command(.object(["shutThrottle": .bool(true)]), elapsed)
        guard session.leaveCraft() != nil else { throw Failure.routeDidNotComplete(phase) }
        try sink.command(.object(["leaveCraft": .bool(true)]), elapsed)
        phase = .walkingToLift
      case .walkingToLift:
        let player = session.game.player.position
        let column = Int(player.x / cellSize)
        let row = Int(player.z / cellSize)
        if column == entrance.cell[0], row == entrance.cell[1],
          pad.covers(player.x, cellSize: cellSize), pad.covers(player.z, cellSize: cellSize) {
          guard session.rideLift() != nil else { throw Failure.liftRefused(entrance.site) }
          try sink.command(.object(["rideLift": .bool(true)]), elapsed)
          phase = .arrived
        } else {
          session.intent = Self.steer(from: session.game.player, to: padPosition, running: true)
        }
      case .arrived, .complete:
        break
      }
      return nil
    }

    mutating func observe(
      _ session: GameplaySession, events: [PresentationEvent]
    ) throws {
      for event in events {
        guard case .touchdown(let touchdown) = event else { continue }
        guard touchdown == .landed else { throw Failure.crashed }
        phase = .landed
      }
      if phase == .arrived {
        guard session.location == .room(entrance.room), session.indoorScene != nil else {
          throw Failure.liftRefused(entrance.site)
        }
        phase = .complete
      }
    }

    func timedOut() -> Failure { .routeDidNotComplete(phase) }

    private static func horizontalDistance(
      from: SIMD3<Double>, to: SIMD3<Double>
    ) -> Double {
      hypot(to.x - from.x, to.z - from.z)
    }

    private static func steer(
      from player: PlayerState, to target: SIMD3<Double>, running: Bool = false
    ) -> Intent {
      let wanted = atan2(target.x - player.position.x, target.z - player.position.z)
      let error = GameCore.wrapPitch(wanted - player.heading)
      let turn = abs(error) < 0.03 ? 0 : (error > 0 ? 1.0 : -1.0)
      return Intent(turn: turn, walk: turn == 0 ? 1 : 0, running: running)
    }

    private static func fly(
      from player: PlayerState, to target: SIMD3<Double>, pitch targetPitch: Double
    ) -> Intent {
      let wanted = atan2(target.x - player.position.x, target.z - player.position.z)
      let heading = GameCore.wrapPitch(wanted - player.heading)
      let pitch = targetPitch - player.pitch
      return Intent(
        turn: abs(heading) < 0.02 ? 0 : (heading > 0 ? 1 : -1),
        pitch: abs(pitch) < 0.01 ? 0 : (pitch > 0 ? 1 : -1))
    }
  }

  /// The middle of one decoded lift-pad run, measured within its surface cell.
  static func padCentre(_ value: Int, shift: Int) -> Double {
    let middleByte = (value << shift) + (shift == 0 ? 0 : 1 << (shift - 1))
    return Double(middleByte << 8)
  }

  /// Drive the session to the end of the scenario, and say where the clock got to.
  @discardableResult
  static func drive(
    _ session: inout GameplaySession, options: BensonTrace.Options, world: World,
    sink: TraceSink
  ) throws -> Double {
    try drive(&session, options: options, objects: world.objects, sink: sink)
  }

  /// The same drive with its routeable placements exposed for focused host-tool tests.
  @discardableResult
  static func drive(
    _ session: inout GameplaySession, options: BensonTrace.Options,
    objects: [ObjectPlacement], sink: TraceSink
  ) throws -> Double {
    let target = options.walkTo.flatMap { slot in objects.first { $0.slot == slot } }
    var reached = false
    let step = TraceRun.dt
    var elapsed: Double = 0
    var shown = ""
    var presses = options.presses.sorted { $0.at < $1.at }
    var boarding = options.boarding.sorted { $0.at < $1.at }
    var openingLoop = OpeningLoopDrive(options: options, session: session, objects: objects)
    if let route = options.openingLoop, openingLoop == nil {
      throw OpeningLoopDrive.Failure.unresolved(
        craft: options.walkTo ?? -1, liftSite: route.liftSite)
    }

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
      var note: TraceValue?
      if openingLoop != nil {
        note = try openingLoop?.prepare(&session, elapsed: elapsed, sink: sink)
      } else if let target, !reached {
        let position = SIMD3<Double>(target.origin)
        let (reachOutcome, _) = session.reach(for: options.walkAction, only: target.slot)
        if reachOutcome == .nothingInReach {
          session.intent = steer(from: session.game.player, to: position)
        } else {
          reached = true
          session.intent = .idle
          sink.say(String(format: "%7.2f  » %@", elapsed, String(describing: reachOutcome)))
          note = .object(["reached": TraceRecords.value(reachOutcome)])
        }
      }

      let update = session.advance(by: step)
      try openingLoop?.observe(session, events: update.events)
      for event in update.events {
        guard case .script(let effect) = event else { continue }
        sink.say(String(format: "%7.2f  · %@", elapsed, String(describing: effect)))
      }
      try sink.step(session, update.events, note)

      // Report each message as it starts, so the report reads as the sequence of things
      // said rather than as a per-frame log.
      if let text = session.scripts?.ticker?.text, text != shown {
        shown = text
        sink.say(String(format: "%7.2f  %@", elapsed, text.isEmpty ? "[blank line]" : text))
      }
      elapsed += step
      if openingLoop?.finished == true { break }
      if openingLoop == nil, session.scripts?.isRunning != true { break }
    }
    if let openingLoop, !openingLoop.finished { throw openingLoop.timedOut() }
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
