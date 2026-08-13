import XCTest

@testable import MercenaryKit

final class InspectorTests: XCTestCase {
  private func bundle() throws -> Payload.Bundle {
    let directory = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("inspector-\(UUID().uuidString)")
    try PayloadFixture.write(into: directory)
    defer { try? FileManager.default.removeItem(at: directory) }
    return try Payload.load(from: directory)
  }

  func testStructuresAreGroupedByStableIdentityInDeterministicOrder() throws {
    var payload = try bundle()
    payload.surface.cells[1].structure = "surface-structure:alpha"
    let inspector = Inspector(world: World(bundle: payload))

    XCTAssertEqual(inspector.structureIdentities, ["surface-structure:alpha", "surface-structure:test"])
    XCTAssertEqual(inspector.representativeCell(forStructure: "surface-structure:test")?.index, 0)
  }

  func testRepeatedStructuresProduceOneInspectorRow() throws {
    var payload = try bundle()
    payload.surface.cells[1].structure = "surface-structure:test"
    let inspector = Inspector(world: World(bundle: payload))

    XCTAssertEqual(inspector.structureRows().count, 1)
    XCTAssertTrue(inspector.structureRows()[0].note.contains("2 cells"))
  }

  func testStructureRowsReportRoadWorkspaceEdges() throws {
    var payload = try bundle()
    payload.surface.cells[0].edges.append([0, 60, 0])
    let inspector = Inspector(world: World(bundle: payload))

    XCTAssertTrue(inspector.structureRows()[0].note.contains("1 road-workspace edge"))
  }

  func testCanonicalStructureFramingUsesTheLargestConnectedComponent() throws {
    var payload = try bundle()
    payload.surface.cells[0].vertices = [
      .init(kind: .worldPoint, position: [0, 0, 0], rotationInput: nil),
      .init(kind: .worldPoint, position: [10, 0, 0], rotationInput: nil),
      .init(kind: .worldPoint, position: [10, 20, 0], rotationInput: nil),
      .init(kind: .worldPoint, position: [0, 20, 0], rotationInput: nil),
      .init(kind: .worldPoint, position: [0, 0, 10], rotationInput: nil),
      .init(kind: .worldPoint, position: [10_000, 0, 10], rotationInput: nil),
    ]
    payload.surface.cells[0].edges = [
      [0, 1, 0], [1, 2, 0], [2, 3, 0], [3, 0, 0],
      [4, 5, 1],
    ]
    payload.surface.cells[0].rotation = nil
    let inspector = Inspector(world: World(bundle: payload))

    let complete = try XCTUnwrap(inspector.bounds(for: .structure(id: "surface-structure:test")))
    let framed = try XCTUnwrap(
      inspector.framingBounds(for: .structure(id: "surface-structure:test")))
    let components = inspector.segmentComponents(
      for: .structure(id: "surface-structure:test"))

    XCTAssertEqual(complete.max.x, 10_000)
    XCTAssertEqual(framed.min, SIMD3<Float>(0, 0, 0))
    XCTAssertEqual(framed.max, SIMD3<Float>(10, 20, 0))
    XCTAssertEqual(components.map(\.count), [4, 1])
    XCTAssertTrue(inspector.structureRows()[0].note.contains("2 components"))
  }
}
