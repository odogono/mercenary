import XCTest

@testable import MercenaryKit

/// Fixtures for the underground: a Room of a stated size, and the rules our own
/// image decodes. Written in code rather than read from a payload so each test says
/// what it depends on.
enum UndergroundFixture {
  static let rules = Payload.RoomsDocument.DoorwayRules(
    depthHalfWindow: 0x40, alongWallBias: 0x28, headingRounding: 2, lockBoundary: 8,
    keySlotBias: 8, skeletonKeySlot: 0x30, photonEmitterSlot: 0x10, lockedMessage: 0,
    darkMessage: 1, lineColour: 1, cooldownFrames: 0x0A, worldFlipCooldownFrames: 0x1F,
    randomRoom: 0x72, worldFlipRoom: 0x7F, nearMargin: 0x20, farMargin: 0xDF,
    wallThudSound: 0x14,
    colonyCraftArrival: .init(x: 0x0867C0, y: 0x40F880, z: 0x087000), colonyCraftSlot: 0x3F,
    stepInterlock: 2,
    transitionColours: [
      0, 11, 12, 15, 1, 1, 1, 15, 12, 11, 0, 2, 4, 8, 8, 8,
      8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
    ],
    worldFlipInputRemap: [0, 1, 2, 3, 8, 9, 10, 11, 4, 5, 6, 7, 12, 13, 14, 15]
  )

  /// A Doorway shaped like the ones the payload carries. The defaults are Room 3's
  /// first Doorway as our own export writes it: in the far X wall, six cells along,
  /// leading to Room 48.
  static func doorway(
    index: Int = 0, shape: Int = 2, plane: String = "zy", x: Int = 4096, z: Int = 1536,
    destination: Payload.RoomsDocument.Room.Doorway.Destination
      = Payload.RoomsDocument.Room.Doorway.Destination.room(48),
    arrival: Payload.RoomsDocument.Room.Doorway.Point? = .init(x: 512, z: 1664),
    lock: Payload.RoomsDocument.Room.Doorway.Lock? = nil
  ) -> Payload.RoomsDocument.Room.Doorway {
    Payload.RoomsDocument.Room.Doorway(
      index: index, shape: shape, plane: plane, position: .init(x: x, z: z),
      destination: destination, arrivalCommandIndex: 0, arrival: arrival, lock: lock
    )
  }

  /// A Room `cellsX` by `cellsZ` cells, with whatever Doorways the test needs.
  static func room(
    _ id: Int = 3, cellsX: Int = 16, cellsZ: Int = 16, dark: Bool = false,
    entry: Payload.RoomsDocument.Room.Entry? = nil,
    doorways: [Payload.RoomsDocument.Room.Doorway] = []
  ) -> Room {
    Room(
      document: Payload.RoomsDocument.Room(
        room: id,
        vertices: [[0, 0, 0], [cellsX * 256, 1024, cellsZ * 256]],
        edges: [[0, 1]],
        bounds: .init(min: [0, 0, 0], max: [cellsX * 256, 1024, cellsZ * 256]),
        palette: .init(background: 6, foreground: 14),
        dark: dark,
        entry: entry,
        specialSetup: nil,
        doorways: doorways
      )
    )
  }
}

/// A Room's walls: where they are, and the fact that touching one is what a Doorway
/// is opened by.
final class ContainmentTests: XCTestCase {
  private let rules = UndergroundFixture.rules

  private func containment(cellsX: Int = 16, cellsZ: Int = 8) -> Containment {
    Containment(room: UndergroundFixture.room(cellsX: cellsX, cellsZ: cellsZ), rules: rules)
  }

  func testARoomIsWalkableFromThirtyTwoInToThirtyThreeShortOfTheFarWall() {
    let walls = containment(cellsX: 16, cellsZ: 8)

    XCTAssertEqual(walls.near, 32)
    XCTAssertEqual(walls.farX, 16 * 256 - 33)
    XCTAssertEqual(walls.farZ, 8 * 256 - 33)
  }

  func testTheTwoAxesAreBoundedSeparatelyBecauseARoomIsNotSquare() {
    let walls = containment(cellsX: 16, cellsZ: 8)
    var position = SIMD3<Double>(3000, 0, 3000)

    XCTAssertEqual(walls.clamp(&position), 1, "only Z is past its wall")
    XCTAssertEqual(position.x, 3000)
    XCTAssertEqual(position.z, 8 * 256 - 33)
  }

  func testWalkingIntoAWallStopsAtItAndReportsContact() {
    let walls = containment()
    var position = SIMD3<Double>(-500, 0, 1000)

    XCTAssertEqual(walls.clamp(&position), 1)
    XCTAssertEqual(position.x, 32)
  }

  func testACornerIsTwoContactsAndBothAxesMove() {
    let walls = containment()
    var position = SIMD3<Double>(-500, 0, 999_999)

    XCTAssertEqual(walls.clamp(&position), 2)
    XCTAssertEqual(position.x, 32)
    XCTAssertEqual(position.z, 8 * 256 - 33)
  }

  func testStandingWellInsideTouchesNothing() {
    let walls = containment()
    var position = SIMD3<Double>(1000, 0, 1000)

    XCTAssertEqual(walls.clamp(&position), 0)
    XCTAssertEqual(position, SIMD3(1000, 0, 1000))
  }

  func testTheNearWallCanBeStoodOnAndTheFarWallCannot() {
    // Not a symmetry to tidy up. The Reference Build's near test passes at exactly
    // the margin and its far test does not, so a player pinned against the far wall
    // reports contact every frame while one against the near wall reports it only on
    // the frame they pushed. Both readings are literal.
    let walls = containment()
    var onTheNearWall = SIMD3<Double>(walls.near, 0, 1000)
    var onTheFarWall = SIMD3<Double>(walls.farX, 0, 1000)

    XCTAssertEqual(walls.clamp(&onTheNearWall), 0)
    XCTAssertEqual(walls.clamp(&onTheFarWall), 1)
    XCTAssertEqual(onTheFarWall.x, walls.farX, "and it does not creep")
  }

  func testAOneCellRoomStillHasSomewhereToStand() {
    // The far bound is written from the last whole cell, so a Room of one cell must
    // not produce a bound below the near one and trap the player between them.
    let walls = containment(cellsX: 1, cellsZ: 1)

    XCTAssertGreaterThan(walls.farX, walls.near)
    XCTAssertEqual(walls.farX, 0xDF)
  }
}

/// The predicate on its own: which positions and headings a Doorway accepts.
final class DoorwayPredicateTests: XCTestCase {
  private let predicate = DoorwayPredicate(rules: UndergroundFixture.rules)
  /// Room 3's first Doorway: the far X wall of a sixteen-cell Room, six cells along.
  private let doorway = UndergroundFixture.doorway()
  /// Facing +X, which is square-on to a `zy` wall.
  private let facingTheWall = Double.pi / 2

  private func accepts(x: Double, z: Double, heading: Double? = nil) -> Bool {
    predicate.accepts(
      doorway, at: SIMD3(x, 128, z), heading: heading ?? facingTheWall
    )
  }

  func testAcceptsThePlayerAtTheDoorwayItself() {
    XCTAssertTrue(accepts(x: 4063, z: 1664))
  }

  func testTheWindowAlongTheWallIsWhereTheDoorwayIsAndNotBeside() {
    XCTAssertFalse(accepts(x: 4063, z: 1599), "before the Doorway's own depth window")
    XCTAssertTrue(accepts(x: 4063, z: 1600), "the first position in it")
    XCTAssertTrue(accepts(x: 4063, z: 1727), "the last")
    XCTAssertFalse(accepts(x: 4063, z: 1728), "past it")
  }

  func testTheWindowIsSixtyFourEitherSideOfTheDoorwaysOwnCentre() {
    // The derived form of the two immediates, which the literal implementation is
    // deliberately not written as. A `zy` Doorway's centre along the wall is its z
    // byte plus half a cell, and the accepted run is 64 either side of it.
    let centre = Double(doorway.position.z + 128)
    XCTAssertTrue(accepts(x: 4063, z: centre - 64))
    XCTAssertTrue(accepts(x: 4063, z: centre + 63))
    XCTAssertFalse(accepts(x: 4063, z: centre - 65))
    XCTAssertFalse(accepts(x: 4063, z: centre + 64))
  }

  func testTheDepthWindowReachesBackFromTheWallButNotFarIntoTheRoom() {
    XCTAssertTrue(accepts(x: 4008, z: 1664), "far enough into the wall")
    XCTAssertFalse(accepts(x: 4007, z: 1664), "and no further out than that")
  }

  func testOnlyAHeadingSquareOnToTheWallOpensIt() {
    // Both ways along the axis count, which is not an oversight: which way the player
    // is pushing is settled by which wall they hit.
    XCTAssertTrue(accepts(x: 4063, z: 1664, heading: .pi / 2), "facing the wall")
    XCTAssertTrue(accepts(x: 4063, z: 1664, heading: 3 * .pi / 2), "and away from it")
    XCTAssertFalse(accepts(x: 4063, z: 1664, heading: 0), "along the wall")
    XCTAssertFalse(accepts(x: 4063, z: 1664, heading: .pi), "or along it the other way")
  }

  func testAHeadingIsRoundedToTheNearestQuarterTurnRatherThanTruncated() {
    let eighth = Double.pi / 4
    XCTAssertTrue(accepts(x: 4063, z: 1664, heading: eighth + 0.01), "rounds up to +X")
    XCTAssertFalse(accepts(x: 4063, z: 1664, heading: eighth - 0.01), "rounds down to +Z")
  }

  func testTheOtherPlaneWantsTheOtherPairOfHeadings() {
    let wall = UndergroundFixture.doorway(plane: "xy", x: 3072, z: 4096)
    func accepts(heading: Double) -> Bool {
      predicate.accepts(wall, at: SIMD3(3200, 128, 4063), heading: heading)
    }

    XCTAssertTrue(accepts(heading: 0))
    XCTAssertTrue(accepts(heading: .pi))
    XCTAssertFalse(accepts(heading: .pi / 2))
  }

  func testTheFirstDoorwayInRecordOrderWins() {
    // The Reference Build stops at the first command that matches, so two Doorways
    // that overlap are not ambiguous — the earlier one is the answer.
    let room = UndergroundFixture.room(
      doorways: [
        UndergroundFixture.doorway(index: 0, destination: .room(48)),
        UndergroundFixture.doorway(index: 1, destination: .room(49)),
      ]
    )

    let found = predicate.doorway(
      in: room, at: SIMD3(4063, 128, 1664), heading: facingTheWall
    )

    XCTAssertEqual(found?.index, 0)
  }

  func testNothingIsFoundStandingInTheMiddleOfARoom() {
    let room = UndergroundFixture.room(doorways: [doorway])

    XCTAssertNil(
      predicate.doorway(in: room, at: SIMD3(2000, 128, 2000), heading: facingTheWall)
    )
  }

  // MARK: - Locks

  func testAnUnlockedDoorwayOpensForAnEmptyHandedPlayer() {
    XCTAssertTrue(predicate.opens(doorway, carrying: { _ in false }))
  }

  func testALockedDoorwayWantsItsOwnKeyAndNoOther() {
    let locked = UndergroundFixture.doorway(shape: 9, lock: .init(class: 9, requiresObject: 0x11))

    XCTAssertFalse(predicate.opens(locked, carrying: { _ in false }))
    XCTAssertFalse(predicate.opens(locked, carrying: { $0 == 0x12 }))
    XCTAssertTrue(predicate.opens(locked, carrying: { $0 == 0x11 }))
  }

  func testTheSkeletonKeyOpensEveryLock() {
    let skeleton = UndergroundFixture.rules.skeletonKeySlot
    for shape in 9...15 {
      let locked = UndergroundFixture.doorway(
        shape: shape, lock: .init(class: shape, requiresObject: shape + 8)
      )
      XCTAssertTrue(predicate.opens(locked, carrying: { $0 == skeleton }), "shape \(shape)")
    }
  }
}

/// Walking underground, through the session that owns it.
final class UndergroundWalkTests: XCTestCase {
  private let flight = FlightFixture.model()

  private func session(cellsX: Int = 16, cellsZ: Int = 16) -> GameplaySession {
    var session = GameplaySession(
      content: .init(
        objects: [], cellSize: 65536, interaction: nil, flight: flight, underground: nil,
        rooms: [3: UndergroundFixture.room(cellsX: cellsX, cellsZ: cellsZ)],
        doorwayRules: UndergroundFixture.rules
      ),
      // Well inside even the smallest Room these tests use, so a test that means to
      // start away from the walls does.
      player: PlayerState(position: SIMD3(500, 0, 500), heading: 0)
    )
    session.teleport(to: .room(3))
    return session
  }

  /// Walk forward for `seconds`, in frames, and collect what happened.
  private func walk(
    _ session: inout GameplaySession, seconds: Double
  ) -> [PresentationEvent] {
    session.intent = Intent(walk: 1)
    var events: [PresentationEvent] = []
    for _ in 0..<Int(seconds * 60) {
      events.append(contentsOf: session.advance(by: 1.0 / 60).events)
    }
    return events
  }

  func testARoomsWallsStopThePlayerRatherThanTheWorlds() {
    var session = session(cellsX: 4, cellsZ: 4)
    _ = walk(&session, seconds: 20)

    // Heading zero walks along +Z, so Z is the axis that meets a wall.
    XCTAssertEqual(session.game.player.position.z, 4 * 256 - 33, accuracy: 0.001)
  }

  func testTheWallSoundsOnceHoweverLongThePlayerLeansOnIt() {
    var session = session(cellsX: 4, cellsZ: 4)

    let events = walk(&session, seconds: 20)
    let thuds = events.filter { if case .wall = $0 { return true } else { return false } }

    XCTAssertEqual(thuds, [.wall(sound: 0x14)])
  }

  func testWalkingOnTheSurfaceHasNoWallsToHit() {
    var session = session()
    session.teleport(to: .surface)

    let events = walk(&session, seconds: 5)

    XCTAssertEqual(session.game.wallContact, 0)
    XCTAssertTrue(events.allSatisfy { if case .wall = $0 { return false } else { return true } })
  }

  // MARK: - Through a Doorway

  /// A session in Room 3 with its real first Doorway, and the player already standing
  /// in the Doorway's window a little way off the wall.
  private func atADoorway(
    _ doorways: [Payload.RoomsDocument.Room.Doorway] = [UndergroundFixture.doorway()],
    heading: Double = .pi / 2,
    carrying: Set<Int> = []
  ) -> GameplaySession {
    var session = GameplaySession(
      content: .init(
        objects: carrying.map {
          ObjectPlacement(
            slot: $0, id: "object-instance:\($0)", model: "m", origin: SIMD3(0, 0, 0),
            vertices: [], edges: [], detailCube: 65536, drawsFarAsPoint: true,
            orientation: .identity, placement: "room", withinWorld: true, room: 3, stateFlags: 0
          )
        },
        cellSize: 65536, interaction: nil, flight: flight, underground: nil,
        rooms: [3: UndergroundFixture.room(doorways: doorways)],
        doorwayRules: UndergroundFixture.rules
      ),
      player: PlayerState(position: SIMD3(4040, 0, 1664), heading: heading)
    )
    session.teleport(to: .room(3))
    for slot in carrying { session.carry(slot) }
    return session
  }

  /// Walk until a Doorway is taken, and stop there. Tests about the moment of arrival
  /// need to stop at it: keep walking and the player leaves the arrival point behind,
  /// which is what walking is for.
  private func walkUntilArrival(_ session: inout GameplaySession) -> Bool {
    session.intent = Intent(walk: 1)
    for _ in 0..<600 {
      let events = session.advance(by: 1.0 / 60).events
      if events.contains(where: { if case .arrived = $0 { return true } else { return false } }) {
        return true
      }
    }
    return false
  }

  func testWalkingIntoTheWallAtADoorwayEntersTheRoomBeyond() {
    var session = atADoorway()

    let events = walk(&session, seconds: 1)

    XCTAssertEqual(session.location, Location.room(48))
    XCTAssertTrue(events.contains(.arrived(.room(48))))
  }

  func testStandingInADoorwayWithoutTouchingTheWallGoesNowhere() {
    // The gate that looks removable. The player is inside the Doorway's own window
    // and facing it; what they have not done is walk into the wall.
    var session = atADoorway()

    for _ in 0..<60 { _ = session.advance(by: 1.0 / 60) }

    XCTAssertEqual(session.location, Location.room(3))
  }

  func testFacingAlongTheWallGoesNowhereEvenPressedAgainstIt() {
    // Pinned against the far wall, which reports contact every frame, so the only
    // thing refusing this is the heading.
    var session = atADoorway(heading: 0)
    session.teleport(to: .room(3))
    _ = walk(&session, seconds: 1)

    XCTAssertEqual(session.location, Location.room(3))
  }

  func testArrivalIsWhereTheDecoderSaidAndTheAltitudeIsUntouched() {
    var session = atADoorway()
    let altitude = session.game.player.position.y

    XCTAssertTrue(walkUntilArrival(&session))

    XCTAssertEqual(session.game.player.position.x, 512)
    XCTAssertEqual(session.game.player.position.z, 1664)
    XCTAssertEqual(session.game.player.position.y, altitude, "a Doorway writes no altitude")
  }

  func testALockedDoorwayRefusesAndSaysSo() {
    var session = atADoorway([
      UndergroundFixture.doorway(shape: 9, lock: .init(class: 9, requiresObject: 0x11))
    ])

    _ = walk(&session, seconds: 1)

    XCTAssertEqual(session.location, Location.room(3), "and the wall still stops them")
  }

  func testCarryingTheKeyOpensThatSameDoorway() {
    var session = atADoorway(
      [UndergroundFixture.doorway(shape: 9, lock: .init(class: 9, requiresObject: 0x11))],
      carrying: [0x11]
    )

    _ = walk(&session, seconds: 1)

    XCTAssertEqual(session.location, Location.room(48))
  }

  func testTheSkeletonKeyOpensADoorwayWhoseOwnKeyIsElsewhere() {
    var session = atADoorway(
      [UndergroundFixture.doorway(shape: 12, lock: .init(class: 12, requiresObject: 0x14))],
      carrying: [UndergroundFixture.rules.skeletonKeySlot]
    )

    _ = walk(&session, seconds: 1)

    XCTAssertEqual(session.location, Location.room(48))
  }

  func testAnOrdinaryTransitionInstallsTheStepInterlockAndNoCooldownAtAll() {
    // The cooldown lives inside the special-setup branch, which $9108 skips outright
    // for an ordinary Room. So walking between two ordinary Rooms is held only by the
    // step interlock, and there is no pause and no flash. Asserted because it is
    // surprising: two interlocks exist, but only one of them is general.
    var session = atADoorway()
    XCTAssertTrue(walkUntilArrival(&session))

    XCTAssertEqual(session.location, Location.room(48))
    XCTAssertEqual(session.game.stepInterlock, 2)
    XCTAssertEqual(session.game.transitionCooldown, 0)
  }

  func testTheStepInterlockDoesNotRunDownWhileThePlayerStandsStill() {
    // Time cannot spend it, only walking can. That is what stops a player who
    // arrived facing a Doorway from being taken back through it by standing there.
    var session = atADoorway()
    XCTAssertTrue(walkUntilArrival(&session))
    let interlock = session.game.stepInterlock

    session.intent = .idle
    for _ in 0..<120 { _ = session.advance(by: 1.0 / 60) }

    XCTAssertEqual(session.game.stepInterlock, interlock)
    XCTAssertEqual(session.game.transitionCooldown, 0, "though the transition does expire")
  }

  func testALinkWithNoReturnDoorwayLeavesThePlayerWhereItPutThem() {
    // One-way links are real and are not repaired: Room 48 here has no Doorway back,
    // so walking into that wall does nothing at all.
    var session = atADoorway()
    _ = walk(&session, seconds: 1)
    XCTAssertEqual(session.location, Location.room(48))

    _ = walk(&session, seconds: 5)

    XCTAssertEqual(session.location, Location.room(48), "and no reverse was invented")
  }

  func testTheOneDoorwayOutOfTheUndergroundReachesTheColonyCraftsCell() {
    var session = atADoorway([UndergroundFixture.doorway(destination: .colonyCraft, arrival: nil)])

    XCTAssertTrue(walkUntilArrival(&session))

    // Out of the underground and at the craft's own cell. Not at its altitude: that
    // is the escape route, and this asserts the difference so nobody reads the
    // horizontal-only placement as an oversight.
    let arrival = UndergroundFixture.rules.colonyCraftArrival
    XCTAssertEqual(session.location, Location.surface)
    XCTAssertEqual(session.game.player.position.x, Double(arrival.x))
    XCTAssertEqual(session.game.player.position.z, Double(arrival.z))
    XCTAssertNotEqual(session.game.player.position.y, Double(arrival.y))
  }

  // MARK: - What a Room says and shows when you arrive

  /// A session whose Doorway leads into `destination`, so what that Room does on
  /// arrival can be watched.
  private func leadingInto(
    _ destination: Room, carrying: Set<Int> = [], scripts: BensonSession? = nil
  ) -> GameplaySession {
    var session = GameplaySession(
      content: .init(
        objects: [], cellSize: 65536, interaction: nil, flight: flight, underground: nil,
        rooms: [
          3: UndergroundFixture.room(doorways: [UndergroundFixture.doorway(destination: .room(48))]),
          48: destination,
        ],
        doorwayRules: UndergroundFixture.rules
      ),
      player: PlayerState(position: SIMD3(4040, 0, 1664), heading: .pi / 2),
      scripts: scripts
    )
    session.teleport(to: .room(3))
    for slot in carrying { session.carry(slot) }
    return session
  }

  func testARoomWithAnEntryMessageSaysItOnArrival() {
    var session = leadingInto(
      UndergroundFixture.room(48, entry: .message(5)),
      scripts: BensonSession(
        program: BensonProgram(instructions: [.ret], entries: [0], decimalSeeds: [:]),
        text: BensonFixture.text
      )
    )

    XCTAssertTrue(walkUntilArrival(&session))

    // The line reveals over time, so what is asserted is the message that started.
    XCTAssertEqual(session.scripts?.ticker?.text, BensonFixture.text.message(5))
  }

  func testADarkRoomIsBlackAndSaysSo() {
    var session = leadingInto(
      UndergroundFixture.room(48, dark: true),
      scripts: BensonSession(
        program: BensonProgram(instructions: [.ret], entries: [0], decimalSeeds: [:]),
        text: BensonFixture.text
      )
    )

    XCTAssertTrue(walkUntilArrival(&session))

    let indoor = try? XCTUnwrap(session.snapshot.indoor)
    XCTAssertEqual(indoor?.dark, true)
    XCTAssertEqual(indoor?.background, 0)
    XCTAssertEqual(indoor?.foreground, 0)
    XCTAssertEqual(indoor?.lineColour, 0, "the line colour goes with the other two")
    XCTAssertEqual(
      session.scripts?.ticker?.text,
      BensonFixture.text.message(UndergroundFixture.rules.darkMessage)
    )
  }

  func testCarryingThePhotonEmitterLightsADarkRoom() {
    var session = leadingInto(
      UndergroundFixture.room(48, dark: true),
      carrying: [UndergroundFixture.rules.photonEmitterSlot]
    )

    XCTAssertTrue(walkUntilArrival(&session))

    XCTAssertEqual(session.snapshot.indoor?.dark, false)
    XCTAssertEqual(session.snapshot.indoor?.foreground, 14, "the Room's own colours are back")
  }

  func testAnEmitterLyingInTheRoomLightsItJustAsWell() {
    // The Reference Build looks in both places: what is carried, and what is here.
    var session = GameplaySession(
      content: .init(
        objects: [
          ObjectPlacement(
            slot: UndergroundFixture.rules.photonEmitterSlot, id: "emitter", model: "m",
            origin: SIMD3(0, 0, 0), vertices: [], edges: [], detailCube: 65536,
            drawsFarAsPoint: true, orientation: .identity, placement: "room",
            withinWorld: true, room: 48, stateFlags: 0
          )
        ],
        cellSize: 65536, interaction: nil, flight: flight, underground: nil,
        rooms: [48: UndergroundFixture.room(48, dark: true)],
        doorwayRules: UndergroundFixture.rules
      ),
      player: PlayerState(position: SIMD3(500, 0, 500), heading: 0)
    )
    session.teleport(to: .room(48))

    XCTAssertEqual(session.snapshot.indoor?.dark, false)
  }

  func testAnEmitterInSomeOtherRoomDoesNotHelp() {
    var session = GameplaySession(
      content: .init(
        objects: [
          ObjectPlacement(
            slot: UndergroundFixture.rules.photonEmitterSlot, id: "emitter", model: "m",
            origin: SIMD3(0, 0, 0), vertices: [], edges: [], detailCube: 65536,
            drawsFarAsPoint: true, orientation: .identity, placement: "room",
            withinWorld: true, room: 3, stateFlags: 0
          )
        ],
        cellSize: 65536, interaction: nil, flight: flight, underground: nil,
        rooms: [48: UndergroundFixture.room(48, dark: true)],
        doorwayRules: UndergroundFixture.rules
      ),
      player: PlayerState(position: SIMD3(500, 0, 500), heading: 0)
    )
    session.teleport(to: .room(48))

    XCTAssertEqual(session.snapshot.indoor?.dark, true)
  }

  func testTheSurfaceHasNoIndoorSceneAtAll() {
    var session = atADoorway()
    session.teleport(to: .surface)

    XCTAssertNil(session.snapshot.indoor)
  }

  // MARK: - The Rooms that rewrite their own Doorway

  private func alternate(
    room: Int, index: Int = 0, arrival: (x: Int, z: Int) = (600, 600)
  ) -> Payload.RoomsDocument.Room.SpecialSetup.Alternate {
    .init(
      room: room, arrivalCommandIndex: index, destination: .room(room),
      arrival: .init(x: arrival.x, z: arrival.z)
    )
  }

  /// A session in which Room 48 is one of the special families, reached by walking
  /// through Room 3's Doorway. Room 48's own first Doorway is what gets rewritten.
  private func special(
    _ setup: Payload.RoomsDocument.Room.SpecialSetup, id: Int = 48, from: Int = 3
  ) -> GameplaySession {
    var session = GameplaySession(
      content: .init(
        objects: [], cellSize: 65536, interaction: nil, flight: flight, underground: nil,
        rooms: [
          from: UndergroundFixture.room(
            from, doorways: [UndergroundFixture.doorway(destination: .room(id))]
          ),
          id: Room(
            document: Payload.RoomsDocument.Room(
              room: id, vertices: [[0, 0, 0], [4096, 1024, 4096]], edges: [[0, 1]],
              bounds: .init(min: [0, 0, 0], max: [4096, 1024, 4096]),
              palette: .init(background: 6, foreground: 14), specialSetup: setup,
              doorways: [UndergroundFixture.doorway(destination: .room(99))]
            )
          ),
        ],
        doorwayRules: UndergroundFixture.rules
      ),
      player: PlayerState(position: SIMD3(4040, 0, 1664), heading: .pi / 2)
    )
    session.teleport(to: .room(from))
    return session
  }

  func testThePreviousRoomFamilyTakesTheFirstPairWhenItNamesSomewhereElse() {
    var session = special(
      .init(selector: .previousRoom, alternates: [alternate(room: 20), alternate(room: 21)])
    )

    XCTAssertTrue(walkUntilArrival(&session))

    XCTAssertEqual(session.rewired[48]?.room, 20)
  }

  func testThePreviousRoomFamilyFallsToTheSecondPairWhenTheFirstNamesWhereYouCameFrom() {
    var session = special(
      .init(selector: .previousRoom, alternates: [alternate(room: 3), alternate(room: 21)])
    )

    XCTAssertTrue(walkUntilArrival(&session))

    XCTAssertEqual(session.rewired[48]?.room, 21)
  }

  func testWhenBothPairsNameWhereYouCameFromNothingIsRewrittenAtAll() {
    // Not "keep the first" and not "keep the second": the Reference Build branches out
    // of the whole setup, so the Room's own stored Doorway stands and everything else
    // in that branch — the transition and the flip — is skipped with it.
    var session = special(
      .init(selector: .previousRoom, alternates: [alternate(room: 3), alternate(room: 3)])
    )

    XCTAssertTrue(walkUntilArrival(&session))

    XCTAssertNil(session.rewired[48])
    XCTAssertEqual(session.game.transitionCooldown, 0)
  }

  func testTheRandomRoomReachesAllEightOfItsPairs() {
    // Eight pairs, not two: the selector's AND #$0E keeps three bits. A version that
    // only ever reached the first two would pass every other test in this file.
    var session = special(
      .init(selector: .random, alternates: (10...17).map { alternate(room: $0) })
    )
    var seen: Set<Int> = []

    for _ in 0..<200 where seen.count < 8 {
      // Back to the Room next door and in again, so each visit draws from the same
      // stream where it left off rather than from a fresh session's first number.
      session.teleport(to: .room(3))
      session.place(at: SIMD3(4040, session.game.player.position.y, 1664), facing: .pi / 2)
      XCTAssertTrue(walkUntilArrival(&session))
      seen.insert(session.rewired[48]?.room ?? -1)
    }

    XCTAssertEqual(seen, Set(10...17))
  }

  func testTheRandomRoomIsReproducibleForAGivenSession() {
    var first = special(.init(selector: .random, alternates: (10...17).map { alternate(room: $0) }))
    var second = special(.init(selector: .random, alternates: (10...17).map { alternate(room: $0) }))

    XCTAssertTrue(walkUntilArrival(&first))
    XCTAssertTrue(walkUntilArrival(&second))

    XCTAssertEqual(first.rewired[48]?.room, second.rewired[48]?.room)
  }

  func testARewrittenDoorwayLeadsWhereTheRewriteSaysAndNotWhereTheRecordDid() {
    var session = special(
      .init(selector: .previousRoom, alternates: [alternate(room: 20), alternate(room: 21)])
    )
    XCTAssertTrue(walkUntilArrival(&session))
    XCTAssertEqual(session.location, Location.room(48))

    // Room 48's stored Doorway leads to 99; its rewrite leads to 20.
    session.place(at: SIMD3(4040, session.game.player.position.y, 1664), facing: .pi / 2)
    XCTAssertTrue(walkUntilArrival(&session))

    XCTAssertEqual(session.location, Location.room(20))
  }

  // MARK: - The flipped world

  func testArrivingInTheFlipRoomMirrorsTheWorld() {
    var session = special(
      .init(selector: .previousRoom, alternates: [alternate(room: 20), alternate(room: 21)]),
      id: UndergroundFixture.rules.worldFlipRoom
    )

    let flipped = walkUntilArrival(&session)

    XCTAssertTrue(flipped)
    XCTAssertTrue(session.game.worldFlipped)
    XCTAssertTrue(session.snapshot.worldFlipped)
  }

  func testTheFlipRoomInstallsItsOwnLongerTransition() {
    var session = special(
      .init(selector: .previousRoom, alternates: [alternate(room: 20), alternate(room: 21)]),
      id: UndergroundFixture.rules.worldFlipRoom
    )

    XCTAssertTrue(walkUntilArrival(&session))

    XCTAssertEqual(
      session.game.transitionCooldown, Double(UndergroundFixture.rules.worldFlipCooldownFrames)
    )
  }

  func testComingFromTheRoomBothPairsNameSkipsTheFlipEntirely() {
    // The Preserved Quirk. Room $7F's two pairs both name Room $56, so arriving from
    // $56 matches both, the setup branches out before the flip test, and the world
    // stays as it was. It is reachable and testable, not theoretical.
    var session = special(
      .init(selector: .previousRoom, alternates: [alternate(room: 86), alternate(room: 86)]),
      id: UndergroundFixture.rules.worldFlipRoom,
      from: 86
    )

    XCTAssertTrue(walkUntilArrival(&session))

    XCTAssertEqual(session.location, Location.room(UndergroundFixture.rules.worldFlipRoom))
    XCTAssertFalse(session.game.worldFlipped, "arriving from $56 does not flip")
  }

  func testAFlippedWorldTurnsTheOtherWay() {
    var session = special(
      .init(selector: .previousRoom, alternates: [alternate(room: 20), alternate(room: 21)]),
      id: UndergroundFixture.rules.worldFlipRoom
    )
    XCTAssertTrue(walkUntilArrival(&session))
    let heading = session.game.player.heading

    session.intent = Intent(turn: 1)
    for _ in 0..<30 { _ = session.advance(by: 1.0 / 60) }

    XCTAssertLessThan(
      session.game.player.heading, heading, "turning right in a mirrored world turns left"
    )
  }

  func testLeavingAWallAndReturningSoundsItAgain() {
    // A large Room, so backing away from one wall does not arrive at the other.
    var session = session()
    _ = walk(&session, seconds: 20)
    // Turn around, walk off the wall, then come back to it.
    session.intent = Intent(walk: -1)
    for _ in 0..<60 { _ = session.advance(by: 1.0 / 60) }
    XCTAssertEqual(session.game.wallContact, 0, "walked away from it")

    let events = walk(&session, seconds: 20)
    let thuds = events.filter { if case .wall = $0 { return true } else { return false } }

    XCTAssertEqual(thuds, [.wall(sound: 0x14)])
  }
}
