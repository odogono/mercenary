/// The live Benson Display. Talk Scripts own game logic, and
/// the Gameplay Session owns the random stream; the display is paced in
/// seconds (ADR 0083). This module loads no Benson program.
import type { BensonSaveSnapshot } from '../session/save.ts';
import { NO_SUBSTITUTIONS, type TextTable } from '../text/index.ts';
import { BensonDisplay, type BensonPacing } from './display.ts';
import type { BensonEffect } from './effect.ts';

/// The game's pacing when settings name none.
export const DEFAULT_PACING: BensonPacing = {
  holdSeconds: 3,
  waitSeconds: 1 / 3
};

export interface BensonMessagePresentation {
  readonly completedText?: string;
  readonly displayText: string;
  readonly occurrence: object;
  readonly reveal: { readonly complete: boolean; readonly progress: number };
  readonly soundCharacter?: string;
}

/// The Benson Display as the Gameplay Session and Talk Scripts see it.
export type BensonPort = BensonChannel;

export class BensonChannel {
  /// Whether a message holds the display, until its reading hold is over.
  messagePlaying = false;
  display: BensonDisplay;
  /// The wait a Talk Script set for the messages that follow, if any.
  messageWaitSeconds: number | undefined;
  private readonly idleDisplayOccurrence = {};
  private messageOccurrence: object | undefined;
  private completeMessage: string | undefined;

  constructor(
    readonly text: TextTable,
    readonly pacing: BensonPacing = DEFAULT_PACING
  ) {
    this.display = new BensonDisplay(pacing.holdSeconds);
  }

  get messageText(): string {
    return this.display.readingText(this.completeMessage);
  }
  get activeMessageText(): string | undefined {
    return this.messageOccurrence === undefined
      ? undefined
      : this.completeMessage;
  }
  get isMessageComplete(): boolean {
    return this.messageOccurrence === undefined || this.display.isFinished;
  }

  get messagePresentation(): BensonMessagePresentation | undefined {
    if (this.messageOccurrence === undefined) {
      return {
        displayText: this.display.displayText,
        occurrence: this.idleDisplayOccurrence,
        reveal: { complete: false, progress: 0 }
      };
    }
    return {
      ...(this.display.soundCharacter === undefined
        ? {}
        : { soundCharacter: this.display.soundCharacter }),
      ...(!this.display.isComplete || this.completeMessage === undefined
        ? {}
        : { completedText: this.completeMessage }),
      displayText: this.display.readingText(this.completeMessage),
      occurrence: this.messageOccurrence,
      reveal: {
        complete: this.display.isComplete,
        progress: this.display.progress
      }
    };
  }

  skipMessage(): void {
    this.display.finish();
  }

  advance(seconds: number): BensonEffect[] {
    if (seconds <= 0) {
      return [];
    }
    if (this.messageOccurrence !== undefined) {
      this.display.advance(seconds);
      if (this.display.isReleased) {
        this.messagePlaying = false;
      }
    }
    return [];
  }

  showText(composed: string, source = composed): void {
    this.completeMessage = composed;
    this.display.start(
      source,
      this.messageWaitSeconds ?? this.pacing.waitSeconds
    );
    this.messageOccurrence = {};
    this.messagePlaying = true;
  }

  /// Composes a message whose first number is the session's credits; no other
  /// number slot is ever set in live play.
  showMessage(index: number, credits: number): void {
    const substitutions = {
      numbers: { 0: credits },
      words: NO_SUBSTITUTIONS.words
    };
    const composed = this.text.message(index, substitutions);
    if (composed !== undefined) {
      this.showText(
        composed,
        this.text.messageForDisplay(index, substitutions)
      );
    }
  }

  captureSaveSnapshot(): BensonSaveSnapshot {
    return {
      activeMessageText:
        this.messageOccurrence === undefined
          ? null
          : (this.completeMessage ?? null),
      display: this.display.captureSaveSnapshot(),
      messagePlaying: this.messagePlaying,
      messageWaitSeconds: this.messageWaitSeconds ?? null
    };
  }

  restore(snapshot: BensonSaveSnapshot): BensonChannel {
    const channel = new BensonChannel(this.text, this.pacing);
    // Talk's own continuation is restored separately.
    channel.messagePlaying = snapshot.messagePlaying;
    channel.messageWaitSeconds = snapshot.messageWaitSeconds ?? undefined;
    channel.display = BensonDisplay.restore(
      snapshot.display,
      this.pacing.holdSeconds
    );
    channel.messageOccurrence =
      snapshot.display.activeSourceText === null ? undefined : {};
    channel.completeMessage = snapshot.activeMessageText ?? undefined;
    return channel;
  }
}
