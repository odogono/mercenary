import { codePointCount } from '../../src/benson/text.ts';
import { BensonHostState } from './host.ts';

/// The message line, revealed a character at a time.
export class MessageTicker {
  static readonly referenceRate = 2;
  static readonly referenceHold = 3;

  readonly text: string;
  charactersPerSecond: number;
  holdSeconds: number;
  revealed: number;
  private readonly codePoints: number;
  private held: number;

  constructor(
    text: string,
    charactersPerSecond = MessageTicker.referenceRate,
    holdSeconds = MessageTicker.referenceHold
  ) {
    this.text = text;
    this.codePoints = codePointCount(text);
    this.charactersPerSecond = Math.max(0, charactersPerSecond);
    this.holdSeconds = this.codePoints === 0 ? 0 : Math.max(0, holdSeconds);
    this.revealed = 0;
    this.held = 0;
  }

  static rate(
    interval: number,
    base = MessageTicker.referenceRate,
    reference = BensonHostState.defaultMessageInterval
  ): number {
    if (interval <= 0 || reference <= 0) {
      return base;
    }
    return (base * reference) / interval;
  }

  advance(seconds: number): void {
    if (seconds <= 0) {
      return;
    }
    this.revealed = Math.min(
      this.codePoints,
      this.revealed + this.charactersPerSecond * seconds
    );
    if (this.isRevealed) {
      this.held += seconds;
    }
  }

  get visibleText(): string {
    const count = Math.min(this.codePoints, Math.trunc(this.revealed));
    let out = '';
    let taken = 0;
    for (const point of this.text) {
      if (taken >= count) {
        break;
      }
      out += point;
      taken += 1;
    }
    return out;
  }

  get isRevealed(): boolean {
    return this.revealed >= this.codePoints;
  }

  get isFinished(): boolean {
    return this.isRevealed && this.held >= this.holdSeconds;
  }

  finish(): void {
    this.revealed = this.codePoints;
    this.held = this.holdSeconds;
  }

  /// Test-only continuation state for the frozen progressive replay oracle.
  get holdProgress(): number {
    return this.held;
  }

  restoreProgress(revealed: number, held: number): void {
    this.revealed = revealed;
    this.held = held;
  }
}
