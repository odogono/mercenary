import { describe, expect, test } from 'bun:test';

import {
  BensonError,
  BensonProgram,
  BensonState,
  DEFAULT_SESSION_SEED,
  MessageTicker,
  codePointCount,
  nextRandom,
  type Instruction
} from '../src/benson/index.ts';
import type {
  BensonDocument,
  BensonInstruction
} from '../src/payload/documents.ts';
import type { Trace } from '../src/trace/index.ts';
import { bensonGate } from './replay/bensonGate.ts';

/// The Benson interpreter's Replay Gate.
///
/// Nine traces, no world: the program, the Host Callout, the message line, and the clock.
/// Two of them end in a `stopped` record when the instruction limit trips — that record is
/// asserted, because a silent early stop would compare clean against a different reason.

const IDS = [
  'script-0-parked',
  'script-0-answered',
  'script-3-plain',
  'script-3-object-in-room',
  'script-3-carried',
  'script-3-flagged',
  'script-3-write-before-test',
  'script-3-write-after-test',
  'script-1-parked'
] as const;

const endsWithStopped = (trace: Trace): boolean => {
  const last = trace.records.at(-1);
  const stopped = last?.['stopped'];
  return (
    typeof stopped === 'object' &&
    stopped !== null &&
    !Array.isArray(stopped) &&
    stopped['reason'] === 'instructionLimit'
  );
};

const endsWithFinished = (trace: Trace): boolean => {
  const last = trace.records.at(-1);
  return last?.['finished'] !== undefined;
};

await bensonGate({
  coverage: traces => {
    expect(endsWithStopped(traces.get('script-0-answered')!)).toBeTrue();
    expect(endsWithStopped(traces.get('script-1-parked')!)).toBeTrue();
    for (const id of IDS) {
      if (id === 'script-0-answered' || id === 'script-1-parked') {
        continue;
      }
      expect(endsWithFinished(traces.get(id)!)).toBeTrue();
    }
  },
  ids: IDS,
  recordCounts: [1353, 21_252, 172, 272, 50, 47, 274, 172, 20_736],
  title: 'the benson Replay Gate'
});

const raw = (
  op: string,
  fields: Partial<BensonInstruction> = {}
): BensonInstruction => ({ op, ...fields });

const document = (
  instructions: BensonInstruction[],
  entries = [0],
  decimalSeeds: Record<string, number> = {}
): BensonDocument => ({
  counts: {},
  decimalSeeds,
  framesPerTick: 50,
  instructions,
  schemaVersion: 1,
  scripts: entries.map((entry, id) => ({ entry, id }))
});

describe('a program the interpreter refuses', () => {
  test('rejects an operation it does not implement', () => {
    expect(() =>
      BensonProgram.fromDocument(document([raw('func', { target: 0 })]))
    ).toThrow(BensonError);
    try {
      BensonProgram.fromDocument(document([raw('func', { target: 0 })]));
    } catch (error) {
      expect(error).toBeInstanceOf(BensonError);
      const failure = error as BensonError;
      expect(failure.kind).toBe('unknownOperation');
      expect(failure.message).toContain('does not implement');
    }
  });

  test('rejects a mask that will not fit in a byte', () => {
    expect(() =>
      BensonProgram.fromDocument(document([raw('setf', { mask: 256 })]))
    ).toThrow(BensonError);
  });

  test('rejects an unknown symbol', () => {
    try {
      BensonProgram.fromDocument(
        document([raw('stor', { symbol: 'somethingElse', value: 1 })])
      );
    } catch (error) {
      expect(error).toBeInstanceOf(BensonError);
      expect((error as BensonError).kind).toBe('unknownSymbol');
      expect((error as BensonError).message).toContain(
        'the host does not provide'
      );
    }
  });
});

describe('MessageTicker reveal counting', () => {
  test('counts Unicode code points, not UTF-16 units', () => {
    const emoji = '👍';
    expect(emoji.length).toBe(2);
    expect(codePointCount(emoji)).toBe(1);
    const ticker = new MessageTicker(emoji, 1, 0);
    ticker.advance(1);
    expect(ticker.visibleText).toBe(emoji);
    expect(ticker.isRevealed).toBeTrue();
  });

  test('counts combining marks as their own code points, not as graphemes', () => {
    const pair = 'e\u0301';
    expect([...new Intl.Segmenter().segment(pair)].length).toBe(1);
    expect(codePointCount(pair)).toBe(2);
    const ticker = new MessageTicker(pair, 1, 0);
    ticker.advance(1);
    expect(ticker.visibleText).toBe('e');
    ticker.advance(1);
    expect(ticker.visibleText).toBe(pair);
  });
});

describe('the interpreter random stream', () => {
  test('splitmix64 from the session seed produces a stable first byte', () => {
    // BensonSession's default seed, 0x2C692ED81B7F0A31 — not BensonState.defaultSeed.
    const state = new BensonState(DEFAULT_SESSION_SEED);
    expect([
      nextRandom(state),
      nextRandom(state),
      nextRandom(state),
      nextRandom(state)
    ]).toEqual([90, 147, 164, 143]);
  });

  test('names both default seeds so they cannot be mixed', () => {
    expect(BensonState.defaultSeed).toBe(0x9e_37_79_b9_7f_4a_7c_15n);
  });
});

describe('a decoded program', () => {
  test('keeps a call branch', () => {
    const program = BensonProgram.fromDocument(
      document([
        raw('room', {
          branchOn: true,
          onTaken: { kind: 'call', target: 1 }
        }),
        raw('ret')
      ])
    );
    const instruction = program.instructions[0] as Instruction;
    expect(instruction.op).toBe('room');
    if (instruction.op === 'room') {
      expect(instruction.condition.branchOn).toBeTrue();
      expect(instruction.condition.branch).toEqual({ call: 1 });
    }
  });
});
