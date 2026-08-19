/// Reading a Golden Trace, and folding its deltas forward.
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

export const parseTrace = (
  text: string,
  emitter: string,
  id: string
): Trace => {
  const lines = text.split('\n').filter(line => line.length > 0);
  if (lines.length === 0) {
    throw new Error(`${emitter}/${id} is empty`);
  }
  const header = JSON.parse(lines[0]!) as TraceObject;
  const version = header['schemaVersion'];
  if (version !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      `${emitter}/${id} is trace schema ${String(version)}, and this harness reads ` +
        `${SUPPORTED_SCHEMA_VERSION}`
    );
  }
  if (header['emitter'] !== emitter || header['id'] !== id) {
    throw new Error(
      `${emitter}/${id} says it is ${String(header['emitter'])}/${String(header['id'])}`
    );
  }
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

const isObject = (value: TraceValue): value is TraceObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
