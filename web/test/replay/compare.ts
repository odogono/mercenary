import type { TraceValue } from '../../src/trace/index.ts';

/// Comparing a ported module's answer against what the Trace Oracle recorded.
///
/// **Values, bit-for-bit — never bytes.** Swift and JavaScript do not spell the same `double`
/// the same way, so a byte comparison across languages fails on formatting rather than on
/// behaviour, and "fixing" it to compare bytes would be a step backwards
/// (`docs/trace-oracle.md`). The trace is parsed and the parsed numbers are compared exactly.
///
/// Exactly means `Object.is`, not `===`. `===` calls `-0` and `0` equal, and a projection that
/// put a line on the other side of the origin would pass; it also calls `NaN` unequal to
/// itself, when a trace can carry no `NaN` at all and a ported module producing one is the
/// clearest possible failure.

export interface Difference {
  readonly actual: TraceValue | undefined;
  readonly expected: TraceValue | undefined;
  /// Where in the record the two disagree, as a readable path.
  readonly path: string;
}

const describe = (value: TraceValue | undefined): string => {
  if (value === undefined) {
    return 'absent';
  }
  if (typeof value === 'number') {
    // Full precision and the sign of a zero, which is the whole point of comparing this way.
    return Object.is(value, -0) ? '-0' : value.toPrecision(17);
  }
  return JSON.stringify(value);
};

export const describeDifference = (difference: Difference): string =>
  `${difference.path}: expected ${describe(difference.expected)}, ` +
  `got ${describe(difference.actual)}`;

const isObject = (value: TraceValue): value is { [key: string]: TraceValue } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/// The first place two values disagree, or null when they are identical.
///
/// Depth-first and ordered, so the reported path is the first difference a reader would find
/// themselves, rather than whichever one a hash happened to surface.
export const firstDifference = (
  expected: TraceValue | undefined,
  actual: TraceValue | undefined,
  path = '$'
): Difference | null => {
  if (expected === undefined || actual === undefined) {
    return Object.is(expected, actual) ? null : { actual, expected, path };
  }
  if (typeof expected === 'number' || typeof actual === 'number') {
    return Object.is(expected, actual) ? null : { actual, expected, path };
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return { actual, expected, path };
    }
    if (expected.length !== actual.length) {
      return {
        actual: actual.length,
        expected: expected.length,
        path: `${path}.length`
      };
    }
    for (let i = 0; i < expected.length; i++) {
      const difference = firstDifference(
        expected[i],
        actual[i],
        `${path}[${i}]`
      );
      if (difference !== null) {
        return difference;
      }
    }
    return null;
  }
  if (isObject(expected) && isObject(actual)) {
    // Every key on both sides, in a stable order, so a member present on one side only is
    // reported as absent rather than skipped.
    const keys = [
      ...new Set([...Object.keys(expected), ...Object.keys(actual)])
    ].sort();
    for (const key of keys) {
      const difference = firstDifference(
        expected[key],
        actual[key],
        `${path}.${key}`
      );
      if (difference !== null) {
        return difference;
      }
    }
    return null;
  }
  return Object.is(expected, actual) ? null : { actual, expected, path };
};

/// Whether two values are identical, without working out where they differ.
///
/// The same walk as `firstDifference` and the same notion of identity, but it allocates nothing:
/// no path strings, no merged-and-sorted key sets. That matters because on a passing run — which
/// is every run a gate is asked to certify — the answer is always "identical", so every path
/// string `firstDifference` builds is built to be thrown away. A whole-session gate grades tens
/// of thousands of records, each a snapshot carrying a sixty-four entry residence table.
///
/// Kept deliberately as a second walk rather than a flag on the first: the reported path is what
/// makes a divergence readable, and threading "do not bother" through the recursion is how that
/// stops being trustworthy.
const same = (
  expected: TraceValue | undefined,
  actual: TraceValue | undefined
): boolean => {
  if (expected === undefined || actual === undefined) {
    return Object.is(expected, actual);
  }
  if (typeof expected === 'number' || typeof actual === 'number') {
    return Object.is(expected, actual);
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (
      !Array.isArray(expected) ||
      !Array.isArray(actual) ||
      expected.length !== actual.length
    ) {
      return false;
    }
    return expected.every((value, index) => same(value, actual[index]));
  }
  if (isObject(expected) && isObject(actual)) {
    const expectedKeys = Object.keys(expected);
    // A key count on both sides plus a hit for each of one side's keys covers a member present
    // on one side only, which is what the sorted union in `firstDifference` is there for.
    if (expectedKeys.length !== Object.keys(actual).length) {
      return false;
    }
    return expectedKeys.every(
      key => key in actual && same(expected[key], actual[key])
    );
  }
  return Object.is(expected, actual);
};

/// Compare, and throw with the first disagreement when there is one.
///
/// One assertion per gate rather than one per value: a flight trace is eighteen hundred
/// records, and a test framework reporting eighteen hundred passing assertions buries the
/// single line that matters.
///
/// The cheap walk decides, and `firstDifference` is asked only once it has found something — so a
/// passing gate never pays for a path it will not print, and a failing one reports exactly what
/// it always did.
export const expectIdentical = (
  expected: TraceValue | undefined,
  actual: TraceValue | undefined,
  context: string
): void => {
  if (same(expected, actual)) {
    return;
  }
  const difference = firstDifference(expected, actual);
  if (difference !== null) {
    throw new Error(`${context} diverged — ${describeDifference(difference)}`);
  }
};
