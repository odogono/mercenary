import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import {
  decodeTourcraftRecord,
  encodeTourcraftRecord
} from '../src/dion/tourcraftSave.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import { until } from './dion-journey.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});
test('a declined ordered delivery survives Save and repeated R13 retriggers retain identity', () => {
  const control = new TourcraftSession(content);
  until(control, () => control.snapshot.reveal === 0);
  control.press('activate');
  control.advance(11 / 50);
  control.advance(64 / 50);
  control.press('star');
  control.advance(11 / 50);
  const before = control.captureResume();
  control.deliverEvents(() => false);
  expect(control.captureResume()).toEqual(before);
  const restored = new TourcraftSession(
    content,
    decodeTourcraftRecord(
      encodeTourcraftRecord(content, before, 'pending'),
      content
    ).snapshot
  );
  const requests = before.snapshot.tourcraft!.events.pending.flatMap(b =>
    b.writes.filter(w => w.register === 13)
  );
  expect(requests).toEqual([
    { register: 13, value: 9 },
    { register: 13, value: 9 }
  ]);
  const left: unknown[] = [],
    right: unknown[] = [];
  control.deliverEvents(batch => {
    left.push(batch);
    return true;
  });
  restored.deliverEvents(batch => {
    right.push(batch);
    return true;
  });
  expect(right).toEqual(left);
  expect(restored.captureResume()).toEqual(control.captureResume());
  expect(restored.snapshot.tourcraft!.events.deliveredEnvelope).not.toBeNull();
  for (let tick = 0; tick < 100; tick++) {
    control.advance(1 / 50);
    restored.advance(1 / 50);
    expect(restored.drainSound()).toEqual(control.drainSound());
    expect(restored.captureResume()).toEqual(control.captureResume());
  }
});
