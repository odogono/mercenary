import type { Description as InteractionDescription } from '../interaction/index.ts';
import {
  decodeRandomState,
  encodeRandomState,
  type BensonSaveSnapshot
} from '../session/save.ts';
import type { TextTable } from '../text/index.ts';
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
import { MessageTicker } from './ticker.ts';

/// Session construction uses this seed. A bare `BensonState` uses `BensonState.defaultSeed`.
export const DEFAULT_SESSION_SEED = 0x2c_69_2e_d8_1b_7f_0a_31n;

const sortedSet = (values: ReadonlySet<number>): number[] =>
  [...values].sort((a, b) => a - b);

const sortedEntries = (
  values: ReadonlyMap<number, number>
): readonly (readonly [number, number])[] =>
  [...values.entries()].sort(([a], [b]) => a - b);

/// One running Benson Script, its host state, and the message line it drives.
export class BensonSession {
  readonly program: BensonProgram;
  readonly text: TextTable;
  tunables: BensonTunables;
  state: BensonState;
  host: BensonHostState;
  ticker: MessageTicker | undefined;
  private frames = 0;

  constructor(
    program: BensonProgram,
    text: TextTable,
    tunables?: BensonTunables,
    randomSeed: bigint = DEFAULT_SESSION_SEED
  ) {
    this.program = program;
    this.text = text;
    this.tunables = tunables ?? defaultTunables(program.framesPerTick);
    this.state = new BensonState(randomSeed);
    this.host = BensonHostState.seeding(program);
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
    return this.ticker?.visibleText ?? '';
  }

  get isMessageComplete(): boolean {
    return this.ticker?.isFinished ?? true;
  }

  skipMessage(): void {
    this.ticker?.finish();
  }

  advance(seconds: number, observer?: BensonObserver): BensonEffect[] {
    if (seconds <= 0) {
      return [];
    }

    if (this.ticker !== undefined) {
      this.ticker.advance(seconds);
      if (this.ticker.isFinished) {
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
    this.ticker = new MessageTicker(
      composed,
      MessageTicker.rate(
        this.host.messageInterval,
        this.tunables.messageCharactersPerSecond
      ) * this.tunables.timeScale,
      this.tunables.messageHoldSeconds
    );
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
      frames: this.frames,
      host: {
        attackingShip: this.host.attackingShip,
        boardedCraft: this.host.boardedCraft,
        canLiftAnything: this.host.canLiftAnything,
        canTakeAnything: this.host.canTakeAnything,
        currentRoom: this.host.currentRoom,
        decimals: [...this.host.decimals],
        destroyedBlocks: sortedSet(this.host.destroyedBlocks),
        engineFlags: this.host.engineFlags,
        gameComplete: this.host.gameComplete,
        inventory: sortedSet(this.host.inventory),
        messageInterval: this.host.messageInterval,
        messagePlaying: this.host.messagePlaying,
        objectFlags: sortedEntries(this.host.objectFlags),
        objectRooms: sortedEntries(this.host.objectRooms),
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
      },
      ticker: this.ticker?.captureSaveSnapshot() ?? null
    };
  }

  static restore(
    program: BensonProgram,
    text: TextTable,
    tunables: BensonTunables,
    snapshot: BensonSaveSnapshot
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
    const session = new BensonSession(program, text, tunables);
    session.state = new BensonState({
      callStack: snapshot.state.callStack,
      pc: snapshot.state.pc ?? undefined,
      randomState: decodeRandomState(snapshot.state.randomState),
      registers: snapshot.state.registers,
      resumeAfterTick: snapshot.state.resumeAfterTick ?? undefined
    });
    session.host = new BensonHostState({
      ...snapshot.host,
      destroyedBlocks: new Set(snapshot.host.destroyedBlocks),
      inventory: new Set(snapshot.host.inventory),
      objectFlags: new Map(snapshot.host.objectFlags),
      objectRooms: new Map(snapshot.host.objectRooms),
      pendingKey: snapshot.host.pendingKey ?? undefined
    });
    session.frames = snapshot.frames;
    session.ticker =
      snapshot.ticker === null
        ? undefined
        : MessageTicker.restore(snapshot.ticker);
    return session;
  }
}
