import XCTest

@testable import Mercenary
@testable import MercenaryCLI
@testable import MercenaryKit

final class RehearsalTests: XCTestCase {
  func testEachLiftPadAxisResolvesItsOwnDecodedCentre() {
    XCTAssertEqual(Rehearsal.padCentre(24, shift: 2), 25_088)
    XCTAssertEqual(Rehearsal.padCentre(28, shift: 2), 29_184)
  }

  private func craft(_ slot: Int) -> ObjectPlacement {
    ObjectPlacement(
      slot: slot, id: "craft", model: "craft", origin: SIMD3(1_000, 0, 1_000),
      vertices: [SIMD3(0, 0, 0), SIMD3(1, 0, 0)], edges: [(0, 1)],
      detailCube: 65_536, drawsFarAsPoint: true, orientation: .identity,
      placement: "surface", withinWorld: true, room: 0, stateFlags: 0)
  }

  private func flight() -> FlightModel {
    let block: (Int) -> Payload.FlightDocument.Block = { index in
      Payload.FlightDocument.Block(
        index: index, handler: .standard, mode: nil, yawDamping: 0.9375,
        yawAuthority: 1, pitchStep: 8, rollCoupling: 4, liftFactor: 0.5,
        speedDamping: 0.5, ceiling: 10, throttleGain: 0.390625, tumble: nil)
    }
    return FlightModel(
      document: Payload.FlightDocument(
        schemaVersion: Payload.supportedFlightSchemaVersion,
        blocks: (0...8).map(block),
        walk: .init(step: 80, turnStep: 16),
        rules: .init(
          angleUnitsPerTurn: 1024, levelPitch: 512, groundAltitude: 63,
          groundBand: 64, takeoffSpeed: 128, crashDescentRate: 256,
          crashPitch: 640, ceilingClimbScale: 9.313225746154785e-10,
          ceilingUnit: 65_536, throttleNotches: (0..<10).map { pow(2, Double(5 + $0)) },
          throttleLimit: 32_768,
          poweramp: .init(craft: 1, throttleScale: 2, ceiling: 90), walkingBlock: 8),
        counts: [:]))
  }

  private var underground: Payload.UndergroundDocument {
    .init(
      schemaVersion: Payload.supportedUndergroundSchemaVersion,
      entrances: [.init(site: 1, cell: [9, 6], room: 1)],
      pad: .init(x: 28, z: 28, shift: 2),
      lift: .init(
        ascendRate: 38, descendRate: 6, surfaceAt: 12, submergeAt: 8,
        surfaceMiddle: 113, submergeMiddle: 8, floor: 128,
        altitudeWrap: 6, altitudeWrapSubtract: 7),
      counts: [:])
  }

  func testAConfiguredOpeningLoopFailsClearlyWhenItsRouteCannotBeResolved() {
    var session = GameplaySession(
      content: .init(), player: PlayerState(position: .zero))
    var options = BensonTrace.Options()
    options.walkTo = 1
    options.openingLoop = TraceScenario.Session.OpeningLoop()

    XCTAssertThrowsError(
      try Rehearsal.drive(
        &session, options: options, objects: [], sink: TraceSink())
    ) { error in
      XCTAssertEqual(
        String(describing: error),
        "the opening-loop rehearsal could not resolve craft 1 and lift site 1"
      )
    }
  }

  func testAConfiguredOpeningLoopHasABoundedTimeoutWithItsCurrentPhase() {
    let dart = craft(1)
    var session = GameplaySession(
      content: .init(objects: [dart], flight: flight(), underground: underground),
      player: PlayerState(position: .zero))
    var options = BensonTrace.Options()
    options.seconds = 0
    options.walkTo = 1
    options.openingLoop = TraceScenario.Session.OpeningLoop()

    XCTAssertThrowsError(
      try Rehearsal.drive(
        &session, options: options, objects: [dart], sink: TraceSink())
    ) { error in
      XCTAssertEqual(
        String(describing: error),
        "the opening-loop rehearsal timed out while awaitingPurchase"
      )
    }
  }
}
