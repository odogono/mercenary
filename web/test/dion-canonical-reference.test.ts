import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import {
  compareTaxiDepartureSchedules,
  selectTaxiCanonicalDepartureSchedule,
  taxiCanonicalStartFrames
} from '../../research/mercenary-iii-st/scripts/taxi-canonical-reference.ts';

test('canonical departure ordering includes absent, repeated, interrupted and returned trips', () => {
  expect(compareTaxiDepartureSchedules([16_156], [81_692])).toBe(-1);
  expect(compareTaxiDepartureSchedules([10, 100], [10, 101])).toBe(-1);
  expect(compareTaxiDepartureSchedules([10, 100, 500], [11, 12])).toBe(-1);
  expect(compareTaxiDepartureSchedules([10], [10, 100])).toBe(-1);
  expect(compareTaxiDepartureSchedules([], [10])).toBe(-1);
  expect(compareTaxiDepartureSchedules([10, 100], [10, 100])).toBe(0);
  expect(() => compareTaxiDepartureSchedules([100, 10], [])).toThrow();
  expect(() => compareTaxiDepartureSchedules([0.5], [])).toThrow();
});

test('the general selector stops at an accepting prefix and handles every departure family', async () => {
  for (const schedules of [
    [[], [10]],
    [[10], [10, 20], [11]],
    [[10, 20, 90], [10, 30], [11]],
    [[20], [10, 20]],
    [[16_156], [81_692], [147_228]]
  ]) {
    const original = structuredClone(schedules);
    const oracle = async (query: {
      readonly nextAtMost?: number;
      readonly prefix: readonly number[];
    }) => {
      const matches = schedules.some(schedule => {
        if (!query.prefix.every((v, i) => schedule[i] === v)) {
          return false;
        }
        if (query.nextAtMost === undefined) {
          return schedule.length === query.prefix.length;
        }
        const next = schedule[query.prefix.length];
        return next !== undefined && next <= query.nextAtMost;
      });
      return matches ? ('reachable' as const) : ('unreachable' as const);
    };
    const expected = [...schedules].sort(compareTaxiDepartureSchedules)[0]!;
    expect(await selectTaxiCanonicalDepartureSchedule(147_229, oracle)).toEqual(
      {
        departures: expected,
        kind: 'selected'
      }
    );
    expect(schedules).toEqual(original);
  }
});

test('unexplored reachability cannot become a refusal or a chosen reference', async () => {
  expect(
    await selectTaxiCanonicalDepartureSchedule(20, async () => 'unresolved')
  ).toEqual({ kind: 'unresolved', query: { prefix: [] } });
  expect(
    await selectTaxiCanonicalDepartureSchedule(20, async query =>
      query.nextAtMost === undefined ? 'unreachable' : 'unresolved'
    )
  ).toEqual({ kind: 'unresolved', query: { nextAtMost: 19, prefix: [] } });
  expect(
    await selectTaxiCanonicalDepartureSchedule(20, async () => 'unreachable')
  ).toEqual({ kind: 'unreachable' });
  expect(
    await selectTaxiCanonicalDepartureSchedule(0, async () => 'unreachable')
  ).toEqual({ kind: 'unreachable' });
  expect(
    await selectTaxiCanonicalDepartureSchedule(10, async query => {
      if (query.nextAtMost === undefined) {
        return 'unreachable';
      }
      return query.nextAtMost === 9 ? 'reachable' : 'unresolved';
    })
  ).toEqual({ kind: 'unresolved', query: { nextAtMost: 4, prefix: [] } });
  expect(
    await selectTaxiCanonicalDepartureSchedule(20, async query => {
      if (query.prefix.length !== 0) {
        return 'unresolved';
      }
      if (query.nextAtMost === undefined) {
        return 'unreachable';
      }
      return query.nextAtMost >= 10 ? 'reachable' : 'unreachable';
    })
  ).toEqual({ kind: 'unresolved', query: { prefix: [10] } });
});

test('the selector agrees with exhaustive enumeration for every three-frame history class', async () => {
  const vectors = Array.from({ length: 8 }, (_, mask) =>
    [0, 1, 2].filter(frame => (mask & (1 << frame)) !== 0)
  );
  for (let mask = 0; mask < 256; mask++) {
    const histories = vectors.filter((_, i) => (mask & (1 << i)) !== 0);
    const least = [...histories].sort(compareTaxiDepartureSchedules)[0];
    const actual = await selectTaxiCanonicalDepartureSchedule(
      3,
      async query => {
        const found = histories.some(vector => {
          if (!query.prefix.every((frame, i) => frame === vector[i])) {
            return false;
          }
          return query.nextAtMost === undefined
            ? query.prefix.length === vector.length
            : vector.length > query.prefix.length &&
                vector[query.prefix.length]! <= query.nextAtMost;
        });
        return found ? 'reachable' : 'unreachable';
      }
    );
    expect(actual).toEqual(
      least === undefined
        ? { kind: 'unreachable' }
        : { departures: least, kind: 'selected' }
    );
  }
});

test('the general selector has logarithmic queries per departure and rejects invalid bounds', async () => {
  const schedule = [0, 1, Number.MAX_SAFE_INTEGER - 1];
  let calls = 0;
  const selected = await selectTaxiCanonicalDepartureSchedule(
    Number.MAX_SAFE_INTEGER,
    async query => {
      calls++;
      if (!query.prefix.every((v, i) => schedule[i] === v)) {
        return 'unreachable';
      }
      if (query.nextAtMost === undefined) {
        return schedule.length === query.prefix.length
          ? 'reachable'
          : 'unreachable';
      }
      const next = schedule[query.prefix.length];
      return next !== undefined && next <= query.nextAtMost
        ? 'reachable'
        : 'unreachable';
    }
  );
  expect(selected).toEqual({ departures: schedule, kind: 'selected' });
  expect(calls).toBeLessThanOrEqual(3 * 55 + 1);
  expect(
    selectTaxiCanonicalDepartureSchedule(-1, async () => 'unreachable')
  ).rejects.toThrow();
  expect(
    selectTaxiCanonicalDepartureSchedule(1.5, async () => 'unreachable')
  ).rejects.toThrow();
});

test('the recorded late source determines all three modular Start candidates independently of its metadata', () => {
  const { source } = JSON.parse(
    readFileSync(
      new URL(
        '../../research/mercenary-iii-st/taxi-history-evidence.json',
        import.meta.url
      ),
      'utf8'
    )
  );
  expect(
    taxiCanonicalStartFrames(source.tick, source.frame, source.wait, 484, 2000)
  ).toEqual([16_156, 81_692, 147_228]);
  expect(
    taxiCanonicalStartFrames(
      source.tick + 65_536 * 11,
      source.frame + 65_536,
      source.wait,
      484,
      2000
    )
  ).toEqual([16_156, 81_692, 147_228, 212_764]);
});

test('a modular candidate requires a valid full-frame source and calibrated prefix', () => {
  expect(() => taxiCanonicalStartFrames(1, 1, 0, 484, 2000)).toThrow();
  expect(() => taxiCanonicalStartFrames(11, 1, 65_536, 484, 2000)).toThrow();
  expect(() => taxiCanonicalStartFrames(11, 1, 0, -1, 0)).toThrow();
});
