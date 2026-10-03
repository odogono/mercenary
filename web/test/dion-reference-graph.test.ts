import { expect, test } from 'bun:test';

import {
  searchTaxiReferenceGraph,
  type TaxiReferenceEdge,
  type TaxiReferenceGraph
} from '../../research/mercenary-iii-st/scripts/taxi-reference-graph.ts';

type Edge = TaxiReferenceEdge<string, number>;
const graph = (
  edges: Readonly<Record<string, readonly Edge[]>>,
  accepting: readonly string[],
  captureFrame = 30
): TaxiReferenceGraph<string, number> => ({
  captureFrame,
  compareOperations: (a, b) => a - b,
  initial: 'root',
  key: node => node,
  matchesSource: node => accepting.includes(node),
  outgoing: node => edges[node] ?? []
});
const edge = (
  operation: number,
  node: string,
  departures: readonly number[] = []
): Edge => ({ departures, node, operation });

test('complete graph search keeps both departure prefixes at a merged historical node', () => {
  const machine = graph(
    {
      before: [edge(2, 'join', [10])],
      join: [edge(3, 'accepted', [20])],
      root: [edge(0, 'join'), edge(1, 'before')]
    },
    ['accepted']
  );
  expect(searchTaxiReferenceGraph(machine)).toEqual({
    discoveredPairs: 6,
    kind: 'selected',
    reference: { departures: [10, 20], operations: [1, 2, 3] }
  });
});

test('equal schedules choose the shortest word, then the first word in operation order', () => {
  const machine = graph(
    {
      extra: [edge(0, 'accepted', [10])],
      long: [edge(0, 'extra')],
      root: [edge(0, 'long'), edge(1, 'second'), edge(2, 'third')],
      second: [edge(5, 'accepted', [10])],
      third: [edge(0, 'accepted', [10])]
    },
    ['accepted']
  );
  expect(searchTaxiReferenceGraph(machine)).toMatchObject({
    kind: 'selected',
    reference: { departures: [10], operations: [1, 5] }
  });
});

test('zero-tick cycles saturate and accepting nodes still have outgoing transitions', () => {
  const machine = graph(
    {
      accepted: [edge(0, 'better', [21])],
      better: [edge(0, 'better')],
      root: [edge(0, 'root'), edge(1, 'accepted', [20])]
    },
    ['accepted', 'better']
  );
  expect(searchTaxiReferenceGraph(machine)).toEqual({
    discoveredPairs: 3,
    kind: 'selected',
    reference: { departures: [20], operations: [1] }
  });
  expect(
    searchTaxiReferenceGraph(graph({ root: [edge(0, 'root')] }, []))
  ).toEqual({ discoveredPairs: 1, kind: 'unreachable' });
});

test('a cutoff remains unresolved even if a matching witness has been found', () => {
  const machine = graph(
    { accepted: [edge(0, 'later')], root: [edge(0, 'accepted')] },
    ['accepted']
  );
  expect(searchTaxiReferenceGraph(machine, 1)).toEqual({
    discoveredPairs: 1,
    kind: 'unresolved',
    matchingWitness: null
  });
  expect(searchTaxiReferenceGraph(machine, 2)).toEqual({
    discoveredPairs: 2,
    kind: 'unresolved',
    matchingWitness: { departures: [], operations: [0] }
  });
  expect(searchTaxiReferenceGraph(machine, 3)).toMatchObject({
    kind: 'selected',
    reference: { departures: [], operations: [0] }
  });
});

test('one advance may contain several departures and proper prefixes precede extensions', () => {
  const machine = graph(
    { root: [edge(0, 'two', [0, 3]), edge(1, 'one', [0])] },
    ['one', 'two'],
    4
  );
  expect(searchTaxiReferenceGraph(machine)).toMatchObject({
    kind: 'selected',
    reference: { departures: [0], operations: [1] }
  });
});

test('long witnesses are reconstructed iteratively from predecessor pairs', () => {
  const length = 10_000;
  const result = searchTaxiReferenceGraph<number, number>({
    captureFrame: 0,
    compareOperations: (a, b) => a - b,
    initial: 0,
    key: String,
    matchesSource: node => node === length,
    outgoing: node =>
      node < length ? [{ departures: [], node: node + 1, operation: node }] : []
  });
  expect(result).toEqual({
    discoveredPairs: length + 1,
    kind: 'selected',
    reference: {
      departures: [],
      operations: Array.from({ length }, (_, i) => i)
    }
  });
});

test('malformed operation ordering and unbounded departure edges cannot certify a graph', () => {
  for (const edges of [
    [edge(1, 'a'), edge(0, 'b')],
    [edge(0, 'a'), edge(0, 'b')],
    [edge(0, 'a', [30])],
    [edge(0, 'a', [-1])],
    [edge(0, 'a', [1, 1])]
  ]) {
    expect(() =>
      searchTaxiReferenceGraph(graph({ root: edges }, ['a']))
    ).toThrow();
  }
  expect(() => searchTaxiReferenceGraph(graph({}, []), 0)).toThrow();
  expect(() => searchTaxiReferenceGraph(graph({}, [], -1))).toThrow();
});

test('graph search agrees with independent path enumeration for every three-frame source class', () => {
  // Independent exhaustive oracle: all eight possible schedules and all 256
  // accepting subsets. Search must recover them from graph edges, not a supplied
  // list of matching vectors. This is synthetic finite analysis, not I2 input.
  const paths = Array.from({ length: 8 }, (_, mask) => {
    const departures = [0, 1, 2].filter(frame => (mask & (1 << frame)) !== 0);
    const operations = [0, 1, 2].map(frame => (mask >> frame) & 1);
    return { departures, mask, operations };
  });
  const edges: Record<string, Edge[]> = {};
  for (let depth = 0; depth < 3; depth++) {
    for (let mask = 0; mask < 1 << depth; mask++) {
      const node = depth === 0 ? 'root' : `${depth}:${mask}`;
      edges[node] = [0, 1].map(operation =>
        edge(
          operation,
          `${depth + 1}:${mask | (operation << depth)}`,
          operation === 1 ? [depth] : []
        )
      );
    }
  }
  const compare = (a: (typeof paths)[number], b: (typeof paths)[number]) => {
    for (
      let i = 0;
      i < Math.min(a.departures.length, b.departures.length);
      i++
    ) {
      const difference = a.departures[i]! - b.departures[i]!;
      if (difference !== 0) {
        return difference;
      }
    }
    return a.departures.length - b.departures.length;
  };
  for (let subset = 0; subset < 256; subset++) {
    const accepted = paths.filter(path => (subset & (1 << path.mask)) !== 0);
    const expected = accepted.sort(compare)[0];
    const actual = searchTaxiReferenceGraph(
      graph(
        edges,
        accepted.map(path => `3:${path.mask}`),
        3
      )
    );
    if (expected) {
      expect(actual).toMatchObject({
        kind: 'selected',
        reference: {
          departures: expected.departures,
          operations: expected.operations
        }
      });
    } else {
      expect(actual).toMatchObject({ kind: 'unreachable' });
    }
  }
});
