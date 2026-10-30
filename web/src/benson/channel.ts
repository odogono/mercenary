/// The live Benson Display and Host Callout. Talk Scripts own game logic, and
/// the Gameplay Session owns the random stream; the display is paced in
/// seconds (ADR 0083). This module loads no Benson program.
import type { BensonSaveSnapshot } from '../session/save.ts';
import { NO_SUBSTITUTIONS, type TextTable } from '../text/index.ts';
import { BensonDisplay, type BensonPacing } from './display.ts';
import { BensonHostState, type BensonEffect } from './host.ts';
import type { BensonKey } from './key.ts';

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

export type BensonMessageMode = 'authentic' | 'legacyOracle';

/// Only a historical comparison adapter supplies this seam. Live play has no
/// interpreter and never handles the payload's old script ids.
export interface BensonReference {
  readonly isRunning: boolean;
  press(key: BensonKey | undefined): void;
  refusing: ReadonlySet<number>;
  readonly running: number | undefined;
  start(script: number): boolean;
  readonly state: {
    readonly callStack: readonly number[];
    readonly pc: number | undefined;
  };
  stop(): void;
}

/// Both the live channel and the test oracle supply the same display and host.
export type BensonPort = Pick<BensonChannel, keyof BensonChannel>;

export class BensonChannel {
  readonly reference?: BensonReference;
  readonly messageMode: BensonMessageMode = 'authentic';
  host: BensonHostState;
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
    // The credits a new game opens with, which the Gameplay Session takes over.
    this.host = new BensonHostState().withDecimal(
      BensonHostState.firstNumberDecimal,
      9000
    );
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
        this.host = this.host.with({ messagePlaying: false });
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
    this.host = this.host.with({ messagePlaying: true });
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
    const { host } = this;
    return {
      activeMessageText:
        this.messageOccurrence === undefined
          ? null
          : (this.completeMessage ?? null),
      display: this.display.captureSaveSnapshot(),
      host: {
        boardedCraft: host.boardedCraft,
        currentRoom: host.currentRoom,
        messageInterval: host.messageInterval,
        messagePlaying: host.messagePlaying
      },
      messageWaitSeconds: this.messageWaitSeconds ?? null
    };
  }

  restore(snapshot: BensonSaveSnapshot): BensonPort {
    const channel = new BensonChannel(this.text, this.pacing);
    // Credits, the Ending and the ships are the session's, and it projects
    // them back; Talk's own continuation is restored separately.
    channel.host = new BensonHostState(snapshot.host);
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
