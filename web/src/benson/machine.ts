import {
  NO_SUBSTITUTIONS,
  type Substitutions,
  type TextTable
} from '../text/index.ts';
import { BensonHostState, type BensonEffect } from './host.ts';
import type { BensonProgram, Condition, Instruction } from './program.ts';

/// Pacing for the Benson interpreter.
export interface BensonTunables {
  framesPerSecond: number;
  framesPerTick: number;
  instructionBudget: number;
  messageCharactersPerSecond: number;
  messageHoldSeconds: number;
  timeScale: number;
}

export const defaultTunables = (framesPerTick = 50): BensonTunables => ({
  framesPerSecond: 50,
  framesPerTick,
  instructionBudget: 512,
  messageCharactersPerSecond: 2,
  messageHoldSeconds: 3,
  timeScale: 1
});

/// One script's execution state.
export class BensonState {
  static readonly registerCount = 16;
  static readonly mapRegister = 13;
  static readonly objectRegister = 14;
  static readonly roomRegister = 15;

  /// Direct `BensonState` construction uses this seed. `BensonSession` uses
  /// `DEFAULT_SESSION_SEED` instead — do not mix them (#94 owns stream sharing).
  static readonly defaultSeed = 0x9e_37_79_b9_7f_4a_7c_15n;

  callStack: number[];
  pc: number | undefined;
  randomState: bigint;
  registers: number[];
  resumeAfterTick: number | undefined;

  constructor(randomState: bigint = BensonState.defaultSeed) {
    this.pc = undefined;
    this.callStack = [];
    this.registers = Array.from({ length: BensonState.registerCount }, () => 0);
    this.randomState = randomState;
    this.resumeAfterTick = undefined;
  }

  get isRunning(): boolean {
    return this.pc !== undefined;
  }

  register(index: number): number {
    return this.registers[index] ?? 0;
  }

  get object(): number {
    return this.register(BensonState.objectRegister);
  }

  get room(): number {
    return this.register(BensonState.roomRegister);
  }

  get map(): number {
    return this.register(BensonState.mapRegister);
  }

  clone(): BensonState {
    const copy = new BensonState(this.randomState);
    copy.pc = this.pc;
    copy.callStack = this.callStack.slice();
    copy.registers = this.registers.slice();
    copy.resumeAfterTick = this.resumeAfterTick;
    return copy;
  }
}

/// SplitMix64-style generator, 64-bit via BigInt, output truncated to a byte.
///
/// Increment constant `0x9E3779B97F4A7C15` is also `BensonState.defaultSeed`.
const MASK64 = (1n << 64n) - 1n;
const INCREMENT = 0x9e_37_79_b9_7f_4a_7c_15n;
const MUL1 = 0xbf_58_47_6d_1c_e4_e5_b9n;
const MUL2 = 0x94_d0_49_bb_13_31_11_ebn;

export const nextRandom = (state: BensonState): number => {
  state.randomState = (state.randomState + INCREMENT) & MASK64;
  let z = state.randomState;
  z = ((z ^ (z >> 30n)) * MUL1) & MASK64;
  z = ((z ^ (z >> 27n)) * MUL2) & MASK64;
  return Number((z ^ (z >> 31n)) & 0xffn);
};

export interface BensonStep {
  readonly blocked: boolean;
  readonly effects: readonly BensonEffect[];
  readonly hostAfter: BensonHostState;
  readonly hostBefore: BensonHostState;
  readonly instruction: Instruction;
  readonly pc: number;
  readonly stateAfter: BensonState;
  readonly stateBefore: BensonState;
}

export type BensonObserver = (step: BensonStep) => void;

export interface Advance {
  readonly effects: readonly BensonEffect[];
  readonly executed: number;
  readonly host: BensonHostState;
  readonly state: BensonState;
}

const play = (
  message: string | undefined,
  pc: number,
  state: BensonState,
  host: BensonHostState,
  effects: BensonEffect[]
): 'advanced' | 'blocked' => {
  state.pc = pc + 1;
  if (message === undefined) {
    return 'advanced';
  }
  host.messagePlaying = true;
  effects.push({ playMessage: message });
  return 'blocked';
};

const decide = (
  answer: boolean,
  condition: Condition,
  pc: number,
  state: BensonState
): void => {
  if (answer !== condition.branchOn) {
    state.pc = pc + 1;
    return;
  }
  if ('jump' in condition.branch) {
    state.pc = condition.branch.jump;
    return;
  }
  state.callStack.push(pc + 1);
  state.pc = condition.branch.call;
};

export const messageSubstitutions = (host: BensonHostState): Substitutions => ({
  numbers: host.numberSubstitutions(),
  words: NO_SUBSTITUTIONS.words
});

const step = (
  instruction: Instruction,
  pc: number,
  state: BensonState,
  host: BensonHostState,
  text: TextTable,
  effects: BensonEffect[]
): 'advanced' | 'blocked' => {
  switch (instruction.op) {
    case 'msg':
      return play(
        text.compose(instruction.tokens, messageSubstitutions(host)),
        pc,
        state,
        host,
        effects
      );
    case 'msgi': {
      const index =
        'immediate' in instruction.source
          ? instruction.source.immediate
          : state.register(instruction.source.register);
      return play(
        text.message(index, messageSubstitutions(host)),
        pc,
        state,
        host,
        effects
      );
    }
    case 'msgr': {
      const index =
        instruction.base + (nextRandom(state) & (instruction.mask & 0xff));
      if (index === 0) {
        host.pendingKey = undefined;
        state.pc = pc + 1;
        return 'advanced';
      }
      return play(
        text.message(index, messageSubstitutions(host)),
        pc,
        state,
        host,
        effects
      );
    }
    case 'wfr': {
      if (state.resumeAfterTick === undefined) {
        state.resumeAfterTick = host.tickCounter + 1;
        return 'blocked';
      }
      if (host.tickCounter < state.resumeAfterTick) {
        return 'blocked';
      }
      state.resumeAfterTick = undefined;
      decide(
        host.tickCounter >= instruction.ticks,
        instruction.condition,
        pc,
        state
      );
      return 'advanced';
    }
    case 'cfr':
      host.tickCounter = 0;
      state.pc = pc + 1;
      return 'advanced';
    case 'tstk': {
      const matched = host.pendingKey === instruction.key;
      if (matched) {
        host.pendingKey = undefined;
        effects.push('keyAcknowledged');
      }
      decide(!matched, instruction.condition, pc, state);
      return 'advanced';
    }
    case 'clrk':
      host.pendingKey = undefined;
      state.pc = pc + 1;
      return 'advanced';
    case 'tstf':
      decide(
        (host.engineFlags & instruction.mask) === 0,
        instruction.condition,
        pc,
        state
      );
      return 'advanced';
    case 'setf':
      host.engineFlags = (host.engineFlags | instruction.mask) & 0xff;
      state.pc = pc + 1;
      return 'advanced';
    case 'clrf':
      host.engineFlags = host.engineFlags & ~instruction.mask & 0xff;
      state.pc = pc + 1;
      return 'advanced';
    case 'room':
      decide(state.room !== host.currentRoom, instruction.condition, pc, state);
      return 'advanced';
    case 'tsti':
      decide(
        host.inventory.has(state.object),
        instruction.condition,
        pc,
        state
      );
      return 'advanced';
    case 'inrm':
      decide(
        state.room !== host.objectRooms.get(state.object),
        instruction.condition,
        pc,
        state
      );
      return 'advanced';
    case 'tsto':
      decide(
        ((host.objectFlags.get(state.object) ?? 0) & instruction.mask) === 0,
        instruction.condition,
        pc,
        state
      );
      return 'advanced';
    case 'tstb':
      decide(
        !host.destroyedBlocks.has(state.map),
        instruction.condition,
        pc,
        state
      );
      return 'advanced';
    case 'tstc':
      decide(
        instruction.craft !== host.boardedCraft,
        instruction.condition,
        pc,
        state
      );
      return 'advanced';
    case 'rand':
      decide(
        instruction.value >= nextRandom(state),
        instruction.condition,
        pc,
        state
      );
      return 'advanced';
    case 'cmp':
      decide(
        instruction.value >= host.valueOf(instruction.symbol),
        instruction.condition,
        pc,
        state
      );
      return 'advanced';
    case 'ldr':
      if (
        instruction.decimal >= 0 &&
        instruction.decimal < host.decimals.length
      ) {
        host.decimals[instruction.decimal] = instruction.value;
      }
      state.pc = pc + 1;
      return 'advanced';
    case 'adr':
      host.addDecimal(instruction.decimal, instruction.value);
      state.pc = pc + 1;
      return 'advanced';
    case 'dadd':
      if (instruction.into >= 0 && instruction.into < host.decimals.length) {
        host.decimals[instruction.into] =
          (host.decimal(instruction.a) + host.decimal(instruction.b)) %
          BensonHostState.decimalLimit;
      }
      state.pc = pc + 1;
      return 'advanced';
    case 'loadi':
      if (
        instruction.register >= 0 &&
        instruction.register < state.registers.length
      ) {
        state.registers[instruction.register] = instruction.value;
      }
      state.pc = pc + 1;
      if (instruction.register === BensonState.mapRegister) {
        effects.push({ cityLocationChanged: instruction.value });
      }
      return 'advanced';
    case 'load': {
      const value = state.register(instruction.from);
      if (instruction.to >= 0 && instruction.to < state.registers.length) {
        state.registers[instruction.to] = value;
      }
      state.pc = pc + 1;
      if (instruction.to === BensonState.mapRegister) {
        effects.push({ cityLocationChanged: value });
      }
      return 'advanced';
    }
    case 'modf': {
      const existing = host.objectFlags.get(state.object) ?? 0;
      const next =
        instruction.mode === 'or'
          ? existing | instruction.mask
          : existing & instruction.mask;
      host.objectFlags.set(state.object, next & 0xff);
      state.pc = pc + 1;
      return 'advanced';
    }
    case 'stor':
      host.write(instruction.symbol, instruction.value);
      state.pc = pc + 1;
      return 'advanced';
    case 'sound':
      effects.push({
        sound: { symbol: instruction.symbol, value: instruction.value }
      });
      state.pc = pc + 1;
      return 'advanced';
    case 'jmp':
      state.pc = instruction.target;
      return 'advanced';
    case 'call':
      state.callStack.push(pc + 1);
      state.pc = instruction.target;
      return 'advanced';
    case 'ret': {
      const resume = state.callStack.pop();
      if (resume !== undefined) {
        state.pc = resume;
      } else {
        state.pc = undefined;
        effects.push('scriptFinished');
      }
      return 'advanced';
    }
  }
};

export const BensonMachine = {
  run(
    state: BensonState,
    host: BensonHostState,
    program: BensonProgram,
    text: TextTable,
    tunables: BensonTunables = defaultTunables(),
    observer?: BensonObserver
  ): Advance {
    const nextState = state.clone();
    const nextHost = host.clone();
    const effects: BensonEffect[] = [];
    let executed = 0;

    if (nextHost.messagePlaying || nextState.pc === undefined) {
      return { effects, executed: 0, host: nextHost, state: nextState };
    }
    if (
      nextState.resumeAfterTick !== undefined &&
      nextHost.tickCounter < nextState.resumeAfterTick
    ) {
      return { effects, executed: 0, host: nextHost, state: nextState };
    }

    while (
      executed < tunables.instructionBudget &&
      nextState.pc !== undefined
    ) {
      const pc = nextState.pc;
      const instruction = program.instructions[pc];
      if (instruction === undefined) {
        nextState.pc = undefined;
        break;
      }
      executed += 1;
      const watch = observer;
      if (watch !== undefined) {
        const before = {
          effects: effects.length,
          host: nextHost.clone(),
          state: nextState.clone()
        };
        const outcome = step(
          instruction,
          pc,
          nextState,
          nextHost,
          text,
          effects
        );
        watch({
          blocked: outcome === 'blocked',
          effects: effects.slice(before.effects),
          hostAfter: nextHost.clone(),
          hostBefore: before.host,
          instruction,
          pc,
          stateAfter: nextState.clone(),
          stateBefore: before.state
        });
        if (outcome === 'blocked') {
          break;
        }
        continue;
      }
      if (
        step(instruction, pc, nextState, nextHost, text, effects) === 'blocked'
      ) {
        break;
      }
    }
    return { effects, executed, host: nextHost, state: nextState };
  },

  start(
    script: number,
    program: BensonProgram,
    state: BensonState,
    host: BensonHostState
  ):
    | { readonly host: BensonHostState; readonly state: BensonState }
    | undefined {
    const entry = program.entry(script);
    if (host.isScriptRunning || entry === undefined) {
      return undefined;
    }
    const nextState = state.clone();
    const nextHost = host.clone();
    nextState.pc = entry;
    nextState.callStack = [];
    nextState.resumeAfterTick = undefined;
    nextHost.engineFlags =
      (nextHost.engineFlags | BensonHostState.scriptRunning) & 0xff;
    return { host: nextHost, state: nextState };
  }
};
