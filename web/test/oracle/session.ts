import { BensonDisplay, type BensonPacing } from '../../src/benson/display.ts';
import { BensonHostState, type BensonEffect } from '../../src/benson/host.ts';
import { MessageTicker, codePointCount } from '../../src/benson/ticker.ts';
import type { Description as InteractionDescription } from '../../src/interaction/index.ts';
import { type BensonSaveSnapshot } from '../../src/session/save.ts';
import type { TextTable } from '../../src/text/index.ts';
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
import { waitSecondsFor } from './tuning.ts';

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
  readonly soundCharacter?: string;
}

export type BensonMessageMode = 'authentic' | 'legacyOracle';

/// One running Benson Script, its host state, and the message line it drives.
export class BensonOracle {
  readonly program: BensonProgram;
  readonly text: TextTable;
  tunables: BensonTunables;
  readonly messageMode: BensonMessageMode;
  state: BensonState;
  host: BensonHostState;
  ticker: MessageTicker | undefined;
  display: BensonDisplay;
  /// Live play's: the oracle paces its display from the message interval.
  messageWaitSeconds: number | undefined;
  private frames = 0;
  private readonly idleDisplayOccurrence = {};
  private messageOccurrence: object | undefined;
  private completeMessage: string | undefined;
  /// The Benson Script last started, which is the one running while any is.
  private started: number | undefined;

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
    this.display = new BensonDisplay(this.tunables.messageHoldSeconds);
  }

  /// The live channel's pacing, as the oracle's frame tunables give it.
  get pacing(): BensonPacing {
    return {
      holdSeconds: this.tunables.messageHoldSeconds,
      waitSeconds: waitSecondsFor(this.host.messageInterval, this.tunables)
    };
  }

  readonly reference = this;
  get randomState(): bigint {
    return this.state.randomState;
  }
  set randomState(value: bigint) {
    this.state = this.state.with({ randomState: value });
  }
  restore(snapshot: BensonSaveSnapshot): BensonOracle {
    return BensonOracle.restore(
      this.program,
      this.text,
      this.tunables,
      snapshot,
      this.messageMode
    );
  }

  nextRandomByte(): number {
    const rolled = nextRandom(this.state);
    this.state = rolled.state;
    return rolled.byte;
  }

  /// Benson Scripts a Talk Script replaces (ADR 0080): asked to start, Benson
  /// refuses them as it refuses a start while a script runs.
  refusing: ReadonlySet<number> = new Set();

  start(script: number): boolean {
    if (this.refusing.has(script)) {
      return false;
    }
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
    this.started = script;
    return true;
  }

  /// The Benson Script running, by id.
  get running(): number | undefined {
    return this.isRunning ? this.started : undefined;
  }

  /// Ends the running Benson Script where it stands. A line it is showing
  /// plays on.
  stop(): void {
    this.state = new BensonState({
      callStack: [],
      pc: undefined,
      randomState: this.state.randomState,
      registers: this.state.registers,
      resumeAfterTick: undefined
    });
    this.host = this.host.with({
      engineFlags: this.host.engineFlags & ~BensonHostState.scriptRunning & 0xff
    });
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
      : this.display.readingText(this.completeMessage);
  }

  get activeMessageText(): string | undefined {
    if (this.messageOccurrence === undefined) {
      return undefined;
    }
    return this.messageMode === 'legacyOracle'
      ? this.ticker?.text
      : this.completeMessage;
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
      // The script continues once the reading hold has passed; the row's departure is
      // presentation that runs alongside whatever the script does next.
      if (this.display.isReleased) {
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
        this.beginMessage(effect.playMessage, effect.displaySource);
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

  private beginMessage(composed: string, displaySource = composed): void {
    this.completeMessage = composed;
    if (this.messageMode === 'legacyOracle') {
      this.ticker = new MessageTicker(
        composed,
        MessageTicker.rate(this.host.messageInterval) * this.tunables.timeScale,
        this.tunables.messageHoldSeconds
      );
    } else {
      this.ticker = undefined;
      this.display.start(
        displaySource,
        waitSecondsFor(this.host.messageInterval, this.tunables)
      );
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
    this.beginMessage(
      composed,
      this.text.messageForDisplay(index, messageSubstitutions(this.host))
    );
    this.host = this.host.with({ messagePlaying: true });
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
      activeMessageText:
        this.messageOccurrence === undefined
          ? null
          : (this.completeMessage ?? null),
      display:
        this.legacyDisplaySnapshot() ?? this.display.captureSaveSnapshot(),
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
      // A Save holds no Benson Script continuation or random state: a running
      // script is lost, and the interpreter's stream starts again from its seed.
      messageWaitSeconds: null
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
      phaseSeconds: this.ticker.isRevealed
        ? 0
        : revealed - Math.trunc(revealed),
      readingHoldProgress: this.ticker.holdProgress,
      restedIntact: false,
      shifts: this.ticker.isRevealed
        ? BensonDisplay.burstShifts
        : Math.min(BensonDisplay.burstShifts - 1, Math.trunc(revealed)),
      sourceIndex: Math.trunc(revealed),
      waitSeconds: waitSecondsFor(this.host.messageInterval, this.tunables)
    };
  }

  static restore(
    program: BensonProgram,
    text: TextTable,
    tunables: BensonTunables,
    snapshot: BensonSaveSnapshot,
    messageMode: BensonMessageMode = 'authentic'
  ): BensonOracle {
    // A Save holds no tick remainder: the oracle's clock starts its tick again.
    const session = new BensonOracle(
      program,
      text,
      tunables,
      DEFAULT_SESSION_SEED,
      messageMode
    );
    // The Site Ledger is the session's, and it republishes it after restoring,
    // so the host starts with nothing destroyed rather than a second copy.
    session.host = new BensonHostState({
      ...snapshot.host,
      pendingKey: snapshot.host.pendingKey ?? undefined
    });
    session.display = BensonDisplay.restore(
      snapshot.display,
      tunables.messageHoldSeconds
    );
    session.messageOccurrence =
      snapshot.display.activeSourceText === null ? undefined : {};
    session.completeMessage = snapshot.activeMessageText ?? undefined;
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
        snapshot.display.sourceIndex + snapshot.display.phaseSeconds,
        snapshot.display.readingHoldProgress
      );
    }
    return session;
  }
}

export { BensonOracle as BensonSession };
