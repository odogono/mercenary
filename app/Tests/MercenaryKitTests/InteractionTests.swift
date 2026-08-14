import XCTest

@testable import MercenaryKit

final class InteractionTests: XCTestCase {
  /// The Reference Build's own rules, as decoded.
  private let interaction = Interaction(
    document: .init(
      schemaVersion: 1,
      takeKey: 0x16,
      boardKey: 0x1C,
      takeRange: 1,
      boardRange: 2,
      rangeUnit: 256,
      craftSlotBound: 8,
      inventoryLimit: 10,
      fixedMask: 0x10,
      heavyMask: 0x20,
      carriedMask: 0x80,
      descriptionMask: 0x0C,
      tooHeavyMessage: 2,
      removedFromWorld: 0xFF,
      counts: [:]
    )
  )

  private func candidate(_ slot: Int, at position: SIMD3<Double>) -> Interaction.Candidate {
    .init(slot: slot, position: position)
  }

  private let origin = SIMD3<Double>(0, 0, 0)

  // MARK: - Reach

  func testReachIsACubeRatherThanARadius() {
    // Each axis was compared separately, so a corner is as reachable as a face.
    let corner = candidate(20, at: SIMD3(400, 400, 400))

    XCTAssertTrue(interaction.isWithinReach(corner, of: origin, range: 2))
  }

  func testBoardReachesFurtherThanTake() {
    let object = candidate(20, at: SIMD3(600, 0, 0))

    XCTAssertFalse(interaction.isWithinReach(object, of: origin, range: interaction.takeRange))
    XCTAssertTrue(interaction.isWithinReach(object, of: origin, range: interaction.boardRange))
  }

  func testAnAxisOutOfRangePutsTheWholeObjectOutOfReach() {
    let object = candidate(20, at: SIMD3(100, 5000, 100))

    XCTAssertFalse(interaction.isWithinReach(object, of: origin, range: interaction.boardRange))
  }

  func testTheNearestCandidateWins() {
    var host = BensonHostState()
    let outcome = interaction.attempt(
      .take,
      from: origin,
      among: [candidate(20, at: SIMD3(400, 0, 0)), candidate(21, at: SIMD3(100, 0, 0))],
      host: &host
    )

    XCTAssertEqual(outcome, .took(slot: 21))
  }

  // MARK: - Taking

  func testTakingCarriesTheObjectOutOfTheWorld() {
    var host = BensonHostState()
    let outcome = interaction.attempt(.take, from: origin, among: [candidate(20, at: origin)], host: &host)

    XCTAssertEqual(outcome, .took(slot: 20))
    XCTAssertTrue(host.inventory.contains(20))
    XCTAssertEqual(host.objectFlags[20]! & interaction.carriedMask, interaction.carriedMask)
    XCTAssertEqual(host.objectRooms[20], BensonHostState.outOfTheWorld)
  }

  func testReachingForNothingIsNotAnEvent() {
    var host = BensonHostState()
    let outcome = interaction.attempt(.take, from: origin, among: [candidate(20, at: SIMD3(9000, 0, 0))], host: &host)

    XCTAssertEqual(outcome, .nothingInReach)
    XCTAssertTrue(host.inventory.isEmpty)
  }

  func testAFixedObjectStaysWhereItIs() {
    var host = BensonHostState()
    host.objectFlags[20] = interaction.fixedMask
    let outcome = interaction.attempt(.take, from: origin, among: [candidate(20, at: origin)], host: &host)

    XCTAssertEqual(outcome, .fixedInPlace(slot: 20))
    XCTAssertTrue(host.inventory.isEmpty)
  }

  func testAHeavyObjectIsRefusedWithSomethingToSay() {
    var host = BensonHostState()
    host.objectFlags[20] = interaction.heavyMask
    let outcome = interaction.attempt(.take, from: origin, among: [candidate(20, at: origin)], host: &host)

    XCTAssertEqual(outcome, .tooHeavy(slot: 20))
    XCTAssertEqual(interaction.tooHeavyMessage, 2)
  }

  func testTheGlobalOverridesLiftBothRestrictions() {
    var host = BensonHostState(canLiftAnything: true, canTakeAnything: true)
    host.objectFlags[20] = interaction.fixedMask | interaction.heavyMask
    let outcome = interaction.attempt(.take, from: origin, among: [candidate(20, at: origin)], host: &host)

    XCTAssertEqual(outcome, .took(slot: 20))
  }

  func testTheInventoryIsBounded() {
    var host = BensonHostState(inventory: Set(100..<110))
    XCTAssertEqual(host.inventory.count, interaction.inventoryLimit)

    let outcome = interaction.attempt(.take, from: origin, among: [candidate(20, at: origin)], host: &host)

    XCTAssertEqual(outcome, .handsFull)
    XCTAssertFalse(host.inventory.contains(20))
  }

  // MARK: - Boarding

  func testBoardingACraftSetsItAsTheCraftUnderYou() {
    var host = BensonHostState()
    let outcome = interaction.attempt(.board, from: origin, among: [candidate(1, at: SIMD3(500, 0, 0))], host: &host)

    XCTAssertEqual(outcome, .boarded(slot: 1))
    XCTAssertEqual(host.boardedCraft, 1)
    XCTAssertEqual(host.objectRooms[1], BensonHostState.outOfTheWorld)
  }

  func testOnlyTheLowSlotsAreCraft() {
    XCTAssertTrue(interaction.isCraft(0))
    XCTAssertTrue(interaction.isCraft(7))
    XCTAssertFalse(interaction.isCraft(8))

    var host = BensonHostState()
    let outcome = interaction.attempt(.board, from: origin, among: [candidate(20, at: origin)], host: &host)

    XCTAssertEqual(outcome, .notACraft(slot: 20))
    XCTAssertEqual(host.boardedCraft, BensonHostState.onFoot)
  }

  func testYouCannotBoardWhileAlreadyAboard() {
    var host = BensonHostState(boardedCraft: 1)
    let outcome = interaction.attempt(.board, from: origin, among: [candidate(2, at: origin)], host: &host)

    XCTAssertEqual(outcome, .alreadyAboard)
    XCTAssertEqual(host.boardedCraft, 1)
  }

  func testACraftJustOutOfReachIsNotBoarded() {
    var host = BensonHostState()
    let outcome = interaction.attempt(.board, from: origin, among: [candidate(1, at: SIMD3(0, 0, 900))], host: &host)

    XCTAssertEqual(outcome, .nothingInReach)
    XCTAssertEqual(host.boardedCraft, BensonHostState.onFoot)
  }

  // MARK: - What an object says

  func testTheDescriptionBitsChooseBetweenAScriptAndAMessage() {
    // The opening marks the Dart with the low bit, so boarding it runs script 1.
    XCTAssertEqual(interaction.description(of: 1, flags: 0x04), .script(1))
    XCTAssertEqual(interaction.description(of: 25, flags: 0x08), .message(25))
    XCTAssertEqual(interaction.description(of: 25, flags: 0x0C), .message(25))
  }

  func testMostObjectsSayNothing() {
    XCTAssertEqual(interaction.description(of: 30, flags: 0), .none)
    XCTAssertEqual(interaction.description(of: 30, flags: 0xF3), .none)
  }

  // MARK: - Leaving

  func testLeavingPutsTheCraftBackIntoTheWorldWhereThePlayerGotOut() {
    // Boarding takes the craft out of the world, so leaving has to undo both
    // halves or the craft is gone for good.
    var host = BensonHostState()
    let outcome = interaction.attempt(
      .board, from: SIMD3(0, 0, 0),
      among: [Interaction.Candidate(slot: 1, position: SIMD3(0, 0, 0))], host: &host
    )

    XCTAssertEqual(outcome, .boarded(slot: 1))
    XCTAssertEqual(host.objectRooms[1], BensonHostState.outOfTheWorld)
    XCTAssertEqual(host.boardedCraft, 1)

    XCTAssertEqual(interaction.leave(host: &host), 1)
    XCTAssertEqual(host.boardedCraft, BensonHostState.onFoot)
    XCTAssertEqual(host.objectRooms[1], Interaction.surfaceRoom)
  }

  func testLeavingOnFootDoesNothing() {
    var host = BensonHostState()

    XCTAssertNil(interaction.leave(host: &host))
    XCTAssertEqual(host.boardedCraft, BensonHostState.onFoot)
  }

  func testABoardedCraftCanBeBoardedAgainAfterLeavingIt() {
    var host = BensonHostState()
    let candidates = [Interaction.Candidate(slot: 1, position: SIMD3(0, 0, 0))]
    _ = interaction.attempt(.board, from: SIMD3(0, 0, 0), among: candidates, host: &host)
    _ = interaction.leave(host: &host)

    let again: Interaction.Outcome = interaction.attempt(
      .board, from: SIMD3(0, 0, 0), among: candidates, host: &host
    )
    XCTAssertEqual(again, .boarded(slot: 1))
  }
}

final class InteractionPayloadTests: XCTestCase {
  private var directory: URL!

  override func setUpWithError() throws {
    directory = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("payload-\(UUID().uuidString)")
  }

  override func tearDownWithError() throws {
    try? FileManager.default.removeItem(at: directory)
  }

  private static let rules = """
    {"schemaVersion":1,"takeKey":22,"boardKey":28,"takeRange":1,"boardRange":2,
     "rangeUnit":256,"craftSlotBound":8,"inventoryLimit":10,"fixedMask":16,
     "heavyMask":32,"carriedMask":128,"descriptionMask":12,"tooHeavyMessage":2,
     "removedFromWorld":255,"counts":{"rules":13}}
    """

  func testAPayloadWithoutRulesStillLoads() throws {
    try PayloadFixture.write(into: directory)

    XCTAssertNil(try Payload.load(from: directory).interaction)
  }

  func testRulesAreLoadedWhenPresent() throws {
    try PayloadFixture.write(into: directory)
    try Self.rules.write(
      to: directory.appendingPathComponent("interaction.json"), atomically: true, encoding: .utf8
    )

    let bundle = try Payload.load(from: directory)
    let interaction = Interaction(document: try XCTUnwrap(bundle.interaction))

    XCTAssertEqual(interaction.takeKey, 0x16)
    XCTAssertEqual(interaction.boardKey, 0x1C)
    XCTAssertEqual(interaction.inventoryLimit, 10)
  }

  func testAFutureRuleSchemaIsRejected() throws {
    try PayloadFixture.write(into: directory)
    try Self.rules.replacingOccurrences(of: "\"schemaVersion\":1", with: "\"schemaVersion\":2")
      .write(to: directory.appendingPathComponent("interaction.json"), atomically: true, encoding: .utf8)

    XCTAssertThrowsError(try Payload.load(from: directory)) { error in
      XCTAssertEqual(error as? Payload.LoadError, .unsupportedSchema("interaction.json", 2))
    }
  }

}
