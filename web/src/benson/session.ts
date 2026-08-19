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
    return nextRandom(this.state);
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
    this.host.engineFlags =
      (this.host.engineFlags | BensonHostState.inputDetected) & 0xff;
    if (key !== undefined) {
      this.host.pendingKey = key;
    }
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
        this.host.messagePlaying = false;
      }
    }

    this.frames +=
      seconds * this.tunables.framesPerSecond * this.tunables.timeScale;
    const framesPerTick = Math.max(1, this.tunables.framesPerTick);
    while (this.frames >= framesPerTick) {
      this.frames -= framesPerTick;
      this.host.tickCounter += 1;
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
    this.host.boardedCraft = craft;
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
    this.host.messagePlaying = true;
  }

  showMessage(index: number): void {
    const composed = this.text.message(index, messageSubstitutions(this.host));
    if (composed === undefined) {
      return;
    }
    this.showText(composed);
  }

  get hostState(): BensonHostState {
    return this.host;
  }

  set hostState(value: BensonHostState) {
    this.host = value;
  }
}
