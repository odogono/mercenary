import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { taxiCanonicalStartFrames } from '../../research/mercenary-iii-st/scripts/taxi-canonical-reference.ts';

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
