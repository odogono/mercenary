import Foundation

extension Payload {
  /// The Reference Build's game-logic programs, re-encoded by the export tool.
  ///
  /// Instructions are one flat list in the order they appeared in the original
  /// stream; every branch, jump, and call target is an index into it, and each
  /// script is an entry point rather than a separate program, because the
  /// original scripts share subroutines. Operands carry named symbols rather
  /// than machine addresses (ADR 0015), so nothing here needs a memory map to
  /// interpret.
  public struct BensonDocument: Codable, Sendable, Equatable {
    public struct Script: Codable, Sendable, Equatable {
      public var id: Int
      /// Index of the instruction this script starts at.
      public var entry: Int
    }

    /// Where control goes when a conditional's branch is taken.
    public struct Branch: Codable, Sendable, Equatable {
      /// `jmp` continues at the target; `call` returns afterwards.
      public var kind: String
      public var target: Int
    }

    /// One instruction. The fields present depend on `op`, which is why they are
    /// all optional — the same flat shape the text document's tokens use.
    public struct Instruction: Codable, Sendable, Equatable {
      public var op: String
      /// Inline message text, in the same token vocabulary as the message table.
      public var tokens: [TextDocument.Token]?
      public var target: Int?
      /// The outcome a conditional's branch fires on.
      public var branchOn: Bool?
      public var onTaken: Branch?
      public var symbol: String?
      public var key: String?
      public var mask: Int?
      /// `and` or `or`, for an object flag change.
      public var mode: String?
      public var register: Int?
      public var value: Int?
      /// Which message an indexed play selects: `immediate` or `register`.
      public var source: String?
      /// A register copy's operands, named apart from `source`/`target` because
      /// those fields already mean a selector kind and a branch destination.
      public var from: Int?
      public var to: Int?
      public var index: Int?
      public var base: Int?
      public var ticks: Int?
      public var craft: Int?
      public var decimal: Int?
      public var byte: Int?
      public var slot: Int?
      public var a: Int?
      public var b: Int?
      public var into: Int?
    }

    public var schemaVersion: Int
    public var scripts: [Script]
    public var instructions: [Instruction]
    /// Decimal registers the conditioned image starts play with, keyed by slot.
    /// Slot 8 is the bank balance; no script sets the opening one.
    public var decimalSeeds: [String: Int]
    /// Video frames per tick of the wait counter, which the app converts into
    /// its own clock.
    public var framesPerTick: Int
    public var counts: [String: Int]
  }
}
