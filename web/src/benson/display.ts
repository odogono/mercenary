import type { BensonDisplaySaveSnapshot } from '../session/save.ts';
import { codePointCount } from './ticker.ts';

export type BensonDisplayPhase = 'feeding' | 'waiting' | 'holding' | 'finished';

const blankCell = (): string => ' ';

/// The Reference Build's session-persistent 23-cell communications display.
///
/// A message's display source, padding words included, enters from the right in 25-shift
/// bursts separated by the silent `$E1` wait. At the first boundary after the last printable
/// character has arrived the row rests through its reading hold; the message is then released,
/// and the remaining padding and the emitter's trailing spaces carry the row off the left edge
/// while the script continues. `clearsAfterHold` keeps that departure; the shell's Arrival
/// Narration turns it off because it paces its own holds over a still row.
export class BensonDisplay {
  static readonly activeFrames = 25;
  static readonly maximumActiveTimeScale = 1;
  static readonly width = 23;

  readonly framesPerSecond: number;
  readonly timeScale: number;
  readonly holdSeconds: number;
  readonly clearsAfterHold: boolean;
  private cells: string[] = Array.from(
    { length: BensonDisplay.width },
    blankCell
  );
  private source = '';
  private hasOccurrence = false;
  private sourcePoints: string[] = [];
  /// One past the last printable source point; the reading hold waits for this much.
  private printableEnd = 0;
  private sourceIndex = 0;
  private cyclePosition = 0;
  private cycleFrames = 26;
  private frameRemainder = 0;
  private holdProgress = 0;
  private phase: BensonDisplayPhase = 'finished';
  private exhausted = false;
  /// True once the reading hold has passed and the row is leaving or has left.
  private released = false;
  /// Whether the complete spoken text has rested intact on the row at a burst boundary.
  private restedIntact = false;

  constructor(
    framesPerSecond = 50,
    timeScale = 1,
    holdSeconds = 3,
    clearsAfterHold = true
  ) {
    this.framesPerSecond = Math.max(1, framesPerSecond);
    this.timeScale = Math.max(0, timeScale);
    this.holdSeconds = Math.max(0, holdSeconds);
    this.clearsAfterHold = clearsAfterHold;
  }

  start(text: string, messageInterval: number): void {
    this.source = text;
    this.hasOccurrence = true;
    this.sourcePoints = [...text];
    this.printableEnd = BensonDisplay.printableEndOf(this.sourcePoints);
    this.sourceIndex = 0;
    this.cyclePosition = 0;
    this.cycleFrames = Math.max(26, Math.trunc(messageInterval));
    this.frameRemainder = 0;
    this.holdProgress = 0;
    this.phase = 'feeding';
    this.exhausted = false;
    this.released = false;
    this.restedIntact = false;
  }

  private static printableEndOf(points: readonly string[]): number {
    let end = points.length;
    while (end > 0 && points[end - 1] === ' ') {
      end -= 1;
    }
    return end;
  }

  advance(seconds: number): void {
    if (seconds <= 0 || this.phase === 'finished') {
      return;
    }
    let remaining = seconds;
    while (remaining > 0 && (this.phase as BensonDisplayPhase) !== 'finished') {
      if (this.phase === 'holding') {
        const used = Math.min(remaining, this.holdSeconds - this.holdProgress);
        this.advanceHold(used);
        remaining -= used;
        if ((this.phase as BensonDisplayPhase) === 'holding') {
          return;
        }
        continue;
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
      let processed = 0;
      while (processed < Math.min(frames, phaseBoundary)) {
        this.advanceFrame();
        processed += 1;
        if ((this.phase as BensonDisplayPhase) === 'finished') {
          break;
        }
      }
      const consumed = Math.max(0, (processed - initialRemainder) / rate);
      remaining = Math.max(0, remaining - consumed);
      if ((this.phase as BensonDisplayPhase) === 'finished') {
        this.frameRemainder = 0;
        return;
      }
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
      if (!this.released && this.sourceIndex >= this.printableEnd) {
        this.phase = 'holding';
        if (this.holdSeconds === 0) {
          this.endHold();
        }
        return;
      }
      this.cyclePosition = 0;
      this.phase = 'feeding';
    }
    this.shift();
    if ((this.phase as BensonDisplayPhase) === 'finished') {
      return;
    }
    this.cyclePosition += 1;
    if (this.cyclePosition === BensonDisplay.activeFrames) {
      this.phase = 'waiting';
      if (this.cells.join('').trim() === this.source.trim()) {
        this.restedIntact = true;
      }
    }
  }

  private shift(): void {
    const next = this.sourcePoints[this.sourceIndex];
    if (next === undefined) {
      this.exhausted = true;
      this.cells = [...this.cells.slice(1), ' '];
    } else {
      this.sourceIndex += 1;
      this.cells = [...this.cells.slice(1), next];
    }
    if (this.released && this.exhausted && this.isBlank) {
      this.settle();
    }
  }

  private get isBlank(): boolean {
    return this.cells.every(cell => cell === ' ');
  }

  private advanceHold(seconds: number): void {
    this.holdProgress = Math.min(this.holdSeconds, this.holdProgress + seconds);
    if (this.holdProgress >= this.holdSeconds) {
      this.endHold();
    }
  }

  /// The reading hold is over. Either leave the row where it is, or release the message so the
  /// next burst carries the row off the left edge, continuing from the intact reading view
  /// rather than from cells the blank feed already evicted.
  private endHold(): void {
    if (!this.clearsAfterHold) {
      this.phase = 'finished';
      return;
    }
    this.cells = [...this.readingCells()];
    this.released = true;
    this.cyclePosition = 0;
    this.frameRemainder = 0;
    this.phase = 'feeding';
    if (this.exhausted && this.isBlank) {
      this.settle();
    }
  }

  /// The row has left; rest at the interval boundary like any finished message.
  private settle(): void {
    this.cyclePosition = this.cycleFrames;
    this.frameRemainder = 0;
    this.phase = 'finished';
  }

  finish(): void {
    while (this.phase === 'feeding' || this.phase === 'waiting') {
      this.advanceFrame();
    }
    this.holdProgress = this.holdSeconds;
    if (this.phase === 'holding') {
      this.endHold();
    }
    while (
      (this.phase as BensonDisplayPhase) === 'feeding' ||
      (this.phase as BensonDisplayPhase) === 'waiting'
    ) {
      this.advanceFrame();
    }
    this.phase = 'finished';
    this.frameRemainder = 0;
  }

  get displayText(): string {
    return this.cells.join('');
  }

  /// The stable reading view of a complete fitting message.
  ///
  /// The recovered burst still feeds blanks after the source terminator, which can evict one
  /// or two printable cells from a nearly full line before it ever rests. Keep those authentic
  /// cells and timings as continuation state, but present the intact source during the reading
  /// hold when it fits in the aperture. A message that has already rested intact at a boundary
  /// is never substituted: its later eviction is the departure, not a defect.
  readingText(completedText: string | undefined): string {
    const cells = this.displayText;
    if (
      !this.exhausted ||
      this.released ||
      this.restedIntact ||
      completedText === undefined ||
      codePointCount(completedText) > BensonDisplay.width ||
      cells.trim() === completedText
    ) {
      return cells;
    }
    return this.readingCells().join('');
  }

  /// The intact source as the reading hold presents it, or the cells when the source cannot
  /// be presented intact.
  private readingCells(): readonly string[] {
    const source = this.sourcePoints;
    const spoken = this.source.trim();
    if (
      !this.exhausted ||
      this.restedIntact ||
      codePointCount(spoken) > BensonDisplay.width ||
      this.cells.join('').trim() === spoken
    ) {
      return this.cells;
    }
    return source.length > BensonDisplay.width
      ? source.slice(-BensonDisplay.width)
      : [
          ...source,
          ...Array.from(
            { length: BensonDisplay.width - source.length },
            blankCell
          )
        ];
  }

  get progress(): number {
    const count = codePointCount(this.source);
    return count === 0 ? 0 : this.sourceIndex;
  }

  get soundCharacter(): string | undefined {
    return this.phase === 'feeding' && this.cyclePosition > 0
      ? this.cells.at(-1)
      : undefined;
  }

  get isComplete(): boolean {
    return this.exhausted;
  }

  /// The reading hold has passed: the script may continue while the row departs.
  get isReleased(): boolean {
    return this.released || this.phase === 'finished';
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
            : this.released
              ? 'clearing'
              : this.exhausted
                ? 'blankFeed'
                : 'source',
      cyclePosition: this.cyclePosition,
      fractionalFrameRemainder: this.frameRemainder,
      messageInterval: this.cycleFrames,
      readingHoldProgress: this.holdProgress,
      restedIntact: this.restedIntact,
      sourceIndex: this.sourceIndex
    };
  }

  static restore(
    snapshot: BensonDisplaySaveSnapshot,
    framesPerSecond: number,
    timeScale: number,
    holdSeconds: number,
    clearsAfterHold = true
  ): BensonDisplay {
    const display = new BensonDisplay(
      framesPerSecond,
      timeScale,
      holdSeconds,
      clearsAfterHold
    );
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
      (snapshot.completionPhase === 'idle' ||
        snapshot.completionPhase === 'clearing') &&
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
    display.printableEnd = BensonDisplay.printableEndOf(display.sourcePoints);
    display.sourceIndex = snapshot.sourceIndex;
    display.cyclePosition = snapshot.cyclePosition;
    display.cycleFrames = snapshot.messageInterval;
    display.frameRemainder = snapshot.fractionalFrameRemainder;
    display.holdProgress = snapshot.readingHoldProgress;
    display.restedIntact = snapshot.restedIntact;
    display.exhausted =
      snapshot.completionPhase === 'blankFeed' ||
      snapshot.completionPhase === 'idle' ||
      snapshot.sourceIndex >= display.sourcePoints.length;
    display.released =
      snapshot.completionPhase === 'clearing' ||
      (snapshot.completionPhase === 'idle' &&
        snapshot.activeSourceText !== null &&
        display.clearsAfterHold);
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
