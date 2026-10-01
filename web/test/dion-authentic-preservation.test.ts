import { createHash } from 'node:crypto';
import { expect, test } from 'bun:test';

import { dionRenderCheckpoints } from './dion-render-checkpoints.ts';
import baseline from './fixtures/dion-authentic-672.json';

const hash = (bytes: Uint8Array | Uint8ClampedArray) =>
  createHash('sha256').update(bytes).digest('hex');

test('Authentic preserves every captured index, palette, composed pixel and planner result from before #672', async () => {
  let count = 0;
  for await (const { name, planned, rgba } of dionRenderCheckpoints()) {
    const expected = baseline.checkpoints.find(item => item.name === name)!;
    expect({
      candidate: planned.candidate,
      horizonRow: planned.horizonRow,
      indexed: hash(planned.frame.pixels),
      land: planned.land,
      name,
      palette: planned.palette,
      rgba: hash(rgba),
      stats: planned.stats
    }).toEqual(expected);
    count += 1;
  }
  expect(count).toBe(18);
});
