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
    XCTAssertEqual(world.cellsPerAxis, 2)
    XCTAssertEqual(world.cellSize, 1000)
    XCTAssertEqual(world.groundExtent, 2000)
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

  func testRoadsJoinCellCentresAndKnowTheirCell() throws {
    let world = World(bundle: try bundle())

    XCTAssertEqual(world.roads.count, 1)
    let road = try XCTUnwrap(world.roads.first)
    XCTAssertEqual(road.segment.a.x, 500)
    XCTAssertEqual(road.segment.a.z, 500)
    XCTAssertEqual(road.segment.b.x, 1500)
    XCTAssertEqual(road.column, 0)
    XCTAssertEqual(road.row, 0)
  }

  func testTheAltitudeLookupIsCarriedEvenThoughItIsNotYetUsed() throws {
    let world = World(bundle: try bundle())

    XCTAssertEqual(world.roadAltitudeLookup, [0, 3])
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
  private func world() throws -> World {
    let directory = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("vis-\(UUID().uuidString)")
    try PayloadFixture.write(into: directory)
    defer { try? FileManager.default.removeItem(at: directory) }
    return World(bundle: try Payload.load(from: directory))
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

  func testRoadsAreDrawnAtAnyAltitude() throws {
    let world = try world()
    let selector = VisibilitySelector(cellRadius: 1)
    let withoutRoads = VisibilitySelector(cellRadius: 1, includeRoads: false)

    // A capture of the original shows a road at altitude zero from a cell that
    // owns none, so neither an altitude radius nor cell ownership can gate them.
    for altitude in [320.0, 70_000.0] {
      let with = selector.visible(in: world, from: SIMD3(1500, altitude, 500))
      let without = withoutRoads.visible(in: world, from: SIMD3(1500, altitude, 500))
      XCTAssertGreaterThan(with.segments.count, without.segments.count)
    }
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
