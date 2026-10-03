import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DionTaxi } from '../../../web/src/dion/service.ts';
import { TAXI_SOURCE_REVISION, withTaxiSource } from './taxi-source.ts';

interface RelaxedInput {
  readonly call: boolean;
  readonly playerCell: number;
}
interface Node {
  readonly taxi: DionTaxi;
  readonly inputs: readonly RelaxedInput[];
}

// A complete overapproximation only until the FIRST boarding. Free per-frame
// call values and all cells remove card/pose/call guards. Before boarding no
// input writes destination, passenger or start; genuine restore preserves taxi.
// Boarding consumes the service result, not a transient internal pass state.
export const auditTaxiFirstIdBound = async () =>
  withTaxiSource(async source => {
    const path = join(source.root, 'web/src/dion/service.ts');
    const { stepTaxi } = (await import(
      path
    )) as typeof import('../../../web/src/dion/service.ts');
    const fresh = new source.SourceSession(source.content).snapshot.taxi;
    let nodes = new Map<string, Node>([
      [JSON.stringify(fresh), { taxi: fresh, inputs: [] }]
    ]);
    const layers: {
      frame: number;
      inputStates: number;
      transitions: number;
      states: number;
      boardableStates: number;
    }[] = [];
    for (let frame = 1; ; frame++) {
      const next = new Map<string, Node>();
      let transitions = 0;
      for (const node of nodes.values()) {
        for (const call of [false, true]) {
          for (let playerCell = 0; playerCell < 256; playerCell++) {
            const result = stepTaxi(
              source.content,
              { ...node.taxi, call },
              playerCell
            );
            transitions++;
            assert.equal(result.arrived, false);
            assert.equal(result.taxi.passenger, false);
            assert.equal(result.taxi.start, false);
            assert.equal(result.taxi.destination, 0);
            assert.ok([0, 1, 2, 34, 35].includes(result.taxi.counter));
            const key = JSON.stringify(result.taxi);
            if (!next.has(key)) {
              next.set(key, {
                taxi: result.taxi,
                inputs: [...node.inputs, { call, playerCell }]
              });
            }
          }
        }
      }
      const boardable = [...next.values()].filter(
        node => node.taxi.counter === 2
      );
      layers.push({
        frame,
        inputStates: nodes.size,
        transitions,
        states: next.size,
        boardableStates: boardable.length
      });
      if (boardable.length !== 0) {
        // These are genuine zero-input captures, separate from the relaxed
        // witness. The constructor's source code supplies the universal fact;
        // this executable control checks it without injecting a taxi snapshot.
        const natural = new source.SourceSession(source.content);
        for (let i = 0; i <= frame; i++) {
          const capture = natural.captureResume();
          const restored = new source.SourceSession(source.content, capture);
          assert.deepEqual(restored.snapshot.taxi, natural.snapshot.taxi);
          if (i < frame) natural.advance(11 / 50);
        }
        return {
          sourceRevision: TAXI_SOURCE_REVISION,
          identity: source.codec.dionRecordIdentity(source.content),
          archivedServiceSha256: createHash('sha256')
            .update(readFileSync(path))
            .digest('hex'),
          abstraction: {
            playerCells: 256,
            callValues: [false, true],
            scope:
              'All pre-first-boarding taxi states; card, call and physical guards relaxed. Each layer fully exhausted, including the first boardable layer.',
            completeness:
              'Before boarding only call can change by input; passenger/start/destination remain false/false/0. Each natural frame uses one cell in 0..255 and one call value. Genuine restores preserve every taxi field; zero-tick inputs do not advance service.'
          },
          earliestBoardableFrame: frame,
          earliestBoardableTick: frame * 11,
          layers,
          relaxedWitness: boardable[0]!,
          restorePreservesNaturalTaxi: true,
          naturalRestoreObservations: frame + 1,
          limit:
            'No accepted external ID can precede this bound: boarding ID needs post-service counter 2 and arrival ID needs a prior passenger. The relaxed witness is not a natural full-source history; message/pose/card guards may delay acceptance further.'
        };
      }
      nodes = next;
    }
  });

if (import.meta.main)
  console.log(JSON.stringify(await auditTaxiFirstIdBound(), null, 2));
