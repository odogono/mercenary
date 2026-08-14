import XCTest

@testable import MercenaryKit

/// Builds a tiny synthetic payload on disk. Nothing here is Reference Build data;
/// the shapes are what matter.
enum PayloadFixture {
  static let manifest = """
    {"schemaVersion":4,"sourceDatasetId":"world-geometry-test","sourceCoreDigest":"\(String(repeating: "a", count: 64))",
     "decoderVersion":3,"counts":{"cells":2,"models":1,"instances":2}}
    """

  static let world = """
    {"schemaVersion":4,"grid":{"cellsPerAxis":4,"cellSize":1000},
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
    {"schemaVersion":4,"cells":[
      {"cell":0,"grid":[0,0],"structure":"surface-structure:test",
       "vertices":[
         {"kind":"world-point","position":[0,0,0]},
         {"kind":"world-point","position":[100,0,0]},
         {"kind":"rotated-input","rotationInput":[1,2,3]}],
       "edges":[[0,1,0],[1,2,1]],"rotation":{"descriptor":115,"center":[132,132]}},
      {"cell":1,"grid":[1,0],"structure":null,
       "vertices":[
         {"kind":"world-point","position":[1000,0,0]},
         {"kind":"world-point","position":[1100,0,0]}],
       "edges":[[0,1,0]],"rotation":null}]}
    """

  static let objects = """
    {"schemaVersion":4,
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

  static let flight = """
    {"schemaVersion":2,
     "blocks":[
       {"index":0,"handler":"standard","yawDamping":0.9375,"yawAuthority":1,"pitchStep":8,
        "rollCoupling":4,"liftFactor":0.5,"speedDamping":0.5,"ceiling":10,"throttleGain":0.390625}],
     "rules":{"angleUnitsPerTurn":1024,"levelPitch":512,"groundAltitude":63,"groundBand":64,
       "takeoffSpeed":128,"crashDescentRate":256,"crashPitch":640,"ceilingClimbScale":0,
       "ceilingUnit":65536,"throttleNotches":[32,64],"throttleLimit":32768,
       "poweramp":{"craft":1,"throttleScale":2,"ceiling":90},"walkingBlock":0},
     "counts":{"flightBlocks":1}}
    """

  static func write(
    into directory: URL,
    manifest: String = manifest,
    world: String = world,
    surface: String = surface,
    objects: String = objects,
    flight: String? = nil,
    omitting: Set<String> = []
  ) throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    var files = [
      ("manifest.json", manifest), ("world.json", world),
      ("surface.json", surface), ("objects.json", objects),
    ]
    if let flight { files.append(("flight.json", flight)) }
    for (name, body) in files where !omitting.contains(name) {
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

  func testLoadsFlightParametersWhenTheExportCarriesThem() throws {
    try PayloadFixture.write(into: directory, flight: PayloadFixture.flight)

    let bundle = try Payload.load(from: directory)

    let document = try XCTUnwrap(bundle.flight)
    XCTAssertEqual(document.blocks.count, 1)
    XCTAssertEqual(document.blocks[0].handler, .standard)
    XCTAssertEqual(document.blocks[0].rollCoupling, 4)
    XCTAssertEqual(document.rules.walkingBlock, 0)
  }

  func testAPayloadWithoutFlightParametersStillLoads() throws {
    try PayloadFixture.write(into: directory)

    XCTAssertNil(try Payload.load(from: directory).flight)
  }

  func testAFutureFlightSchemaRequiresAReexport() throws {
    try PayloadFixture.write(
      into: directory,
      flight: PayloadFixture.flight.replacingOccurrences(of: "\"schemaVersion\":2", with: "\"schemaVersion\":3")
    )

    XCTAssertThrowsError(try Payload.load(from: directory)) { error in
      XCTAssertEqual(error as? Payload.LoadError, .unsupportedSchema("flight.json", 3))
    }
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
      world: PayloadFixture.world.replacingOccurrences(of: "\"schemaVersion\":4", with: "\"schemaVersion\":5")
    )

    XCTAssertThrowsError(try Payload.load(from: directory)) { error in
      XCTAssertEqual(error as? Payload.LoadError, .unsupportedSchema("world.json", 5))
    }
  }

  func testSchemaThreeRequiresAReexport() throws {
    try PayloadFixture.write(
      into: directory,
      manifest: PayloadFixture.manifest.replacingOccurrences(of: "\"schemaVersion\":4", with: "\"schemaVersion\":3")
    )

    XCTAssertThrowsError(try Payload.load(from: directory)) { error in
      XCTAssertEqual(error as? Payload.LoadError, .unsupportedSchema("manifest.json", 3))
    }
  }

  func testOldGeometryDecoderRequiresAReextract() throws {
    try PayloadFixture.write(
      into: directory,
      manifest: PayloadFixture.manifest.replacingOccurrences(
        of: "\"decoderVersion\":3", with: "\"decoderVersion\":2"
      )
    )

    XCTAssertThrowsError(try Payload.load(from: directory)) { error in
      XCTAssertEqual(error as? Payload.LoadError, .unsupportedDecoder(2))
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
