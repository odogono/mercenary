import Foundation

/// The one owner of a play session's mutable state (ADR 0018).
///
/// Everything that can change during play lives here: the player's pose and what
/// they are in, where every object is, the running script and its host state, and
/// the message line. A shell above this translates input into intents, calls
/// ``advance(by:)``, and draws the ``SessionSnapshot`` it gets back. It keeps no
/// game state of its own, which is what makes the interactive path and the
/// headless emitters provably the same path rather than two similar ones.
///
/// ## The Host Callout is a projection, not a copy
///
/// A Benson Script sees byte-wide engine variables — the current room, the boarded
/// craft, a room-membership table. Those used to be *stored* beside the typed state
/// that meant the same thing, and kept in step by whoever remembered to: boarding
/// updated both because ``Interaction`` happened to write both, and riding the lift
/// updated only one, so a script asking which room the player was in was answered
/// against the surface for the whole time they were underground.
///
/// They are derived here instead. ``project(into:)`` writes them from the typed
/// state on the way into the interpreter and ``reconcile(from:)`` reads any script
/// write back out on the way, so the two cannot disagree by construction. A script
/// that writes the current room moves the player, because in the Reference Build
/// there is one variable and the engine reads what the script wrote; no script in
/// the payload does, so nothing observable changes.
public struct GameplaySession: Sendable {
  /// What a session needs and never changes: the decoded rules, and the objects
  /// the world starts with. Held apart from the mutable state so a session can be
  /// built in a test without a payload on disk.
  public struct Content: Sendable {
    public var objects: [ObjectPlacement]
    public var cellSize: Double
    public var interaction: Interaction?
    public var flight: FlightModel?
    public var underground: Payload.UndergroundDocument?
    /// The Rooms, by their own identifiers. A Room is what bounds the player and
    /// carries the Doorways they can leave it through.
    public var rooms: [Int: Room]
    /// How a Doorway is taken and how a Room contains the player.
    public var doorwayRules: Payload.RoomsDocument.DoorwayRules?

    public init(
      objects: [ObjectPlacement] = [],
      cellSize: Double = 65536,
      interaction: Interaction? = nil,
      flight: FlightModel? = nil,
      underground: Payload.UndergroundDocument? = nil,
      rooms: [Int: Room] = [:],
      doorwayRules: Payload.RoomsDocument.DoorwayRules? = nil
    ) {
      self.objects = objects
      self.cellSize = cellSize
      self.interaction = interaction
      self.flight = flight
      self.underground = underground
      self.rooms = rooms
      self.doorwayRules = doorwayRules
    }

    /// Everything a session needs that comes straight out of a loaded payload.
    ///
    /// The shells built this field by field, which meant every new piece of decoded
    /// content had to be remembered in three places — and a shell that forgot one
    /// did not fail, it just quietly played a game missing that rule. `flight` stays
    /// a parameter because the tuning knobs shape it before it gets here.
    public init(world: World, bundle: Payload.Bundle, flight: FlightModel?) {
      self.init(
        objects: world.objects,
        cellSize: Double(world.cellSize),
        interaction: bundle.interaction.map(Interaction.init(document:)),
        flight: flight,
        underground: bundle.underground,
        rooms: world.rooms,
        doorwayRules: world.doorwayRules
      )
    }
  }

  public let content: Content

  /// The pose, mode, throttle, and which craft and room the player is in. This is
  /// the single store for all of those; ``location`` and ``occupancy`` are typed
  /// views over it rather than a second copy.
  public private(set) var game: GameState
  /// Where every object that has moved now is. Objects absent from this are still
  /// where the payload placed them.
  public private(set) var residence: [Int: Residence]
  /// The running script, its host state, and the message line. Present only when
  /// the payload carries scripts.
  public private(set) var scripts: BensonSession?

  /// The state flags each object starts with, which scripts and the take rules read.
  /// Immutable; the carried bit is projected from ``residence`` on top of these.
  private let baseFlags: [Int: UInt8]

  public init(content: Content, player: PlayerState, scripts: BensonSession? = nil) {
    self.content = content
    var game = GameState(player: player)
    if let flight = content.flight {
      game.player.position.y = flight.groundAltitude
    }
    self.game = game
    self.residence = [:]
    self.scripts = scripts
    self.baseFlags = Dictionary(
      content.objects.map { ($0.slot, UInt8(truncatingIfNeeded: $0.stateFlags)) },
      uniquingKeysWith: { first, _ in first }
    )
    // A session's first projection has to happen before anything reads the host,
    // or the opening script starts against a room and craft nobody set.
    if var scripts = self.scripts {
      scripts.hostState = project(into: scripts.hostState)
      self.scripts = scripts
    }
  }

  // MARK: - Typed views over the one store

  public var location: Location {
    game.room.map(Location.room) ?? .surface
  }

  public var occupancy: Occupancy {
    game.craft.map(Occupancy.aboard) ?? .onFoot
  }

  /// Where an object is now, which is its payload placement until something moves it.
  public func residence(of slot: Int) -> Residence {
    if let known = residence[slot] { return known }
    guard let object = content.objects.first(where: { $0.slot == slot }) else {
      return .surface(at: nil)
    }
    // The payload says which room an instance belongs to, and zero is the surface.
    return object.room == 0 ? .surface(at: nil) : .room(object.room)
  }

  // MARK: - The Host Callout

  /// Write the typed state into the byte-wide variables a script reads.
  private func project(into host: BensonHostState) -> BensonHostState {
    var host = host
    host.currentRoom = location.hostValue
    host.boardedCraft = occupancy.hostValue
    var rooms: [Int: Int] = [:]
    var flags: [Int: UInt8] = [:]
    var carried: Set<Int> = []
    for object in content.objects {
      let where_ = residence(of: object.slot)
      rooms[object.slot] = where_.hostRoom
      var slotFlags = baseFlags[object.slot] ?? 0
      if let interaction = content.interaction {
        if where_.isCarried {
          slotFlags |= interaction.carriedMask
        } else {
          slotFlags &= ~interaction.carriedMask
        }
      }
      flags[object.slot] = slotFlags
      if where_.isCarried { carried.insert(object.slot) }
    }
    host.objectRooms = rooms
    host.objectFlags = flags
    host.inventory = carried
    return host
  }

  /// Read back anything a script wrote to those variables.
  ///
  /// The Reference Build has one variable per fact, so a script's write is simply
  /// the new value and the engine reads it. Honouring it here keeps that true
  /// rather than silently dropping the write or trapping on it.
  private mutating func reconcile(from host: BensonHostState) {
    if host.currentRoom != location.hostValue {
      game.room = Location(hostValue: host.currentRoom).room
    }
    if host.boardedCraft != occupancy.hostValue {
      game.craft = Occupancy(hostValue: host.boardedCraft).craft
    }
    for object in content.objects {
      let slot = object.slot
      guard let written = host.objectRooms[slot] else { continue }
      let current = residence(of: slot)
      let carried = host.inventory.contains(slot)
      guard written != current.hostRoom || carried != current.isCarried else { continue }
      if carried {
        residence[slot] = .carried
      } else if written == BensonHostState.outOfTheWorld {
        residence[slot] = .gone
      } else if written == Interaction.surfaceRoom {
        // Keep any displacement: putting an object back on the surface does not
        // move it to where the payload first placed it.
        residence[slot] = .surface(at: current.displacement)
      } else {
        residence[slot] = .room(written)
      }
    }
  }

  /// Run `body` across the Host Callout, projecting in and reconciling out.
  private mutating func acrossTheCallout<T>(_ body: (inout BensonHostState) -> T) -> T? {
    guard var scripts else { return nil }
    var host = project(into: scripts.hostState)
    let result = body(&host)
    scripts.hostState = host
    self.scripts = scripts
    reconcile(from: host)
    return result
  }

  // MARK: - Semantic Actions

  /// Reach for whatever the player is standing next to.
  ///
  /// The Reference Build ran this inside its draw loop, so only objects in the
  /// scene could be reached; the candidates are the same drawable surface objects
  /// the renderer works from.
  /// `only` restricts the candidates to one slot, for a bounded scenario that
  /// means to reach for a named object rather than for whatever is nearest.
  @discardableResult
  public mutating func reach(
    for action: InteractionAction, only slot: Int? = nil
  ) -> (Interaction.Outcome, [PresentationEvent]) {
    guard let interaction, scripts != nil else { return (.nothingInReach, []) }
    let candidates = content.objects
      .filter { slot == nil || $0.slot == slot }
      .filter(\.isDrawable)
      .filter { residence(of: $0.slot).hostRoom != BensonHostState.outOfTheWorld }
      .map { object in
        Interaction.Candidate(
          slot: object.slot,
          position: residence(of: object.slot).displacement ?? SIMD3<Double>(object.origin)
        )
      }
    let position = game.player.position
    guard
      let outcome = acrossTheCallout({ host in
        interaction.attempt(action, from: position, among: candidates, host: &host)
      })
    else { return (.nothingInReach, []) }

    var events: [PresentationEvent] = []
    switch outcome {
    case .took(let slot), .boarded(let slot):
      events.append(.tone)
      if case .boarded = outcome, let craft = content.objects.first(where: { $0.slot == slot }),
        let flight = content.flight {
        let at = residence(of: slot).displacement ?? SIMD3<Double>(craft.origin)
        game = GameCore.board(
          game, craft: slot, at: SIMD3(at.x, 0, at.z),
          heading: Self.heading(of: craft), flight: flight
        )
      }
      // Both paths play the object's own description, which for some objects
      // starts a script instead — boarding the Dart is how the opening ends.
      let flags = flagsForDescription(of: slot)
      describe(interaction.description(of: slot, flags: flags))
    case .tooHeavy:
      show(message: interaction.tooHeavyMessage)
    case .nothingInReach, .fixedInPlace, .handsFull, .notACraft, .alreadyAboard:
      // The Reference Build refused these silently.
      break
    }
    return (outcome, events)
  }

  /// Step out, which the Reference Build allowed only once on the ground.
  ///
  /// The craft goes back into the world where the player left it, so it can be
  /// walked away from and boarded again.
  @discardableResult
  public mutating func leaveCraft() -> (slot: Int, events: [PresentationEvent])? {
    guard let interaction, let flight = content.flight, game.mode == .grounded else { return nil }
    let position = game.player.position
    guard let slot = acrossTheCallout({ host in interaction.leave(host: &host) }) ?? nil else {
      return nil
    }
    residence[slot] = .surface(at: position)
    game = GameCore.leave(game, flight: flight)
    return (slot, [.tone])
  }

  /// Ride the lift, in whichever direction the player is going.
  ///
  /// The Reference Build's lift is a ride whose arrival flips a flag. Its animation
  /// is outside this slice, so the decoded arrival state is set directly while
  /// still refusing anywhere there is no lift.
  @discardableResult
  public mutating func rideLift() -> [PresentationEvent]? {
    guard let flight = content.flight, let underground = content.underground else { return nil }
    switch location {
    case .room(let room):
      guard let entrance = underground.entrances.first(where: { $0.room == room }) else { return nil }
      game = GameCore.surface(
        game, entrance: entrance, lift: underground.lift,
        cellSize: content.cellSize, flight: flight
      )
    case .surface:
      let column = Int(game.player.position.x / content.cellSize)
      let row = Int(game.player.position.z / content.cellSize)
      // On foot, and standing on the lift's own pad — the Reference Build asks for
      // both before it will take anyone anywhere.
      guard occupancy == .onFoot,
        underground.pad.covers(game.player.position.x, cellSize: content.cellSize),
        underground.pad.covers(game.player.position.z, cellSize: content.cellSize),
        let entrance = underground.entrance(column: column, row: row)
      else { return nil }
      game = GameCore.enter(game, entrance: entrance, lift: underground.lift, flight: flight)
    }
    // The lift calls the same Room setup a Doorway does ($A2E0 and $857E both reach
    // $90BE), so arriving by lift greets the player and applies darkness too.
    settleIntoTheRoom()
    return [.tone, .arrived(location)]
  }

  // MARK: - Walking through a Doorway

  /// Everything the walking path does once the player has moved, in the Reference
  /// Build's own order (`$8570`).
  ///
  /// The order is the behaviour, so it is worth reading as a list:
  ///
  /// 1. containment must have clamped an axis — no wall contact, no Doorway;
  /// 2. the step interlock must have run down;
  /// 3. the transition cooldown must have expired;
  /// 4. the first Doorway in record order the player stands in and faces wins;
  /// 5. its lock must open, or the refusal is a message and nothing else;
  /// 6. only then does anyone go anywhere.
  ///
  /// Steps 1 and 2 are the ones that look removable and are not. Without 1 a player
  /// standing in a Doorway is moved by merely turning around; without 2 they are
  /// handed straight back through the Doorway they arrived in, because arrival puts
  /// them inside it.
  private mutating func traverse() -> [PresentationEvent] {
    guard case .room(let id) = location, let room = content.rooms[id],
      let rules = content.doorwayRules,
      game.wallContact != 0,
      game.stepInterlock <= 0,
      game.transitionCooldown <= 0
    else { return [] }
    let predicate = DoorwayPredicate(rules: rules)
    guard
      let doorway = predicate.doorway(
        in: room, at: game.player.position, heading: game.player.heading
      )
    else { return [] }
    guard predicate.opens(doorway, carrying: { residence(of: $0).isCarried }) else {
      // A locked Doorway is a message and a wall. The player is already stopped by
      // containment, so refusing takes no further doing.
      show(message: rules.lockedMessage)
      return []
    }
    return take(doorway, rules: rules)
  }

  /// Go through a Doorway that has already been accepted.
  private mutating func take(
    _ doorway: Payload.RoomsDocument.Room.Doorway, rules: Payload.RoomsDocument.DoorwayRules
  ) -> [PresentationEvent] {
    switch doorway.destination {
    case .room(let destination):
      game.room = destination
      // The decoder resolved where in the destination the player lands, so there is
      // no cross-Room index to chase here. Altitude is deliberately untouched: the
      // Reference Build writes only the two horizontal coordinates.
      if let arrival = doorway.arrival {
        game.player.position.x = Double(arrival.x)
        game.player.position.z = Double(arrival.z)
      }
    case .surface:
      // The one Doorway that leaves the underground, at the fixed position the
      // Reference Build copies over the player's own. Its altitude is not adopted —
      // see ``Payload/RoomsDocument/DoorwayRules/surfaceExit``.
      game.room = nil
      game.player.position.x = Double(rules.surfaceExit.x)
      game.player.position.z = Double(rules.surfaceExit.z)
    }
    game.transitionCooldown = Double(rules.cooldownFrames)
    game.stepInterlock = Double(rules.stepInterlock)
    settleIntoTheRoom()
    return [.arrived(location)]
  }

  /// Everything Room setup does once the player is in the new Location.
  ///
  /// Shared by every way of arriving — a Doorway, the lift, or a debug placement —
  /// because in the Reference Build they all call the same routine, and a Room that
  /// only greeted people who came through a Doorway would be a difference we invented.
  private mutating func settleIntoTheRoom() {
    // A Room change is a change in what a script sees, so it has to reach the Host
    // Callout before anything reads it.
    republishHostState()
    // Room setup runs containment itself, before anything is drawn ($9226). It has to:
    // several arrivals land exactly on a wall, or a little outside one, and without
    // this the player would be drawn there for a frame before being pulled back. The
    // contact it reports is kept rather than cleared, which is what stops the wall
    // sounding a second time for a bump the player did not make.
    game.wallContactLatch = game.wallContact
    game.wallContact = containment.map { $0.clamp(&game.player.position) } ?? 0
    if case .room(let id) = location, let room = content.rooms[id], let rules = content.doorwayRules {
      react(arrivingIn: room, rules: rules)
    }
  }

  /// Put the player somewhere directly, without a lift to take them there.
  ///
  /// For bounded debug scenarios only, which the underground work needs to reach
  /// the rare states — one-way, locked, dark, random and flipped — that a normal
  /// playthrough may not visit.
  public mutating func teleport(to location: Location) {
    game.room = location.room
    // A debug placement stands in for arriving, so it arrives: the Room greets the
    // player and darkness applies. Otherwise a scenario that starts in a dark Room
    // would start in a lit one.
    settleIntoTheRoom()
  }

  // MARK: - What a Room looks like, and what it says when you arrive

  /// The Room as it looks right now, or nil on the surface.
  public var indoorScene: IndoorScene? {
    guard case .room(let id) = location, let room = content.rooms[id],
      let rules = content.doorwayRules
    else { return nil }
    return IndoorScene(room: room, rules: rules, emitter: residence(of: rules.photonEmitterSlot))
  }

  /// Whether a Room the payload marks dark is dark for this player.
  func isDark(_ room: Room) -> Bool {
    guard let rules = content.doorwayRules else { return false }
    return IndoorScene(
      room: room, rules: rules, emitter: residence(of: rules.photonEmitterSlot)
    ).dark
  }

  /// What a Room says when the player arrives in it.
  ///
  /// The order is the Reference Build's and it decides one case that is otherwise
  /// arbitrary: darkness queues its message first, and then the header's own reaction
  /// runs. So a Room that is both dark and carries an entry *message* shows the entry
  /// message — it overwrote the pending one — while a dark Room with an entry *script*
  /// still says it is dark, because starting a script does not touch that byte.
  private mutating func react(arrivingIn room: Room, rules: Payload.RoomsDocument.DoorwayRules) {
    var pending: Int? = isDark(room) ? rules.darkMessage : nil
    switch room.entry {
    case .script(let id):
      // A script that is already running is not restarted, as the Reference Build's
      // own starter refuses.
      start(script: id)
    case .message(let index):
      pending = index
    case nil:
      break
    }
    if let pending { show(message: pending) }
  }

  /// Stand the player somewhere in the Location they are already in, and optionally
  /// turn them.
  ///
  /// For bounded debug scenarios only, alongside ``teleport(to:)``. It deliberately
  /// does not clear the interlocks: a scenario that wants to start mid-transition can
  /// say so, and one that does not is starting from rest anyway.
  public mutating func place(at position: SIMD3<Double>, facing heading: Double? = nil) {
    game.player.position = position
    if let heading { game.player.heading = heading }
  }

  /// Put an object in the player's hands without their having reached for it.
  ///
  /// For bounded debug scenarios only, alongside ``teleport(to:)``: the locked, dark
  /// and flipped states all turn on what is being carried, and reaching for each key
  /// where it lies is a playthrough rather than a scenario.
  public mutating func carry(_ slot: Int) {
    residence[slot] = .carried
    republishHostState()
  }

  /// Put the player aboard without reaching for anything.
  ///
  /// For bounded debug scenarios only — the interactive path always goes through
  /// ``reach(for:only:)``, which is what applies the rules about what can be
  /// boarded and from how far away.
  public mutating func board(craft slot: Int) {
    // A craft being flown is out of the world, the same as one reached for: it must
    // stop being drawn where it was parked.
    residence[slot] = .gone
    guard let flight = content.flight else {
      game.craft = slot
      republishHostState()
      return
    }
    // The same transition reaching for a craft makes, so a scenario that boards by
    // fiat still gets the craft's own ground altitude and parameter block.
    game = GameCore.board(
      game, craft: slot, at: game.player.position, heading: game.player.heading, flight: flight
    )
    republishHostState()
  }

  public mutating func throttle(notch: Int) {
    guard let flight = content.flight, occupancy != .onFoot else { return }
    game = GameCore.throttle(game, notch: notch, rules: flight.rules)
  }

  public mutating func throttle(step: Int) {
    guard let flight = content.flight, occupancy != .onFoot else { return }
    game = GameCore.throttle(game, step: step, rules: flight.rules)
  }

  /// Fit or remove the poweramp, which the Reference Build reads for one craft.
  public mutating func fitPoweramp(_ fitted: Bool) {
    game.poweramp = fitted
  }

  public mutating func shutThrottle() {
    guard occupancy != .onFoot else { return }
    game.throttle = 0
  }

  // MARK: - Scripts and the message line

  /// Tell the scripts the player pressed something.
  public mutating func press(_ key: BensonKey?) {
    scripts?.press(key)
  }

  public mutating func skipMessage() {
    scripts?.skipMessage()
  }

  @discardableResult
  public mutating func start(script: Int) -> Bool {
    guard var scripts else { return false }
    let started = scripts.start(script: script)
    self.scripts = scripts
    return started
  }

  public mutating func show(message index: Int) {
    guard var scripts else { return }
    scripts.show(message: index)
    self.scripts = scripts
  }

  public mutating func describe(_ description: Interaction.Description) {
    guard var scripts else { return }
    scripts.describe(description)
    self.scripts = scripts
  }

  /// Advance the whole session by `seconds` of real time, and say what happened.
  ///
  /// One call produces one consistent update: the pose and Location move, the
  /// script runs against a Host Callout projected from them, anything it wrote
  /// comes back, and the snapshot describes the result.
  @discardableResult
  public mutating func advance(by seconds: Double) -> (snapshot: SessionSnapshot, events: [PresentationEvent]) {
    var events: [PresentationEvent] = []
    if let flight = content.flight, seconds > 0 {
      game = GameCore.step(
        game, intent: intent, dt: seconds, flight: flight, containment: containment
      )
      if game.wallThud, let rules = content.doorwayRules {
        events.append(.wall(sound: rules.wallThudSound))
      }
      events.append(contentsOf: traverse())
      if let touchdown = game.touchdown {
        events.append(.tone)
        events.append(.touchdown(touchdown))
        // A crash puts the player out of the craft, as the Reference Build's own
        // crash path did. The craft stays out of the world with it.
        if touchdown == .crashed {
          game = GameCore.leave(game, flight: flight)
        }
      }
    }
    if var scripts, seconds > 0 {
      scripts.hostState = project(into: scripts.hostState)
      let effects = scripts.advance(by: seconds)
      let host = scripts.hostState
      self.scripts = scripts
      reconcile(from: host)
      events.append(contentsOf: effects.map(PresentationEvent.script))
    }
    return (snapshot, events)
  }

  /// The intent the session is currently acting on, set by the shell each frame.
  public var intent: Intent = .idle

  // MARK: - What a renderer sees

  public var snapshot: SessionSnapshot {
    SessionSnapshot(
      player: game.player,
      location: location,
      occupancy: occupancy,
      mode: game.mode,
      throttle: game.throttle,
      throttleNotch: throttleNotch,
      elapsed: game.elapsed,
      message: scripts?.messageText ?? "",
      credits: scripts?.credits ?? 0,
      isScriptRunning: scripts?.isRunning ?? false,
      hiddenSlots: hiddenSlots,
      displacedObjects: displacedObjects,
      indoor: indoorScene
    )
  }

  /// Object slots the game has taken out of the world, which the renderer needs so
  /// a boarded craft stops being drawn and reappears when it is left.
  public var hiddenSlots: Set<Int> {
    Set(
      content.objects.map(\.slot).filter {
        residence(of: $0).hostRoom == BensonHostState.outOfTheWorld
      }
    )
  }

  public var displacedObjects: [Int: SIMD3<Double>] {
    residence.compactMapValues(\.displacement)
  }

  /// The throttle as a notch on the decoded ladder, or 0 when it is shut.
  public var throttleNotch: Int {
    guard let flight = content.flight else { return 0 }
    guard
      let index = flight.rules.throttleNotches.firstIndex(where: { abs($0 - game.throttle) < 0.5 })
    else { return 0 }
    return index + 1
  }

  // MARK: - Internals

  private var interaction: Interaction? { content.interaction }

  /// The walls of the Room the player is in, when they are in one. Nil on the
  /// surface, and nil for a Room the payload does not carry, which leaves walking
  /// bounded by the world rather than by nothing.
  var containment: Containment? {
    guard case .room(let id) = location, let room = content.rooms[id],
      let rules = content.doorwayRules
    else { return nil }
    return Containment(room: room, rules: rules)
  }

  /// Push the typed state through to the host without running anything, for the
  /// transitions that change what a script would see outside an interpreter step.
  private mutating func republishHostState() {
    guard var scripts else { return }
    scripts.hostState = project(into: scripts.hostState)
    self.scripts = scripts
  }

  /// The flags an object's description is chosen by, which the carried bit is part of.
  private func flagsForDescription(of slot: Int) -> UInt8 {
    var flags = baseFlags[slot] ?? 0
    if let interaction, residence(of: slot).isCarried {
      flags |= interaction.carriedMask
    }
    return flags
  }

  /// A craft's heading, from the orientation bytes the payload carries for it.
  ///
  /// Those bytes count 256 to a turn, which is the object tables' own unit and not
  /// the 1024 the control loop's angles use. The half turn is the models' own
  /// facing: a craft's nose points along decreasing Z when its orientation byte is
  /// zero, while a heading of zero looks along increasing Z, so boarding one
  /// without this put the player in it back to front.
  static func heading(of craft: ObjectPlacement) -> Double {
    let turn = Double(craft.orientation.y & 0xFF) / 256 * 2 * .pi
    return (turn + .pi).truncatingRemainder(dividingBy: 2 * .pi)
  }
}
