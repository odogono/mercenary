import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import type { TourcraftScriptState } from '../src/dion/tourcraftNarrative.ts';
import {
  decodeTourcraftRecord,
  encodeTourcraftRecord
} from '../src/dion/tourcraftSave.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});
test('ordinary free waiting fires election and mining thresholds with complete Resume futures', () => {
  const control = new TourcraftSession(content);
  const waitTo = (seconds: number) => {
    while (control.snapshot.clock.seconds < seconds) {
      control.advance(Math.min(60, seconds - control.snapshot.clock.seconds));
      control.drainSound();
    }
  };
  waitTo(32_399);
  expect(control.snapshot.narrative.flags[9]).toBe(false);
  const election = new TourcraftSession(
    content,
    decodeTourcraftRecord(
      encodeTourcraftRecord(
        content,
        control.captureResume(),
        'before election'
      ),
      content
    ).snapshot
  );
  for (let frame = 0; frame < 100; frame++) {
    control.advance(11 / 50);
    election.advance(11 / 50);
    expect(election.drainSound()).toEqual(control.drainSound());
    expect(election.captureResume()).toEqual(control.captureResume());
  }
  expect(control.snapshot.narrative.flags[9]).toBe(true);
  waitTo(61_199);
  const mining = new TourcraftSession(
    content,
    decodeTourcraftRecord(
      encodeTourcraftRecord(content, control.captureResume(), 'before mining'),
      content
    ).snapshot
  );
  let requested = false;
  for (let frame = 0; frame < 1500; frame++) {
    control.advance(11 / 50);
    mining.advance(11 / 50);
    const request = control.snapshot.tourcraft!.encounter.request;
    requested ||=
      request === 65_499 ||
      control.snapshot.tourcraft!.encounter.programme === 36;
    expect(mining.drainSound()).toEqual(control.drainSound());
    expect(mining.captureResume()).toEqual(control.captureResume());
  }
  expect(
    new Map(
      (control.snapshot.narrative as TourcraftScriptState).availabilityBytes
    ).get(19)! & 128
  ).toBe(0);
  expect(requested).toBe(true);
  expect(control.snapshot.narrative.flags[10]).toBe(false);
  expect(control.snapshot.narrative.flags[22]).toBe(false);
}, 600_000);
