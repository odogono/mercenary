import Foundation
import MercenaryCLI
import MercenaryKit

/// The Benson interpreter as a Golden Trace, one record per instruction.
///
/// No world. That is the point: the browser port reaches the Benson trio after the mover
/// and before the interaction rules (#68), so this trace has to be replayable with the
/// interpreter, the program and the text table and nothing else. ``BensonTrace`` remains
/// the whole-session rehearsal, above this layer.
///
/// The instruction detail comes from ``BensonObserver``, threaded through the session so
/// the execution traced is the one the app performs. Running with a one-instruction budget
/// would have traced a different execution, because the budget stands in for the frame
/// boundary.
///
/// What an instruction *read* is not recorded, and does not need to be: the header carries
/// the whole of ``BensonState`` and ``BensonHostState``, every record carries what changed,
/// so every value an instruction could have consulted is reconstructible at the moment it
/// ran — and which way a test went is the program counter in the next record.
enum ScriptTrace {
  struct Options {
    /// The scenario this invocation describes. The command line reaches a subset of what
    /// the catalogue can say — there are no flags for a synthetic Host Callout, because
    /// spelling one out on a command line would be worse than writing it down in the
    /// catalogue where it can be reviewed.
    var body = TraceScenario.Benson()
    var trace: URL?

    var scenario: TraceScenario {
      TraceScenario(
        emitter: .benson, id: "script-\(body.script)", note: "written by --script-trace",
        body: .benson(body))
    }
  }

  static let knownFlags: Set<String> = [
    "--script-trace", "--script", "--seconds", "--time-scale", "--press", "--trace",
  ]

  static func options(from arguments: [String]) throws -> Options? {
    let arguments = Arguments(arguments)
    guard arguments.isPresent("--script-trace") else { return nil }
    try arguments.rejectUnknownFlags(besides: knownFlags)
    var options = Options()
    if let script = try arguments.int("--script", expected: "a script id") {
      options.body.script = script
    }
    if let seconds = try arguments.double("--seconds") { options.body.seconds = seconds }
    options.body.timeScale = try arguments.double("--time-scale")
    options.trace = try arguments.trace()
    for value in try arguments.values(of: "--press", expected: "a key, as name@seconds") {
      let parts = value.split(separator: "@", maxSplits: 1)
      guard let name = parts.first, !name.isEmpty, parts.count == 2,
        let at = Double(parts[1])
      else {
        throw Arguments.Failure.missingValue(
          flag: "--press", expected: "a key and a time, written NAME@SECONDS")
      }
      var press = TraceScenario.Benson.Press()
      // `any` is the keypress with no code, which the opening reads as intent to walk.
      press.key = name == "any" ? nil : String(name)
      press.at = at
      options.body.presses.append(press)
    }
    return options
  }

  static func run(_ options: Options) -> Int32 {
    do {
      let trace = try emit(try TraceRun(), scenario: options.scenario, body: options.body)
      if let output = options.trace {
        try trace.write(to: output)
        print("wrote \(output.path)")
      } else {
        print(String(decoding: trace.bytes, as: UTF8.self), terminator: "")
      }
      return 0
    } catch {
      FileHandle.standardError.write(Data("error: \(error)\n".utf8))
      return 1
    }
  }

  static func emit(
    _ run: TraceRun, scenario: TraceScenario, body: TraceScenario.Benson
  ) throws -> TraceFile {
    guard var session = try run.scripts(timeScale: body.timeScale) else {
      throw TraceRun.Failure.noScripts
    }
    // The Host Callout as the world would have left it. Applied before the script starts,
    // because a script's first test may be the one that decides everything after it.
    session.hostState = try apply(body.host, to: session.hostState)
    guard session.start(script: body.script) else {
      throw TraceRun.Failure.scriptWouldNotStart(body.script)
    }

    var trace = TraceFile(emitter: scenario.emitter.rawValue, id: scenario.id)
    var previous = state(of: session)
    try trace.header(
      run.header(
        for: scenario,
        extra: [
          (key: "initial", value: previous),
          (
            key: "program",
            value: .object([
              "instructions": .int(session.program.instructions.count),
              "scripts": .int(session.program.scriptCount),
              "framesPerTick": .int(session.program.framesPerTick),
              "entry": .int(session.program.entry(of: body.script) ?? -1),
            ])
          ),
          (
            key: "tunables",
            value: .object([
              "framesPerTick": .int(session.tunables.framesPerTick),
              "framesPerSecond": .double(session.tunables.framesPerSecond),
              "timeScale": .double(session.tunables.timeScale),
              "instructionBudget": .int(session.tunables.instructionBudget),
              "messageCharactersPerSecond": .double(session.tunables.messageCharactersPerSecond),
              "messageHoldSeconds": .double(session.tunables.messageHoldSeconds),
            ])
          ),
        ]))

    let step = TraceRun.dt
    var elapsed = 0.0
    var stepIndex = 0
    var instructions = 0
    var presses = body.presses.sorted { $0.at < $1.at }
    var writes = body.writes.sorted { $0.at < $1.at }

    while elapsed < body.seconds {
      // A parked script spins on a jump to itself and spends its whole budget on it every
      // step, so a scenario that outlives its script would otherwise record millions of
      // identical instructions. Stopping is announced rather than silent — see
      // ``TraceScenario/Benson/maxInstructions``.
      if instructions >= body.maxInstructions {
        try trace.record(
          .object([
            "step": .int(stepIndex), "elapsed": .double(elapsed),
            "stopped": .object([
              "reason": .string("instructionLimit"),
              "limit": .int(body.maxInstructions),
              "instructions": .int(instructions),
              "secondsRequested": .double(body.seconds),
              "stillRunning": .bool(session.isRunning),
            ]),
          ]))
        return trace
      }
      // Inputs first, and recorded as their own records, so a replay applies them at the
      // same step rather than inferring them from a state change.
      while let next = presses.first, next.at <= elapsed {
        presses.removeFirst()
        let key = try next.key.map { name -> BensonKey in
          guard let key = BensonKey(rawValue: name) ?? BensonKey(rawValue: "key" + name.uppercased())
          else { throw TraceRun.Failure.unknownKey(name) }
          return key
        }
        session.press(key)
        try trace.record(
          .object([
            "step": .int(stepIndex), "elapsed": .double(elapsed),
            "input": .object(["press": key.map { .string($0.rawValue) } ?? .string("any")]),
          ]))
      }
      while let next = writes.first, next.at <= elapsed {
        writes.removeFirst()
        session.hostState = apply(next, to: session.hostState)
        try trace.record(
          .object([
            "step": .int(stepIndex), "elapsed": .double(elapsed),
            "input": .object(["hostWrite": TraceScenarioRecords.write(next)]),
          ]))
      }

      // One record per instruction, from inside the run.
      var executed: [BensonStep] = []
      session.advance(by: step, observer: { executed.append($0) })
      instructions += executed.count
      for instruction in executed {
        try trace.record(
          .object([
            "step": .int(stepIndex),
            "elapsed": .double(elapsed),
            "pc": .int(instruction.pc),
            "instruction": TraceRecords.value(instruction.instruction),
            "blocked": .bool(instruction.blocked),
            "effects": .array(instruction.effects.map(TraceRecords.value)),
            "nextPc": instruction.stateAfter.pc.map { .int($0) } ?? .null,
          ]))
      }

      // The interpreter's state after the step, as a change. Taken once per step rather
      // than once per instruction because the message line and the tick counter move with
      // the clock rather than with the program counter, and a per-instruction reading
      // would attribute their movement to whichever instruction happened to be running.
      let now = state(of: session)
      if let changes = previous.changes(to: now) {
        try trace.record(
          .object([
            "step": .int(stepIndex), "elapsed": .double(elapsed), "changed": changes,
          ]))
        previous = now
      }

      elapsed += step
      stepIndex += 1
      if !session.isRunning { break }
    }

    try trace.record(
      .object([
        "step": .int(stepIndex), "elapsed": .double(elapsed),
        "finished": .object([
          "stillRunning": .bool(session.isRunning),
          "credits": .int(session.credits),
        ]),
      ]))
    return trace
  }

  /// Everything the interpreter is, in full.
  private static func state(of session: BensonSession) -> TraceValue {
    .object([
      "state": TraceRecords.value(session.state),
      "host": TraceRecords.value(session.host),
      "message": .string(session.messageText),
      "isMessageComplete": .bool(session.isMessageComplete),
      "isRunning": .bool(session.isRunning),
    ])
  }

  private static func apply(
    _ host: TraceScenario.Benson.Host, to state: BensonHostState
  ) throws -> BensonHostState {
    var state = state
    state.currentRoom = host.room
    state.boardedCraft = host.craft ?? BensonHostState.onFoot
    state.inventory = Set(host.carrying)
    for (slot, room) in host.objectRooms {
      guard let slot = Int(slot) else { continue }
      state.objectRooms[slot] = room
    }
    for (slot, flags) in host.objectFlags {
      guard let slot = Int(slot), let byte = UInt8(exactly: flags) else { continue }
      state.objectFlags[slot] = byte
    }
    return state
  }

  private static func apply(
    _ write: TraceScenario.Benson.Write, to state: BensonHostState
  ) -> BensonHostState {
    var state = state
    if let room = write.room { state.currentRoom = room }
    if let craft = write.craft { state.boardedCraft = craft }
    if let carrying = write.carrying { state.inventory = Set(carrying) }
    for (slot, room) in write.objectRooms ?? [:] {
      guard let slot = Int(slot) else { continue }
      state.objectRooms[slot] = room
    }
    for (slot, flags) in write.objectFlags ?? [:] {
      guard let slot = Int(slot), let byte = UInt8(exactly: flags) else { continue }
      state.objectFlags[slot] = byte
    }
    return state
  }
}
