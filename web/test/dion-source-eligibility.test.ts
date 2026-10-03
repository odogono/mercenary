import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { auditTaxiEligibility } from '../../research/mercenary-iii-st/scripts/taxi-eligibility-audit.ts';
import { readTaxiSourceCandidate } from '../../research/mercenary-iii-st/scripts/taxi-source-eligibility.ts';
import { withTaxiSource } from '../../research/mercenary-iii-st/scripts/taxi-source.ts';

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

test('additional early sources reproduce the ledger and deterministic research model futures', async () => {
  const audit = await auditTaxiEligibility({ includeLate: false });
  const ledger = JSON.parse(
    readFileSync(
      new URL(
        '../../research/mercenary-iii-st/taxi-eligibility-evidence.json',
        import.meta.url
      ),
      'utf8'
    )
  );
  expect(audit).toEqual({
    ...ledger,
    naturalSources: ledger.naturalSources.filter(
      (s: { early: boolean }) => s.early
    )
  });
  expect(audit.naturalSources).toHaveLength(6);
  expect(audit.naturalSources.some(s => s.early && s.tick % 11 !== 0)).toBe(
    true
  );
}, 30_000);

test('all 33 historical controls pass the necessary source consistency checks', async () => {
  await withTaxiSource(async source => {
    for (const control of source.dionControlCaptures(source.content)) {
      const encoded = source.codec.encodeDionRecord({
        identity: source.codec.dionRecordIdentity(source.content),
        savedAt: '2026-10-03T00:00:00Z',
        schemaVersion: 1,
        snapshot: control.record,
        where: control.name
      });
      expect(readTaxiSourceCandidate(encoded, source).snapshot).toEqual(
        control.record
      );
    }
  });
});

test('decoder-valid synthetic inconsistencies are refused with a path without mutating the source', async () => {
  await withTaxiSource(async source => {
    const record = {
      identity: source.codec.dionRecordIdentity(source.content),
      savedAt: '2026-10-03T00:00:00Z',
      schemaVersion: 1,
      snapshot: new source.SourceSession(source.content).captureResume(),
      where: 'synthetic consistency probes'
    };
    const probes: [string, (r: Mutable<typeof record>) => void][] = [
      [
        'snapshot.snapshot.narrative.available',
        r => {
          r.snapshot.snapshot.narrative.available = [0x34, 0x33];
        }
      ],
      [
        'snapshot.snapshot.cash',
        r => {
          r.snapshot.snapshot.cash = '999999999999';
        }
      ],
      [
        'snapshot.snapshot.day',
        r => {
          r.snapshot.snapshot.day = !r.snapshot.snapshot.day;
        }
      ],
      [
        'snapshot.snapshot.narrative.queued',
        r => {
          r.snapshot.snapshot.narrative.queued = 0x33;
        }
      ],
      [
        'snapshot.snapshot.narrative.available',
        r => {
          r.snapshot.snapshot.narrative.available = [0x33, 0x33, 0x34];
        }
      ],
      [
        'snapshot.snapshot.clock.seconds',
        r => {
          r.snapshot.snapshot.clock.seconds = 1;
        }
      ],
      [
        'snapshot.snapshot.clock.accumulator',
        r => {
          r.snapshot.snapshot.clock.accumulator = 673;
        }
      ],
      [
        'snapshot.snapshot.clock.day',
        r => {
          r.snapshot.snapshot.clock.day = 1;
        }
      ],
      [
        'snapshot.remainder',
        r => {
          r.snapshot.remainder = 1 / 50;
        }
      ],
      [
        'snapshot.remainder',
        r => {
          r.snapshot.remainder = 1 / 50 - 5e-13;
        }
      ],
      [
        'snapshot.snapshot.phase',
        r => {
          r.snapshot.snapshot.phase++;
        }
      ],
      [
        'snapshot.snapshot.frameCounter',
        r => {
          r.snapshot.snapshot.frameCounter++;
        }
      ],
      [
        'snapshot.snapshot.extra',
        r => {
          Object.assign(r.snapshot.snapshot, { extra: true });
        }
      ],
      [
        'identity.extra',
        r => {
          Object.assign(r.identity, { extra: true });
        }
      ],
      [
        'extra',
        r => {
          Object.assign(r, { extra: true });
        }
      ]
    ];
    for (const [path, mutate] of probes) {
      const raw = structuredClone(record) as Mutable<typeof record>;
      mutate(raw);
      const encoded = JSON.stringify(raw);
      expect(() =>
        source.codec.decodeDionRecord(encoded, record.identity, source.content)
      ).not.toThrow();
      expect(() => readTaxiSourceCandidate(encoded, source)).toThrow(path);
      expect(JSON.stringify(raw)).toBe(encoded);
    }
  });
});

test('negative zero in raw numeric fields is refused at its path rather than normalized into writer output', async () => {
  await withTaxiSource(async source => {
    const record = {
      identity: source.codec.dionRecordIdentity(source.content),
      savedAt: '2026-10-03T00:00:00Z',
      schemaVersion: 1 as const,
      snapshot: new source.SourceSession(source.content).captureResume(),
      where: 'synthetic negative-zero boundary'
    };
    for (const [field, path] of [
      ['tick', 'snapshot.snapshot.tick'],
      ['remainder', 'snapshot.remainder']
    ]) {
      // JSON.stringify cannot create this probe: it turns -0 into 0, exactly
      // why these raw literals cannot be produced by the archived writer.
      const encoded = source.codec
        .encodeDionRecord(record)
        .replace(`"${field}":0`, `"${field}":-0`);
      const decoded = source.codec.decodeDionRecord(
        encoded,
        record.identity,
        source.content
      );
      const value =
        field === 'tick'
          ? decoded.snapshot.snapshot.tick
          : decoded.snapshot.remainder;
      expect(Object.is(value, -0)).toBe(true);
      expect(() => readTaxiSourceCandidate(encoded, source)).toThrow(
        `${path}: historical JSON writer cannot emit negative zero`
      );
      const raw = JSON.parse(encoded);
      const retained =
        field === 'tick' ? raw.snapshot.snapshot.tick : raw.snapshot.remainder;
      expect(Object.is(retained, -0)).toBe(true);
    }
  });
});
