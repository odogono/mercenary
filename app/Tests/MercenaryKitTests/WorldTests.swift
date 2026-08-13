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

  func testRoadsJoinCellCentres() throws {
    let world = World(bundle: try bundle())

    XCTAssertEqual(world.roads.count, 1)
    let road = try XCTUnwrap(world.roads.first)
    XCTAssertEqual(road.a.x, 500)
    XCTAssertEqual(road.a.z, 500)
    XCTAssertEqual(road.b.x, 1500)
    XCTAssertEqual(road.b.z, 500)
  }

  func testOnlySurfaceInstancesArePlaced() throws {
    let world = World(bundle: try bundle())

    // The fixture has one surface instance (2 model edges) and one in a room.
    XCTAssertEqual(world.objects.count, 2)
  }

  func testAPlacedModelRestsOnItsInstanceHeight() throws {
    let world = World(bundle: try bundle())
    let lowest = try XCTUnwrap(world.objects.flatMap { [$0.a.y, $0.b.y] }.min())

    // The fixture model spans -100...-60 and its instance sits at y = 0, so
    // grounding must lift the base to zero rather than leave it underground.
    XCTAssertEqual(lowest, 0, accuracy: 0.001)
  }

  func testAPlacedModelKeepsItsHorizontalOffsetFromTheInstance() throws {
    let world = World(bundle: try bundle())
    let xs = world.objects.flatMap { [$0.a.x, $0.b.x] }

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

  func testGathersNearbyCellsPlusRoadsAndObjects() throws {
    let world = try world()
    let selector = VisibilitySelector(cellRadius: 1)

    let segments = selector.segments(in: world, from: SIMD3(500, 320, 500))

    // 2 + 1 cell segments, 1 road, 2 object segments.
    XCTAssertEqual(segments.count, 6)
  }

  func testExcludingRoadsAndObjectsLeavesOnlyStructures() throws {
    let world = try world()
    let selector = VisibilitySelector(cellRadius: 1, includeObjects: false, includeRoads: false)

    let segments = selector.segments(in: world, from: SIMD3(500, 320, 500))

    XCTAssertEqual(segments.count, 3)
  }

  func testAPositionOutsideTheGridStillReturnsWhatIsInRange() throws {
    let world = try world()
    let selector = VisibilitySelector(cellRadius: 1)

    let segments = selector.segments(in: world, from: SIMD3(-5_000, 320, -5_000))

    XCTAssertEqual(segments.filter { $0.ink == .black }.count, 0)
  }
}
