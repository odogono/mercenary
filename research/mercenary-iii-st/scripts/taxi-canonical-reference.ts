// Lexicographic order over every successful departure, including repeat trips.
// A proper prefix precedes its extensions. This orders reference histories; it
// does not prove source matching or enumerate the complete reachability class.
export const compareTaxiDepartureSchedules = (
  a: readonly number[],
  b: readonly number[]
): number => {
  for (const schedule of [a, b]) {
    if (
      schedule.some(
        (tick, i) =>
          !Number.isSafeInteger(tick) ||
          tick < 0 ||
          (i > 0 && tick <= schedule[i - 1]!)
      )
    ) {
      throw new Error(
        'departure schedule must contain increasing nonnegative safe ticks'
      );
    }
  }
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  }
  return Math.sign(a.length - b.length);
};

export interface TaxiDepartureQuery {
  readonly prefix: readonly number[];
  // Absent means a COMPLETE matching history with exactly this vector.
  // Present means a complete matching history extends the prefix with a next
  // departure <= this bound; subsequent departures are unrestricted.
  readonly nextAtMost?: number;
}

export type TaxiReachability = 'reachable' | 'unreachable' | 'unresolved';
export type TaxiDepartureSelection =
  | { readonly kind: 'selected'; readonly departures: readonly number[] }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'unresolved'; readonly query: TaxiDepartureQuery };

// Research-only universal ordering algorithm. The caller must answer each
// query over ALL complete histories matching the same full pinned old source.
// This separates canonical ordering from the still unimplemented inverse
// source solver. Finite replay candidates are not a sufficient oracle.
export const selectTaxiCanonicalDepartureSchedule = async (
  captureFrame: number,
  oracle: (query: TaxiDepartureQuery) => Promise<TaxiReachability>
): Promise<TaxiDepartureSelection> => {
  if (!Number.isSafeInteger(captureFrame) || captureFrame < 0) {
    throw new Error('capture frame must be a nonnegative safe integer');
  }
  const departures: number[] = [];
  const ask = async (nextAtMost?: number) => {
    const query: TaxiDepartureQuery = Object.freeze({
      prefix: Object.freeze([...departures]),
      ...(nextAtMost === undefined ? {} : { nextAtMost })
    });
    const result = await oracle(query);
    if (!['reachable', 'unreachable', 'unresolved'].includes(result)) {
      throw new Error('invalid reachability answer');
    }
    return { result, query };
  };
  for (;;) {
    // Prefix-first order means stop BEFORE looking for a later departure.
    const exact = await ask();
    if (exact.result === 'unresolved') {
      return { kind: 'unresolved', query: exact.query };
    }
    if (exact.result === 'reachable') {
      return { kind: 'selected', departures };
    }
    let lo = departures.length === 0 ? 0 : departures.at(-1)! + 1;
    let hi = captureFrame - 1;
    if (lo > hi) {
      if (departures.length !== 0) {
        throw new Error('inconsistent reachability oracle');
      }
      return { kind: 'unreachable' };
    }
    const any = await ask(hi);
    if (any.result === 'unresolved') {
      return { kind: 'unresolved', query: any.query };
    }
    if (any.result === 'unreachable') {
      if (departures.length !== 0) {
        throw new Error('inconsistent reachability oracle');
      }
      return { kind: 'unreachable' };
    }
    // Existence of a next departure <= x is monotone. The bound established
    // above remains reachable; a false answer removes only smaller values.
    while (lo < hi) {
      const mid = lo + Math.floor((hi - lo) / 2);
      const answer = await ask(mid);
      if (answer.result === 'unresolved') {
        return { kind: 'unresolved', query: answer.query };
      }
      if (answer.result === 'reachable') hi = mid;
      else lo = mid + 1;
    }
    departures.push(lo);
  }
};

// Research-only candidate enumeration for the retained single-trip family.
// Candidates are necessary timing matches, not source eligibility: every one
// must still pass a complete frozen-source replay and nested codec comparison.
// The last-reset offset must be calibrated from that family's actual script.
export const taxiCanonicalStartFrames = (
  tick: number,
  frame: number,
  wait: number,
  resetOffsetFrames: number,
  prefixFrame: number
): number[] => {
  if (
    ![tick, frame, wait, resetOffsetFrames, prefixFrame].every(
      value => Number.isSafeInteger(value) && value >= 0
    ) ||
    frame !== tick / 11 ||
    wait > 0xff_ff
  ) {
    throw new Error('Invalid full-frame source timing or replay calibration');
  }
  // wait = tick - 11 * (Start + offset), modulo 65536. Because 11 is
  // coprime with 65536, its inverse 35747 yields one residue class of Starts.
  const modulus = 65_536;
  const rawStart =
    ((tick % modulus) - wait) * 35_747 - (resetOffsetFrames % modulus);
  const residue = ((rawStart % modulus) + modulus) % modulus;
  const first =
    residue +
    Math.max(0, Math.ceil((prefixFrame - residue) / modulus)) * modulus;
  const candidates: number[] = [];
  // Leave is consumed on the final frame; Start must precede that frame.
  for (let start = first; start < frame - 1; start += modulus) {
    candidates.push(start);
  }
  return candidates;
};
