import { expect, test } from 'bun:test';

import { DionSession } from '../src/dion/session.ts';
import { dionDay, dionStars } from '../src/dion/sky.ts';
import { dionContent } from './dion-documents.ts';

test('samples the full fractional METIS phase and keeps coordinate caches through restore', async () => {
  const content = await dionContent();
  const initial = new DionSession(content);
  const record = initial.captureResume();
  const phase = 0x00_bc_ff_f0;
  expect(dionDay({ ...content.world.sky, phase })).toBe(true);
  expect(dionDay({ ...content.world.sky, phase: phase + 0x3_b0 })).toBe(false);
  const uninterrupted = new DionSession(content, {
    ...record,
    snapshot: { ...record.snapshot, phase }
  });
  uninterrupted.advance(1 / 50);
  expect(uninterrupted.snapshot.phase).toBe(phase + 0x3_b0);
  expect(uninterrupted.snapshot.day).toBe(true); // the sampled frame has not run.
  const restored = new DionSession(content, uninterrupted.captureResume());
  uninterrupted.advance(10 / 50);
  restored.advance(10 / 50);
  expect(restored.snapshot).toEqual(uninterrupted.snapshot);
  expect(restored.snapshot.day).toBe(false);
  expect(dionStars(content.world.sky, 0, 511).length).toBe(44);
  expect(dionStars(content.world.sky, 768, 511).length).toBe(49);
});
