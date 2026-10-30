/// The live Benson Display and Host Callout, with the world's shared random
/// stream. Talk Scripts own game logic; this module loads no Benson program.
/// Schema 14's empty continuation fields are retained solely for old Saves.
import {
  decodeRandomState,
  encodeRandomState,
  type BensonSaveSnapshot
} from '../session/save.ts';
import { NO_SUBSTITUTIONS, type TextTable } from '../text/index.ts';
import { BensonDisplay } from './display.ts';
import { BensonHostState, type BensonEffect } from './host.ts';
import type { BensonKey } from './key.ts';
import { DEFAULT_SESSION_SEED, randomByte } from './random.ts';
import { defaultTunables, type BensonTunables } from './tuning.ts';

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
  randomState: bigint;
  private frames = 0;
  private readonly idleDisplayOccurrence = {};
  private messageOccurrence: object | undefined;
  private completeMessage: string | undefined;

  constructor(
    readonly text: TextTable,
    public tunables: BensonTunables = defaultTunables(),
    randomSeed = DEFAULT_SESSION_SEED
  ) {
    this.randomState = randomSeed;
    this.host = new BensonHostState().withDecimal(
      BensonHostState.firstNumberDecimal,
      9000
    );
    this.display = new BensonDisplay(
      tunables.framesPerSecond,
      tunables.timeScale,
      tunables.messageHoldSeconds
    );
  }

  nextRandomByte(): number {
    const next = randomByte(this.randomState);
    this.randomState = next.state;
    return next.byte;
  }

  get credits(): number {
    return this.host.decimal(BensonHostState.firstNumberDecimal);
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
    // The fraction of a tick left over is saved, so the clock runs on after a restore.
    this.frames +=
      seconds * this.tunables.framesPerSecond * this.tunables.timeScale;
    const framesPerTick = Math.max(1, this.tunables.framesPerTick);
    const ticks = Math.floor(this.frames / framesPerTick);
    this.frames -= ticks * framesPerTick;
    this.host = this.host.with({ tickCounter: this.host.tickCounter + ticks });
    return [];
  }

  showText(composed: string, source = composed): void {
    this.completeMessage = composed;
    this.display.start(source, this.host.messageInterval);
    this.messageOccurrence = {};
    this.host = this.host.with({ messagePlaying: true });
  }

  showMessage(index: number): void {
    const substitutions = {
      numbers: this.host.numberSubstitutions(),
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
      frames: this.frames,
      host: {
        attackingShip: host.attackingShip,
        boardedCraft: host.boardedCraft,
        canLiftAnything: host.canLiftAnything,
        canTakeAnything: host.canTakeAnything,
        currentRoom: host.currentRoom,
        decimals: [...host.decimals],
        endingPhase: host.endingPhase,
        engineFlags: host.engineFlags,
        messageInterval: host.messageInterval,
        messagePlaying: host.messagePlaying,
        pendingKey: null,
        shipInbound: host.shipInbound,
        signedRegister: host.signedRegister,
        tickCounter: host.tickCounter
      },
      script: null,
      state: {
        callStack: [],
        pc: null,
        randomState: encodeRandomState(this.randomState),
        registers: Array.from({ length: 16 }, () => 0),
        resumeAfterTick: null
      }
    };
  }

  restore(snapshot: BensonSaveSnapshot): BensonPort {
    if (snapshot.frames >= Math.max(1, this.tunables.framesPerTick)) {
      throw new Error(
        `Save Snapshot fractional script timing ${snapshot.frames} is outside its tick`
      );
    }
    const channel = new BensonChannel(
      this.text,
      this.tunables,
      decodeRandomState(snapshot.state.randomState)
    );
    // Old interpreter continuations are retired. World flags, credits and the
    // display survive; Talk's own continuation is restored separately.
    channel.host = new BensonHostState({
      ...snapshot.host,
      engineFlags: snapshot.host.engineFlags & ~0xc0,
      pendingKey: undefined
    });
    channel.frames = snapshot.frames;
    channel.display = BensonDisplay.restore(
      snapshot.display,
      this.tunables.framesPerSecond,
      this.tunables.timeScale,
      this.tunables.messageHoldSeconds
    );
    channel.messageOccurrence =
      snapshot.display.activeSourceText === null ? undefined : {};
    channel.completeMessage = snapshot.activeMessageText ?? undefined;
    return channel;
  }
}
