import { isDeepStrictEqual } from 'node:util';

import type { DionAction } from '../../../web/src/dion/session.ts';
import type { TaxiGraphReference } from './taxi-reference-graph.ts';
import { readTaxiSourceCandidate } from './taxi-source-eligibility.ts';
import type { withTaxiSource } from './taxi-source.ts';

type Source = Parameters<Parameters<typeof withTaxiSource>[0]>[0];
type Operation =
  | { readonly kind: 'press'; readonly action: DionAction }
  | { readonly kind: 'advance'; readonly seconds: number };

// Complete source reachability/reference rule ONLY before the first tick. The
// frozen press/intent/advance/captureRestore writers cannot change any other
// serialized opening owner without executing a tick. Later records must use
// the general inverse solver; outside-domain is not a migration refusal.
export const taxiZeroTickReference = (
  encoded: string,
  source: Source
):
  | { readonly kind: 'outside-domain' }
  | {
      readonly kind: 'selected';
      readonly reference: TaxiGraphReference<Operation>;
    } => {
  const record = readTaxiSourceCandidate(encoded, source);
  const { snapshot: saved, remainder } = record.snapshot;
  if (saved.tick !== 0) return { kind: 'outside-domain' };
  const fresh = new source.SourceSession(source.content).captureResume();
  const expected = {
    remainder,
    snapshot: { ...fresh.snapshot, pending: saved.pending }
  };
  // Project the constructed witness only. Normalizing the incoming record
  // would hide raw values (such as -0) that the writer cannot produce.
  const projected = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value));
  if (!isDeepStrictEqual(record.snapshot, projected(expected))) {
    throw new Error(
      'snapshot.snapshot: zero-tick state differs from the historical opening'
    );
  }
  const operations: Operation[] = [];
  if (saved.pending !== null) {
    operations.push({ kind: 'press', action: saved.pending });
  }
  if (remainder !== 0) operations.push({ kind: 'advance', seconds: remainder });
  // No trip is possible. A nonnull pending action needs a press; positive
  // remainder needs an advance. These commute before tick 1, so press-first
  // is the least word among the minimum-length words under the global order.
  return { kind: 'selected', reference: { departures: [], operations } };
};
