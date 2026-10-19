import { describe, expect, test } from 'bun:test';

import { atan, cos, pow, sin, tan, toFloat32 } from '../src/math/index.ts';
import { parseTrace } from '../src/trace/index.ts';
import { readTraceText } from './replay/artifacts.ts';
import { describeDifference, firstDifference } from './replay/compare.ts';
import { onRecordingLibm } from './replay/platform.ts';

/// The gate beneath every other gate (ADR 0022).
///
/// This one is unusual, and worth being explicit about: it does not grade an implementation of
/// ours. `src/math` delegates to the platform, so what this compares is the platform's own
/// elementary functions against the libm every other Golden Trace was recorded through. It is
/// a canary. While it is green, a value-equality comparison of any other trace is a statement
/// about ported behaviour; the day it goes red, every gate above it is suspect for a reason
/// that has nothing to do with the port, and this is where that is diagnosed.

const trace = parseTrace(
  await readTraceText('math', 'elementary'),
  'math',
  'elementary'
);

const evaluate = (record: { fn: string; x: number; y?: number }): number => {
  switch (record.fn) {
    case 'sin':
      return sin(record.x);
    case 'cos':
      return cos(record.x);
    case 'tan':
      return tan(record.x);
    case 'atan':
      return atan(record.x);
    case 'pow':
      return pow(record.x, record.y!);
    default:
      throw new Error(
        `the trace records ${record.fn}, which this gate does not evaluate`
      );
  }
};

describe('the math Replay Gate', () => {
  test('the header names no payload, because this emitter reads none', () => {
    // Not incidental: recording the extraction would make a payload re-export report this
    // trace as differing, which is the false signal the per-emitter narrowing removed.
    expect(trace.header['payload']).toBeUndefined();
    expect(trace.header['dt']).toBeUndefined();
  });

  test.skipIf(!onRecordingLibm)(
    'every recorded value reproduces bit-for-bit',
    () => {
      expect(trace.records.length).toBeGreaterThan(2000);
      const failures: string[] = [];
      const covered = new Set<string>();
      for (const [index, record] of trace.records.entries()) {
        const fn = record['fn'] as string;
        covered.add(fn);
        const actual = evaluate(
          record as unknown as { fn: string; x: number; y?: number }
        );
        const difference = firstDifference(
          record['value'],
          actual,
          `record ${index} ${fn}`
        );
        if (difference !== null) {
          // Collect rather than throw on the first: when this canary goes red the useful
          // question is which functions moved and how far, not which sample was first.
          if (failures.length < 10) {
            failures.push(
              `${describeDifference(difference)} at x=${String(record['x'])}`
            );
          }
        }
      }
      if (failures.length > 0) {
        throw new Error(
          `the platform no longer reproduces the recorded libm (ADR 0022):\n${failures.join('\n')}`
        );
      }
      // All five, or the trace stopped covering something the engine calls.
      expect([...covered].sort()).toEqual(['atan', 'cos', 'pow', 'sin', 'tan']);
    }
  );
});

describe('narrowing to binary32', () => {
  test('reproduces what a Swift Float would hold', () => {
    // The constant from the trace contract: a Float of 0.1 read back as a double.
    expect(toFloat32(0.1)).toBe(0.100_000_001_490_116_12);
    expect(toFloat32(0)).toBe(0);
    expect(Object.is(toFloat32(-0), -0)).toBe(true);
  });
});
