/// Reading a Golden Trace, and folding its deltas forward.
///
/// In `src` rather than beside the tests because there are two readers, not one: the Replay Gates
/// fold a whole state to grade it, and the browser page folds the player out of a flight trace to
/// fly it. A second reader in the page would mean the schema version, the JSON Lines split and the
/// fold semantics written twice, and the copy that is not a gate is exactly the one that would
/// half-read a bumped schema without failing. Nothing here touches a filesystem or a test runner —
/// locating an artifact is `test/replay/artifacts.ts`, and grading one is `test/replay/compare.ts`.
///
/// JSON Lines: the first line is the header, every line after it is one record. A record
/// carries `changed`, a recursive structural diff against the previous state rather than the
/// state itself, because the collections in the game state dwarf what moves on any one step.
/// A replay reconstructs by folding those forward from the header's `initial`.
///
/// `apply` has to undo `changes(to:)` exactly. A fold that did not would report divergences
/// the simulation never had, which is the one failure a Replay Gate must not have.

/// Any value a trace can carry. Deliberately not narrowed further: a harness that knew the
/// shape of each emitter's records would need changing whenever one gained a field, and its
/// job is to compare what is there.
export type TraceValue =
  | number
  | string
  | boolean
  | null
  | TraceValue[]
  | { [key: string]: TraceValue };

export type TraceObject = { [key: string]: TraceValue };

export interface Trace {
  readonly emitter: string;
  readonly header: TraceObject;
  readonly id: string;
  readonly records: readonly TraceObject[];
}

/// The key a diff lists removed members under. Cannot collide with a field: every field in a
/// trace is a name or a number.
const REMOVAL_KEY = '-';

/// The trace schema this harness understands. A trace written in a schema it does not know is
/// refused rather than half-read — the version exists precisely so that a header shape can
/// change without a reader silently misinterpreting it.
export const SUPPORTED_SCHEMA_VERSION = 3;

/// The header alone, without parsing the records.
///
/// A trace's records dwarf its header — twelve of them are a couple of megabytes — and a caller
/// that only wants what the run was configured with should not pay to parse every step of it.
/// The same schema and identity checks apply, because a header is the thing they are about.
export const parseTraceHeader = (
  text: string,
  emitter: string,
  id: string
): TraceObject => {
  const end = text.indexOf('\n');
  const first = end < 0 ? text : text.slice(0, end);
  if (first.length === 0) {
    throw new Error(`${emitter}/${id} is empty`);
  }
  return checkedHeader(JSON.parse(first) as TraceObject, emitter, id);
};

const checkedHeader = (
  header: TraceObject,
  emitter: string,
  id: string
): TraceObject => {
  const version = header['schemaVersion'];
  if (version !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      `${emitter}/${id} is trace schema ${String(version)}, and this reader reads ` +
        `${SUPPORTED_SCHEMA_VERSION}`
    );
  }
  if (header['emitter'] !== emitter || header['id'] !== id) {
    throw new Error(
      `${emitter}/${id} says it is ${String(header['emitter'])}/${String(header['id'])}`
    );
  }
  return header;
};

export const parseTrace = (
  text: string,
  emitter: string,
  id: string
): Trace => {
  const lines = text.split('\n').filter(line => line.length > 0);
  if (lines.length === 0) {
    throw new Error(`${emitter}/${id} is empty`);
  }
  const header = checkedHeader(
    JSON.parse(lines[0]!) as TraceObject,
    emitter,
    id
  );
  const records = lines.slice(1).map((line, index) => {
    try {
      return JSON.parse(line) as TraceObject;
    } catch (error) {
      throw new Error(
        `${emitter}/${id} record ${index} is not JSON: ${String(error)}`
      );
    }
  });
  return { emitter, header, id, records };
};

/// Whether a trace value is a named shape, and so has members to read or merge.
///
/// Exported because every reader needs it before it can index a value: `apply` merges member by
/// member, and the page has to reach `player.position` through two of them.
export const isObject = (value: TraceValue | undefined): value is TraceObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/// What to write to turn `before` into `after`, or `undefined` when nothing moved.
///
/// Two objects diff member by member. Anything else that differs is written whole, because a
/// partial update only means something for a shape whose members are named. `apply` undoes
/// this exactly.
export const changes = (
  before: TraceValue,
  after: TraceValue
): TraceValue | undefined => {
  if (firstEqual(before, after)) {
    return undefined;
  }
  if (!isObject(before) || !isObject(after)) {
    return after;
  }
  const members: TraceObject = {};
  for (const [key, value] of Object.entries(after)) {
    if (!(key in before)) {
      members[key] = value;
      continue;
    }
    const change = changes(before[key]!, value);
    if (change !== undefined) {
      members[key] = change;
    }
  }
  const removed = Object.keys(before)
    .filter(key => !(key in after))
    .sort();
  if (removed.length > 0) {
    members[REMOVAL_KEY] = removed;
  }
  return Object.keys(members).length === 0 ? undefined : members;
};

const firstEqual = (left: TraceValue, right: TraceValue): boolean => {
  if (typeof left === 'number' || typeof right === 'number') {
    return Object.is(left, right);
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !Array.isArray(left) ||
      !Array.isArray(right) ||
      left.length !== right.length
    ) {
      return false;
    }
    return left.every((item, i) => firstEqual(item, right[i]!));
  }
  if (isObject(left) && isObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      if (!(key in left) || !(key in right)) {
        return false;
      }
      if (!firstEqual(left[key]!, right[key]!)) {
        return false;
      }
    }
    return true;
  }
  return left === right;
};

/// Fold one recorded change forward, returning the state it produces.
///
/// Objects merge member by member and recurse; anything else replaces wholesale, because a
/// partial update only means something for a shape whose members are named. Members listed
/// under `-` are removed.
export const apply = (state: TraceValue, change: TraceValue): TraceValue => {
  if (!isObject(state) || !isObject(change)) {
    return change;
  }
  const next: TraceObject = { ...state };
  for (const [key, value] of Object.entries(change)) {
    if (key === REMOVAL_KEY) {
      if (Array.isArray(value)) {
        for (const removed of value) {
          if (typeof removed === 'string') {
            delete next[removed];
          }
        }
      }
      continue;
    }
    next[key] = key in next ? apply(next[key]!, value) : value;
  }
  return next;
};

/// Every state a trace passed through, starting from the header's `initial`.
///
/// Returned as an array rather than yielded one at a time because a gate compares a whole run
/// and reports the first step that moved, and because a trace is a few megabytes at worst.
export const foldStates = (trace: Trace): TraceValue[] => {
  const initial = trace.header['initial'];
  if (initial === undefined) {
    throw new Error(
      `${trace.emitter}/${trace.id} has no initial state to fold from`
    );
  }
  let state: TraceValue = initial;
  const states: TraceValue[] = [];
  for (const record of trace.records) {
    const changed = record['changed'];
    if (changed !== undefined) {
      state = apply(state, changed);
    }
    states.push(state);
  }
  return states;
};
