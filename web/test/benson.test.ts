import { describe, expect, test } from 'bun:test';

import {
  BensonError,
  BensonHostState,
  BensonMachine,
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
import { TextTable } from '../src/text/index.ts';
import type { Trace } from '../src/trace/index.ts';
import { bensonGate } from './replay/bensonGate.ts';

/// The Benson interpreter's Replay Gate.
///
/// Four traces, no world: the program, the Host Callout, the message line, and the clock.
/// Two of them end in a `stopped` record when the instruction limit trips — that record is
/// asserted, because a silent early stop would compare clean against a different reason.
///
/// Five script-3 traces were retired in #131: the Trace Oracle emitted them with `tsti`
/// inverted, so they record a branch a correct interpreter cannot take, and the frozen
/// oracle cannot re-emit them. `trace-scenarios.json` carries the reason, and
/// `deliveries.test.ts` now covers the predicate order they pinned.

const IDS = [
  'script-0-parked',
  'script-0-answered',
  'script-3-flagged',
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
  recordCounts: [1353, 21_252, 47, 20_736],
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
    let state = new BensonState(DEFAULT_SESSION_SEED);
    const bytes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const rolled = nextRandom(state);
      bytes.push(rolled.byte);
      state = rolled.state;
    }
    expect(bytes).toEqual([90, 147, 164, 143]);
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

/// The test opcodes all answer their own *negative* condition, which is what lets one
/// `branchOn: false` mean "the object is here" for both `tsti` and `inrm`. Getting `tsti`
/// backwards silently inverts every delivery and the rental terminal, and it is not the kind
/// of mistake a trace catches when the oracle shares it — so it is pinned directly.
const emptyText = new TextTable({
  counts: {},
  messages: [],
  schemaVersion: 1,
  unresolvedCodes: [],
  words: []
});

/// Runs one test opcode and reports the answer it gave, by branching on true into a `setf`.
const answerOf = (
  op: string,
  fields: Record<string, unknown>,
  host: BensonHostState,
  object = 29
): boolean => {
  // Branch when the answer is true, so where we land reports the answer.
  const program = BensonProgram.fromDocument(
    document([
      raw('loadi', { register: 14, value: object }),
      raw('loadi', { register: 15, value: 136 }),
      raw(op, {
        branchOn: true,
        onTaken: { kind: 'jmp', target: 4 },
        ...fields
      }),
      raw('ret'),
      raw('setf', { mask: 8 }),
      raw('ret')
    ])
  );
  const started = BensonMachine.start(0, program, new BensonState(), host)!;
  const advance = BensonMachine.run(
    started.state,
    started.host,
    program,
    emptyText
  );
  return (advance.host.engineFlags & 0x08) !== 0;
};

describe('the Ending phase byte behind the gameComplete symbol', () => {
  // The Reference Build reads 0, 1 and 255 apart (notes/decode/endgame.md,
  // "Ending phases"), so the Host Callout carries the byte rather than a
  // Boolean that would collapse the two nonzero phases into one.
  test('write and read keep all three decoded values distinct', () => {
    for (const phase of [0, 1, 255]) {
      const host = new BensonHostState().write('gameComplete', phase);
      expect(host.endingPhase).toBe(phase);
      expect(host.valueOf('gameComplete')).toBe(phase);
    }
  });

  test('a write is masked to one byte, as a store through the callout is', () => {
    expect(
      new BensonHostState().write('gameComplete', 0x1_01).endingPhase
    ).toBe(0x01);
  });
});

describe('the polarity of the test opcodes', () => {
  test('tsti answers true when the object is not carried', () => {
    expect(
      answerOf('tsti', {}, new BensonHostState({ inventory: new Set() }))
    ).toBeTrue();
    expect(
      answerOf('tsti', {}, new BensonHostState({ inventory: new Set([29]) }))
    ).toBeFalse();
  });

  test('inrm answers true when the object is not in the room', () => {
    expect(
      answerOf(
        'inrm',
        {},
        new BensonHostState({ objectRooms: new Map([[29, 1]]) })
      )
    ).toBeTrue();
    expect(
      answerOf(
        'inrm',
        {},
        new BensonHostState({ objectRooms: new Map([[29, 136]]) })
      )
    ).toBeFalse();
  });

  test('tsto answers true when the flag is clear', () => {
    expect(
      answerOf(
        'tsto',
        { mask: 1 },
        new BensonHostState({ objectFlags: new Map([[29, 0]]) })
      )
    ).toBeTrue();
    expect(
      answerOf(
        'tsto',
        { mask: 1 },
        new BensonHostState({ objectFlags: new Map([[29, 1]]) })
      )
    ).toBeFalse();
  });

  test('tstf answers true when the engine flag is clear', () => {
    expect(answerOf('tstf', { mask: 2 }, new BensonHostState())).toBeTrue();
    expect(
      answerOf('tstf', { mask: 2 }, new BensonHostState({ engineFlags: 2 }))
    ).toBeFalse();
  });
});
