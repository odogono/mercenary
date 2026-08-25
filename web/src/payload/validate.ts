import { fail } from './errors.ts';

/// Reading a payload document strictly, by hand.
///
/// Swift gets this for nothing: `Codable` refuses a document whose field is missing or holds
/// the wrong type, and every payload document relies on that. TypeScript's `JSON.parse`
/// returns `any` and would let a renamed field arrive as `undefined` and travel until it
/// produced a wrong wireframe rather than an error — which is the failure the Reference
/// Build's own decode was built to refuse.
///
/// So each document is validated field by field. The validators are written out rather than
/// generated from a schema library because the set of documents is closed and versioned, the
/// dependency budget for the port is zero, and a validator that reads as a description of its
/// document is worth having twice over: it is also the clearest record of what the payload
/// contains.
///
/// A failure names the path it happened at — `objects.json instances[7].position[2]` — because
/// the payload is machine-generated and "expected an integer" without a path is a hunt.

export interface Reader {
  /// The document being read, for the failure message.
  readonly name: string;
}

const bad = (
  reader: Reader,
  path: string,
  expected: string,
  got: unknown
): never =>
  fail({
    kind: 'unreadable',
    name: reader.name,
    reason: `${path} should be ${expected}, and is ${
      got === undefined ? 'absent' : JSON.stringify(got)
    }`
  });

export const asObject = (
  reader: Reader,
  value: unknown,
  path: string
): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return bad(reader, path, 'an object', value);
  }
  return value as Record<string, unknown>;
};

export const asArray = (
  reader: Reader,
  value: unknown,
  path: string
): unknown[] => {
  if (!Array.isArray(value)) {
    return bad(reader, path, 'an array', value);
  }
  return value;
};

/// An integer, and only an integer. The payload's integer-preserving rule (ADR 0012) means a
/// count or a coordinate is never written `12.0`, so a fractional value here is a real fault.
export const asInt = (reader: Reader, value: unknown, path: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return bad(reader, path, 'an integer', value);
  }
  return value;
};

/// A number that may carry a fraction. Used for the decoded flight parameters, which are real
/// numbers rather than the engine's own sixteen-bit floats (ADR 0015).
export const asNumber = (
  reader: Reader,
  value: unknown,
  path: string
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return bad(reader, path, 'a finite number', value);
  }
  return value;
};

export const asString = (
  reader: Reader,
  value: unknown,
  path: string
): string => {
  if (typeof value !== 'string') {
    return bad(reader, path, 'a string', value);
  }
  return value;
};

export const asBool = (
  reader: Reader,
  value: unknown,
  path: string
): boolean => {
  if (typeof value !== 'boolean') {
    return bad(reader, path, 'a boolean', value);
  }
  return value;
};

/// A field that may be absent or null, which the payload uses for a genuine "no value" — a
/// block with no mode, an object with no orientation bytes.
export const optional = <T>(
  value: unknown,
  read: (value: unknown) => T
): T | undefined =>
  value === undefined || value === null ? undefined : read(value);

export const intArray = (
  reader: Reader,
  value: unknown,
  path: string
): number[] =>
  asArray(reader, value, path).map((item, i) =>
    asInt(reader, item, `${path}[${i}]`)
  );

/// A fixed-width table. A short or long one would leave the reader guessing which
/// entries went missing, so the width is part of the contract rather than a hint.
export const intArrayOfLength = (
  reader: Reader,
  value: unknown,
  path: string,
  length: number
): number[] => {
  const items = intArray(reader, value, path);
  if (items.length !== length) {
    return bad(reader, path, `${length} entries`, items.length);
  }
  return items;
};

/// A two-entry table — a cell, a window — read as a pair so the callers that
/// only ever want both entries index it without a fallback standing in for a
/// malformed payload.
export const intPair = (
  reader: Reader,
  value: unknown,
  path: string
): [number, number] => {
  const items = intArrayOfLength(reader, value, path, 2);
  const [first, second] = items;
  if (first === undefined || second === undefined) {
    return bad(reader, path, '2 entries', items.length);
  }
  return [first, second];
};

export const numberArray = (
  reader: Reader,
  value: unknown,
  path: string
): number[] =>
  asArray(reader, value, path).map((item, i) =>
    asNumber(reader, item, `${path}[${i}]`)
  );

export const stringArray = (
  reader: Reader,
  value: unknown,
  path: string
): string[] =>
  asArray(reader, value, path).map((item, i) =>
    asString(reader, item, `${path}[${i}]`)
  );

export const intArrayArray = (
  reader: Reader,
  value: unknown,
  path: string
): number[][] =>
  asArray(reader, value, path).map((item, i) =>
    intArray(reader, item, `${path}[${i}]`)
  );

/// A map of counts, as every document's `counts` field carries.
export const intMap = (
  reader: Reader,
  value: unknown,
  path: string
): Record<string, number> => {
  const source = asObject(reader, value, path);
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(source)) {
    out[key] = asInt(reader, entry, `${path}.${key}`);
  }
  return out;
};

/// One of a closed set of names. The export refuses any control routine it cannot name, so a
/// handler outside this set means the payload and the port disagree about the set.
export const asOneOf = <T extends string>(
  reader: Reader,
  value: unknown,
  path: string,
  allowed: readonly T[]
): T => {
  const text = asString(reader, value, path);
  if (!(allowed as readonly string[]).includes(text)) {
    return bad(reader, path, `one of ${allowed.join(', ')}`, text);
  }
  return text as T;
};
