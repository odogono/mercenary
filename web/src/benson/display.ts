import type { BensonDisplaySaveSnapshot } from '../session/save.ts';
import { codePointCount } from './ticker.ts';

export type BensonDisplayPhase = 'feeding' | 'waiting' | 'holding' | 'finished';

const blankCell = (): string => ' ';

/// The Reference Build's session-persistent 23-cell communications display.
export class BensonDisplay {
  static readonly activeFrames = 25;
  static readonly maximumActiveTimeScale = 1;
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
    let remaining = seconds;
    while (remaining > 0 && (this.phase as BensonDisplayPhase) !== 'finished') {
      if (this.phase === 'holding') {
        this.advanceHold(remaining);
        return;
      }
      // Scaling the silent interval preserves the browser's script pacing. Scanout itself is
      // capped at the recovered 50 Hz: the gameplay scale of six otherwise turns a whole
      // message into an imperceptible four- or five-render-frame flash.
      const phaseScale =
        this.phase === 'feeding'
          ? Math.min(BensonDisplay.maximumActiveTimeScale, this.timeScale)
          : this.timeScale;
      const rate = this.framesPerSecond * phaseScale;
      if (rate <= 0) {
        return;
      }
      const initialRemainder = this.frameRemainder;
      const available = initialRemainder + remaining * rate;
      const frames = Math.floor(
        available + Number.EPSILON * Math.max(1, available) * 16
      );
      if (frames === 0) {
        this.frameRemainder = available;
        return;
      }
      const phaseBoundary =
        this.phase === 'feeding'
          ? BensonDisplay.activeFrames - this.cyclePosition
          : this.cycleFrames - this.cyclePosition;
      const processed = Math.min(frames, phaseBoundary);
      for (let frame = 0; frame < processed; frame += 1) {
        this.advanceFrame();
      }
      const consumed = Math.max(0, (processed - initialRemainder) / rate);
      remaining = Math.max(0, remaining - consumed);
      if (processed < phaseBoundary) {
        this.frameRemainder = Math.max(0, available - processed);
        return;
      }
      this.frameRemainder = 0;
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
        if (this.holdSeconds === 0) {
          this.phase = 'finished';
        }
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
    if (snapshot.readingHoldProgress > display.holdSeconds) {
      throw new Error(
        'Save Snapshot Benson reading-hold progress exceeds its configured hold'
      );
    }
    if (
      snapshot.completionPhase === 'readingHold' &&
      snapshot.readingHoldProgress >= display.holdSeconds
    ) {
      throw new Error(
        'Save Snapshot active Benson reading hold has already reached its configured hold'
      );
    }
    if (
      snapshot.completionPhase === 'idle' &&
      snapshot.activeSourceText !== null &&
      snapshot.readingHoldProgress !== display.holdSeconds
    ) {
      throw new Error(
        'Save Snapshot finished Benson message has incomplete reading-hold progress'
      );
    }
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
