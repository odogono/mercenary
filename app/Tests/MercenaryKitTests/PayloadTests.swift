import XCTest

@testable import MercenaryKit

/// Builds a tiny synthetic payload on disk. Nothing here is Reference Build data;
/// the shapes are what matter.
enum PayloadFixture {
  static let manifest = """
    {"schemaVersion":\(Payload.supportedSchemaVersion),"sourceDatasetId":"world-geometry-test","sourceCoreDigest":"\(String(repeating: "a", count: 64))",
     "decoderVersion":\(Payload.supportedDecoderVersion),"counts":{"cells":2,"models":1,"instances":2}}
    """

  static let world = """
    {"schemaVersion":\(Payload.supportedSchemaVersion),"grid":{"cellsPerAxis":4,"cellSize":1000},
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
    {"schemaVersion":\(Payload.supportedSchemaVersion),"cells":[
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
    {"schemaVersion":\(Payload.supportedSchemaVersion),
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

  static let doorwayRules = """
    {"depthHalfWindow":64,"alongWallBias":40,"headingRounding":2,"lockBoundary":8,
     "keySlotBias":8,"skeletonKeySlot":48,"photonEmitterSlot":16,"lockedMessage":0,
     "darkMessage":1,"lineColour":1,"cooldownFrames":10,"worldFlipCooldownFrames":31,
     "randomRoom":114,"worldFlipRoom":127,
     "nearMargin":32,"farMargin":223,"wallThudSound":20,"surfaceExit":{"x":550848,"y":4257920,"z":552960},"stepInterlock":2,
     "transitionColours":[0,11,12,15,1,1,1,15,12,11,0,2,4,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8],
     "worldFlipInputRemap":[0,1,2,3,8,9,10,11,4,5,6,7,12,13,14,15]}
    """

  static let rooms = """
    {"schemaVersion":\(Payload.supportedSchemaVersion),
     "doorwayRules":\(doorwayRules),
     "rooms":[
       {"room":0,"vertices":[[0,0,0],[4096,0,0],[4096,1024,0]],"edges":[[0,1],[1,2]],
        "bounds":{"min":[0,0,0],"max":[4096,1024,0]},"palette":{"background":6,"foreground":14},
        "dark":false,"entry":{"message":9},"specialSetup":null,
        "doorways":[{"index":0,"shape":9,"plane":"zy","position":{"x":4096,"z":3072},
          "destination":{"room":88},"arrivalCommandIndex":1,"arrival":{"x":2176,"z":256},
          "arrivalWithinDestination":true,"lock":{"class":9,"requiresObject":17}}]},
       {"room":1,"vertices":[[0,0,0],[512,0,0]],"edges":[[0,1]],
        "bounds":{"min":[0,0,0],"max":[512,0,0]},"palette":{"background":0,"foreground":1},
        "dark":true,"entry":null,"specialSetup":null,"doorways":[]},
       {"room":2,"vertices":[[0,0,0],[768,0,0]],"edges":[[0,1]],
        "bounds":{"min":[0,0,0],"max":[768,0,0]},"palette":{"background":0,"foreground":7},
        "dark":false,"entry":{"script":23},
        "specialSetup":{"selector":"previousRoom","alternates":[
          {"room":86,"arrivalCommandIndex":0,"destination":{"room":86},
           "arrival":{"x":128,"z":256},"arrivalWithinDestination":true},
          {"room":86,"arrivalCommandIndex":0,"destination":{"room":86},
           "arrival":{"x":128,"z":256},"arrivalWithinDestination":true}]},
        "doorways":[{"index":0,"shape":2,"plane":"xy","position":{"x":0,"z":768},
          "destination":{"surface":true},"arrivalCommandIndex":0,"arrival":null,
          "arrivalWithinDestination":true,"lock":null}]}]}
    """

  static let underground = """
    {"schemaVersion":\(Payload.supportedUndergroundSchemaVersion),
     "entrances":[{"site":1,"cell":[9,6],"room":1},{"site":2,"cell":[9,5],"room":2}],
     "pad":{"x":28,"z":28,"shift":2},
     "lift":{"ascendRate":38,"descendRate":6,"surfaceAt":12,"submergeAt":8,
       "surfaceMiddle":113,"submergeMiddle":8,"floor":128,"altitudeWrap":6,
       "altitudeWrapSubtract":7},
     "counts":{"undergroundEntrances":2}}
    """

  static let flight = """
    {"schemaVersion":\(Payload.supportedFlightSchemaVersion),
     "walk":{"step":80,"turnStep":16},
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
    rooms: String = rooms,
    flight: String? = nil,
    underground: String? = nil,
    omitting: Set<String> = []
  ) throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    var files = [
      ("manifest.json", manifest), ("world.json", world),
      ("surface.json", surface), ("objects.json", objects), ("rooms.json", rooms),
    ]
    if let flight { files.append(("flight.json", flight)) }
    if let underground { files.append(("underground.json", underground)) }
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
    XCTAssertEqual(bundle.rooms.rooms[0].palette.background, 6)
    XCTAssertEqual(bundle.rooms.rooms[0].palette.foreground, 14)
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
      flight: PayloadFixture.flight.replacingOccurrences(
        of: "\"schemaVersion\":\(Payload.supportedFlightSchemaVersion)",
        with: "\"schemaVersion\":\(Payload.supportedFlightSchemaVersion + 1)"
      )
    )

    XCTAssertThrowsError(try Payload.load(from: directory)) { error in
      XCTAssertEqual(
        error as? Payload.LoadError,
        .unsupportedSchema("flight.json", Payload.supportedFlightSchemaVersion + 1)
      )
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
      world: PayloadFixture.world.replacingOccurrences(
        of: "\"schemaVersion\":\(Payload.supportedSchemaVersion)",
        with: "\"schemaVersion\":\(Payload.supportedSchemaVersion + 1)"
      )
    )

    XCTAssertThrowsError(try Payload.load(from: directory)) { error in
      XCTAssertEqual(
        error as? Payload.LoadError,
        .unsupportedSchema("world.json", Payload.supportedSchemaVersion + 1)
      )
    }
  }

  func testAStaleSchemaRequiresAReexport() throws {
    try PayloadFixture.write(
      into: directory,
      manifest: PayloadFixture.manifest.replacingOccurrences(
        of: "\"schemaVersion\":\(Payload.supportedSchemaVersion)",
        with: "\"schemaVersion\":\(Payload.supportedSchemaVersion - 1)"
      )
    )

    XCTAssertThrowsError(try Payload.load(from: directory)) { error in
      XCTAssertEqual(
        error as? Payload.LoadError,
        .unsupportedSchema("manifest.json", Payload.supportedSchemaVersion - 1)
      )
    }
  }

  func testOldGeometryDecoderRequiresAReextract() throws {
    try PayloadFixture.write(
      into: directory,
      manifest: PayloadFixture.manifest.replacingOccurrences(
        of: "\"decoderVersion\":\(Payload.supportedDecoderVersion)",
        with: "\"decoderVersion\":\(Payload.supportedDecoderVersion - 1)"
      )
    )

    XCTAssertThrowsError(try Payload.load(from: directory)) { error in
      XCTAssertEqual(error as? Payload.LoadError, .unsupportedDecoder(Payload.supportedDecoderVersion - 1))
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

  func testLoadsTheLiftWhenTheExportCarriesIt() throws {
    try PayloadFixture.write(into: directory, underground: PayloadFixture.underground)
    let lift = try XCTUnwrap(try Payload.load(from: directory).underground)

    XCTAssertEqual(lift.entrances.count, 2)
    XCTAssertEqual(lift.lift.descendRate, 6)
    // The site is handed to the room setup as a room id, so they agree by design.
    XCTAssertEqual(lift.entrances.first?.site, lift.entrances.first?.room)
  }

  func testFindsTheLiftServingASurfaceCell() throws {
    try PayloadFixture.write(into: directory, underground: PayloadFixture.underground)
    let lift = try XCTUnwrap(try Payload.load(from: directory).underground)

    XCTAssertEqual(lift.entrance(column: 9, row: 6)?.room, 1)
    XCTAssertEqual(lift.entrance(column: 9, row: 5)?.room, 2)
    XCTAssertNil(lift.entrance(column: 0, row: 0))
  }

  func testTheLiftsPadIsASquareNearTheMiddleOfItsCell() throws {
    try PayloadFixture.write(into: directory, underground: PayloadFixture.underground)
    let pad = try XCTUnwrap(try Payload.load(from: directory).underground).pad
    let cell = 65_536.0

    // Middle bytes $70 to $73 stand on it; surfacing puts the player at $71, which is
    // the pad's own middle, so arriving leaves them able to go straight back.
    XCTAssertTrue(pad.covers(Double(0x70 << 8), cellSize: cell))
    XCTAssertTrue(pad.covers(Double(0x71 << 8), cellSize: cell))
    XCTAssertTrue(pad.covers(Double(0x73 << 8), cellSize: cell))
    XCTAssertFalse(pad.covers(Double(0x74 << 8), cellSize: cell))
    XCTAssertFalse(pad.covers(Double(0x6F << 8), cellSize: cell))
  }

  func testThePadIsFoundInAnyCellRatherThanOnlyTheFirst() throws {
    try PayloadFixture.write(into: directory, underground: PayloadFixture.underground)
    let pad = try XCTUnwrap(try Payload.load(from: directory).underground).pad
    let cell = 65_536.0

    XCTAssertTrue(pad.covers(9 * cell + Double(0x71 << 8), cellSize: cell))
    XCTAssertFalse(pad.covers(9 * cell + Double(0x20 << 8), cellSize: cell))
  }

  func testAPayloadWithoutTheLiftStillLoads() throws {
    try PayloadFixture.write(into: directory)

    XCTAssertNil(try Payload.load(from: directory).underground)
  }

  // MARK: - The rules navigation is built on

  func testCarriesTheRulesThatBoundARoomAndTakeADoorway() throws {
    try PayloadFixture.write(into: directory)

    let rules = try Payload.load(from: directory).rooms.doorwayRules

    XCTAssertEqual(rules.nearMargin, 32)
    XCTAssertEqual(rules.farMargin, 223)
    XCTAssertEqual(rules.stepInterlock, 2)
    XCTAssertEqual(rules.wallThudSound, 20)
  }

  func testTheTwoMarginsDescribeTheSameWallAtBothEndsOfARoom() throws {
    try PayloadFixture.write(into: directory)
    let rules = try Payload.load(from: directory).rooms.doorwayRules

    // The near margin is a whole position and the far one is a low byte, which is
    // easy to mistake for an asymmetry. Written as distances from each wall they are
    // 32 and 33 — near enough the same that a Room is not lopsided, and different
    // enough that hard-coding one of them for both would be wrong.
    let cells = 7
    let near = rules.nearMargin
    let far = (cells - 1) * 256 + rules.farMargin

    XCTAssertEqual(near, 32)
    XCTAssertEqual(cells * 256 - far, 33)
  }

  func testATransitionHasAColourForEveryFrameItCanLast() throws {
    try PayloadFixture.write(into: directory)
    let rules = try Payload.load(from: directory).rooms.doorwayRules

    XCTAssertEqual(rules.transitionColours.count, rules.worldFlipCooldownFrames)
    XCTAssertTrue(rules.transitionColours.allSatisfy { (0..<16).contains($0) })
  }

  func testTheWorldFlipSwapsTheTurnBitsAndIsItsOwnInverse() throws {
    try PayloadFixture.write(into: directory)
    let remap = try Payload.load(from: directory).rooms.doorwayRules.worldFlipInputRemap

    XCTAssertEqual(remap.count, 16)
    for input in 0..<16 {
      XCTAssertEqual(remap[input], input & 0b0011 | (input & 0b0100) << 1 | (input & 0b1000) >> 1)
      XCTAssertEqual(remap[remap[input]], input)
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
