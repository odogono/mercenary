import XCTest

@testable import MercenaryKit

final class WorldTests: XCTestCase {
  private func bundle() throws -> Payload.Bundle {
    let directory = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("world-\(UUID().uuidString)")
    try PayloadFixture.write(into: directory)
    defer { try? FileManager.default.removeItem(at: directory) }
    return try Payload.load(from: directory)
  }

  func testCellsKeepTheirGridPositionAndSegments() throws {
    let world = World(bundle: try bundle())

    XCTAssertEqual(world.cells.count, 2)
    XCTAssertEqual(world.cellsPerAxis, 4)
    XCTAssertEqual(world.cellSize, 1000)
    XCTAssertEqual(world.groundExtent, 4000)
    let first = try XCTUnwrap(world.cell(column: 0, row: 0))
    XCTAssertEqual(first.segments(at: 0).count, 2)
    XCTAssertEqual(first.centre, SIMD3(500, 0, 500))
  }

  func testRoomPalettePropagatesIntoTheWorld() throws {
    let room = try XCTUnwrap(World(bundle: try bundle()).rooms[0])

    XCTAssertEqual(room.palette.background, 6)
    XCTAssertEqual(room.palette.foreground, 14)
  }

  func testInkCodesBecomeInkCases() throws {
    let world = World(bundle: try bundle())
    let cell = try XCTUnwrap(world.cell(column: 0, row: 0))

    XCTAssertEqual(cell.segments(at: 0).map(\.ink), [.white, .black])
  }

  func testCellsRetainTheirStableStructureIdentity() throws {
    let world = World(bundle: try bundle())

    XCTAssertEqual(world.cell(column: 0, row: 0)?.structure, "surface-structure:test")
    XCTAssertNil(world.cell(column: 1, row: 0)?.structure)
  }

  func testEdgesUsingTheSharedRoadWorkspaceAreReportedNotSilentlyLost() throws {
    var payload = try bundle()
    payload.surface.cells[0].edges.append([0, 60, 0])

    let world = World(bundle: payload)
    let cell = try XCTUnwrap(world.cell(column: 0, row: 0))

    XCTAssertEqual(cell.unresolvedEdgeCount, 1)
    XCTAssertEqual(world.deferredEdges, 1)
    XCTAssertEqual(cell.segments(at: 0).count, 2)
  }

  func testEdgesTouchingRotatedPointsAreDrawn() throws {
    let world = World(bundle: try bundle())
    let rotating = try XCTUnwrap(world.cell(column: 0, row: 0))

    XCTAssertEqual(world.deferredEdges, 0)
    XCTAssertEqual(rotating.segments(at: 0).count, 2)
    // A ×64 displacement per byte, corrected from ×16 — see the note.
    XCTAssertEqual(rotating.segments(at: 0)[1].b, SIMD3(33_856, 512, 33_984))
  }

  func testRotatedPointsTurnAtTheReferenceBuildsRateAndDoNotStepBetweenFrames() throws {
    // The rate is the decoded one — a whole step of the descriptor per geometry
    // frame — but the phase runs continuously through it rather than jumping once
    // every fifth of a second, which at 60 frames a second read as a stutter.
    let world = World(bundle: try bundle())
    let rotating = try XCTUnwrap(world.cell(column: 0, row: 0))
    func point(at elapsed: Double) -> SIMD3<Float> { rotating.segments(at: elapsed)[1].b }
    func expected(afterFrames frames: Double) -> SIMD3<Float> {
      let angle = frames * 56.0 / 1_024.0 * (2 * Double.pi)
      return SIMD3(
        Float(33_792 + 64 * cos(angle) - 192 * sin(angle)),
        512,
        Float(33_792 + 64 * sin(angle) + 192 * cos(angle))
      )
    }

    // One whole frame lands exactly where the original's own step would put it.
    XCTAssertEqual(point(at: 0.2).x, expected(afterFrames: 1).x, accuracy: 0.01)
    XCTAssertEqual(point(at: 0.2).y, expected(afterFrames: 1).y, accuracy: 0.01)
    XCTAssertEqual(point(at: 0.2).z, expected(afterFrames: 1).z, accuracy: 0.01)

    // Half a frame is half way round that step, and no longer where it started.
    XCTAssertEqual(point(at: 0.1).x, expected(afterFrames: 0.5).x, accuracy: 0.01)
    XCTAssertEqual(point(at: 0.1).z, expected(afterFrames: 0.5).z, accuracy: 0.01)
    XCTAssertNotEqual(point(at: 0.1), point(at: 0))
  }

  func testMapLinesPreserveFullRunsBetweenGridCentres() throws {
    let world = World(bundle: try bundle())

    let lines = world.mapSegments(from: SIMD3(500, 2_048, 500))

    XCTAssertEqual(lines.count, 1)
    XCTAssertEqual(lines[0].a, SIMD3(1500, 0, 500))
    XCTAssertEqual(lines[0].b, SIMD3(3500, 0, 500))
    XCTAssertEqual(lines[0].ink, .black)
  }

  func testTheAltitudeLookupSelectsSurroundingRoadTableCells() throws {
    var payload = try bundle()
    payload.world.roadCells[1].segments = [.init(slot: 0, from: [2, 0], to: [3, 0])]
    let world = World(bundle: payload)

    XCTAssertEqual(world.roadAltitudeLookup, [0, 1])
    XCTAssertEqual(world.mapSegments(from: SIMD3(500, 2_048, 500)).count, 2)
  }

  func testMapSelectionDeduplicatesReversedRuns() throws {
    var payload = try bundle()
    payload.world.roadCells[0].segments = [
      .init(slot: 0, from: [1, 0], to: [3, 0]),
      .init(slot: 1, from: [3, 0], to: [1, 0]),
    ]
    let world = World(bundle: payload)

    XCTAssertEqual(world.mapSegments(from: SIMD3(500, 2_048, 500)).count, 1)
  }

  func testZeroAltitudeExtentDrawsNoRoadCells() throws {
    let world = World(bundle: try bundle())

    XCTAssertTrue(world.mapSegments(from: SIMD3(500, 2_047, 500)).isEmpty)
    XCTAssertEqual(world.mapSegments(from: SIMD3(500, 2_048, 500)).count, 1)
  }

  func testCurrentStructureEndpointIsSuppressedThenRestoredAboveTheFirst64KiB() throws {
    var payload = try bundle()
    payload.world.roadCells[1].segments = [.init(slot: 0, from: [1, 0], to: [3, 0])]
    let world = World(bundle: payload)
    let low = world.mapSegments(from: SIMD3(1_500, 2_048, 500))
    let raised = world.mapSegments(from: SIMD3(1_500, 0x01_0000, 500))

    XCTAssertTrue(low.isEmpty)
    XCTAssertEqual(raised.count, 1)
  }

  func testEveryInstanceIsPlacedButOnlySurfaceOnesAreDrawable() throws {
    let world = World(bundle: try bundle())

    // Both instances are inspectable; only the surface one is drawn.
    XCTAssertEqual(world.objects.count, 2)
    XCTAssertEqual(world.objects.filter(\.isDrawable).count, 1)
  }

  func testAPlacedModelRestsOnItsInstanceHeight() throws {
    let world = World(bundle: try bundle())
    let drawable = try XCTUnwrap(world.objects.first(where: \.isDrawable))
    let lowest = try XCTUnwrap(drawable.vertices.map(\.y).min())

    // The fixture model spans -100...-60 and its instance sits at y = 0, so
    // grounding must lift the base to zero rather than leave it underground.
    XCTAssertEqual(lowest, 0, accuracy: 0.001)
  }

  func testAPlacedModelKeepsItsHorizontalOffsetFromTheInstance() throws {
    let world = World(bundle: try bundle())
    let xs = try XCTUnwrap(world.objects.first(where: \.isDrawable)).vertices.map(\.x)

    // Instance at x = 500, model spans -10...10.
    XCTAssertEqual(xs.min(), 490)
    XCTAssertEqual(xs.max(), 510)
  }

  func testAnUnknownGridPositionResolvesToNothing() throws {
    let world = World(bundle: try bundle())

    XCTAssertNil(world.cell(column: 9, row: 9))
  }

  func testARotatedStructureDisplacementIsSixtyFourPerByte() {
    // `SETUP_STRUCTURE_POINTERS` hands the byte to `BIT24_TO_FP` as the high byte
    // of a 24-bit value and then takes ten powers of two off the exponent, so the
    // displacement is `byte << 16 >> 10`. Reading it as ×16 drew the rotating
    // pyramid at cell 8:8 as a spike four times too narrow.
    let rotation = SurfaceRotation(descriptor: 0, centre: SIMD2(0, 0))
    let point = rotation.resolve(SIMD3(1, 0, 1), elapsed: 0)

    XCTAssertEqual(point.x, 64, accuracy: 0.001)
    XCTAssertEqual(point.z, 64, accuracy: 0.001)
  }

  func testARotatedStructureHeightStaysInMiddleByteUnits() {
    // Y is stored straight into the ground-structure MSB rather than converted,
    // so it is the one axis of the three that is not a ×64 displacement.
    let rotation = SurfaceRotation(descriptor: 0, centre: SIMD2(0, 0))

    XCTAssertEqual(rotation.resolve(SIMD3(0, 1, 0), elapsed: 0).y, 256, accuracy: 0.001)
  }

  func testARotatedDisplacementIsSignedAboutItsCentre() {
    let rotation = SurfaceRotation(descriptor: 0, centre: SIMD2(10_000, 20_000))
    let negative = rotation.resolve(SIMD3(0xFF, 0, 0xFF), elapsed: 0)

    XCTAssertEqual(negative.x, 10_000 - 64, accuracy: 0.001)
    XCTAssertEqual(negative.z, 20_000 - 64, accuracy: 0.001)
  }
}

final class VisibilitySelectorTests: XCTestCase {
  private func bundle() throws -> Payload.Bundle {
    let directory = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("vis-\(UUID().uuidString)")
    try PayloadFixture.write(into: directory)
    defer { try? FileManager.default.removeItem(at: directory) }
    return try Payload.load(from: directory)
  }

  private func world() throws -> World {
    World(bundle: try bundle())
  }

  func testAnObjectInsideItsDetailCubeContributesItsWireframe() throws {
    let world = try world()
    let selector = VisibilitySelector()
    let structuresOnly = VisibilitySelector(includeObjects: false, includeRoads: false)

    // Stand next to the surface instance, well inside its detail cube.
    let position = SIMD3<Double>(500, 320, 500)
    let visible = selector.visible(in: world, from: position)
    let bare = structuresOnly.visible(in: world, from: position)

    XCTAssertEqual(visible.detailedObjects, 1)
    XCTAssertTrue(visible.points.isEmpty)
    XCTAssertGreaterThan(visible.segments.count, bare.segments.count)
  }

  func testMapLinesComeFromTheAltitudeSelectedCells() throws {
    let world = try world()
    let selector = VisibilitySelector()
    let withoutRoads = VisibilitySelector(includeRoads: false)

    let with = selector.visible(in: world, from: SIMD3(500, 2_048, 500))
    let without = withoutRoads.visible(in: world, from: SIMD3(500, 2_048, 500))

    XCTAssertEqual(with.segments.count, without.segments.count + 1)
  }

  func testHighAltitudeUsesTheFixedFallbackMap() throws {
    let world = try world()

    let lines = world.mapSegments(from: SIMD3(500, 0x20_0000, 500))

    XCTAssertEqual(lines.count, 1)
    XCTAssertEqual(lines[0].a, SIMD3(500, 0, 1500))
    XCTAssertEqual(lines[0].b, SIMD3(3500, 0, 1500))
  }

  func testStructuresCanBeHiddenWithoutHidingMapLines() throws {
    let world = try world()
    let mapOnly = VisibilitySelector(includeObjects: false, includeRoads: true, includeStructures: false)
    let empty = VisibilitySelector(includeObjects: false, includeRoads: false, includeStructures: false)

    let position = SIMD3<Double>(500, 2_048, 500)
    XCTAssertEqual(mapOnly.visible(in: world, from: position).segments.count, 1)
    XCTAssertTrue(empty.visible(in: world, from: position).segments.isEmpty)
  }

  func testCellEightEightAirstripIsStructureGeometryNotMapLines() throws {
    var payload = try bundle()
    payload.world.grid.cellsPerAxis = 16
    payload.world.grid.cellSize = 65_536
    payload.world.roadAltitudeLookup = [0]
    payload.world.roadCells = [.init(cell: 0x88, segments: [])]
    var airstrip = payload.surface.cells[0]
    airstrip.cell = 0x88
    airstrip.grid = [8, 8]
    airstrip.structure = "surface-structure:cef6"
    airstrip.vertices = [
      .init(kind: .rotatedInput, position: nil, rotationInput: [240, 8, 244]),
      .init(kind: .rotatedInput, position: nil, rotationInput: [0, 8, 24]),
      .init(kind: .rotatedInput, position: nil, rotationInput: [16, 8, 244]),
      .init(kind: .worldPoint, position: [553_984, 0, 560_896], rotationInput: nil),
      .init(kind: .worldPoint, position: [550_000, 0, 558_000], rotationInput: nil),
      .init(kind: .worldPoint, position: [568_000, 0, 558_000], rotationInput: nil),
      .init(kind: .worldPoint, position: [550_000, 0, 560_000], rotationInput: nil),
      .init(kind: .worldPoint, position: [568_000, 0, 560_000], rotationInput: nil),
      .init(kind: .worldPoint, position: [550_000, 0, 562_000], rotationInput: nil),
      .init(kind: .worldPoint, position: [568_000, 0, 562_000], rotationInput: nil),
      .init(kind: .worldPoint, position: [550_000, 0, 564_000], rotationInput: nil),
      .init(kind: .worldPoint, position: [568_000, 0, 564_000], rotationInput: nil),
    ]
    airstrip.edges = [
      [0, 1, 0], [1, 2, 0], [2, 0, 0], [0, 3, 0], [1, 3, 0], [2, 3, 0],
      [4, 5, 1], [5, 7, 1], [7, 6, 1], [6, 4, 1],
      [8, 9, 1], [9, 11, 1], [11, 10, 1], [10, 8, 1],
    ]
    airstrip.rotation = .init(descriptor: 0x32, center: [116, 143])
    payload.surface.cells = [airstrip]
    payload.objects.instances[0].position = [559_104, 0, 559_104]
    payload.objects.instances[1].position = [562_916, 0, 559_991]
    payload.objects.instances[1].placement = "surface"
    payload.objects.instances[1].room = 0
    let world = World(bundle: payload)
    let position = SIMD3<Double>(559_104, 400, 545_000)

    XCTAssertTrue(world.mapSegments(from: position).isEmpty)
    let airstripSegments = try XCTUnwrap(world.cell(column: 8, row: 8)?.segments(at: 0))
    XCTAssertEqual(airstripSegments.count, 14)
    XCTAssertEqual(airstripSegments.filter { $0.ink == .white }.count, 6)
    XCTAssertEqual(airstripSegments.filter { $0.ink == .black }.count, 8)

    let structuresOnly = VisibilitySelector(
      includeObjects: false, includeRoads: false, includeStructures: true
    )
    let hidden = VisibilitySelector(
      includeObjects: false, includeRoads: true, includeStructures: false
    )
    XCTAssertEqual(structuresOnly.visible(in: world, from: position).segments.count, 14)
    XCTAssertTrue(hidden.visible(in: world, from: position).segments.isEmpty)

    let opening = VisibilitySelector(includeRoads: false)
      .visible(in: world, from: position)
    XCTAssertEqual(opening.detailedObjects, 2)
    XCTAssertEqual(opening.segments.count, 16)
  }

  func testExcludingRoadsAndObjectsLeavesOnlyStructures() throws {
    let world = try world()
    let selector = VisibilitySelector(includeObjects: false, includeRoads: false)

    let visible = selector.visible(in: world, from: SIMD3(1_500, 320, 500))

    let neighbouringCellEdges = try XCTUnwrap(world.cell(column: 1, row: 0)).segments(at: 0).count
    XCTAssertEqual(visible.segments.count, neighbouringCellEdges)
    XCTAssertTrue(visible.points.isEmpty)
    XCTAssertEqual(visible.detailedObjects, 0)
  }

  func testMovingAcrossACellBoundaryKeepsNeighbouringStructuresVisible() throws {
    let world = try world()
    let selector = VisibilitySelector(includeObjects: false, includeRoads: false)

    let first = selector.visible(in: world, from: SIMD3(1_500, 320, 500))
    let second = selector.visible(in: world, from: SIMD3(500, 320, 500))

    XCTAssertEqual(first.segments.count, 1)
    XCTAssertEqual(second.segments, first.segments)
  }

  func testCellZeroDoesNotExpandItsSentinelStructurePointerButItsNeighbourCanRender() throws {
    let world = try world()
    let selector = VisibilitySelector(includeObjects: false, includeRoads: false)

    let visible = selector.visible(in: world, from: SIMD3(500, 320, 500))

    XCTAssertEqual(visible.segments.count, 1)
    XCTAssertEqual(visible.segments, world.cell(column: 1, row: 0)?.segments(at: 0))
  }

  func testADistantObjectBecomesAPoint() throws {
    let world = try world()
    let selector = VisibilitySelector()

    let visible = selector.visible(in: world, from: SIMD3(500, 500_000, 500))

    XCTAssertEqual(visible.detailedObjects, 0)
    XCTAssertEqual(visible.points.count, 1)
  }

  func testAPositionOutsideTheGridStillReturnsWhatIsInRange() throws {
    let world = try world()
    let selector = VisibilitySelector()

    let visible = selector.visible(in: world, from: SIMD3(-5_000, 320, -5_000))

    XCTAssertEqual(visible.segments.filter { $0.ink == Ink.black }.count, 0)
  }

  func testABoardedCraftIsNotDrawnAndReappearsAtItsLandingPositionWhenLeft() throws {
    // The payload's room byte only says where a thing started. What is out of the
    // world *now* is live state, so the renderer has to be told — otherwise the
    // craft the player is sitting in goes on being drawn beside them.
    let world = World(bundle: try bundle())
    let selector = VisibilitySelector()
    let slot = try XCTUnwrap(world.objects.first(where: \.isDrawable)).slot
    let original = SIMD3<Double>(500, 128, 500)
    let landing = SIMD3<Double>(3_500, 128, 3_500)

    let onFoot = selector.visible(in: world, from: original)
    let aboard = selector.visible(in: world, from: original, hidden: [slot])
    let afterLeaving = selector.visible(
      in: world, from: landing, moved: [slot: landing]
    )

    XCTAssertLessThan(
      aboard.segments.count + aboard.points.count,
      onFoot.segments.count + onFoot.points.count
    )
    XCTAssertEqual(
      afterLeaving.detailedObjects,
      onFoot.detailedObjects
    )
    let originalCraft = try XCTUnwrap(onFoot.segments.last)
    let movedCraft = try XCTUnwrap(afterLeaving.segments.last)
    XCTAssertGreaterThan(movedCraft.a.x, 3_000)
    XCTAssertGreaterThan(movedCraft.a.z, 3_000)
    XCTAssertEqual(movedCraft.a.y, originalCraft.a.y)
    XCTAssertEqual(movedCraft.b.y, originalCraft.b.y)
  }

  // MARK: - Underground rooms

  func testRoomsAreBuiltFromTheirOwnPointSpace() throws {
    // A room's edge indices mean nothing outside it: the Reference Build expands a
    // room's drawing commands into points before drawing, one room at a time.
    let world = World(bundle: try bundle())
    let room = try XCTUnwrap(world.rooms[0])

    XCTAssertEqual(room.id, 0)
    XCTAssertEqual(room.segments.count, 2)
    XCTAssertEqual(room.segments[0].a, SIMD3(0, 0, 0))
    XCTAssertEqual(room.segments[0].b, SIMD3(4096, 0, 0))
  }

  func testARoomCarriesItsBoundsAndItsDoorways() throws {
    let world = World(bundle: try bundle())
    let linked = try XCTUnwrap(world.rooms[0])
    let sealed = try XCTUnwrap(world.rooms[1])

    XCTAssertEqual(linked.bounds.max, SIMD3(4096, 1024, 0))
    XCTAssertEqual(linked.doorways.count, 1)
    XCTAssertEqual(linked.doorways.first?.destination, .room(88))
    XCTAssertTrue(sealed.doorways.isEmpty)
  }

  func testADoorwayCarriesItsResolvedArrivalAndLock() throws {
    // The decoder resolves both, so nothing here reads an opcode or looks the
    // destination up: a Doorway already knows where the player lands.
    let world = World(bundle: try bundle())
    let room = try XCTUnwrap(world.rooms[0])
    let doorway = try XCTUnwrap(room.doorways.first)

    XCTAssertEqual(doorway.arrival, .init(x: 2176, z: 256))
    XCTAssertEqual(doorway.arrivalCommandIndex, 1)
    XCTAssertTrue(doorway.arrivalWithinDestination)
    XCTAssertEqual(doorway.lock, .init(class: 9, requiresObject: 17))
    XCTAssertEqual(doorway.shape, doorway.lock?.class, "a door's shape is also its lock class")
  }

  func testARoomCarriesDarknessEntryAndSpecialSetup() throws {
    let world = World(bundle: try bundle())
    let lit = try XCTUnwrap(world.rooms[0])
    let dark = try XCTUnwrap(world.rooms[1])
    let special = try XCTUnwrap(world.rooms[2])

    XCTAssertFalse(lit.dark)
    XCTAssertEqual(lit.entry, .message(9))
    XCTAssertTrue(dark.dark)
    XCTAssertNil(dark.entry)
    XCTAssertEqual(special.entry, .script(23))
    XCTAssertEqual(special.specialSetup?.selector, .previousRoom)
    XCTAssertEqual(special.specialSetup?.alternates.count, 2)
    // Both alternates naming one room is what makes the world flip skippable:
    // arriving from that room matches both and the record is left alone.
    XCTAssertEqual(Set(special.specialSetup?.alternates.map(\.room) ?? []), [86])
  }

  func testADoorwayToTheSurfaceIsNotARoomLink() throws {
    let world = World(bundle: try bundle())
    let doorway = try XCTUnwrap(world.rooms[2]?.doorways.first)

    XCTAssertEqual(doorway.destination, .surface)
    XCTAssertNil(doorway.arrival, "the surface places the player from its own start position")
  }

  func testARoomsCentreIsTheMiddleOfItsOwnBounds() throws {
    // There is nowhere in the surface world for a room to sit, so its centre is
    // local — which is what the inspector frames its camera on.
    let world = World(bundle: try bundle())
    let room = try XCTUnwrap(world.rooms[0])

    XCTAssertEqual(room.centre, SIMD3(2048, 512, 0))
  }

  func testAnEdgeOutsideARoomsPointSpaceIsDroppedRatherThanCrashing() throws {
    var document = try bundle().rooms
    document.rooms[0].edges.append([0, 99])
    var replaced = try bundle()
    replaced.rooms = document

    // The export asserts this cannot happen; the app still refuses to trust it.
    XCTAssertEqual(World(bundle: replaced).rooms[0]?.segments.count, 2)
  }
}
