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

export interface BensonStateFields {
  readonly callStack: readonly number[];
  readonly pc: number | undefined;
  readonly randomState: bigint;
  readonly registers: readonly number[];
  readonly resumeAfterTick: number | undefined;
}

/// One script's execution state. Persistent: every write returns a new value (ADR 0023).
export class BensonState implements BensonStateFields {
  static readonly registerCount = 16;
  static readonly mapRegister = 13;
  static readonly objectRegister = 14;
  static readonly roomRegister = 15;

  /// Direct `BensonState` construction uses this seed. `BensonSession` uses
  /// `DEFAULT_SESSION_SEED` instead — do not mix them (#94 owns stream sharing).
  static readonly defaultSeed = 0x9e_37_79_b9_7f_4a_7c_15n;

  readonly callStack: readonly number[];
  readonly pc: number | undefined;
  readonly randomState: bigint;
  readonly registers: readonly number[];
  readonly resumeAfterTick: number | undefined;

  constructor(
    randomState: bigint | Partial<BensonStateFields> = BensonState.defaultSeed
  ) {
    if (typeof randomState === 'bigint') {
      this.pc = undefined;
      this.callStack = [];
      this.registers = Array.from(
        { length: BensonState.registerCount },
        () => 0
      );
      this.randomState = randomState;
      this.resumeAfterTick = undefined;
      return;
    }
    this.pc = randomState.pc;
    this.callStack = randomState.callStack ?? [];
    this.registers =
      randomState.registers ??
      Array.from({ length: BensonState.registerCount }, () => 0);
    this.randomState = randomState.randomState ?? BensonState.defaultSeed;
    this.resumeAfterTick = randomState.resumeAfterTick;
  }

  with(patch: Partial<BensonStateFields>): BensonState {
    return new BensonState({
      callStack: patch.callStack ?? this.callStack,
      pc: patch.pc !== undefined ? patch.pc : this.pc,
      randomState: patch.randomState ?? this.randomState,
      registers: patch.registers ?? this.registers,
      resumeAfterTick:
        patch.resumeAfterTick !== undefined
          ? patch.resumeAfterTick
          : this.resumeAfterTick
    });
  }

  withPc(pc: number | undefined): BensonState {
    return new BensonState({ ...this, pc });
  }

  withoutResume(): BensonState {
    return new BensonState({ ...this, resumeAfterTick: undefined });
  }

  pushCall(returnPc: number): BensonState {
    return this.with({ callStack: [...this.callStack, returnPc] });
  }

  popCall(): { readonly resume: number | undefined; readonly state: BensonState } {
    if (this.callStack.length === 0) {
      return { resume: undefined, state: this };
    }
    const callStack = this.callStack.slice(0, -1);
    const resume = this.callStack[this.callStack.length - 1];
    return { resume, state: this.with({ callStack }) };
  }

  withRegister(index: number, value: number): BensonState {
    if (index < 0 || index >= this.registers.length) {
      return this;
    }
    const registers = this.registers.slice();
    registers[index] = value;
    return this.with({ registers });
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
}

/// SplitMix64-style generator, 64-bit via BigInt, output truncated to a byte.
///
/// Increment constant `0x9E3779B97F4A7C15` is also `BensonState.defaultSeed`.
const MASK64 = (1n << 64n) - 1n;
const INCREMENT = 0x9e_37_79_b9_7f_4a_7c_15n;
const MUL1 = 0xbf_58_47_6d_1c_e4_e5_b9n;
const MUL2 = 0x94_d0_49_bb_13_31_11_ebn;

export const nextRandom = (
  state: BensonState
): { readonly byte: number; readonly state: BensonState } => {
  const randomState = (state.randomState + INCREMENT) & MASK64;
  let z = randomState;
  z = ((z ^ (z >> 30n)) * MUL1) & MASK64;
  z = ((z ^ (z >> 27n)) * MUL2) & MASK64;
  return {
    byte: Number((z ^ (z >> 31n)) & 0xffn),
    state: state.with({ randomState })
  };
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

interface Stepped {
  readonly host: BensonHostState;
  readonly outcome: 'advanced' | 'blocked';
  readonly state: BensonState;
}

const play = (
  message: string | undefined,
  pc: number,
  state: BensonState,
  host: BensonHostState,
  effects: BensonEffect[]
): Stepped => {
  const next = state.withPc(pc + 1);
  if (message === undefined) {
    return { host, outcome: 'advanced', state: next };
  }
  effects.push({ playMessage: message });
  return {
    host: host.with({ messagePlaying: true }),
    outcome: 'blocked',
    state: next
  };
};

const decide = (
  answer: boolean,
  condition: Condition,
  pc: number,
  state: BensonState
): BensonState => {
  if (answer !== condition.branchOn) {
    return state.withPc(pc + 1);
  }
  if ('jump' in condition.branch) {
    return state.withPc(condition.branch.jump);
  }
  return state.pushCall(pc + 1).withPc(condition.branch.call);
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
): Stepped => {
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
      const rolled = nextRandom(state);
      const index =
        instruction.base + (rolled.byte & (instruction.mask & 0xff));
      if (index === 0) {
        return {
          host: host.withoutPendingKey(),
          outcome: 'advanced',
          state: rolled.state.withPc(pc + 1)
        };
      }
      return play(
        text.message(index, messageSubstitutions(host)),
        pc,
        rolled.state,
        host,
        effects
      );
    }
    case 'wfr': {
      if (state.resumeAfterTick === undefined) {
        return {
          host,
          outcome: 'blocked',
          state: state.with({ resumeAfterTick: host.tickCounter + 1 })
        };
      }
      if (host.tickCounter < state.resumeAfterTick) {
        return { host, outcome: 'blocked', state };
      }
      return {
        host,
        outcome: 'advanced',
        state: decide(
          host.tickCounter >= instruction.ticks,
          instruction.condition,
          pc,
          state.withoutResume()
        )
      };
    }
    case 'cfr':
      return {
        host: host.with({ tickCounter: 0 }),
        outcome: 'advanced',
        state: state.withPc(pc + 1)
      };
    case 'tstk': {
      const matched = host.pendingKey === instruction.key;
      let nextHost = host;
      if (matched) {
        nextHost = host.withoutPendingKey();
        effects.push('keyAcknowledged');
      }
      return {
        host: nextHost,
        outcome: 'advanced',
        state: decide(!matched, instruction.condition, pc, state)
      };
    }
    case 'clrk':
      return {
        host: host.withoutPendingKey(),
        outcome: 'advanced',
        state: state.withPc(pc + 1)
      };
    case 'tstf':
      return {
        host,
        outcome: 'advanced',
        state: decide(
          (host.engineFlags & instruction.mask) === 0,
          instruction.condition,
          pc,
          state
        )
      };
    case 'setf':
      return {
        host: host.with({
          engineFlags: (host.engineFlags | instruction.mask) & 0xff
        }),
        outcome: 'advanced',
        state: state.withPc(pc + 1)
      };
    case 'clrf':
      return {
        host: host.with({
          engineFlags: host.engineFlags & ~instruction.mask & 0xff
        }),
        outcome: 'advanced',
        state: state.withPc(pc + 1)
      };
    case 'room':
      return {
        host,
        outcome: 'advanced',
        state: decide(
          state.room !== host.currentRoom,
          instruction.condition,
          pc,
          state
        )
      };
    case 'tsti':
      return {
        host,
        outcome: 'advanced',
        state: decide(
          host.inventory.has(state.object),
          instruction.condition,
          pc,
          state
        )
      };
    case 'inrm':
      return {
        host,
        outcome: 'advanced',
        state: decide(
          state.room !== host.objectRooms.get(state.object),
          instruction.condition,
          pc,
          state
        )
      };
    case 'tsto':
      return {
        host,
        outcome: 'advanced',
        state: decide(
          ((host.objectFlags.get(state.object) ?? 0) & instruction.mask) === 0,
          instruction.condition,
          pc,
          state
        )
      };
    case 'tstb':
      return {
        host,
        outcome: 'advanced',
        state: decide(
          !host.destroyedBlocks.has(state.map),
          instruction.condition,
          pc,
          state
        )
      };
    case 'tstc':
      return {
        host,
        outcome: 'advanced',
        state: decide(
          instruction.craft !== host.boardedCraft,
          instruction.condition,
          pc,
          state
        )
      };
    case 'rand': {
      const rolled = nextRandom(state);
      return {
        host,
        outcome: 'advanced',
        state: decide(
          instruction.value >= rolled.byte,
          instruction.condition,
          pc,
          rolled.state
        )
      };
    }
    case 'cmp':
      return {
        host,
        outcome: 'advanced',
        state: decide(
          instruction.value >= host.valueOf(instruction.symbol),
          instruction.condition,
          pc,
          state
        )
      };
    case 'ldr': {
      let nextHost = host;
      if (
        instruction.decimal >= 0 &&
        instruction.decimal < host.decimals.length
      ) {
        nextHost = host.withDecimal(instruction.decimal, instruction.value);
      }
      return {
        host: nextHost,
        outcome: 'advanced',
        state: state.withPc(pc + 1)
      };
    }
    case 'adr':
      return {
        host: host.addDecimal(instruction.decimal, instruction.value),
        outcome: 'advanced',
        state: state.withPc(pc + 1)
      };
    case 'dadd': {
      let nextHost = host;
      if (instruction.into >= 0 && instruction.into < host.decimals.length) {
        nextHost = host.withDecimal(
          instruction.into,
          (host.decimal(instruction.a) + host.decimal(instruction.b)) %
            BensonHostState.decimalLimit
        );
      }
      return {
        host: nextHost,
        outcome: 'advanced',
        state: state.withPc(pc + 1)
      };
    }
    case 'loadi': {
      const next = state.withRegister(instruction.register, instruction.value);
      const stepped = next.withPc(pc + 1);
      if (instruction.register === BensonState.mapRegister) {
        effects.push({ cityLocationChanged: instruction.value });
      }
      return { host, outcome: 'advanced', state: stepped };
    }
    case 'load': {
      const value = state.register(instruction.from);
      const next = state.withRegister(instruction.to, value).withPc(pc + 1);
      if (instruction.to === BensonState.mapRegister) {
        effects.push({ cityLocationChanged: value });
      }
      return { host, outcome: 'advanced', state: next };
    }
    case 'modf': {
      const existing = host.objectFlags.get(state.object) ?? 0;
      const next =
        instruction.mode === 'or'
          ? existing | instruction.mask
          : existing & instruction.mask;
      return {
        host: host.withObjectFlag(state.object, next & 0xff),
        outcome: 'advanced',
        state: state.withPc(pc + 1)
      };
    }
    case 'stor':
      return {
        host: host.write(instruction.symbol, instruction.value),
        outcome: 'advanced',
        state: state.withPc(pc + 1)
      };
    case 'sound':
      effects.push({
        sound: { symbol: instruction.symbol, value: instruction.value }
      });
      return {
        host,
        outcome: 'advanced',
        state: state.withPc(pc + 1)
      };
    case 'jmp':
      return {
        host,
        outcome: 'advanced',
        state: state.withPc(instruction.target)
      };
    case 'call':
      return {
        host,
        outcome: 'advanced',
        state: state.pushCall(pc + 1).withPc(instruction.target)
      };
    case 'ret': {
      const popped = state.popCall();
      if (popped.resume !== undefined) {
        return {
          host,
          outcome: 'advanced',
          state: popped.state.withPc(popped.resume)
        };
      }
      effects.push('scriptFinished');
      return {
        host,
        outcome: 'advanced',
        state: popped.state.withPc(undefined)
      };
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
    let nextState = state;
    let nextHost = host;
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
        nextState = nextState.withPc(undefined);
        break;
      }
      executed += 1;
      const watch = observer;
      if (watch !== undefined) {
        const beforeEffects = effects.length;
        const hostBefore = nextHost;
        const stateBefore = nextState;
        const result = step(
          instruction,
          pc,
          nextState,
          nextHost,
          text,
          effects
        );
        nextHost = result.host;
        nextState = result.state;
        watch({
          blocked: result.outcome === 'blocked',
          effects: effects.slice(beforeEffects),
          hostAfter: nextHost,
          hostBefore,
          instruction,
          pc,
          stateAfter: nextState,
          stateBefore
        });
        if (result.outcome === 'blocked') {
          break;
        }
        continue;
      }
      const result = step(
        instruction,
        pc,
        nextState,
        nextHost,
        text,
        effects
      );
      nextHost = result.host;
      nextState = result.state;
      if (result.outcome === 'blocked') {
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
    return {
      host: host.with({
        engineFlags: (host.engineFlags | BensonHostState.scriptRunning) & 0xff
      }),
      state: new BensonState({
        callStack: [],
        pc: entry,
        randomState: state.randomState,
        registers: state.registers,
        resumeAfterTick: undefined
      })
    };
  }
};
