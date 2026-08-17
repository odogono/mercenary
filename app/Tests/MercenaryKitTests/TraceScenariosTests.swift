import XCTest

@testable import MercenaryKit

/// The catalogue is read the way a command line is read: strictly. A scenario file is the
/// same kind of instruction, and the failure it must not have is the one ``Arguments`` was
/// rewritten to stop — a misspelled field that looks like it worked and traces something
/// else.
final class TraceScenariosTests: XCTestCase {
  private func load(_ json: String) throws -> TraceScenarios {
    try TraceScenarios.load(
      at: URL(fileURLWithPath: "/catalogue/trace-scenarios.json"),
      read: { _ in Data(json.utf8) })
  }

  func testAScenarioNamesOnlyWhatItChanges() throws {
    let catalogue = try load(
      """
      {"schemaVersion": 1, "scenarios": [
        {"emitter": "flight", "id": "one", "craft": 3}
      ]}
      """)
    guard case .flight(let body) = catalogue.scenarios[0].body else { return XCTFail("a flight body") }
    XCTAssertEqual(body.craft, 3)
    // The rest are the defaults, which a synthesized decoder would have called missing.
    XCTAssertEqual(body.notch, 10)
    XCTAssertEqual(body.seconds, 30)
    XCTAssertFalse(body.poweramp)
  }

  func testEachEmitterDecodesItsOwnBody() throws {
    let catalogue = try load(
      """
      {"schemaVersion": 1, "scenarios": [
        {"emitter": "decode", "id": "payload"},
        {"emitter": "projection", "id": "pose", "room": 3, "heading": 90},
        {"emitter": "flight", "id": "craft", "craft": 2},
        {"emitter": "game-core", "id": "walk", "legs": [{"walk": 1, "seconds": 2}]},
        {"emitter": "benson", "id": "script", "script": 7, "host": {"room": 3}},
        {"emitter": "session", "id": "opening", "walkTo": 1},
        {"emitter": "navigation", "id": "room", "room": 144, "legs": [{"heading": 270, "seconds": 3}]}
      ]}
      """)
    XCTAssertEqual(
      catalogue.scenarios.map(\.emitter),
      [.decode, .projection, .flight, .gameCore, .benson, .session, .navigation])
    guard case .gameCore(let core) = catalogue.scenarios[3].body else { return XCTFail("a core body") }
    XCTAssertEqual(core.legs.count, 1)
    XCTAssertEqual(core.legs[0].walk, 1)
    guard case .benson(let benson) = catalogue.scenarios[4].body else { return XCTFail("a benson body") }
    XCTAssertEqual(benson.host.room, 3)
  }

  /// The whole point of reading this strictly.
  func testAMisspelledFieldIsRefusedByName() {
    XCTAssertThrowsError(
      try load(
        """
        {"schemaVersion": 1, "scenarios": [
          {"emitter": "flight", "id": "one", "crafts": 3}
        ]}
        """)
    ) { error in
      XCTAssertTrue(
        String(describing: error).contains("crafts"),
        "the error should name the field: \(error)")
      XCTAssertTrue(
        String(describing: error).contains("craft"),
        "and suggest the one that exists: \(error)")
    }
  }

  /// A field that belongs to a different emitter is still unknown here. `--poweramp` means
  /// something to a flight scenario and nothing to a walk, and silently ignoring it would
  /// trace a walk that the catalogue appears to say is powered.
  func testAFieldFromAnotherEmitterIsRefused() {
    XCTAssertThrowsError(
      try load(
        """
        {"schemaVersion": 1, "scenarios": [
          {"emitter": "game-core", "id": "walk", "poweramp": true}
        ]}
        """)
    ) { error in
      XCTAssertTrue(String(describing: error).contains("poweramp"))
    }
  }

  func testUnknownFieldsInsideNestedBodiesAreRefusedToo() {
    XCTAssertThrowsError(
      try load(
        """
        {"schemaVersion": 1, "scenarios": [
          {"emitter": "game-core", "id": "walk", "legs": [{"walking": 1, "seconds": 2}]}
        ]}
        """)
    ) { error in
      XCTAssertTrue(String(describing: error).contains("walking"))
    }
  }

  func testAnUnknownEmitterIsRefused() {
    XCTAssertThrowsError(
      try load(#"{"schemaVersion": 1, "scenarios": [{"emitter": "renderer", "id": "one"}]}"#))
  }

  /// Two scenarios with one name would write one file, and the first would silently lose.
  func testTwoScenariosCannotShareAnIdWithinAnEmitter() {
    XCTAssertThrowsError(
      try load(
        """
        {"schemaVersion": 1, "scenarios": [
          {"emitter": "flight", "id": "one", "craft": 1},
          {"emitter": "flight", "id": "one", "craft": 2}
        ]}
        """)
    ) { error in
      XCTAssertEqual(
        error as? TraceScenarios.LoadError, .duplicate(emitter: .flight, id: "one"))
    }
  }

  /// The pair is what a path is built from, so the same name under two emitters is fine.
  func testTheSameIdUnderTwoEmittersIsFine() throws {
    let catalogue = try load(
      """
      {"schemaVersion": 1, "scenarios": [
        {"emitter": "flight", "id": "one", "craft": 1},
        {"emitter": "navigation", "id": "one", "room": 3}
      ]}
      """)
    XCTAssertEqual(catalogue.scenarios.count, 2)
  }

  /// Selection order is the port's dependency order, then id, so a run writes its traces in
  /// the same sequence however the file is arranged.
  func testSelectionIsSortedByEmitterThenId() throws {
    let catalogue = try load(
      """
      {"schemaVersion": 1, "scenarios": [
        {"emitter": "navigation", "id": "zulu", "room": 3},
        {"emitter": "flight", "id": "bravo", "craft": 1},
        {"emitter": "decode", "id": "payload"},
        {"emitter": "flight", "id": "alpha", "craft": 2}
      ]}
      """)
    XCTAssertEqual(
      catalogue.selected().map { "\($0.emitter.rawValue)/\($0.id)" },
      ["decode/payload", "flight/alpha", "flight/bravo", "navigation/zulu"])
  }

  func testFiltering() throws {
    let catalogue = try load(
      """
      {"schemaVersion": 1, "scenarios": [
        {"emitter": "flight", "id": "alpha", "craft": 1},
        {"emitter": "flight", "id": "bravo", "craft": 2},
        {"emitter": "decode", "id": "payload"}
      ]}
      """)
    XCTAssertEqual(catalogue.selected(emitter: .flight).count, 2)
    XCTAssertEqual(catalogue.selected(id: "alpha").map(\.id), ["alpha"])
    XCTAssertEqual(catalogue.selected(emitter: .decode, id: "alpha").count, 0)
  }

  func testAMissingFileIsReportedAsSuch() {
    XCTAssertThrowsError(try TraceScenarios.load(at: nil)) { error in
      XCTAssertEqual(error as? TraceScenarios.LoadError, .notFound)
    }
  }

  func testUnreadableJSONIsReportedAsSuch() {
    XCTAssertThrowsError(try load("not json at all")) { error in
      guard case .unreadable = error as? TraceScenarios.LoadError else {
        return XCTFail("expected an unreadable failure, got \(error)")
      }
    }
  }

  /// The emitter order is the claim #68 relies on: each emitter observes only modules at or
  /// below its own layer, so asserting the order is asserting that layering.
  func testEmittersAreOrderedByTheirDependencies() {
    XCTAssertEqual(
      TraceEmitter.allCases,
      [.decode, .projection, .flight, .gameCore, .benson, .session, .navigation])
    XCTAssertTrue(TraceEmitter.decode < TraceEmitter.projection)
    XCTAssertTrue(TraceEmitter.benson < TraceEmitter.session)
  }
}

/// Same shape as ``SettingsLocator``, and tested the same way: with an injected
/// `fileExists`, so the suite never depends on where the repository happens to be.
final class TraceScenarioLocatorTests: XCTestCase {
  func testAnOverrideIsUsedWhenItExists() {
    let found = TraceScenarioLocator.locate(
      environment: [TraceScenarioLocator.environmentKey: "/elsewhere/scenarios.json"],
      startingAt: URL(fileURLWithPath: "/repo/app"),
      fileExists: { $0.path == "/elsewhere/scenarios.json" })
    XCTAssertEqual(found?.path, "/elsewhere/scenarios.json")
  }

  func testAnOverrideThatDoesNotExistFindsNothingRatherThanFallingBack() {
    let found = TraceScenarioLocator.locate(
      environment: [TraceScenarioLocator.environmentKey: "/elsewhere/scenarios.json"],
      startingAt: URL(fileURLWithPath: "/repo/app"),
      fileExists: { $0.path == "/repo/trace-scenarios.json" })
    XCTAssertNil(found, "an override names a file; silently using another would hide a typo")
  }

  func testAnEmptyOverrideIsIgnored() {
    let found = TraceScenarioLocator.locate(
      environment: [TraceScenarioLocator.environmentKey: ""],
      startingAt: URL(fileURLWithPath: "/repo/app"),
      fileExists: { $0.path == "/repo/trace-scenarios.json" })
    XCTAssertEqual(found?.path, "/repo/trace-scenarios.json")
  }

  /// `swift run` starts inside `app/`, while a built binary usually starts at the root.
  func testItWalksUpFromTheWorkingDirectory() {
    let found = TraceScenarioLocator.locate(
      environment: [:],
      startingAt: URL(fileURLWithPath: "/repo/app/.build/debug"),
      fileExists: { $0.path == "/repo/trace-scenarios.json" })
    XCTAssertEqual(found?.path, "/repo/trace-scenarios.json")
  }

  func testNoFileAnywhereFindsNothing() {
    XCTAssertNil(
      TraceScenarioLocator.locate(
        environment: [:], startingAt: URL(fileURLWithPath: "/repo/app"), fileExists: { _ in false }))
  }
}
