import { compareTaxiDepartureSchedules } from './taxi-canonical-reference.ts';

export interface TaxiReferenceEdge<Node, Operation> {
  readonly operation: Operation;
  readonly node: Node;
  // Successful pre-Start frames, not consuming frames or ticks. One advance
  // may cross several departures; rejected or pending Starts contribute none.
  readonly departures: readonly number[];
}

// Research-only graph search. The adapter owns the proof that its graph is
// finite, nodes/labels remain immutable, keys preserve complete private state
// and matching/transition behavior, and deterministic outgoing operations are
// exhaustive under one global total operation order. matchesSource must compare
// the complete encoded source projection. A restricted graph establishes only
// its own reference, never I2 source eligibility or a globally canonical natural
// history.
export interface TaxiReferenceGraph<Node, Operation> {
  readonly captureFrame: number;
  readonly initial: Node;
  key(node: Node): string;
  matchesSource(node: Node): boolean;
  outgoing(node: Node): Iterable<TaxiReferenceEdge<Node, Operation>>;
  compareOperations(a: Operation, b: Operation): number;
}

export interface TaxiGraphReference<Operation> {
  readonly departures: readonly number[];
  readonly operations: readonly Operation[];
}

export type TaxiReferenceGraphResult<Operation> =
  | {
      readonly kind: 'selected';
      readonly discoveredPairs: number;
      readonly reference: TaxiGraphReference<Operation>;
    }
  | { readonly kind: 'unreachable'; readonly discoveredPairs: number }
  | {
      readonly kind: 'unresolved';
      readonly discoveredPairs: number;
      // Existence evidence only; neither departure minimality nor the final
      // shortest/lexicographic tie break is certified on an incomplete search.
      readonly matchingWitness: TaxiGraphReference<Operation> | null;
    };

export const searchTaxiReferenceGraph = <Node, Operation>(
  graph: TaxiReferenceGraph<Node, Operation>,
  maxStates = Number.POSITIVE_INFINITY
): TaxiReferenceGraphResult<Operation> => {
  if (!Number.isSafeInteger(graph.captureFrame) || graph.captureFrame < 0) {
    throw new Error('capture frame must be a nonnegative safe integer');
  }
  if (
    maxStates !== Number.POSITIVE_INFINITY &&
    (!Number.isSafeInteger(maxStates) || maxStates < 1)
  ) {
    throw new Error('state limit must be a positive safe integer or Infinity');
  }
  interface Pair {
    readonly node: Node;
    readonly departures: readonly number[];
    readonly trace: {
      readonly parent: number;
      readonly operation: Operation;
    } | null;
  }
  const pairKey = (node: Node, departures: readonly number[]) =>
    JSON.stringify([graph.key(node), departures]);
  const queue: Pair[] = [{ node: graph.initial, departures: [], trace: null }];
  const seen = new Set([pairKey(graph.initial, [])]);
  // Store one predecessor per pair, not a copied word at every search depth.
  const reference = (index: number): TaxiGraphReference<Operation> => {
    const departures = queue[index]!.departures;
    const operations: Operation[] = [];
    for (
      let trace = queue[index]!.trace;
      trace !== null;
      trace = queue[trace.parent]!.trace
    ) {
      operations.push(trace.operation);
    }
    return { departures, operations: operations.reverse() };
  };
  let best: number | null = null;
  for (let index = 0; index < queue.length; index++) {
    const { node, departures: prefix } = queue[index]!;
    if (
      graph.matchesSource(node) &&
      (best === null ||
        compareTaxiDepartureSchedules(prefix, queue[best]!.departures) < 0)
    ) {
      best = index;
    }
    // Do not stop at the first accepting node: it need not carry the least
    // departure vector. Its zero-tick outgoing edges still belong to closure.
    let previous: TaxiReferenceEdge<Node, Operation> | undefined;
    for (const edge of graph.outgoing(node)) {
      if (previous !== undefined) {
        const order = graph.compareOperations(
          previous.operation,
          edge.operation
        );
        if (!Number.isFinite(order) || order >= 0) {
          throw new Error('outgoing operations must be strictly ordered');
        }
      }
      previous = edge;
      const departures = [...prefix, ...edge.departures];
      // This comparison also validates integer entries and strict increase,
      // including an edge's first departure against its predecessor vector.
      compareTaxiDepartureSchedules(departures, departures);
      if (departures.some(frame => frame >= graph.captureFrame)) {
        throw new Error('departure must precede the capture frame');
      }
      const key = pairKey(edge.node, departures);
      if (seen.has(key)) continue;
      if (seen.size >= maxStates) {
        return {
          kind: 'unresolved',
          discoveredPairs: seen.size,
          matchingWitness: best === null ? null : reference(best)
        };
      }
      seen.add(key);
      // Unit-cost BFS with ordered edges visits words by length, then full
      // operation order. The first path to a PAIR supplies both tie breakers.
      queue.push({
        node: edge.node,
        departures,
        trace: { parent: index, operation: edge.operation }
      });
    }
  }
  return best === null
    ? { kind: 'unreachable', discoveredPairs: seen.size }
    : {
        kind: 'selected',
        discoveredPairs: seen.size,
        reference: reference(best)
      };
};
