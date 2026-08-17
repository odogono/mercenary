import Foundation
import MercenaryCLI
import MercenaryKit

/// The control loop as a Golden Trace: intents in, state out, one record per fixed step.
///
/// Two emitters share this one record shape. `flight` is the circuit ``FlightTrace`` flies
/// through a craft; `game-core` is a scripted walk from the catalogue. Both are the same
/// ``GameCore`` advance over different Craft Parameter Blocks — walking and flying are one
/// mover (ADR 0016) — so pinning them with two schemas would be pretending they were two
/// things.
///
/// Neither runs a script. That is what lets the browser port replay them once the mover is
/// ported and before the interpreter is (#68's gated order).
enum CoreTrace {
  /// Builds the trace as a run proceeds.
  ///
  /// Holds the previous state so each record can carry only what moved, and holds nothing
  /// else: the driver keeps its own clock and its own scenario, and hands both in.
  struct Recorder {
    private(set) var trace: TraceFile
    private var previous: TraceValue
    private var step = 0

    init(run: TraceRun, scenario: TraceScenario, session: GameplaySession) throws {
      trace = TraceFile(emitter: scenario.emitter.rawValue, id: scenario.id)
      previous = Self.state(of: session)
      try trace.header(
        run.header(for: scenario, extra: [(key: "initial", value: previous)]))
    }

    /// Everything a replay compares, in full. Records carry the changes to this.
    static func state(of session: GameplaySession) -> TraceValue {
      let snapshot = session.snapshot
      return .object(
        TraceRecords.scalars(snapshot) + [
          (key: "core", value: TraceRecords.coreState(session.game)),
          (key: "residence", value: .slots(TraceRecords.slots(snapshot.residence))),
        ])
    }

    /// One step: what went in, what came out, and what the session said about it.
    ///
    /// `input` is the whole point of the record. The drivers here are feedback loops —
    /// the flight circuit corrects toward an attitude it reads back off the craft — so a
    /// replay that had to reproduce the *driver* would be testing this file's arithmetic
    /// rather than the port's mover. Recording the intent that was actually applied makes
    /// a replay a pure function of the trace.
    mutating func record(
      session: GameplaySession, events: [PresentationEvent], elapsed: Double,
      input: TraceValue? = nil, note: TraceValue? = nil
    ) throws {
      let state = Self.state(of: session)
      var members: [(key: String, value: TraceValue)] = [
        (key: "step", value: .int(step)),
        // The session's own accumulated clock, which the core consumes. Recorded as an
        // assertion rather than used as a key: a replay drives by `step` and `dt`, and
        // this proves its additions came out in the same place.
        (key: "elapsed", value: .double(session.snapshot.elapsed)),
        (key: "input", value: input ?? TraceRecords.value(session.intent)),
      ]
      if let note { members.append((key: "note", value: note)) }
      if !events.isEmpty {
        members.append((key: "events", value: .array(events.map(TraceRecords.value))))
      }
      if let changes = previous.changes(to: state) {
        members.append((key: "changed", value: changes))
      }
      try trace.record(.object(members))
      previous = state
      step += 1
    }

    /// Note an input that is not an intent — boarding, a throttle notch — at the step it
    /// was applied, so a replay applies it in the same place.
    mutating func command(_ command: TraceValue, elapsed: Double) throws {
      try trace.record(
        .object([
          "step": .int(step), "elapsed": .double(elapsed), "command": command,
        ]))
    }
  }

  static func emit(
    _ run: TraceRun, scenario: TraceScenario, body: TraceScenario.GameCore
  ) throws -> TraceFile {
    guard let flight = run.flight else { throw TraceRun.Failure.noFlight }
    let world = run.world
    // No scripts at all: this emitter's whole purpose is to be replayable before the
    // interpreter is ported.
    var session = GameplaySession(
      content: GameplaySession.Content(world: world, bundle: run.bundle, flight: flight),
      player: OpeningScene.player
    )
    if let room = body.room {
      guard let start = world.rooms[room] else { throw TraceRun.Failure.noRoom(room) }
      session.teleport(to: .room(room))
      // The middle of the Room, which is where the lift arrives.
      let middle = (start.bounds.min + start.bounds.max) / 2
      session.place(
        at: SIMD3(
          body.at?.x ?? Double(middle.x), session.game.player.position.y,
          body.at?.z ?? Double(middle.z)))
    } else if let at = body.at {
      session.place(at: SIMD3(at.x, session.game.player.position.y, at.z))
    }
    if let craft = body.craft {
      guard run.bundle.flight?.blocks.indices.contains(craft) == true else {
        throw TraceRun.Failure.noCraft(craft)
      }
      session.board(craft: craft)
    }
    if let notch = body.notch { session.throttle(notch: notch) }

    var recorder = try Recorder(run: run, scenario: scenario, session: session)
    if let craft = body.craft {
      try recorder.command(.object(["board": .int(craft)]), elapsed: 0)
    }
    if let notch = body.notch {
      try recorder.command(.object(["throttle": .int(notch)]), elapsed: 0)
    }

    let step = TraceRun.dt
    var elapsed = 0.0
    for (index, leg) in body.legs.enumerated() {
      var intent = Intent()
      intent.turn = leg.turn
      intent.pitch = leg.pitch
      intent.walk = leg.walk
      intent.running = leg.running
      var remaining = leg.seconds
      while remaining > 0 {
        session.intent = intent
        let update = session.advance(by: step)
        try recorder.record(
          session: session, events: update.events, elapsed: elapsed,
          note: .object(["leg": .int(index + 1)]))
        elapsed += step
        remaining -= step
      }
    }
    return recorder.trace
  }
}
