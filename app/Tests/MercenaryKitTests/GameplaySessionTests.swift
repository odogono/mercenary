import XCTest

@testable import MercenaryKit

/// The session's job is that one update describes one consistent world (ADR 0018).
/// These tests are mostly about things that used to be able to disagree.
final class GameplaySessionTests: XCTestCase {
  private static let rules = Interaction(
    document: .init(
      schemaVersion: 1, takeKey: 0x16, boardKey: 0x1C, takeRange: 1, boardRange: 2,
      rangeUnit: 256, craftSlotBound: 8, inventoryLimit: 10, fixedMask: 0x10,
      heavyMask: 0x20, carriedMask: 0x80, descriptionMask: 0x0C, tooHeavyMessage: 2,
      removedFromWorld: 0xFF, counts: [:]
    )
  )

  private static let underground = Payload.UndergroundDocument(
    schemaVersion: 2,
    entrances: [.init(site: 1, cell: [8, 8], room: 3)],
    pad: .init(x: 28, z: 28, shift: 2),
    lift: .init(
      ascendRate: 38, descendRate: 6, surfaceAt: 12, submergeAt: 8, surfaceMiddle: 113,
      submergeMiddle: 8, floor: 128, altitudeWrap: 6, altitudeWrapSubtract: 7
    ),
    counts: [:]
  )

  private func object(
    _ slot: Int, at origin: SIMD3<Float> = SIMD3(1000, 0, 1000), room: Int = 0, flags: Int = 0
  ) -> ObjectPlacement {
    ObjectPlacement(
      slot: slot, id: String(format: "object-instance:%02x", slot), model: "m", origin: origin,
      vertices: [SIMD3(0, 0, 0), SIMD3(1, 0, 0)], edges: [(0, 1)], detailCube: 65536,
      drawsFarAsPoint: true, orientation: .identity, placement: "surface", withinWorld: true,
      room: room, stateFlags: flags
    )
  }

  private func scripts(_ instructions: [BensonProgram.Instruction] = [.ret]) -> BensonSession {
    BensonSession(
      program: BensonProgram(instructions: instructions, entries: [0], decimalSeeds: [8: 9000]),
      text: BensonFixture.text
    )
  }

  private func session(
    objects: [ObjectPlacement] = [],
    interaction: Interaction? = GameplaySessionTests.rules,
    underground: Payload.UndergroundDocument? = GameplaySessionTests.underground,
    scripts: BensonSession? = nil,
    player: PlayerState = PlayerState(position: SIMD3(1000, 0, 1000), heading: 0)
  ) -> GameplaySession {
    GameplaySession(
      content: .init(
        objects: objects, cellSize: 65536, interaction: interaction,
        flight: nil, underground: underground
      ),
      player: player,
      scripts: scripts
    )
  }

  // MARK: - The Host Callout is a projection

  func testTheHostSeesTheRoomTheLiftTookThePlayerTo() {
    // This is the defect the session exists to make impossible: the lift used to
    // set the typed room and never the byte a script reads, so a script asking
    // which room the player was in was answered against the surface throughout.
    var session = session(scripts: scripts())
    XCTAssertEqual(session.scripts?.host.currentRoom, 0)

    session.teleport(to: .room(3))

    XCTAssertEqual(session.location, Location.room(3))
    XCTAssertEqual(session.scripts?.host.currentRoom, 3, "the script has to see the same room")
    _ = session.advance(by: 1.0 / 60)
    XCTAssertEqual(session.scripts?.host.currentRoom, 3, "and keep seeing it")
  }

  func testRidingTheLiftPublishesTheRoomWithoutWaitingForAFrame() {
    var session = session(scripts: scripts())
    // Without flight parameters the lift will not move anyone, which is itself the
    // rule; the point here is that arriving publishes before any frame elapses.
    session.teleport(to: .room(3))

    XCTAssertEqual(session.scripts?.host.currentRoom, 3)
  }

  func testTheHostSeesWhatThePlayerIsAboard() {
    var session = session(objects: [object(1)], scripts: scripts())
    XCTAssertEqual(session.scripts?.host.boardedCraft, BensonHostState.onFoot)

    session.board(craft: 1)

    XCTAssertEqual(session.occupancy, .aboard(1))
    XCTAssertEqual(session.scripts?.host.boardedCraft, 1)
  }

  func testAScriptWritingTheRoomMovesThePlayer() {
    // The Reference Build has one variable, so a script's write is the new value
    // and the engine reads it. No script in the payload does this, so honouring it
    // changes nothing observable — but dropping it silently would be a lie.
    var session = session(scripts: scripts([.write(.currentRoom, value: 7), .ret]))
    session.start(script: 0)

    _ = session.advance(by: 1.0 / 60)

    XCTAssertEqual(session.location, Location.room(7))
    XCTAssertEqual(session.game.room, 7)
  }

  func testAScriptWritingAnObjectsRoomMovesTheObject() {
    // The one host write the payload's scripts actually make.
    var session = session(
      objects: [object(46)],
      scripts: scripts([.write(.objectRoom(slot: 46), value: 1), .ret])
    )
    session.start(script: 0)

    _ = session.advance(by: 1.0 / 60)

    XCTAssertEqual(session.residence(of: 46), Residence.room(1))
  }

  // MARK: - Residence is one fact

  func testCarryingSomethingIsOneFactProjectedThreeWays() {
    // Carried used to be stored twice — an inventory set and a flag bit — and the
    // two could disagree. They are projections of one value now.
    var session = session(objects: [object(5)], scripts: scripts())

    let (outcome, _) = session.reach(for: .take)

    XCTAssertEqual(outcome, .took(slot: 5))
    XCTAssertEqual(session.residence(of: 5), .carried)
    let host = try? XCTUnwrap(session.scripts?.host)
    XCTAssertEqual(host?.inventory, [5])
    XCTAssertEqual(host?.objectRooms[5], BensonHostState.outOfTheWorld)
    XCTAssertEqual((host?.objectFlags[5] ?? 0) & 0x80, 0x80, "the carried bit follows too")
    XCTAssertFalse(
      object(5).isDrawable(in: session.location, residence: session.residence(of: 5)),
      "and the renderer stops drawing it"
    )
  }

  func testAnObjectStartsWhereThePayloadPutIt() {
    let session = session(objects: [object(2, room: 0), object(3, room: 9)])

    XCTAssertEqual(session.residence(of: 2), .surface(at: nil))
    XCTAssertEqual(session.residence(of: 3), Residence.room(9), "a room instance belongs to its room")
    XCTAssertNil(session.residence(of: 3).displacement, "nothing has been moved yet")
  }

  func testTheSnapshotAndTheHostNeverDisagreeAboutWhatIsHidden() {
    var session = session(objects: [object(5), object(6)], scripts: scripts())
    _ = session.reach(for: .take)

    let host = session.scripts?.host
    let hiddenAccordingToHost = Set(
      (host?.objectRooms ?? [:]).compactMap { slot, room in
        room == BensonHostState.outOfTheWorld ? slot : nil
      }
    )
    let hiddenInTheSnapshot = Set(
      session.snapshot.residence.filter { $0.value.hostRoom == BensonHostState.outOfTheWorld }.keys
    )
    XCTAssertEqual(hiddenInTheSnapshot, hiddenAccordingToHost)
  }

  // MARK: - One update, everything or nothing

  func testBoardingMovesOccupancyResidenceAndTheHostInOneCall() {
    var session = session(objects: [object(1)], scripts: scripts())

    let (outcome, events) = session.reach(for: .board)

    XCTAssertEqual(outcome, .boarded(slot: 1))
    XCTAssertEqual(session.occupancy, .aboard(1))
    XCTAssertEqual(session.residence(of: 1).hostRoom, BensonHostState.outOfTheWorld)
    XCTAssertEqual(session.scripts?.host.boardedCraft, 1)
    XCTAssertEqual(events, [.tone])
  }

  func testRefusalsChangeNothingAtAll() {
    var session = session(objects: [object(1, at: SIMD3(60000, 0, 60000))], scripts: scripts())
    let before = session.snapshot

    let (outcome, events) = session.reach(for: .board)

    XCTAssertEqual(outcome, .nothingInReach)
    XCTAssertTrue(events.isEmpty, "the Reference Build refused this silently")
    XCTAssertEqual(session.snapshot, before)
  }

  func testReachingCanBeAimedAtOneObject() {
    // A bounded scenario reaches for a named object rather than whatever is nearest.
    var session = session(objects: [object(5), object(6)], scripts: scripts())

    let (outcome, _) = session.reach(for: .take, only: 6)

    XCTAssertEqual(outcome, .took(slot: 6))
    XCTAssertEqual(session.residence(of: 5), .surface(at: nil), "the other one is untouched")
  }

  func testASessionWithoutRulesRefusesRatherThanReaching() {
    var session = session(objects: [object(1)], interaction: nil, scripts: scripts())

    let (outcome, events) = session.reach(for: .board)

    XCTAssertEqual(outcome, .nothingInReach)
    XCTAssertTrue(events.isEmpty)
  }

  // MARK: - Crashing

  func testCrashingPutsThePlayerOutOfTheCraftAndLeavesItGone() {
    // This used to live in the shell, so the headless emitters never did it and a
    // trace of a crash showed the player still flying. The traces do not reach a
    // crash, so it is pinned here instead.
    var session = GameplaySession(
      content: .init(
        objects: [object(1)], cellSize: 65536, interaction: Self.rules,
        flight: FlightFixture.model(), underground: Self.underground
      ),
      player: PlayerState(position: SIMD3(10_000, 63, 10_000)),
      scripts: scripts()
    )
    session.board(craft: 1)
    session.throttle(notch: 10)

    // Climb away, then push the nose down and hold it there until the ground.
    var crashed = false
    session.intent = Intent(pitch: 1)
    for _ in 0..<600 where session.game.player.position.y < 20_000 {
      _ = session.advance(by: 1.0 / 60)
    }
    session.intent = Intent(pitch: -1)
    for _ in 0..<3000 {
      let update = session.advance(by: 1.0 / 60)
      if update.events.contains(.touchdown(.crashed)) {
        crashed = true
        break
      }
      if update.events.contains(where: { if case .touchdown = $0 { return true } else { return false } }) {
        break
      }
    }

    XCTAssertTrue(crashed, "a dive into the ground should be a crash, not a landing")
    XCTAssertEqual(session.occupancy, .onFoot, "a crash puts the player out of the craft")
    XCTAssertEqual(session.residence(of: 1), .gone, "and the craft stays out of the world with it")
  }

  // MARK: - Determinism

  func testTheSameInputsProduceTheSameSession() {
    // Determinism is the property the Trace Oracle rests on, so it is asserted
    // rather than assumed.
    func run() -> SessionSnapshot {
      var session = session(objects: [object(5)], scripts: scripts([.testRandom(value: 128, .init(branchOn: true, branch: .jump(0))), .ret]))
      session.start(script: 0)
      _ = session.reach(for: InteractionAction.take)
      for _ in 0..<120 { _ = session.advance(by: 1.0 / 60) }
      return session.snapshot
    }

    XCTAssertEqual(run(), run())
  }

  func testRandomnessIsOneStreamTheSessionOwns() {
    // The Reference Build has a single random routine and the world draws from the
    // same state the scripts do, so there is one seed here and it is the session's.
    var first = session(scripts: scripts([.testRandom(value: 128, .init(branchOn: true, branch: .jump(0))), .ret]))
    var second = session(scripts: scripts([.testRandom(value: 128, .init(branchOn: true, branch: .jump(0))), .ret]))
    first.start(script: 0)
    second.start(script: 0)

    for _ in 0..<60 {
      _ = first.advance(by: 1.0 / 60)
      _ = second.advance(by: 1.0 / 60)
    }

    XCTAssertEqual(first.scripts?.state.randomState, second.scripts?.state.randomState)
    XCTAssertNotEqual(
      first.scripts?.state.randomState, BensonState().randomState,
      "the stream has actually advanced"
    )
  }

  // MARK: - Snapshot

  func testTheSnapshotDescribesTheSessionRatherThanRepeatingIt() {
    var session = session(objects: [object(1)], scripts: scripts())
    session.teleport(to: .room(4))
    session.board(craft: 1)

    let snapshot = session.snapshot

    XCTAssertEqual(snapshot.location, Location.room(4))
    XCTAssertEqual(snapshot.occupancy, .aboard(1))
    XCTAssertEqual(snapshot.location, session.location)
    XCTAssertEqual(snapshot.occupancy, session.occupancy)
  }

  func testASessionWithoutScriptsStillDescribesItself() {
    let snapshot = session(objects: [object(1)]).snapshot

    XCTAssertEqual(snapshot.message, "")
    XCTAssertEqual(snapshot.credits, 0)
    XCTAssertFalse(snapshot.isScriptRunning)
  }

  // MARK: - Typed state

  func testLocationAndOccupancyRoundTripThroughTheirHostValues() {
    for location in [Location.surface, .room(1), .room(191)] {
      XCTAssertEqual(Location(hostValue: location.hostValue), location)
    }
    for occupancy in [Occupancy.onFoot, .aboard(0), .aboard(7)] {
      XCTAssertEqual(Occupancy(hostValue: occupancy.hostValue), occupancy)
    }
  }

  func testTheSurfaceIsNotARoomIdOfZero() {
    XCTAssertNil(Location.surface.room)
    XCTAssertEqual(Location.surface.hostValue, 0)
    XCTAssertEqual(Location(hostValue: 0), .surface)
  }

  func testResidenceProjectsToTheRoomMembershipTheHostReads() {
    XCTAssertEqual(Residence.surface(at: nil).hostRoom, Interaction.surfaceRoom)
    XCTAssertEqual(Residence.surface(at: SIMD3(1, 2, 3)).hostRoom, Interaction.surfaceRoom)
    XCTAssertEqual(Residence.room(9).hostRoom, 9)
    XCTAssertEqual(Residence.carried.hostRoom, BensonHostState.outOfTheWorld)
    XCTAssertEqual(Residence.gone.hostRoom, BensonHostState.outOfTheWorld)
  }
}
