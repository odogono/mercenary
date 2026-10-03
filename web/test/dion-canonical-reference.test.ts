import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import {
  compareTaxiDepartureSchedules,
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
