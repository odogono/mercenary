import XCTest

@testable import MercenaryKit

final class MessageTickerTests: XCTestCase {
  func testRevealsCharactersAtItsRate() {
    var ticker = MessageTicker(text: "CRASH", charactersPerSecond: 2)

    XCTAssertEqual(ticker.visibleText, "")
    ticker.advance(by: 0.5)
    XCTAssertEqual(ticker.visibleText, "C")
    ticker.advance(by: 1.0)
    XCTAssertEqual(ticker.visibleText, "CRA")
  }

  func testHoldsAMessageAfterRevealingItSoItCanBeRead() {
    var ticker = MessageTicker(text: "TARG", charactersPerSecond: 4, holdSeconds: 1)

    ticker.advance(by: 0.5)
    XCTAssertFalse(ticker.isRevealed)

    ticker.advance(by: 0.5)
    XCTAssertEqual(ticker.visibleText, "TARG")
    XCTAssertTrue(ticker.isRevealed)
    XCTAssertFalse(ticker.isFinished, "a revealed message is still being read")

    ticker.advance(by: 1.0)
    XCTAssertTrue(ticker.isFinished)
  }

  func testNeverRunsPastTheEnd() {
    var ticker = MessageTicker(text: "AB", charactersPerSecond: 100)

    ticker.advance(by: 10)

    XCTAssertEqual(ticker.visibleText, "AB")
    XCTAssertTrue(ticker.isFinished)
  }

  func testAFasterRateShowsMoreInTheSameTime() {
    var slow = MessageTicker(text: "CRASH LANDED", charactersPerSecond: 2)
    var fast = MessageTicker(text: "CRASH LANDED", charactersPerSecond: 8)

    slow.advance(by: 1)
    fast.advance(by: 1)

    XCTAssertLessThan(slow.visibleText.count, fast.visibleText.count)
  }

  func testABlankLineDoesNotHoldTheScriptUp() {
    let ticker = MessageTicker(text: "")

    XCTAssertTrue(ticker.isFinished)
    XCTAssertEqual(ticker.visibleText, "")
  }

  func testSkippingRevealsTheRest() {
    var ticker = MessageTicker(text: "MESSAGE ENDS", charactersPerSecond: 2)

    ticker.advance(by: 0.5)
    ticker.finish()

    XCTAssertTrue(ticker.isFinished)
    XCTAssertEqual(ticker.visibleText, "MESSAGE ENDS")
  }

  func testTheIntervalPlayStartsWithGivesTheReferenceRate() {
    XCTAssertEqual(
      MessageTicker.rate(forInterval: BensonHostState.defaultMessageInterval),
      MessageTicker.referenceRate,
      accuracy: 0.0001
    )
  }

  func testAScriptSlowingTheIntervalSlowsTheLine() {
    // The endgame asks for a longer interval, and means a slower crawl.
    XCTAssertLessThan(
      MessageTicker.rate(forInterval: 150),
      MessageTicker.rate(forInterval: BensonHostState.defaultMessageInterval)
    )
    XCTAssertGreaterThan(
      MessageTicker.rate(forInterval: 60),
      MessageTicker.rate(forInterval: BensonHostState.defaultMessageInterval)
    )
  }

  func testAnImpossibleIntervalFallsBackToTheReferenceRate() {
    XCTAssertEqual(MessageTicker.rate(forInterval: 0), MessageTicker.referenceRate)
  }
}
