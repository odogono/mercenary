import Foundation

/// The message line, revealed a character at a time.
///
/// The Reference Build scrolled its comms line rather than printing it, and its
/// interpreter could not advance while a message was in progress — so this pace
/// is the opening sequence's pace, not decoration. The rate is a tunable because
/// the original's was a raster-interrupt tally rather than a chosen speed, and
/// scripts retime it themselves (the endgame slows it right down).
public struct MessageTicker: Sendable, Equatable {
  public let text: String
  public var charactersPerSecond: Double
  /// Characters revealed so far, fractional between steps.
  public var revealed: Double
  /// How long a fully revealed message stays up before the script moves on.
  ///
  /// The Reference Build held a message after it had finished scrolling — its
  /// interpreter stayed blocked for many more intervals — and without that pause
  /// the last message of a run is replaced on the very frame it completes, which
  /// reads as a flicker rather than as something said.
  public var holdSeconds: Double
  private var held: Double = 0

  /// Characters per second a conditioned Reference Build advances at.
  public static let referenceRate: Double = 2
  /// How long a revealed message is left up to be read. Unlike the reveal rate
  /// this is not the Reference Build's number scaled — it is a reading pause, and
  /// reading speed belongs to the reader rather than to the original's clock.
  public static let referenceHold: Double = 3

  public init(
    text: String,
    charactersPerSecond: Double = Self.referenceRate,
    holdSeconds: Double = Self.referenceHold
  ) {
    self.text = text
    self.charactersPerSecond = max(0, charactersPerSecond)
    // A blank line is a separator between messages rather than something to
    // read, so it does not hold the script up.
    self.holdSeconds = text.isEmpty ? 0 : max(0, holdSeconds)
    self.revealed = 0
  }

  /// The rate implied by a message interval a script has written.
  ///
  /// Scripts retime the message line by writing the engine's interval, and what
  /// they mean by it is relative: the endgame asks for a slower crawl than the
  /// one play starts with. That relationship is honoured here, while the rate it
  /// is relative to stays ours — the Reference Build's interval counted raster
  /// interrupts against a scroll whose granularity is not settled, so adopting
  /// its number outright would be a guess dressed as fidelity.
  public static func rate(
    forInterval interval: Int,
    base: Double = referenceRate,
    reference: Int = BensonHostState.defaultMessageInterval
  ) -> Double {
    guard interval > 0, reference > 0 else { return base }
    return base * Double(reference) / Double(interval)
  }

  public mutating func advance(by seconds: Double) {
    guard seconds > 0 else { return }
    revealed = min(Double(text.count), revealed + charactersPerSecond * seconds)
    if isRevealed { held += seconds }
  }

  public var visibleText: String {
    let count = min(text.count, Int(revealed))
    return String(text.prefix(count))
  }

  /// Every character is on screen.
  public var isRevealed: Bool { revealed >= Double(text.count) }

  /// Revealed, and held long enough to read.
  public var isFinished: Bool { isRevealed && held >= holdSeconds }

  /// Show the rest and drop the hold, for a player who does not want to wait.
  public mutating func finish() {
    revealed = Double(text.count)
    held = holdSeconds
  }
}
