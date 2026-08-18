import type { Message, TextDocument, Token, Word } from "../payload/documents.ts"

/// Rendering a decoded message, filling the slots the Reference Build filled at runtime.
///
/// The engine composed a message one character at a time, inserting a space whenever no word
/// was in progress — which is why a suffix word joins the word before it directly. That rule is
/// reproduced here rather than read off the pre-composed string, because a substitution has to
/// be filled in properly and the pre-composed text still carries its placeholders.

export interface Substitutions {
  /// Values for the `number` slots, such as a credit balance.
  readonly numbers: Readonly<Record<number, number>>
  /// Word indices overriding the `substitution` slots.
  readonly words: Readonly<Record<number, number>>
}

export const NO_SUBSTITUTIONS: Substitutions = { numbers: {}, words: {} }

export class TextTable {
  readonly words: readonly Word[]
  readonly messages: readonly Message[]
  readonly unresolvedCodes: readonly string[]

  constructor(document: TextDocument) {
    this.words = document.words
    this.messages = document.messages
    this.unresolvedCodes = document.unresolvedCodes
  }

  get messageCount(): number {
    return this.messages.length
  }

  word(index: number): string {
    return this.words[index]?.text ?? ""
  }

  /// Compose message `index`, or undefined when there is no such message.
  message(index: number, values: Substitutions = NO_SUBSTITUTIONS): string | undefined {
    const message = this.messages[index]
    if (message === undefined) return undefined
    return this.compose(message.tokens, values)
  }

  /// Compose a bare token stream.
  ///
  /// Benson Scripts carry message text inside the instruction rather than in the table, in this
  /// same token vocabulary, which is why this takes tokens rather than a message.
  compose(
    tokens: readonly Token[],
    values: Substitutions = NO_SUBSTITUTIONS,
  ): string {
    let out = ""
    for (const token of tokens) {
      switch (token.kind) {
        case "word": {
          const index = token.word
          if (index === undefined) continue
          const entry = this.words[index]
          if (entry === undefined) continue
          out += entry.suffix ? entry.text : ` ${entry.text}`
          break
        }
        case "literal":
          out += ` ${token.text ?? ""}`
          break
        case "space":
          out += " "
          break
        case "substitution": {
          const override = token.slot === undefined ? undefined : values.words[token.slot]
          const replacement = override ?? token.word
          out += ` ${replacement === undefined ? "" : this.word(replacement)}`
          break
        }
        case "number": {
          const value = token.slot === undefined ? undefined : values.numbers[token.slot]
          out += ` ${value === undefined ? "0" : String(value)}`
          break
        }
        default:
          continue
      }
    }
    // Collapse the runs of spaces the character-at-a-time rule leaves behind, and drop the
    // leading one. Swift's `split(separator:)` discards empty subsequences, so the join is over
    // non-empty pieces only — an empty filter here, not a cosmetic trim.
    return out.split(" ").filter((piece) => piece.length > 0).join(" ")
  }
}
