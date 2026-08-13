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
}
