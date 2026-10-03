import { expect, test } from 'bun:test';

import { readTaxiSourceCandidate } from '../../research/mercenary-iii-st/scripts/taxi-source-eligibility.ts';
import { withTaxiSource } from '../../research/mercenary-iii-st/scripts/taxi-source.ts';
import { taxiZeroTickReference } from '../../research/mercenary-iii-st/scripts/taxi-zero-tick-reference.ts';
import type { DionAction } from '../src/dion/session.ts';
import { IDLE } from '../src/gameCore/index.ts';

test('the whole zero-tick domain selects the minimum natural word from source alone', async () => {
  await withTaxiSource(async source => {
    const actions: (DionAction | null)[] = [
      null,
      'activate',
      'star',
      'plus',
      'minus',
      'board',
      'leave'
    ];
    for (const action of actions) {
      for (const remainder of [
        0,
        Number.MIN_VALUE,
        1e-12,
        1 / 60,
        1 / 50 - 2e-12
      ]) {
        const actual = new source.SourceSession(source.content);
        // A nonminimal but ordinary history: these zero-tick calls cannot run
        // input, VM, movement, service, audio or face writers.
        actual.intent = { ...IDLE, turn: 0.375, walk: -0.25 };
        actual.advance(0);
        if (action !== null) {
          actual.press(action);
        }
        actual.advance(remainder);
        expect(actual.snapshot.tick).toBe(0);
        const record = {
          identity: source.codec.dionRecordIdentity(source.content),
          savedAt: '2026-10-03T00:00:00Z',
          schemaVersion: 1 as const,
          snapshot: actual.captureResume(),
          where: 'natural zero-tick source'
        };
        const encoded = source.codec.encodeDionRecord(record);
        const original = encoded;
        const selected = taxiZeroTickReference(encoded, source);
        const operations = [
          ...(action === null ? [] : [{ action, kind: 'press' as const }]),
          ...(remainder === 0
            ? []
            : [{ kind: 'advance' as const, seconds: remainder }])
        ];
        expect(selected).toEqual({
          kind: 'selected',
          reference: { departures: [], operations }
        });
        expect(
          taxiZeroTickReference(
            source.codec.encodeDionRecord({
              ...record,
              savedAt: '2000-01-01T00:00:00Z',
              where: 'another slot'
            }),
            source
          )
        ).toEqual(selected);
        expect(encoded).toBe(original);
        const decoded = source.codec.decodeDionRecord(
          encoded,
          record.identity,
          source.content
        );
        const restored = new source.SourceSession(
          source.content,
          decoded.snapshot
        );
        expect(
          taxiZeroTickReference(
            source.codec.encodeDionRecord({
              ...record,
              snapshot: restored.captureResume()
            }),
            source
          )
        ).toEqual(selected);
        const reference = new source.SourceSession(source.content);
        for (const operation of operations) {
          if (operation.kind === 'press') {
            reference.press(operation.action);
          } else {
            reference.advance(operation.seconds);
          }
        }
        expect(reference.captureResume()).toEqual(actual.captureResume());
        // This checks the independently selected full historical reference,
        // not construction of #737's expanded owners.
        for (let frame = 0; frame < 600; frame++) {
          actual.intent = IDLE;
          reference.intent = IDLE;
          actual.advance(11 / 50);
          reference.advance(11 / 50);
          expect(reference.captureResume()).toEqual(actual.captureResume());
          expect(reference.drainSound()).toEqual(actual.drainSound());
        }
      }
    }
  });
}, 30_000);

test('necessary checks cannot admit forged zero-tick state and later sources remain outside this subdomain', async () => {
  await withTaxiSource(async source => {
    const actual = new source.SourceSession(source.content);
    const record = {
      identity: source.codec.dionRecordIdentity(source.content),
      savedAt: '2026-10-03T00:00:00Z',
      schemaVersion: 1 as const,
      snapshot: actual.captureResume(),
      where: 'synthetic zero-tick boundary'
    };
    const forged = JSON.stringify({
      ...record,
      snapshot: {
        ...record.snapshot,
        snapshot: { ...record.snapshot.snapshot, heading: 123 }
      }
    });
    expect(() => readTaxiSourceCandidate(forged, source)).not.toThrow();
    expect(() => taxiZeroTickReference(forged, source)).toThrow(
      'snapshot.snapshot: zero-tick state differs from the historical opening'
    );
    expect(JSON.parse(forged).snapshot.snapshot.heading).toBe(123);
    actual.advance(1 / 50);
    const later = source.codec.encodeDionRecord({
      ...record,
      snapshot: actual.captureResume()
    });
    expect(taxiZeroTickReference(later, source)).toEqual({
      kind: 'outside-domain'
    });
  });
});
