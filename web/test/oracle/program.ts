import type { BensonSymbol } from '../../src/benson/host.ts';
import { BensonKey, parseBensonKey } from '../../src/benson/key.ts';
import type { Token } from '../../src/payload/documents.ts';
import type {
  BensonDocument,
  BensonInstruction as RawInstruction
} from './documents.ts';

export {
  BensonKey,
  bensonKeyCode,
  parseBensonKey
} from '../../src/benson/key.ts';

export type Branch = { readonly jump: number } | { readonly call: number };

export interface Condition {
  readonly branch: Branch;
  readonly branchOn: boolean;
}

export type MessageSource =
  { readonly immediate: number } | { readonly register: number };

export type MaskMode = 'and' | 'or';

export type { BensonSymbol } from '../../src/benson/host.ts';

export type Instruction =
  | { readonly op: 'msg'; readonly tokens: readonly Token[] }
  | { readonly op: 'msgi'; readonly source: MessageSource }
  | { readonly base: number; readonly mask: number; readonly op: 'msgr' }
  | {
      readonly condition: Condition;
      readonly op: 'wfr';
      readonly ticks: number;
    }
  | { readonly op: 'cfr' }
  | {
      readonly condition: Condition;
      readonly key: BensonKey;
      readonly op: 'tstk';
    }
  | { readonly op: 'clrk' }
  | {
      readonly condition: Condition;
      readonly mask: number;
      readonly op: 'tstf';
    }
  | { readonly mask: number; readonly op: 'setf' }
  | { readonly mask: number; readonly op: 'clrf' }
  | { readonly condition: Condition; readonly op: 'room' }
  | { readonly condition: Condition; readonly op: 'tsti' }
  | { readonly condition: Condition; readonly op: 'inrm' }
  | {
      readonly condition: Condition;
      readonly mask: number;
      readonly op: 'tsto';
    }
  | { readonly condition: Condition; readonly op: 'tstb' }
  | {
      readonly condition: Condition;
      readonly craft: number;
      readonly op: 'tstc';
    }
  | {
      readonly condition: Condition;
      readonly op: 'rand';
      readonly value: number;
    }
  | {
      readonly condition: Condition;
      readonly op: 'cmp';
      readonly symbol: BensonSymbol;
      readonly value: number;
    }
  | { readonly decimal: number; readonly op: 'ldr'; readonly value: number }
  | { readonly decimal: number; readonly op: 'adr'; readonly value: number }
  | {
      readonly a: number;
      readonly b: number;
      readonly into: number;
      readonly op: 'dadd';
    }
  | { readonly op: 'loadi'; readonly register: number; readonly value: number }
  | { readonly from: number; readonly op: 'load'; readonly to: number }
  | { readonly mask: number; readonly mode: MaskMode; readonly op: 'modf' }
  | {
      readonly op: 'stor';
      readonly symbol: BensonSymbol;
      readonly value: number;
    }
  | { readonly op: 'sound'; readonly symbol: string; readonly value: number }
  | { readonly op: 'jmp'; readonly target: number }
  | { readonly op: 'call'; readonly target: number }
  | { readonly op: 'ret' };

export type BensonErrorKind =
  | 'unknownOperation'
  | 'badField'
  | 'badTarget'
  | 'unknownSymbol'
  | 'unknownKey'
  | 'badScript';

/// A payload the interpreter refuses to run, reported the way payload load errors are.
export class BensonError extends Error {
  readonly field: string | undefined;
  readonly instruction: number;
  readonly kind: BensonErrorKind;
  readonly op: string | undefined;
  readonly script: number | undefined;
  readonly symbol: string | undefined;
  readonly target: number | undefined;

  constructor(
    kind: BensonErrorKind,
    instruction: number,
    extras: {
      readonly field?: string;
      readonly op?: string;
      readonly script?: number;
      readonly symbol?: string;
      readonly target?: number;
    } = {}
  ) {
    super(describeBensonError(kind, instruction, extras));
    this.name = 'BensonError';
    this.kind = kind;
    this.instruction = instruction;
    this.field = extras.field;
    this.op = extras.op;
    this.script = extras.script;
    this.symbol = extras.symbol;
    this.target = extras.target;
  }
}

const describeBensonError = (
  kind: BensonErrorKind,
  instruction: number,
  extras: {
    readonly field?: string;
    readonly op?: string;
    readonly script?: number;
    readonly symbol?: string;
    readonly target?: number;
  }
): string => {
  switch (kind) {
    case 'unknownOperation':
      return (
        `Benson instruction ${instruction} has operation '${extras.op}', ` +
        'which this interpreter does not implement.'
      );
    case 'badField':
      return (
        `Benson instruction ${instruction} is missing or misuses its ` +
        `'${extras.field}' field.`
      );
    case 'badTarget':
      return (
        `Benson instruction ${instruction} branches to ${extras.target}, ` +
        'which is not an instruction.'
      );
    case 'unknownSymbol':
      return (
        `Benson instruction ${instruction} names engine state '${extras.symbol}', ` +
        'which the host does not provide.'
      );
    case 'unknownKey':
      return (
        `Benson instruction ${instruction} tests key '${extras.symbol}', ` +
        'which is not bound.'
      );
    case 'badScript':
      return `Benson script ${extras.script} is outside the script table.`;
  }
};

/// A validated Benson program: operands resolved and targets checked.
export class BensonProgram {
  readonly decimalSeeds: Readonly<Record<number, number>>;
  readonly entries: readonly number[];
  readonly framesPerTick: number;
  readonly instructions: readonly Instruction[];

  constructor(
    instructions: readonly Instruction[],
    entries: readonly number[],
    decimalSeeds: Readonly<Record<number, number>> = {},
    framesPerTick = 50
  ) {
    this.instructions = instructions;
    this.entries = entries;
    this.decimalSeeds = decimalSeeds;
    this.framesPerTick = framesPerTick;
  }

  static fromDocument(document: BensonDocument): BensonProgram {
    const count = document.instructions.length;
    const decoded = document.instructions.map((raw, index) =>
      decode(raw, index, count)
    );

    const entries = Array.from({ length: document.scripts.length }, () => 0);
    for (const script of document.scripts) {
      if (script.id < 0 || script.id >= document.scripts.length) {
        throw new BensonError('badScript', -1, { script: script.id });
      }
      if (script.entry < 0 || script.entry >= decoded.length) {
        throw new BensonError('badTarget', -1, { target: script.entry });
      }
      entries[script.id] = script.entry;
    }

    const seeds: Record<number, number> = {};
    for (const [slot, value] of Object.entries(document.decimalSeeds)) {
      const index = Number.parseInt(slot, 10);
      if (!Number.isInteger(index) || String(index) !== slot) {
        throw new BensonError('badField', -1, { field: 'decimalSeeds' });
      }
      seeds[index] = value;
    }
    if (document.framesPerTick <= 0) {
      throw new BensonError('badField', -1, { field: 'framesPerTick' });
    }
    return new BensonProgram(decoded, entries, seeds, document.framesPerTick);
  }

  get scriptCount(): number {
    return this.entries.length;
  }

  entry(script: number): number | undefined {
    return this.entries[script];
  }

  /// The script whose code holds an address: the one with the latest entry at
  /// or before it, the lowest id where entries are shared. Only a guess where
  /// a script's code isn't laid out after its entry.
  scriptAt(address: number): number | undefined {
    let found: number | undefined;
    for (const [script, entry] of this.entries.entries()) {
      if (
        entry <= address &&
        (found === undefined || entry > this.entries[found]!)
      ) {
        found = script;
      }
    }
    return found;
  }
}

const decode = (
  raw: RawInstruction,
  index: number,
  count: number
): Instruction => {
  const integer = (value: number | undefined, field: string): number => {
    if (value === undefined) {
      throw new BensonError('badField', index, { field });
    }
    return value;
  };
  const mask = (value: number | undefined, field: string): number => {
    const amount = integer(value, field);
    if (!Number.isInteger(amount) || amount < 0 || amount > 255) {
      throw new BensonError('badField', index, { field });
    }
    return amount;
  };
  const target = (value: number | undefined, field: string): number => {
    const amount = integer(value, field);
    if (amount < 0 || amount >= count) {
      throw new BensonError('badTarget', index, { target: amount });
    }
    return amount;
  };
  const condition = (): Condition => {
    if (raw.branchOn === undefined || raw.onTaken === undefined) {
      throw new BensonError('badField', index, { field: 'onTaken' });
    }
    const destination = target(raw.onTaken.target, 'onTaken.target');
    let branch: Branch;
    switch (raw.onTaken.kind) {
      case 'jmp':
        branch = { jump: destination };
        break;
      case 'call':
        branch = { call: destination };
        break;
      default:
        throw new BensonError('badField', index, { field: 'onTaken.kind' });
    }
    return { branch, branchOn: raw.branchOn };
  };
  const symbol = (): BensonSymbol => {
    if (raw.symbol === undefined) {
      throw new BensonError('badField', index, { field: 'symbol' });
    }
    switch (raw.symbol) {
      case 'decimalByte':
        return {
          decimalByte: {
            byte: integer(raw.byte, 'byte'),
            decimal: integer(raw.decimal, 'decimal')
          }
        };
      case 'objectRoom':
        return { objectRoom: integer(raw.slot, 'slot') };
      case 'objectFlags':
        return { objectFlags: integer(raw.slot, 'slot') };
      case 'engineFlags':
      case 'currentRoom':
      case 'boardedCraft':
      case 'inputKey':
      case 'signedRegister':
      case 'messageInterval':
      case 'attackingShip':
      case 'gameComplete':
      case 'shipInbound':
        return raw.symbol;
      default:
        throw new BensonError('unknownSymbol', index, { symbol: raw.symbol });
    }
  };

  switch (raw.op) {
    case 'msg':
      if (raw.tokens === undefined) {
        throw new BensonError('badField', index, { field: 'tokens' });
      }
      return { op: 'msg', tokens: raw.tokens };
    case 'msgi':
      switch (raw.source) {
        case 'immediate':
          return {
            op: 'msgi',
            source: { immediate: integer(raw.index, 'index') }
          };
        case 'register':
          return {
            op: 'msgi',
            source: { register: integer(raw.register, 'register') }
          };
        default:
          throw new BensonError('badField', index, { field: 'source' });
      }
    case 'msgr':
      return {
        base: integer(raw.base, 'base'),
        mask: integer(raw.mask, 'mask'),
        op: 'msgr'
      };
    case 'wfr':
      return {
        condition: condition(),
        op: 'wfr',
        ticks: integer(raw.ticks, 'ticks')
      };
    case 'cfr':
      return { op: 'cfr' };
    case 'tstk': {
      if (raw.key === undefined) {
        throw new BensonError('badField', index, { field: 'key' });
      }
      const key = parseBensonKey(raw.key);
      if (key === undefined) {
        throw new BensonError('unknownKey', index, { symbol: raw.key });
      }
      return { condition: condition(), key, op: 'tstk' };
    }
    case 'clrk':
      return { op: 'clrk' };
    case 'tstf':
      return {
        condition: condition(),
        mask: mask(raw.mask, 'mask'),
        op: 'tstf'
      };
    case 'setf':
      return { mask: mask(raw.mask, 'mask'), op: 'setf' };
    case 'clrf':
      return { mask: mask(raw.mask, 'mask'), op: 'clrf' };
    case 'room':
      return { condition: condition(), op: 'room' };
    case 'tsti':
      return { condition: condition(), op: 'tsti' };
    case 'inrm':
      return { condition: condition(), op: 'inrm' };
    case 'tsto':
      return {
        condition: condition(),
        mask: mask(raw.mask, 'mask'),
        op: 'tsto'
      };
    case 'tstb':
      return { condition: condition(), op: 'tstb' };
    case 'tstc':
      return {
        condition: condition(),
        craft: integer(raw.craft, 'craft'),
        op: 'tstc'
      };
    case 'rand':
      return {
        condition: condition(),
        op: 'rand',
        value: integer(raw.value, 'value')
      };
    case 'cmp':
      return {
        condition: condition(),
        op: 'cmp',
        symbol: symbol(),
        value: integer(raw.value, 'value')
      };
    case 'ldr':
      return {
        decimal: integer(raw.decimal, 'decimal'),
        op: 'ldr',
        value: integer(raw.value, 'value')
      };
    case 'adr':
      return {
        decimal: integer(raw.decimal, 'decimal'),
        op: 'adr',
        value: integer(raw.value, 'value')
      };
    case 'dadd':
      return {
        a: integer(raw.a, 'a'),
        b: integer(raw.b, 'b'),
        into: integer(raw.into, 'into'),
        op: 'dadd'
      };
    case 'loadi':
      return {
        op: 'loadi',
        register: integer(raw.register, 'register'),
        value: integer(raw.value, 'value')
      };
    case 'load':
      return {
        from: integer(raw.from, 'from'),
        op: 'load',
        to: integer(raw.to, 'to')
      };
    case 'modf': {
      if (raw.mode !== 'and' && raw.mode !== 'or') {
        throw new BensonError('badField', index, { field: 'mode' });
      }
      return { mask: mask(raw.mask, 'mask'), mode: raw.mode, op: 'modf' };
    }
    case 'stor':
      return {
        op: 'stor',
        symbol: symbol(),
        value: integer(raw.value, 'value')
      };
    case 'sound':
      if (raw.symbol === undefined) {
        throw new BensonError('badField', index, { field: 'symbol' });
      }
      return {
        op: 'sound',
        symbol: raw.symbol,
        value: integer(raw.value, 'value')
      };
    case 'jmp':
      return { op: 'jmp', target: target(raw.target, 'target') };
    case 'call':
      return { op: 'call', target: target(raw.target, 'target') };
    case 'ret':
      return { op: 'ret' };
    default:
      throw new BensonError('unknownOperation', index, { op: raw.op });
  }
};
