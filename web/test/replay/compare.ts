import type { TraceValue } from "./trace.ts"

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
  /// Where in the record the two disagree, as a readable path.
  readonly path: string
  readonly expected: TraceValue | undefined
  readonly actual: TraceValue | undefined
}

const describe = (value: TraceValue | undefined): string => {
  if (value === undefined) return "absent"
  if (typeof value === "number") {
    // Full precision and the sign of a zero, which is the whole point of comparing this way.
    return Object.is(value, -0) ? "-0" : value.toPrecision(17)
  }
  return JSON.stringify(value)
}

export const describeDifference = (difference: Difference): string =>
  `${difference.path}: expected ${describe(difference.expected)}, ` +
  `got ${describe(difference.actual)}`

const isObject = (value: TraceValue): value is { [key: string]: TraceValue } =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/// The first place two values disagree, or null when they are identical.
///
/// Depth-first and ordered, so the reported path is the first difference a reader would find
/// themselves, rather than whichever one a hash happened to surface.
export const firstDifference = (
  expected: TraceValue | undefined,
  actual: TraceValue | undefined,
  path = "$",
): Difference | null => {
  if (expected === undefined || actual === undefined) {
    return Object.is(expected, actual) ? null : { path, expected, actual }
  }
  if (typeof expected === "number" || typeof actual === "number") {
    return Object.is(expected, actual) ? null : { path, expected, actual }
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) return { path, expected, actual }
    if (expected.length !== actual.length) return { path: `${path}.length`, expected: expected.length, actual: actual.length }
    for (let i = 0; i < expected.length; i++) {
      const difference = firstDifference(expected[i], actual[i], `${path}[${i}]`)
      if (difference !== null) return difference
    }
    return null
  }
  if (isObject(expected) && isObject(actual)) {
    // Every key on both sides, in a stable order, so a member present on one side only is
    // reported as absent rather than skipped.
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()
    for (const key of keys) {
      const difference = firstDifference(expected[key], actual[key], `${path}.${key}`)
      if (difference !== null) return difference
    }
    return null
  }
  return Object.is(expected, actual) ? null : { path, expected, actual }
}

/// Compare, and throw with the first disagreement when there is one.
///
/// One assertion per gate rather than one per value: a flight trace is eighteen hundred
/// records, and a test framework reporting eighteen hundred passing assertions buries the
/// single line that matters.
export const expectIdentical = (
  expected: TraceValue | undefined,
  actual: TraceValue | undefined,
  context: string,
): void => {
  const difference = firstDifference(expected, actual)
  if (difference !== null) {
    throw new Error(`${context} diverged — ${describeDifference(difference)}`)
  }
}
