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
    XCTAssertEqual(first.segments.count, 2)
    XCTAssertEqual(first.centre, SIMD3(500, 0, 500))
  }

  func testInkCodesBecomeInkCases() throws {
    let world = World(bundle: try bundle())
    let cell = try XCTUnwrap(world.cell(column: 0, row: 0))

    XCTAssertEqual(cell.segments.map(\.ink), [.white, .black])
  }

  func testDeferredEdgesAreCountedNotDrawn() throws {
    let world = World(bundle: try bundle())
    let sparse = try XCTUnwrap(world.cell(column: 1, row: 0))

    XCTAssertEqual(world.deferredEdges, 3)
    XCTAssertEqual(sparse.segments.count, 1)
  }

  func testMapLinesPreserveFullRunsBetweenGridCentres() throws {
    let world = World(bundle: try bundle())

    let lines = world.mapSegments(from: SIMD3(500, 320, 500))

    XCTAssertEqual(lines.count, 1)
    XCTAssertEqual(lines[0].a, SIMD3(1500, 0, 500))
    XCTAssertEqual(lines[0].b, SIMD3(3500, 0, 500))
    XCTAssertEqual(lines[0].ink, .black)
  }

  func testTheAltitudeLookupSelectsAWiderCellSquare() throws {
    let world = World(bundle: try bundle())

    XCTAssertEqual(world.roadAltitudeLookup, [0, 1])
  }

  func testMapSelectionDeduplicatesReversedRuns() throws {
    var payload = try bundle()
    payload.world.roadCells[0].segments = [
      .init(slot: 0, from: [1, 0], to: [3, 0]),
      .init(slot: 1, from: [3, 0], to: [1, 0]),
    ]
    let world = World(bundle: payload)

    XCTAssertEqual(world.mapSegments(from: SIMD3(500, 320, 500)).count, 1)
  }

  func testCurrentStructureEndpointIsSuppressedThenRestoredAboveTheFirst64KiB() throws {
    var payload = try bundle()
    payload.world.roadCells[1].segments = [.init(slot: 0, from: [1, 0], to: [3, 0])]
    let world = World(bundle: payload)
    let low = world.mapSegments(from: SIMD3(1_500, 320, 500))
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
    let selector = VisibilitySelector(cellRadius: 1)
    let structuresOnly = VisibilitySelector(cellRadius: 1, includeObjects: false, includeRoads: false)

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
    let selector = VisibilitySelector(cellRadius: 1)
    let withoutRoads = VisibilitySelector(cellRadius: 1, includeRoads: false)

    let with = selector.visible(in: world, from: SIMD3(500, 320, 500))
    let without = withoutRoads.visible(in: world, from: SIMD3(500, 320, 500))

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
    let mapOnly = VisibilitySelector(cellRadius: 1, includeObjects: false, includeRoads: true, includeStructures: false)
    let empty = VisibilitySelector(cellRadius: 1, includeObjects: false, includeRoads: false, includeStructures: false)

    let position = SIMD3<Double>(500, 320, 500)
    XCTAssertEqual(mapOnly.visible(in: world, from: position).segments.count, 1)
    XCTAssertTrue(empty.visible(in: world, from: position).segments.isEmpty)
  }

  func testCellEightEightAirstripIsStructureGeometryNotMapLines() throws {
    var payload = try bundle()
    payload.world.grid.cellsPerAxis = 16
    payload.world.roadAltitudeLookup = [0]
    payload.world.roadCells = [.init(cell: 0x88, segments: [])]
    var airstrip = payload.surface.cells[0]
    airstrip.cell = 0x88
    airstrip.grid = [8, 8]
    airstrip.structure = "surface-structure:cef6"
    airstrip.vertices = [
      [8_000, 0, 8_200], [9_000, 0, 8_200],
      [8_000, 0, 8_800], [9_000, 0, 8_800],
    ]
    // The structure table's ink split does not control the chosen Atari ST
    // presentation: every airstrip outline edge is black.
    airstrip.edges = [[0, 1, 0], [2, 3, 0]]
    payload.surface.cells = [airstrip]
    let world = World(bundle: payload)
    let position = SIMD3<Double>(8_500, 63, 8_500)

    XCTAssertTrue(world.mapSegments(from: position).isEmpty)
    let airstripSegments = try XCTUnwrap(world.cell(column: 8, row: 8)?.segments)
    XCTAssertEqual(airstripSegments.count, 2)
    XCTAssertEqual(airstripSegments.map(\.ink), [.black, .black])

    let structuresOnly = VisibilitySelector(
      cellRadius: 0, includeObjects: false, includeRoads: false, includeStructures: true
    )
    let hidden = VisibilitySelector(
      cellRadius: 0, includeObjects: false, includeRoads: true, includeStructures: false
    )
    XCTAssertEqual(structuresOnly.visible(in: world, from: position).segments.count, 2)
    XCTAssertTrue(hidden.visible(in: world, from: position).segments.isEmpty)
  }

  func testExcludingRoadsAndObjectsLeavesOnlyStructures() throws {
    let world = try world()
    let selector = VisibilitySelector(cellRadius: 1, includeObjects: false, includeRoads: false)

    let visible = selector.visible(in: world, from: SIMD3(500, 320, 500))

    // Both fixture cells are in range; only their own edges remain.
    let cellEdges = world.cells.reduce(0) { $0 + $1.segments.count }
    XCTAssertEqual(visible.segments.count, cellEdges)
    XCTAssertTrue(visible.points.isEmpty)
    XCTAssertEqual(visible.detailedObjects, 0)
  }

  func testADistantObjectBecomesAPoint() throws {
    let world = try world()
    let selector = VisibilitySelector(cellRadius: 1)

    let visible = selector.visible(in: world, from: SIMD3(500, 500_000, 500))

    XCTAssertEqual(visible.detailedObjects, 0)
    XCTAssertEqual(visible.points.count, 1)
  }

  func testAPositionOutsideTheGridStillReturnsWhatIsInRange() throws {
    let world = try world()
    let selector = VisibilitySelector(cellRadius: 1)

    let visible = selector.visible(in: world, from: SIMD3(-5_000, 320, -5_000))

    XCTAssertEqual(visible.segments.filter { $0.ink == Ink.black }.count, 0)
  }
}
