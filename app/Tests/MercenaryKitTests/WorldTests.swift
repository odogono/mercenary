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
    XCTAssertEqual(rotating.segments(at: 0)[1].b, SIMD3(34_048, 512, 34_560))
  }

  func testRotatedPointsUseAReferenceBuildRateAndDeterministicElapsedTime() throws {
    let world = World(bundle: try bundle())
    let rotating = try XCTUnwrap(world.cell(column: 0, row: 0))
    let initial = rotating.segments(at: 0)[1].b
    let beforeFirstUpdate = rotating.segments(at: 0.019)[1].b
    let afterFirstUpdate = rotating.segments(at: 0.020)[1].b
    let angle = 56.0 / 1_024.0 * (2 * Double.pi)

    XCTAssertEqual(beforeFirstUpdate, initial)
    XCTAssertEqual(afterFirstUpdate.x, Float(33_792 + 256 * cos(angle) - 768 * sin(angle)), accuracy: 0.01)
    XCTAssertEqual(afterFirstUpdate.y, 512, accuracy: 0.01)
    XCTAssertEqual(afterFirstUpdate.z, Float(33_792 + 256 * sin(angle) + 768 * cos(angle)), accuracy: 0.01)
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
}
