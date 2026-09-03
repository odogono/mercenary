import type { Description as InteractionDescription } from '../interaction/index.ts';
import {
  decodeRandomState,
  encodeRandomState,
  type BensonSaveSnapshot
} from '../session/save.ts';
import type { TextTable } from '../text/index.ts';
import { BensonDisplay } from './display.ts';
import { BensonHostState, type BensonEffect } from './host.ts';
import {
  BensonMachine,
  BensonState,
  defaultTunables,
  messageSubstitutions,
  nextRandom,
  type BensonObserver,
  type BensonTunables
} from './machine.ts';
import type { BensonKey, BensonProgram } from './program.ts';
import { MessageTicker, codePointCount } from './ticker.ts';

/// Session construction uses this seed. A bare `BensonState` uses `BensonState.defaultSeed`.
export const DEFAULT_SESSION_SEED = 0x2c_69_2e_d8_1b_7f_0a_31n;

const sortedSet = (values: ReadonlySet<number>): number[] =>
  [...values].sort((a, b) => a - b);

export interface BensonMessagePresentation {
  readonly completedText?: string;
  readonly displayText: string;
  readonly occurrence: object;
  readonly reveal: {
    readonly complete: boolean;
    readonly progress: number;
  };
}

export type BensonMessageMode = 'authentic' | 'legacyOracle';

/// One running Benson Script, its host state, and the message line it drives.
export class BensonSession {
  readonly program: BensonProgram;
  readonly text: TextTable;
  tunables: BensonTunables;
  readonly messageMode: BensonMessageMode;
  state: BensonState;
  host: BensonHostState;
  ticker: MessageTicker | undefined;
  display: BensonDisplay;
  private frames = 0;
  private readonly idleDisplayOccurrence = {};
  private messageOccurrence: object | undefined;

  constructor(
    program: BensonProgram,
    text: TextTable,
    tunables?: BensonTunables,
    randomSeed: bigint = DEFAULT_SESSION_SEED,
    messageMode: BensonMessageMode = 'authentic'
  ) {
    this.program = program;
    this.text = text;
    this.tunables = tunables ?? defaultTunables(program.framesPerTick);
    this.messageMode = messageMode;
    this.state = new BensonState(randomSeed);
    this.host = BensonHostState.seeding(program);
    this.display = new BensonDisplay(
      this.tunables.framesPerSecond,
      this.tunables.timeScale,
      this.tunables.messageHoldSeconds
    );
  }

  nextRandomByte(): number {
    const rolled = nextRandom(this.state);
    this.state = rolled.state;
    return rolled.byte;
  }

  start(script: number): boolean {
    const started = BensonMachine.start(
      script,
      this.program,
      this.state,
      this.host
    );
    if (started === undefined) {
      return false;
    }
    this.state = started.state;
    this.host = started.host;
    return true;
  }

  press(key: BensonKey | undefined): void {
    // `pendingKey` is passed straight through: `with` keeps the field it already has when the
    // patch leaves it undefined, so a keyless press does not clear a held key. Clearing one is
    // `withoutPendingKey`, deliberately a different call.
    this.host = this.host.with({
      engineFlags:
        (this.host.engineFlags | BensonHostState.inputDetected) & 0xff,
      pendingKey: key
    });
  }

  get isRunning(): boolean {
    return this.host.isScriptRunning || this.state.isRunning;
  }

  get messageText(): string {
    return this.messageMode === 'legacyOracle'
      ? (this.ticker?.visibleText ?? '')
      : this.display.displayText;
  }

  get activeMessageText(): string | undefined {
    if (this.messageOccurrence === undefined) {
      return undefined;
    }
    return this.messageMode === 'legacyOracle'
      ? this.ticker?.text
      : this.display.text;
  }

  /// Immutable presentation facts without exposing either mutable display implementation.
  get messagePresentation(): BensonMessagePresentation | undefined {
    if (this.messageOccurrence === undefined) {
      return this.messageMode === 'legacyOracle'
        ? undefined
        : {
            displayText: this.display.displayText,
            occurrence: this.idleDisplayOccurrence,
            reveal: { complete: false, progress: 0 }
          };
    }
    if (this.messageMode === 'authentic') {
      return {
        ...(this.display.completedText === undefined
          ? {}
          : { completedText: this.display.completedText }),
        displayText: this.display.displayText,
        occurrence: this.messageOccurrence,
        reveal: {
          complete: this.display.isComplete,
          progress: this.display.progress
        }
      };
    }
    const ticker = this.ticker!;
    return {
      ...(ticker.isRevealed ? { completedText: ticker.text } : {}),
      displayText: ticker.visibleText,
      occurrence: this.messageOccurrence,
      reveal: {
        complete: ticker.isRevealed,
        progress: ticker.revealed
      }
    };
  }

  get isMessageComplete(): boolean {
    return (
      this.messageOccurrence === undefined ||
      (this.messageMode === 'legacyOracle'
        ? this.ticker!.isFinished
        : this.display.isFinished)
    );
  }

  skipMessage(): void {
    if (this.messageMode === 'legacyOracle') {
      this.ticker?.finish();
    } else {
      this.display.finish();
    }
  }

  advance(seconds: number, observer?: BensonObserver): BensonEffect[] {
    if (seconds <= 0) {
      return [];
    }

    if (this.messageMode === 'legacyOracle' && this.ticker !== undefined) {
      this.ticker.advance(seconds);
      if (this.ticker.isFinished) {
        this.host = this.host.with({ messagePlaying: false });
      }
    } else if (
      this.messageMode === 'authentic' &&
      this.messageOccurrence !== undefined
    ) {
      this.display.advance(seconds);
      if (this.display.isFinished) {
        this.host = this.host.with({ messagePlaying: false });
      }
    }

    this.frames +=
      seconds * this.tunables.framesPerSecond * this.tunables.timeScale;
    const framesPerTick = Math.max(1, this.tunables.framesPerTick);
    while (this.frames >= framesPerTick) {
      this.frames -= framesPerTick;
      this.host = this.host.with({
        tickCounter: this.host.tickCounter + 1
      });
    }

    const advance = BensonMachine.run(
      this.state,
      this.host,
      this.program,
      this.text,
      this.tunables,
      observer
    );
    this.state = advance.state;
    this.host = advance.host;

    const remaining: BensonEffect[] = [];
    for (const effect of advance.effects) {
      if (typeof effect === 'object' && 'playMessage' in effect) {
        this.beginMessage(effect.playMessage);
      } else {
        remaining.push(effect);
      }
    }
    return remaining;
  }

  get credits(): number {
    return this.host.decimal(BensonHostState.firstNumberDecimal);
  }

  board(craft: number): void {
    this.host = this.host.with({ boardedCraft: craft });
  }

  private beginMessage(composed: string): void {
    if (this.messageMode === 'legacyOracle') {
      this.ticker = new MessageTicker(
        composed,
        MessageTicker.rate(this.host.messageInterval) * this.tunables.timeScale,
        this.tunables.messageHoldSeconds
      );
    } else {
      this.ticker = undefined;
      this.display.start(composed, this.host.messageInterval);
    }
    this.messageOccurrence = {};
  }

  showText(composed: string): void {
    this.beginMessage(composed);
    this.host = this.host.with({ messagePlaying: true });
  }

  showMessage(index: number): void {
    const composed = this.text.message(index, messageSubstitutions(this.host));
    if (composed === undefined) {
      return;
    }
    this.showText(composed);
  }

  describe(description: InteractionDescription): void {
    switch (description.kind) {
      case 'none':
        break;
      case 'message':
        this.showMessage(description.index);
        break;
      case 'script':
        this.start(description.id);
        break;
    }
  }

  captureSaveSnapshot(): BensonSaveSnapshot {
    return {
      display:
        this.legacyDisplaySnapshot() ?? this.display.captureSaveSnapshot(),
      frames: this.frames,
      host: {
        attackingShip: this.host.attackingShip,
        boardedCraft: this.host.boardedCraft,
        canLiftAnything: this.host.canLiftAnything,
        canTakeAnything: this.host.canTakeAnything,
        currentRoom: this.host.currentRoom,
        decimals: [...this.host.decimals],
        endingPhase: this.host.endingPhase,
        engineFlags: this.host.engineFlags,
        messageInterval: this.host.messageInterval,
        messagePlaying: this.host.messagePlaying,
        pendingKey: this.host.pendingKey ?? null,
        shipInbound: this.host.shipInbound,
        signedRegister: this.host.signedRegister,
        tickCounter: this.host.tickCounter
      },
      state: {
        callStack: [...this.state.callStack],
        pc: this.state.pc ?? null,
        randomState: encodeRandomState(this.state.randomState),
        registers: [...this.state.registers],
        resumeAfterTick: this.state.resumeAfterTick ?? null
      }
    };
  }

  private legacyDisplaySnapshot(): BensonSaveSnapshot['display'] | undefined {
    if (this.messageMode !== 'legacyOracle' || this.ticker === undefined) {
      return undefined;
    }
    const visible = [...this.ticker.visibleText];
    const revealed = Math.min(
      codePointCount(this.ticker.text),
      this.ticker.revealed
    );
    const messageInterval = Math.max(26, this.host.messageInterval);
    return {
      activeSourceText: this.ticker.text,
      cells: Array.from(
        { length: BensonDisplay.width },
        (_, index) =>
          visible[visible.length - BensonDisplay.width + index] ?? ' '
      ),
      completionPhase: this.ticker.isFinished
        ? 'idle'
        : this.ticker.isRevealed
          ? 'readingHold'
          : 'source',
      cyclePosition: this.ticker.isRevealed
        ? messageInterval
        : Math.min(messageInterval - 1, Math.trunc(revealed)),
      fractionalFrameRemainder: revealed - Math.trunc(revealed),
      messageInterval,
      readingHoldProgress: this.ticker.holdProgress,
      sourceIndex: Math.trunc(revealed)
    };
  }

  static restore(
    program: BensonProgram,
    text: TextTable,
    tunables: BensonTunables,
    snapshot: BensonSaveSnapshot,
    messageMode: BensonMessageMode = 'authentic'
  ): BensonSession {
    const instructionCount = program.instructions.length;
    if (
      snapshot.state.pc !== null &&
      (snapshot.state.pc < 0 || snapshot.state.pc >= instructionCount)
    ) {
      throw new Error(
        `Save Snapshot program counter ${snapshot.state.pc} is outside the Benson program`
      );
    }
    for (const address of snapshot.state.callStack) {
      if (address < 0 || address > instructionCount) {
        throw new Error(
          `Save Snapshot call-stack address ${address} is outside the Benson program`
        );
      }
    }
    const framesPerTick = Math.max(1, tunables.framesPerTick);
    if (snapshot.frames >= framesPerTick) {
      throw new Error(
        `Save Snapshot fractional script timing ${snapshot.frames} is outside its tick`
      );
    }
    const session = new BensonSession(
      program,
      text,
      tunables,
      DEFAULT_SESSION_SEED,
      messageMode
    );
    session.state = new BensonState({
      callStack: snapshot.state.callStack,
      pc: snapshot.state.pc ?? undefined,
      randomState: decodeRandomState(snapshot.state.randomState),
      registers: snapshot.state.registers,
      resumeAfterTick: snapshot.state.resumeAfterTick ?? undefined
    });
    // The Site Ledger is the session's, and it republishes it after restoring,
    // so the host starts with nothing destroyed rather than a second copy.
    session.host = new BensonHostState({
      ...snapshot.host,
      pendingKey: snapshot.host.pendingKey ?? undefined
    });
    session.frames = snapshot.frames;
    session.display = BensonDisplay.restore(
      snapshot.display,
      tunables.framesPerSecond,
      tunables.timeScale,
      tunables.messageHoldSeconds
    );
    session.messageOccurrence =
      snapshot.display.activeSourceText === null ? undefined : {};
    if (
      messageMode === 'legacyOracle' &&
      snapshot.display.activeSourceText !== null
    ) {
      session.ticker = new MessageTicker(
        snapshot.display.activeSourceText,
        MessageTicker.rate(snapshot.host.messageInterval) * tunables.timeScale,
        tunables.messageHoldSeconds
      );
      session.ticker.restoreProgress(
        snapshot.display.sourceIndex +
          snapshot.display.fractionalFrameRemainder,
        snapshot.display.readingHoldProgress
      );
    }
    return session;
  }
}
