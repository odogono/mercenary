import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { auditTaxiFirstIdBound } from '../../research/mercenary-iii-st/scripts/taxi-first-id-bound.ts';

test('exhausted relaxed pre-boarding service excludes every external ID before frame 19', async () => {
  const evidence = await auditTaxiFirstIdBound();
  const ledger = JSON.parse(
    readFileSync(
      new URL(
        '../../research/mercenary-iii-st/taxi-first-id-bound-evidence.json',
        import.meta.url
      ),
      'utf8'
    )
  );
  expect(evidence).toEqual(ledger);
  expect(evidence.earliestBoardableFrame).toBe(19);
  expect(evidence.layers).toHaveLength(19);
  expect(
    evidence.layers.slice(0, -1).every(layer => layer.boardableStates === 0)
  ).toBe(true);
  expect(evidence.layers.at(-1)!.boardableStates).toBeGreaterThan(0);
  expect(evidence.restorePreservesNaturalTaxi).toBe(true);
  expect(evidence.naturalRestoreObservations).toBe(20);
}, 30_000);
