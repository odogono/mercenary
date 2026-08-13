import XCTest

@testable import MercenaryKit

/// Builds a tiny synthetic payload on disk. Nothing here is Reference Build data;
/// the shapes are what matter.
enum PayloadFixture {
  static let manifest = """
    {"schemaVersion":3,"sourceDatasetId":"world-geometry-test","sourceCoreDigest":"\(String(repeating: "a", count: 64))",
     "decoderVersion":1,"counts":{"cells":2,"models":1,"instances":2}}
    """

  static let world = """
    {"schemaVersion":3,"grid":{"cellsPerAxis":4,"cellSize":1000},
     "bounds":{"min":[0,0,0],"max":[4000,500,4000]},
     "roadAltitudeLookup":[0,1],
     "roadCells":[
       {"cell":0,"segments":[{"slot":0,"from":[1,0],"to":[3,0]}]},
       {"cell":1,"segments":[]},
       {"cell":2,"segments":[]},
       {"cell":3,"segments":[]}],
     "highAltitudeMap":[{"slot":0,"from":[0,1],"to":[3,1]}]}
    """

  static let surface = """
    {"schemaVersion":3,"cells":[
      {"cell":0,"grid":[0,0],"structure":"surface-structure:test",
       "vertices":[[0,0,0],[100,0,0],[100,200,0]],
       "edges":[[0,1,0],[1,2,1]],"deferredVertices":[],"deferredEdges":0},
      {"cell":1,"grid":[1,0],"structure":null,
       "vertices":[[1000,0,0],[1100,0,0]],
       "edges":[[0,1,0]],
       "deferredVertices":[{"vertex":2,"rotationInput":[1,2,3]}],"deferredEdges":3}],
     "rotatedStructures":[{"id":"surface-structure:test","rotatedPointDescriptor":115,
       "rotationCenter":[132,132],"rotatedPointCount":4}]}
    """

  static let objects = """
    {"schemaVersion":3,
     "models":[{"id":"object-model:test","vertices":[[-10,-100,-10],[10,-100,-10]],
                "edges":[[0,1]]}],
     "instances":[
       {"slot":0,"id":"object-instance:00","model":"object-model:test","position":[500,0,500],
        "orientation":[0,0,0],"room":0,"stateFlags":48,"rotatable":true,"placement":"surface",
        "visibility":{"detailCubePerAxis":65536,"farRepresentation":"point"}},
       {"slot":1,"id":"object-instance:01","model":"object-model:test","position":[10,0,20],
        "orientation":null,"room":7,"stateFlags":32,"rotatable":false,"placement":"room",
        "visibility":{"detailCubePerAxis":65536,"farRepresentation":"point"}}]}
    """

  static func write(
    into directory: URL,
    manifest: String = manifest,
    world: String = world,
    surface: String = surface,
    objects: String = objects,
    omitting: Set<String> = []
  ) throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    for (name, body) in [
      ("manifest.json", manifest), ("world.json", world),
      ("surface.json", surface), ("objects.json", objects),
    ] where !omitting.contains(name) {
      try body.write(to: directory.appendingPathComponent(name), atomically: true, encoding: .utf8)
    }
  }
}

final class PayloadTests: XCTestCase {
  private var directory: URL!

  override func setUpWithError() throws {
    directory = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("payload-\(UUID().uuidString)")
  }

  override func tearDownWithError() throws {
    try? FileManager.default.removeItem(at: directory)
  }

  func testLoadsACompletePayload() throws {
    try PayloadFixture.write(into: directory)

    let bundle = try Payload.load(from: directory)

    XCTAssertEqual(bundle.manifest.sourceDatasetId, "world-geometry-test")
    XCTAssertEqual(bundle.world.grid.cellsPerAxis, 4)
    XCTAssertEqual(bundle.surface.cells.count, 2)
    XCTAssertEqual(bundle.objects.models.count, 1)
    XCTAssertEqual(bundle.objects.instances.count, 2)
  }

  func testAMissingDirectoryExplainsHowToExportOne() {
    XCTAssertThrowsError(try Payload.load(from: directory)) { error in
      guard case Payload.LoadError.missingDirectory = error else {
        return XCTFail("expected missingDirectory, got \(error)")
      }
      XCTAssertTrue(String(describing: error).contains("lab payload export"))
    }
  }

  func testAMissingFileIsNamed() throws {
    try PayloadFixture.write(into: directory, omitting: ["surface.json"])

    XCTAssertThrowsError(try Payload.load(from: directory)) { error in
      XCTAssertEqual(error as? Payload.LoadError, .missingFile("surface.json"))
    }
  }

  func testAFutureSchemaIsRejectedRatherThanMisread() throws {
    try PayloadFixture.write(
      into: directory,
      world: PayloadFixture.world.replacingOccurrences(of: "\"schemaVersion\":3", with: "\"schemaVersion\":4")
    )

    XCTAssertThrowsError(try Payload.load(from: directory)) { error in
      XCTAssertEqual(error as? Payload.LoadError, .unsupportedSchema("world.json", 4))
    }
  }

  func testSchemaTwoRequiresAReexport() throws {
    try PayloadFixture.write(
      into: directory,
      manifest: PayloadFixture.manifest.replacingOccurrences(of: "\"schemaVersion\":3", with: "\"schemaVersion\":2")
    )

    XCTAssertThrowsError(try Payload.load(from: directory)) { error in
      XCTAssertEqual(error as? Payload.LoadError, .unsupportedSchema("manifest.json", 2))
    }
  }

  func testMalformedJsonIsReportedAgainstItsFile() throws {
    try PayloadFixture.write(into: directory, objects: "{ not json")

    XCTAssertThrowsError(try Payload.load(from: directory)) { error in
      guard case Payload.LoadError.unreadable(let name, _) = error else {
        return XCTFail("expected unreadable, got \(error)")
      }
      XCTAssertEqual(name, "objects.json")
    }
  }
}

final class PayloadLocatorTests: XCTestCase {
  func testAnEnvironmentOverrideWins() {
    let found = PayloadLocator.locate(
      environment: [PayloadLocator.environmentKey: "/somewhere/payload"],
      startingAt: URL(fileURLWithPath: "/unused"),
      fileExists: { $0.path == "/somewhere/payload/manifest.json" }
    )

    XCTAssertEqual(found?.path, "/somewhere/payload")
  }

  func testAnEmptyOverrideIsIgnored() {
    let found = PayloadLocator.locate(
      environment: [PayloadLocator.environmentKey: ""],
      startingAt: URL(fileURLWithPath: "/repo/app"),
      fileExists: { $0.path == "/repo/payload/manifest.json" }
    )

    XCTAssertEqual(found?.path, "/repo/payload")
  }

  func testAnOverrideWithoutAManifestFindsNothing() {
    let found = PayloadLocator.locate(
      environment: [PayloadLocator.environmentKey: "/empty"],
      startingAt: URL(fileURLWithPath: "/repo/app"),
      fileExists: { _ in false }
    )

    XCTAssertNil(found)
  }

  func testDiscoveryWalksUpFromTheWorkingDirectory() {
    let found = PayloadLocator.locate(
      environment: [:],
      startingAt: URL(fileURLWithPath: "/repo/app/.build/debug"),
      fileExists: { $0.path == "/repo/payload/manifest.json" }
    )

    XCTAssertEqual(found?.path, "/repo/payload")
  }

  func testDiscoveryStopsAtTheFilesystemRoot() {
    let found = PayloadLocator.locate(
      environment: [:],
      startingAt: URL(fileURLWithPath: "/repo/app"),
      fileExists: { _ in false }
    )

    XCTAssertNil(found)
  }
}
