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

  /// Either a seed on its own, which is how a fresh interpreter starts, or the fields to hold.
  ///
  /// Two shapes rather than two constructors because a `readonly` field has to be assigned here,
  /// and the seed form is what almost every caller wants.
  constructor(
    seedOrFields: bigint | Partial<BensonStateFields> = BensonState.defaultSeed
  ) {
    if (typeof seedOrFields === 'bigint') {
      this.pc = undefined;
      this.callStack = [];
      this.registers = Array.from(
        { length: BensonState.registerCount },
        () => 0
      );
      this.randomState = seedOrFields;
      this.resumeAfterTick = undefined;
      return;
    }
    this.pc = seedOrFields.pc;
    this.callStack = seedOrFields.callStack ?? [];
    this.registers =
      seedOrFields.registers ??
      Array.from({ length: BensonState.registerCount }, () => 0);
    this.randomState = seedOrFields.randomState ?? BensonState.defaultSeed;
    this.resumeAfterTick = seedOrFields.resumeAfterTick;
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

  /// The fields written out rather than spread from `this`.
  ///
  /// `{ ...this, pc }` reads the same and costs an order of magnitude more: spreading a class
  /// instance enumerates its own properties, and the constructor then re-reads every field it
  /// was just handed. `withPc` runs about once per instruction — every non-branching opcode and
  /// both arms of `decide` — which makes it the most executed write in the interpreter, so it
  /// is worth naming the five fields here. Measured at roughly a thirteenth of the cost.
  ///
  /// This cannot go through `with`, which merges by `??` and so cannot write `undefined`; `pc`
  /// and `resumeAfterTick` both need to.
  withPc(pc: number | undefined): BensonState {
    return new BensonState({
      callStack: this.callStack,
      pc,
      randomState: this.randomState,
      registers: this.registers,
      resumeAfterTick: this.resumeAfterTick
    });
  }

  withoutResume(): BensonState {
    return new BensonState({
      callStack: this.callStack,
      pc: this.pc,
      randomState: this.randomState,
      registers: this.registers,
      resumeAfterTick: undefined
    });
  }

  pushCall(returnPc: number): BensonState {
    return this.with({ callStack: [...this.callStack, returnPc] });
  }

  popCall(): {
    readonly resume: number | undefined;
    readonly state: BensonState;
  } {
    if (this.callStack.length === 0) {
      return { resume: undefined, state: this };
    }
    const callStack = this.callStack.slice(0, -1);
    const resume = this.callStack.at(-1);
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

/// The ordinary answer: this instruction ran, and the interpreter should carry on.
///
/// A helper rather than the record written out at each site, because `step` answers this way
/// thirty times over and the record is three quarters boilerplate — what matters at each `case`
/// is which host and which state, and those are exactly the two arguments.
const advanced = (host: BensonHostState, state: BensonState): Stepped => ({
  host,
  outcome: 'advanced',
  state
});

/// A conditional instruction's answer: work out the branch it selects, then carry on.
///
/// Eleven opcodes differ only in the boolean they hand to `decide`, so this leaves each `case`
/// stating that boolean and nothing else — which is the one thing about them worth reading.
const decided = (
  answer: boolean,
  condition: Condition,
  pc: number,
  state: BensonState,
  host: BensonHostState
): Stepped => advanced(host, decide(answer, condition, pc, state));

const play = (
  message: string | undefined,
  pc: number,
  state: BensonState,
  host: BensonHostState,
  effects: BensonEffect[]
): Stepped => {
  const next = state.withPc(pc + 1);
  if (message === undefined) {
    return advanced(host, next);
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
        return advanced(host.withoutPendingKey(), rolled.state.withPc(pc + 1));
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
      return decided(
        host.tickCounter >= instruction.ticks,
        instruction.condition,
        pc,
        state.withoutResume(),
        host
      );
    }
    case 'cfr':
      return advanced(host.with({ tickCounter: 0 }), state.withPc(pc + 1));
    case 'tstk': {
      const matched = host.pendingKey === instruction.key;
      let nextHost = host;
      if (matched) {
        nextHost = host.withoutPendingKey();
        effects.push('keyAcknowledged');
      }
      return decided(!matched, instruction.condition, pc, state, nextHost);
    }
    case 'clrk':
      return advanced(host.withoutPendingKey(), state.withPc(pc + 1));
    case 'tstf':
      return decided(
        (host.engineFlags & instruction.mask) === 0,
        instruction.condition,
        pc,
        state,
        host
      );
    case 'setf':
      return advanced(
        host.with({
          engineFlags: (host.engineFlags | instruction.mask) & 0xff
        }),
        state.withPc(pc + 1)
      );
    case 'clrf':
      return advanced(
        host.with({
          engineFlags: host.engineFlags & ~instruction.mask & 0xff
        }),
        state.withPc(pc + 1)
      );
    case 'room':
      return decided(
        state.room !== host.currentRoom,
        instruction.condition,
        pc,
        state,
        host
      );
    case 'tsti':
      // Answers "not carried", like every other test opcode answers its own
      // negative condition. The native handler branches to its answer-true
      // target when the inventory search fails; see notes/decode/endgame.md.
      return decided(
        !host.inventory.has(state.object),
        instruction.condition,
        pc,
        state,
        host
      );
    case 'inrm':
      return decided(
        state.room !== host.objectRooms.get(state.object),
        instruction.condition,
        pc,
        state,
        host
      );
    case 'tsto':
      return decided(
        ((host.objectFlags.get(state.object) ?? 0) & instruction.mask) === 0,
        instruction.condition,
        pc,
        state,
        host
      );
    case 'tstb':
      return decided(
        !host.destroyedBlocks.has(state.map),
        instruction.condition,
        pc,
        state,
        host
      );
    case 'tstc':
      return decided(
        instruction.craft !== host.boardedCraft,
        instruction.condition,
        pc,
        state,
        host
      );
    case 'rand': {
      const rolled = nextRandom(state);
      return decided(
        instruction.value >= rolled.byte,
        instruction.condition,
        pc,
        rolled.state,
        host
      );
    }
    case 'cmp':
      return decided(
        instruction.value >= host.valueOf(instruction.symbol),
        instruction.condition,
        pc,
        state,
        host
      );
    case 'ldr':
      // No bounds test here: `withDecimal` answers a slot outside the table with the host
      // unchanged, which is the same refusal this used to spell out for itself.
      return advanced(
        host.withDecimal(instruction.decimal, instruction.value),
        state.withPc(pc + 1)
      );
    case 'adr':
      return advanced(
        host.addDecimal(instruction.decimal, instruction.value),
        state.withPc(pc + 1)
      );
    case 'dadd':
      // Likewise guarded inside `withDecimal`. The sum is computed either way, which it was
      // before too — `decimal()` answers an out-of-range slot with zero rather than refusing.
      return advanced(
        host.withDecimal(
          instruction.into,
          (host.decimal(instruction.a) + host.decimal(instruction.b)) %
            BensonHostState.decimalLimit
        ),
        state.withPc(pc + 1)
      );
    case 'loadi': {
      const next = state.withRegister(instruction.register, instruction.value);
      const stepped = next.withPc(pc + 1);
      if (instruction.register === BensonState.mapRegister) {
        effects.push({ cityLocationChanged: instruction.value });
      }
      return advanced(host, stepped);
    }
    case 'load': {
      const value = state.register(instruction.from);
      const next = state.withRegister(instruction.to, value).withPc(pc + 1);
      if (instruction.to === BensonState.mapRegister) {
        effects.push({ cityLocationChanged: value });
      }
      return advanced(host, next);
    }
    case 'modf': {
      const existing = host.objectFlags.get(state.object) ?? 0;
      const next =
        instruction.mode === 'or'
          ? existing | instruction.mask
          : existing & instruction.mask;
      return advanced(
        host.withObjectFlag(state.object, next & 0xff),
        state.withPc(pc + 1)
      );
    }
    case 'stor':
      return advanced(
        host.write(instruction.symbol, instruction.value),
        state.withPc(pc + 1)
      );
    case 'sound':
      effects.push({
        sound: { symbol: instruction.symbol, value: instruction.value }
      });
      return advanced(host, state.withPc(pc + 1));
    case 'jmp':
      return advanced(host, state.withPc(instruction.target));
    case 'call':
      return advanced(host, state.pushCall(pc + 1).withPc(instruction.target));
    case 'ret': {
      const popped = state.popCall();
      if (popped.resume !== undefined) {
        return advanced(host, popped.state.withPc(popped.resume));
      }
      effects.push('scriptFinished');
      return advanced(host, popped.state.withPc(undefined));
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
      const result = step(instruction, pc, nextState, nextHost, text, effects);
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
