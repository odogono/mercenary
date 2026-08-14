import XCTest

@testable import MercenaryKit

final class SettingsTests: XCTestCase {
  private func settings(_ json: String) throws -> Settings {
    try Settings.load(at: URL(fileURLWithPath: "/settings.json")) { _ in Data(json.utf8) }
  }

  func testNoFileMeansTheBuiltInDefaults() throws {
    let settings = try Settings.load(at: nil)

    XCTAssertEqual(settings, Settings())
    XCTAssertEqual(settings.message.holdSeconds, MessageTicker.referenceHold)
  }

  func testAFileMayNameOnlyWhatItChanges() throws {
    let settings = try settings(#"{"message":{"holdSeconds":5}}"#)

    XCTAssertEqual(settings.message.holdSeconds, 5)
    XCTAssertEqual(
      settings.message.charactersPerSecond, Settings.Message().charactersPerSecond,
      "an unnamed value keeps its default"
    )
    XCTAssertEqual(settings.scripts, Settings.Scripts(), "an unnamed section keeps its defaults")
  }

  func testEverySettingCanBeSet() throws {
    let settings = try settings(
      #"""
      {"message":{"holdSeconds":4,"charactersPerSecond":8},
       "scripts":{"timeScale":2,"instructionBudget":64},
       "flight":{"referenceFrameRate":10,"turnScale":4,"pitchScale":2,"speedScale":3,
                 "runMultiplier":5,"groundAltitude":80}}
      """#
    )

    XCTAssertEqual(settings.message.holdSeconds, 4)
    XCTAssertEqual(settings.message.charactersPerSecond, 8)
    XCTAssertEqual(settings.scripts.timeScale, 2)
    XCTAssertEqual(settings.scripts.instructionBudget, 64)
    XCTAssertEqual(settings.flight.referenceFrameRate, 10)
    XCTAssertEqual(settings.flight.turnScale, 4)
    XCTAssertEqual(settings.flight.pitchScale, 2)
    XCTAssertEqual(settings.flight.speedScale, 3)
    XCTAssertEqual(settings.flight.runMultiplier, 5)
    XCTAssertEqual(settings.flight.groundAltitude, 80)
  }

  func testAFlightSectionMayNameOnlyWhatItChanges() throws {
    let settings = try settings(#"{"flight":{"turnScale":4}}"#)

    XCTAssertEqual(settings.flight.turnScale, 4)
    XCTAssertEqual(settings.flight.referenceFrameRate, Settings.Flight().referenceFrameRate)
    XCTAssertNil(settings.flight.groundAltitude, "absent means the payload's own ground altitude")
  }

  func testTheFlightDefaultsAreTheControlLoopsOwn() {
    // The knob defaults live once, on ControlLimits; the settings restate nothing.
    let limits = ControlLimits()
    XCTAssertEqual(Settings.Flight().limits(groundExtent: limits.groundExtent), limits)
  }

  func testAnEmptyObjectIsTheDefaults() throws {
    XCTAssertEqual(try settings("{}"), Settings())
  }

  func testAMalformedFileIsReportedRatherThanIgnored() {
    // Silently falling back would leave a tuning session running the old values.
    XCTAssertThrowsError(try settings("{ not json")) { error in
      guard case Settings.LoadError.unreadable(let name, _) = error else {
        return XCTFail("expected unreadable, got \(error)")
      }
      XCTAssertEqual(name, "settings.json")
      XCTAssertTrue("\(error)".contains("Could not read settings"))
    }
  }

  func testSettingsBecomeScriptPacing() throws {
    let settings = try settings(#"{"message":{"holdSeconds":4,"charactersPerSecond":9},"scripts":{"timeScale":3}}"#)

    let tunables = settings.bensonTunables(framesPerTick: 50)

    XCTAssertEqual(tunables.messageHoldSeconds, 4)
    XCTAssertEqual(tunables.messageCharactersPerSecond, 9)
    XCTAssertEqual(tunables.timeScale, 3)
    XCTAssertEqual(tunables.framesPerTick, 50, "the payload still decides how long a tick is")
  }

  func testTheHoldAndRevealRateReachTheMessageLine() {
    var session = BensonSession(
      program: BensonProgram(
        instructions: [.message([.init(kind: "literal", word: nil, text: "TARG", slot: nil)]), .ret],
        entries: [0]
      ),
      text: BensonFixture.text,
      tunables: BensonTunables(timeScale: 2, messageCharactersPerSecond: 5, messageHoldSeconds: 7)
    )
    session.start(script: 0)

    session.advance(by: 1.0 / 60)

    XCTAssertEqual(session.ticker?.holdSeconds, 7, "the hold is the player's time, unscaled")
    XCTAssertEqual(session.ticker?.charactersPerSecond, 10, "the reveal takes the timing scale")
  }
}

final class SettingsLocatorTests: XCTestCase {
  func testAnEnvironmentOverrideWins() {
    let url = SettingsLocator.locate(
      environment: [SettingsLocator.environmentKey: "/somewhere/tuned.json"],
      startingAt: URL(fileURLWithPath: "/a/b"),
      fileExists: { $0.path == "/somewhere/tuned.json" }
    )

    XCTAssertEqual(url?.path, "/somewhere/tuned.json")
  }

  func testAnOverridePointingAtNothingFindsNothing() {
    XCTAssertNil(
      SettingsLocator.locate(
        environment: [SettingsLocator.environmentKey: "/absent.json"],
        startingAt: URL(fileURLWithPath: "/a/b"),
        fileExists: { _ in false }
      )
    )
  }

  func testItWalksUpToTheRepositoryRoot() {
    // `swift run` starts inside app/, so the file is found above it.
    let url = SettingsLocator.locate(
      environment: [:],
      startingAt: URL(fileURLWithPath: "/repo/app"),
      fileExists: { $0.path == "/repo/settings.json" }
    )

    XCTAssertEqual(url?.path, "/repo/settings.json")
  }

  func testNoFileAnywhereIsNotAnError() {
    XCTAssertNil(
      SettingsLocator.locate(
        environment: [:], startingAt: URL(fileURLWithPath: "/a/b"), fileExists: { _ in false }
      )
    )
  }
}
