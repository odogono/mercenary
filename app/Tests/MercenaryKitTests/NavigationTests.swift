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
    wallThudSound: 0x14, stepInterlock: 2,
    transitionColours: [
      0, 11, 12, 15, 1, 1, 1, 15, 12, 11, 0, 2, 4, 8, 8, 8,
      8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8,
    ],
    worldFlipInputRemap: [0, 1, 2, 3, 8, 9, 10, 11, 4, 5, 6, 7, 12, 13, 14, 15]
  )

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
