import type { BensonDisplaySaveSnapshot } from '../session/save.ts';
import { codePointCount } from './ticker.ts';

export type BensonDisplayPhase = 'feeding' | 'waiting' | 'holding' | 'finished';

const blankCell = (): string => ' ';

/// The Reference Build's session-persistent 23-cell communications display.
export class BensonDisplay {
  static readonly activeFrames = 25;
  static readonly width = 23;

  readonly framesPerSecond: number;
  readonly timeScale: number;
  readonly holdSeconds: number;
  private cells: string[] = Array.from(
    { length: BensonDisplay.width },
    blankCell
  );
  private source = '';
  private hasOccurrence = false;
  private sourcePoints: string[] = [];
  private sourceIndex = 0;
  private cyclePosition = 0;
  private cycleFrames = 26;
  private frameRemainder = 0;
  private holdProgress = 0;
  private phase: BensonDisplayPhase = 'finished';
  private exhausted = false;

  constructor(framesPerSecond = 50, timeScale = 1, holdSeconds = 3) {
    this.framesPerSecond = Math.max(1, framesPerSecond);
    this.timeScale = Math.max(0, timeScale);
    this.holdSeconds = Math.max(0, holdSeconds);
  }

  start(text: string, messageInterval: number): void {
    this.source = text;
    this.hasOccurrence = true;
    this.sourcePoints = [...text];
    this.sourceIndex = 0;
    this.cyclePosition = 0;
    this.cycleFrames = Math.max(26, Math.trunc(messageInterval));
    this.frameRemainder = 0;
    this.holdProgress = 0;
    this.phase = 'feeding';
    this.exhausted = false;
  }

  advance(seconds: number): void {
    if (seconds <= 0 || this.phase === 'finished') {
      return;
    }
    if (this.phase === 'holding') {
      this.advanceHold(seconds);
      return;
    }
    const rate = this.framesPerSecond * this.timeScale;
    if (rate <= 0) {
      return;
    }
    const initialRemainder = this.frameRemainder;
    const available = initialRemainder + seconds * rate;
    const frames = Math.floor(
      available + Number.EPSILON * Math.max(1, available)
    );
    let processed = 0;
    while (
      processed < frames &&
      (this.phase as BensonDisplayPhase) !== 'holding'
    ) {
      this.advanceFrame();
      processed += 1;
    }
    if ((this.phase as BensonDisplayPhase) === 'holding') {
      this.frameRemainder = 0;
      const consumed = Math.max(0, (processed - initialRemainder) / rate);
      this.advanceHold(Math.max(0, seconds - consumed));
    } else {
      this.frameRemainder = available - frames;
    }
  }

  private advanceFrame(): void {
    if (this.phase === 'waiting') {
      this.cyclePosition += 1;
      if (this.cyclePosition < this.cycleFrames) {
        return;
      }
      if (this.exhausted) {
        this.phase = 'holding';
        return;
      }
      this.cyclePosition = 0;
      this.phase = 'feeding';
    }
    this.shift();
    this.cyclePosition += 1;
    if (this.cyclePosition === BensonDisplay.activeFrames) {
      this.phase = 'waiting';
    }
  }

  private shift(): void {
    const next = this.sourcePoints[this.sourceIndex];
    if (next === undefined) {
      this.exhausted = true;
      this.cells = [...this.cells.slice(1), ' '];
      return;
    }
    this.sourceIndex += 1;
    this.cells = [...this.cells.slice(1), next];
  }

  private advanceHold(seconds: number): void {
    this.holdProgress = Math.min(this.holdSeconds, this.holdProgress + seconds);
    if (this.holdProgress >= this.holdSeconds) {
      this.phase = 'finished';
    }
  }

  finish(): void {
    while (this.phase === 'feeding' || this.phase === 'waiting') {
      this.advanceFrame();
    }
    this.holdProgress = this.holdSeconds;
    this.phase = 'finished';
    this.frameRemainder = 0;
  }

  get displayText(): string {
    return this.cells.join('');
  }

  get text(): string {
    return this.source;
  }

  get completedText(): string | undefined {
    return this.exhausted ? this.source : undefined;
  }

  get progress(): number {
    const count = codePointCount(this.source);
    return count === 0 ? 0 : this.sourceIndex;
  }

  get isComplete(): boolean {
    return this.exhausted;
  }

  get isFinished(): boolean {
    return this.phase === 'finished';
  }

  captureSaveSnapshot(): BensonDisplaySaveSnapshot {
    return {
      activeSourceText: this.hasOccurrence ? this.source : null,
      cells: [...this.cells],
      completionPhase:
        this.phase === 'finished'
          ? 'idle'
          : this.phase === 'holding'
            ? 'readingHold'
            : this.exhausted
              ? 'blankFeed'
              : 'source',
      cyclePosition: this.cyclePosition,
      fractionalFrameRemainder: this.frameRemainder,
      messageInterval: this.cycleFrames,
      readingHoldProgress: this.holdProgress,
      sourceIndex: this.sourceIndex
    };
  }

  static restore(
    snapshot: BensonDisplaySaveSnapshot,
    framesPerSecond: number,
    timeScale: number,
    holdSeconds: number
  ): BensonDisplay {
    const display = new BensonDisplay(framesPerSecond, timeScale, holdSeconds);
    display.cells = [...snapshot.cells];
    display.source = snapshot.activeSourceText ?? '';
    display.hasOccurrence = snapshot.activeSourceText !== null;
    display.sourcePoints = [...display.source];
    display.sourceIndex = snapshot.sourceIndex;
    display.cyclePosition = snapshot.cyclePosition;
    display.cycleFrames = snapshot.messageInterval;
    display.frameRemainder = snapshot.fractionalFrameRemainder;
    display.holdProgress = snapshot.readingHoldProgress;
    display.exhausted = snapshot.completionPhase !== 'source';
    display.phase =
      snapshot.completionPhase === 'idle'
        ? 'finished'
        : snapshot.completionPhase === 'readingHold'
          ? 'holding'
          : snapshot.cyclePosition < BensonDisplay.activeFrames
            ? 'feeding'
            : 'waiting';
    return display;
  }
}
