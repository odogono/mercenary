import XCTest

@testable import MercenaryCLI

/// Reconstruction is half the contract. A trace writes its collections once and then
/// only what moved, so a reader that folds the changes forward wrongly would report a
/// divergence the simulation never had — which is worse than a large file, because it
/// discredits the oracle rather than merely inflating it.
final class TraceDeltaTests: XCTestCase {
  private let residence = TraceValue.object([
    "1": .string("surface"), "2": .string("surface"), "3": .string("carried"),
  ])

  func testNothingMovedIsNilRatherThanAnEmptyObject() {
    XCTAssertNil(residence.changes(to: residence))
  }

  func testOnlyChangedMembersAppear() throws {
    let after = TraceValue.object([
      "1": .string("surface"), "2": .object(["room": .int(7)]), "3": .string("carried"),
    ])
    XCTAssertEqual(
      try residence.changes(to: after)?.serialized(), #"{"2":{"room":7}}"#)
  }

  func testAppearedAndDisappearedMembers() throws {
    let before = TraceValue.object(["1": .int(1), "2": .int(2)])
    let after = TraceValue.object(["2": .int(2), "3": .int(3)])
    // Numeric keys sort ahead of named ones, so the removal list reads last.
    XCTAssertEqual(try before.changes(to: after)?.serialized(), #"{"3":3,"-":["1"]}"#)
  }

  func testRemovalsAreSorted() throws {
    let before = TraceValue.object(["10": .int(1), "2": .int(1), "33": .int(1), "4": .int(1)])
    XCTAssertEqual(
      try before.changes(to: .object([]))?.serialized(), #"{"-":["10","2","33","4"]}"#)
  }

  /// A nested object diffs member by member too, so one object moving room does not
  /// rewrite the whole sixty-four-slot map.
  func testNestingIsDiffedRatherThanReplaced() throws {
    let before = TraceValue.object([
      "host": .object(["currentRoom": .int(0), "objectRooms": .slots([1: .int(0), 2: .int(0)])])
    ])
    let after = TraceValue.object([
      "host": .object(["currentRoom": .int(3), "objectRooms": .slots([1: .int(0), 2: .int(3)])])
    ])
    XCTAssertEqual(
      try before.changes(to: after)?.serialized(),
      #"{"host":{"currentRoom":3,"objectRooms":{"2":3}}}"#)
  }

  /// A value written whole when a partial update would mean nothing: an array's members
  /// are positional, so "the third one changed" is not a smaller statement than the array.
  func testArraysAreWrittenWhole() throws {
    let before = TraceValue.object(["registers": .array([.int(0), .int(0), .int(0)])])
    let after = TraceValue.object(["registers": .array([.int(0), .int(9), .int(0)])])
    XCTAssertEqual(try before.changes(to: after)?.serialized(), #"{"registers":[0,9,0]}"#)
  }

  func testAShapeChangeIsWrittenWhole() throws {
    let before = TraceValue.object(["indoor": .null])
    let after = TraceValue.object(["indoor": .object(["dark": .bool(true)])])
    XCTAssertEqual(try before.changes(to: after)?.serialized(), #"{"indoor":{"dark":true}}"#)
    XCTAssertEqual(before.applying(before.changes(to: after)!), after)
  }

  /// The property the reader depends on, for every kind of change at once.
  func testApplyingAChangeReproducesTheState() {
    let before = TraceValue.object([
      "1": .string("surface"), "2": .string("surface"), "3": .string("carried"),
      "4": .string("gone"),
    ])
    let after = TraceValue.object([
      "1": .string("surface"), "2": .object(["room": .int(7)]), "4": .string("gone"),
      "9": .string("carried"),
    ])
    let change = before.changes(to: after)
    XCTAssertNotNil(change)
    XCTAssertEqual(before.applying(change!), after)
  }

  /// Folded forward over a whole run rather than one step, since that is how a replay
  /// consumes them and a per-step round trip would not catch an accumulating error.
  func testFoldingAWholeRunForward() throws {
    var truth = TraceValue.object([
      "player": .object(["speed": .double(0), "heading": .double(0)]),
      "residence": .slots([1: .string("surface"), 2: .string("surface"), 3: .string("surface")]),
    ])
    var replayed = truth

    for step in 1...200 {
      var slots: [Int: TraceValue] = [
        1: .string("surface"), 2: .string("surface"), 3: .string("surface"),
      ]
      // Something moves on most steps; something appears and vanishes on a few.
      slots[step % 3 + 1] = .object(["room": .int(step)])
      if step % 7 == 0 { slots[100 + step] = .string("carried") }
      let next = TraceValue.object([
        "player": .object([
          "speed": .double(Double(step) / 3), "heading": .double(Double(step) / 1024),
        ]),
        "residence": .slots(slots),
      ])

      if let change = truth.changes(to: next) {
        replayed = replayed.applying(change)
      }
      truth = next
      XCTAssertEqual(replayed, truth, "diverged at step \(step)")
    }
  }

  /// A double that changed only in its last bit is a change. Comparison runs through
  /// ``TraceValue``'s bit-pattern equality, so drift too small to see in a rounded
  /// readout still gets written.
  func testABitOfDriftCountsAsAChange() {
    let before = TraceValue.object(["speed": .double(0.1)])
    XCTAssertNotNil(before.changes(to: .object(["speed": .double(0.1.nextUp)])))
  }

  func testNegativeZeroCountsAsAChange() {
    XCTAssertNotNil(
      TraceValue.object(["roll": .double(0)]).changes(to: .object(["roll": .double(-0.0)])))
  }

  /// The removal key cannot be confused with a field, because no field is named for it.
  func testTheRemovalKeyIsNotAPossibleFieldName() {
    XCTAssertEqual(TraceValue.removalKey, "-")
    let fields = ["player", "residence", "objectRooms", "1", "63", "throttleNotch"]
    XCTAssertFalse(fields.contains(TraceValue.removalKey))
  }
}
