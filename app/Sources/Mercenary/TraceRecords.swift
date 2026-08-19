import MercenaryCLI
import MercenaryKit

/// How the game's own values reach a Golden Trace.
///
/// One place, because two emitters writing the same value two ways would make a
/// TypeScript replay chase a difference in the *writers* (ADR 0019). Everything here is
/// a projection of a kit value into ``TraceValue`` and nothing computes anything.
///
/// Deliberately in the app rather than in the kit: the kit is the surface a browser
/// implementation has to reproduce, and the browser reads these files rather than
/// writing them.
enum TraceRecords {
  /// Bumped when a record's or header's shape changes in a way a replay must notice. A trace
  /// whose schema a replay does not know is refused rather than half-read.
  ///
  /// 2: a header carries only the tuning its own emitter consumes, and no settings digest, so
  /// a tuning change leaves the traces it cannot reach byte-identical.
  /// 3: an emitter that reads no payload carries no payload identity either, for the same
  /// reason — `math` observes only the platform's elementary functions, so a payload
  /// re-export must not report its trace as differing. A replay written for 2 would expect
  /// `payload` in every header, which is why this is a bump rather than a quiet addition.
  static let schemaVersion = 3
}

// MARK: - The clock

extension TraceRecords {
  /// The step index and the clock it has reached.
  ///
  /// `step` is the key: it is an integer, so a replay drives by it exactly. `elapsed` is
  /// an *assertion* — the diagnostics accumulate `elapsed += dt`, which after eighteen
  /// hundred sixtieths is not thirty, and the core consumes that accumulated value. A
  /// replay that keyed off it would diverge on the order of its additions rather than on
  /// anything the simulation did; recorded as an output, it proves the accumulation
  /// matched instead.
  static func clock(step: Int, elapsed: Double) -> [(key: String, value: TraceValue)] {
    [(key: "step", value: .int(step)), (key: "elapsed", value: .double(elapsed))]
  }
}

// MARK: - Player and intent

extension TraceRecords {
  static func value(_ intent: Intent) -> TraceValue {
    .object([
      "turn": .double(intent.turn),
      "pitch": .double(intent.pitch),
      "walk": .double(intent.walk),
      "running": .bool(intent.running),
    ])
  }

  static func value(_ player: PlayerState) -> TraceValue {
    .object([
      "position": .vector(player.position),
      "heading": .double(player.heading),
      "pitch": .double(player.pitch),
      "roll": .double(player.roll),
      "yawVelocity": .double(player.yawVelocity),
      "speed": .double(player.speed),
    ])
  }

  static func value(_ mode: FlightMode) -> TraceValue {
    .string(mode == .flying ? "flying" : "grounded")
  }

  static func value(_ touchdown: Touchdown) -> TraceValue {
    .string(touchdown == .landed ? "landed" : "crashed")
  }

  static func value(_ location: Location) -> TraceValue {
    switch location {
    case .surface: return .string("surface")
    case .room(let id): return .object(["room": .int(id)])
    }
  }

  static func value(_ occupancy: Occupancy) -> TraceValue {
    switch occupancy {
    case .onFoot: return .string("onFoot")
    case .aboard(let slot): return .object(["craft": .int(slot)])
    }
  }

  /// Where one object has got to.
  ///
  /// `surface` carries its displacement only when something moved the object, because
  /// that is the distinction ``Residence`` itself draws: nil means still where the
  /// payload put it, and flattening the two would lose which craft the player has parked
  /// somewhere else.
  static func value(_ residence: Residence) -> TraceValue {
    switch residence {
    case .surface(let at):
      guard let at else { return .string("surface") }
      return .object(["surface": .vector(at)])
    case .room(let id): return .object(["room": .int(id)])
    case .carried: return .string("carried")
    case .gone: return .string("gone")
    }
  }

  static func slots(_ residence: [Int: Residence]) -> [Int: TraceValue] {
    residence.mapValues(value)
  }

  /// The three orientation bytes, named.
  ///
  /// Written out rather than reflected. `String(describing:)` would spell this
  /// `Orientation(z: 0, x: 0, y: 32)`, whose field order is Swift's struct layout: a port
  /// cannot reproduce that string, and reordering the struct would rewrite every record
  /// that carries one.
  static func value(_ orientation: Orientation) -> TraceValue {
    .object([
      "z": .int(orientation.z), "x": .int(orientation.x), "y": .int(orientation.y),
    ])
  }

  /// What reaching for something did.
  ///
  /// Enumerated rather than reflected, for the same reason as ``value(_:)-9orientation``:
  /// a case name and its associated value are a shape, and `String(describing:)` turns
  /// them into a Swift-specific spelling nothing else can reproduce.
  static func value(_ outcome: Interaction.Outcome) -> TraceValue {
    switch outcome {
    case .took(let slot): return .object(["took": .int(slot)])
    case .boarded(let slot): return .object(["boarded": .int(slot)])
    case .nothingInReach: return .string("nothingInReach")
    case .fixedInPlace(let slot): return .object(["fixedInPlace": .int(slot)])
    case .tooHeavy(let slot): return .object(["tooHeavy": .int(slot)])
    case .handsFull: return .string("handsFull")
    case .notACraft(let slot): return .object(["notACraft": .int(slot)])
    case .alreadyAboard: return .string("alreadyAboard")
    }
  }

  static func value(_ scene: IndoorScene) -> TraceValue {
    .object([
      "background": .int(scene.background),
      "foreground": .int(scene.foreground),
      "lineColour": .int(scene.lineColour),
      "dark": .bool(scene.dark),
    ])
  }

  static func value(_ event: PresentationEvent) -> TraceValue {
    switch event {
    case .tone:
      return .string("tone")
    case .script(let effect):
      return .object(["script": value(effect)])
    case .touchdown(let touchdown):
      return .object(["touchdown": value(touchdown)])
    case .arrived(let location):
      return .object(["arrived": value(location)])
    case .wall(let sound):
      return .object(["wall": .object(["sound": .int(sound)])])
    case .worldFlipped(let flipped):
      return .object(["worldFlipped": .bool(flipped)])
    }
  }
}

// MARK: - The session's scalar state

extension TraceRecords {
  /// Everything about a snapshot that is not one of the slot-keyed collections.
  ///
  /// Written every step, because all of it moves and none of it is large. The
  /// collections are written as deltas instead; see ``TraceDelta``.
  static func scalars(_ snapshot: SessionSnapshot) -> [(key: String, value: TraceValue)] {
    [
      (key: "player", value: value(snapshot.player)),
      (key: "location", value: value(snapshot.location)),
      (key: "occupancy", value: value(snapshot.occupancy)),
      (key: "mode", value: value(snapshot.mode)),
      (key: "throttle", value: .double(snapshot.throttle)),
      (key: "throttleNotch", value: .int(snapshot.throttleNotch)),
      (key: "message", value: .string(snapshot.message)),
      (key: "credits", value: .int(snapshot.credits)),
      (key: "isScriptRunning", value: .bool(snapshot.isScriptRunning)),
      (key: "worldFlipped", value: .bool(snapshot.worldFlipped)),
      (key: "indoor", value: snapshot.indoor.map(value) ?? .null),
    ]
  }

  /// The parts of the core's own state that no snapshot carries, and that a replay of
  /// the control loop has to agree about: the interlocks a Doorway turns on, and the
  /// wall-contact latch that decides whether a wall sounds.
  static func coreState(_ state: GameState) -> TraceValue {
    .object([
      "wallContact": .int(state.wallContact),
      "wallContactLatch": .int(state.wallContactLatch),
      "transitionCooldown": .double(state.transitionCooldown),
      "stepInterlock": .double(state.stepInterlock),
      "poweramp": .bool(state.poweramp),
      "touchdown": state.touchdown.map(value) ?? .null,
    ])
  }
}

// MARK: - Geometry and projection

extension TraceRecords {
  static func value(_ ink: Ink) -> TraceValue {
    .string(ink == .white ? "white" : "black")
  }

  /// A resolved screen line.
  ///
  /// The coordinates are `Float` in the kit, widened here — which is exact, and which is
  /// why the long decimal tails are the truth rather than noise. A port carrying binary64
  /// precision to the screen will not reproduce these numbers unless it narrows at this
  /// same boundary.
  static func value(_ line: ScreenLine) -> TraceValue {
    .object([
      "x1": .float(line.x1),
      "y1": .float(line.y1),
      "x2": .float(line.x2),
      "y2": .float(line.y2),
      "ink": value(line.ink),
    ])
  }

  static func value(_ segment: Segment) -> TraceValue {
    .object(["a": .vector(segment.a), "b": .vector(segment.b), "ink": value(segment.ink)])
  }

  static func value(_ row: Inspector.Row) -> TraceValue {
    .object([
      "subject": .string(row.subject),
      "detail": .string(row.detail),
      "vertices": .int(row.vertices),
      "edges": .int(row.edges),
      "spans": .vector(row.spans),
      "note": .string(row.note),
    ])
  }
}

// MARK: - Craft parameters

extension TraceRecords {
  static func value(_ block: Payload.FlightDocument.Block) -> TraceValue {
    var members: [(key: String, value: TraceValue)] = [
      (key: "index", value: .int(block.index)),
      (key: "handler", value: .string(block.handler.rawValue)),
      (key: "mode", value: block.mode.map { .string($0) } ?? .null),
      (key: "yawDamping", value: .double(block.yawDamping)),
      (key: "yawAuthority", value: .double(block.yawAuthority)),
      (key: "pitchStep", value: .int(block.pitchStep)),
      (key: "rollCoupling", value: .double(block.rollCoupling)),
      (key: "liftFactor", value: .double(block.liftFactor)),
      (key: "speedDamping", value: .double(block.speedDamping)),
      (key: "ceiling", value: .int(block.ceiling)),
      (key: "throttleGain", value: .double(block.throttleGain)),
    ]
    if let tumble = block.tumble {
      members.append(
        (
          key: "tumble",
          value: .object([
            "altitudeDrop": .int(tumble.altitudeDrop),
            "rollStep": .int(tumble.rollStep),
            "pitchStep": .int(tumble.pitchStep),
            "yawStep": .int(tumble.yawStep),
          ])
        ))
    }
    return .object(members)
  }

  static func value(_ rules: Payload.FlightDocument.Rules) -> TraceValue {
    .object([
      "angleUnitsPerTurn": .int(rules.angleUnitsPerTurn),
      "levelPitch": .int(rules.levelPitch),
      "groundAltitude": .int(rules.groundAltitude),
      "groundBand": .int(rules.groundBand),
      "takeoffSpeed": .double(rules.takeoffSpeed),
      "crashDescentRate": .double(rules.crashDescentRate),
      "crashPitch": .int(rules.crashPitch),
      "ceilingClimbScale": .double(rules.ceilingClimbScale),
      "ceilingUnit": .int(rules.ceilingUnit),
      "throttleNotches": .array(rules.throttleNotches.map { .double($0) }),
      "throttleLimit": .double(rules.throttleLimit),
      "walkingBlock": .int(rules.walkingBlock),
      "poweramp": .object([
        "craft": .int(rules.poweramp.craft),
        "throttleScale": .double(rules.poweramp.throttleScale),
        "ceiling": .int(rules.poweramp.ceiling),
      ]),
    ])
  }

  static func value(_ walk: Payload.FlightDocument.Walk) -> TraceValue {
    .object(["step": .double(walk.step), "turnStep": .int(walk.turnStep)])
  }
}

// MARK: - The interpreter

extension TraceRecords {
  static func value(_ state: BensonState) -> TraceValue {
    .object([
      "pc": state.pc.map { .int($0) } ?? .null,
      "callStack": .array(state.callStack.map { .int($0) }),
      "registers": .array(state.registers.map { .int($0) }),
      // The random stream is state a script reads through `rand`, so a replay that let
      // it drift would take different branches for reasons nothing else records.
      "randomState": .string(String(state.randomState)),
      "resumeAfterTick": state.resumeAfterTick.map { .int($0) } ?? .null,
    ])
  }

  static func value(_ host: BensonHostState) -> TraceValue {
    .object([
      "engineFlags": .int(Int(host.engineFlags)),
      "messagePlaying": .bool(host.messagePlaying),
      "pendingKey": host.pendingKey.map { .string($0.rawValue) } ?? .null,
      "tickCounter": .int(host.tickCounter),
      "messageInterval": .int(host.messageInterval),
      "currentRoom": .int(host.currentRoom),
      "boardedCraft": .int(host.boardedCraft),
      "decimals": .array(host.decimals.map { .int($0) }),
      "objectRooms": .slots(host.objectRooms.mapValues { TraceValue.int($0) }),
      "objectFlags": .slots(host.objectFlags.mapValues { TraceValue.int(Int($0)) }),
      "inventory": .slots(host.inventory),
      "destroyedBlocks": .slots(host.destroyedBlocks),
      "canLiftAnything": .bool(host.canLiftAnything),
      "canTakeAnything": .bool(host.canTakeAnything),
      "attackingShip": .bool(host.attackingShip),
      "gameComplete": .bool(host.gameComplete),
      "shipInbound": .int(host.shipInbound),
      "signedRegister": .int(host.signedRegister),
    ])
  }

  static func value(_ effect: BensonEffect) -> TraceValue {
    switch effect {
    case .playMessage(let message):
      return .object(["playMessage": .string(message)])
    case .keyAcknowledged:
      return .string("keyAcknowledged")
    case .sound(let symbol, let value):
      return .object(["sound": .object(["symbol": .string(symbol), "value": .int(value)])])
    case .cityLocationChanged(let block):
      return .object(["cityLocationChanged": .int(block)])
    case .scriptFinished:
      return .string("scriptFinished")
    }
  }

  static func value(_ symbol: BensonSymbol) -> TraceValue {
    switch symbol {
    case .decimalByte(let decimal, let byte):
      return .object(["decimalByte": .object(["decimal": .int(decimal), "byte": .int(byte)])])
    case .objectRoom(let slot):
      return .object(["objectRoom": .int(slot)])
    case .objectFlags(let slot):
      return .object(["objectFlags": .int(slot)])
    case .engineFlags: return .string("engineFlags")
    case .currentRoom: return .string("currentRoom")
    case .boardedCraft: return .string("boardedCraft")
    case .inputKey: return .string("inputKey")
    case .signedRegister: return .string("signedRegister")
    case .messageInterval: return .string("messageInterval")
    case .attackingShip: return .string("attackingShip")
    case .gameComplete: return .string("gameComplete")
    case .shipInbound: return .string("shipInbound")
    }
  }

  static func value(_ condition: BensonProgram.Condition) -> TraceValue {
    let branch: TraceValue
    switch condition.branch {
    case .jump(let target): branch = .object(["jump": .int(target)])
    case .call(let target): branch = .object(["call": .int(target)])
    }
    return .object(["branchOn": .bool(condition.branchOn), "branch": branch])
  }

  /// An instruction, named the way the payload names it.
  ///
  /// The mnemonics are the export's own — `msg`, `wfr`, `tstk` — rather than a second
  /// vocabulary invented here, so a trace can be read beside `benson.json` and against a
  /// port that decodes the same document.
  static func value(_ instruction: BensonProgram.Instruction) -> TraceValue {
    func op(_ name: String, _ operands: KeyValuePairs<String, TraceValue> = [:]) -> TraceValue {
      .object([(key: "op", value: .string(name))] + operands.map { (key: $0.key, value: $0.value) })
    }
    func source(_ source: BensonProgram.MessageSource) -> TraceValue {
      switch source {
      case .immediate(let value): return .object(["immediate": .int(value)])
      case .register(let register): return .object(["register": .int(register)])
      }
    }

    switch instruction {
    case .message(let tokens):
      return op("msg", ["tokens": .array(tokens.map(value))])
    case .messageIndexed(let from):
      return op("msgi", ["source": source(from)])
    case .messageRandom(let base, let mask):
      return op("msgr", ["base": .int(base), "mask": .int(mask)])
    case .waitTicks(let ticks, let condition):
      return op("wfr", ["ticks": .int(ticks), "condition": value(condition)])
    case .clearTickCounter:
      return op("cfr")
    case .testKey(let key, let condition):
      return op("tstk", ["key": .string(key.rawValue), "condition": value(condition)])
    case .clearKey:
      return op("clrk")
    case .testFlags(let mask, let condition):
      return op("tstf", ["mask": .int(Int(mask)), "condition": value(condition)])
    case .setFlags(let mask):
      return op("setf", ["mask": .int(Int(mask))])
    case .clearFlags(let mask):
      return op("clrf", ["mask": .int(Int(mask))])
    case .testRoom(let condition):
      return op("room", ["condition": value(condition)])
    case .testInventory(let condition):
      return op("tsti", ["condition": value(condition)])
    case .testObjectInRoom(let condition):
      return op("inrm", ["condition": value(condition)])
    case .testObjectFlags(let mask, let condition):
      return op("tsto", ["mask": .int(Int(mask)), "condition": value(condition)])
    case .testBlockIntact(let condition):
      return op("tstb", ["condition": value(condition)])
    case .testCraft(let craft, let condition):
      return op("tstc", ["craft": .int(craft), "condition": value(condition)])
    case .testRandom(let threshold, let condition):
      return op("rand", ["value": .int(threshold), "condition": value(condition)])
    case .testSymbol(let symbol, let threshold, let condition):
      return op(
        "cmp",
        ["symbol": value(symbol), "value": .int(threshold), "condition": value(condition)])
    case .loadDecimal(let decimal, let amount):
      return op("ldr", ["decimal": .int(decimal), "value": .int(amount)])
    case .addDecimal(let decimal, let amount):
      return op("adr", ["decimal": .int(decimal), "value": .int(amount)])
    case .addDecimals(let into, let a, let b):
      return op("dadd", ["into": .int(into), "a": .int(a), "b": .int(b)])
    case .loadRegister(let register, let amount):
      return op("loadi", ["register": .int(register), "value": .int(amount)])
    case .copyRegister(let from, let to):
      return op("load", ["from": .int(from), "to": .int(to)])
    case .changeObjectFlags(let mode, let mask):
      return op("modf", ["mode": .string(mode == .and ? "and" : "or"), "mask": .int(Int(mask))])
    case .write(let symbol, let amount):
      return op("stor", ["symbol": value(symbol), "value": .int(amount)])
    case .sound(let symbol, let amount):
      return op("sound", ["symbol": .string(symbol), "value": .int(amount)])
    case .jump(let target):
      return op("jmp", ["target": .int(target)])
    case .call(let target):
      return op("call", ["target": .int(target)])
    case .ret:
      return op("ret")
    }
  }

  static func value(_ token: Payload.TextDocument.Token) -> TraceValue {
    var members: [(key: String, value: TraceValue)] = [(key: "kind", value: .string(token.kind))]
    if let word = token.word { members.append((key: "word", value: .int(word))) }
    if let text = token.text { members.append((key: "text", value: .string(text))) }
    if let slot = token.slot { members.append((key: "slot", value: .int(slot))) }
    return .object(members)
  }
}
