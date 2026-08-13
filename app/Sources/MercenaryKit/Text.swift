import Foundation

extension Payload {
  /// The decoded word dictionary and message set.
  public struct TextDocument: Codable, Sendable, Equatable {
    public struct Word: Codable, Sendable, Equatable {
      public var index: Int
      public var text: String
      public var suffix: Bool
      public var unused: Bool
    }

    /// One element of a message. `kind` distinguishes a dictionary word from an
    /// inline literal, an extra space, and the two runtime-filled slots.
    public struct Token: Codable, Sendable, Equatable {
      public var kind: String
      public var word: Int?
      public var text: String?
      public var slot: Int?
    }

    public struct Message: Codable, Sendable, Equatable {
      public var index: Int
      public var tokens: [Token]
      /// Pre-composed text with `{word0}` / `{number0}` placeholders left in.
      public var text: String
    }

    public var schemaVersion: Int
    public var words: [Word]
    public var messages: [Message]
    public var unresolvedCodes: [String]
    public var counts: [String: Int]
  }
}

/// Renders decoded messages, filling the slots the Reference Build fills at runtime.
///
/// The engine composed a message by emitting one character at a time, inserting a
/// space whenever no word was in progress — which is why a suffix word joins the
/// preceding word directly. That rule is reproduced here rather than relying on the
/// pre-composed string, so substitutions can be filled in properly.
public struct TextTable: Sendable, Equatable {
  public struct Substitutions: Sendable, Equatable {
    /// Values for the `number` slots, such as a credit balance.
    public var numbers: [Int: Int]
    /// Word indices overriding the `substitution` slots.
    public var words: [Int: Int]

    public static let none = Substitutions(numbers: [:], words: [:])

    public init(numbers: [Int: Int] = [:], words: [Int: Int] = [:]) {
      self.numbers = numbers
      self.words = words
    }
  }

  public let words: [Payload.TextDocument.Word]
  public let messages: [Payload.TextDocument.Message]
  public let unresolvedCodes: [String]

  public init(document: Payload.TextDocument) {
    self.words = document.words
    self.messages = document.messages
    self.unresolvedCodes = document.unresolvedCodes
  }

  public var messageCount: Int { messages.count }

  public func word(_ index: Int) -> String {
    words.indices.contains(index) ? words[index].text : ""
  }

  /// Compose message `index`, or nil when there is no such message.
  public func message(_ index: Int, substituting values: Substitutions = .none) -> String? {
    guard messages.indices.contains(index) else { return nil }
    return compose(messages[index], substituting: values)
  }

  public func compose(
    _ message: Payload.TextDocument.Message, substituting values: Substitutions = .none
  ) -> String {
    var out = ""
    for token in message.tokens {
      switch token.kind {
      case "word":
        guard let index = token.word, words.indices.contains(index) else { continue }
        let entry = words[index]
        out += entry.suffix ? entry.text : " " + entry.text
      case "literal":
        out += " " + (token.text ?? "")
      case "space":
        out += " "
      case "substitution":
        let replacement = token.slot.flatMap { values.words[$0] } ?? token.word
        out += " " + (replacement.map(word) ?? "")
      case "number":
        let value = token.slot.flatMap { values.numbers[$0] }
        out += " " + (value.map(String.init) ?? "0")
      default:
        continue
      }
    }
    return out.split(separator: " ").joined(separator: " ")
  }
}
