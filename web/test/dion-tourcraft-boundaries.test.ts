import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import { prepareTourcraftFrame } from '../src/dion/tourcraftPresentation.ts';
import {
  decodeTourcraftRecord,
  encodeTourcraftRecord
} from '../src/dion/tourcraftSave.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import { applyDionControl } from './dion-controls.ts';
import { boardOpeningTaxi } from './dion-journey.ts';
import { continueTourcraft } from './tourcraft-journey.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});

test('restores partial ticks and first views at every flight phase and low-byte wrap', () => {
  const control = new TourcraftSession(content);
  boardOpeningTaxi(control);
  control.drainSound();
  const checkpoints = new Set([
    0, 2, 16, 138, 139, 140, 255, 256, 257, 461, 462, 463, 511, 512, 767, 768,
    882, 883, 884, 911, 926, 927, 928
  ]);
  const seen = new Set<number>();
  const requests: number[] = [];
  let serial = control.snapshot.narrative.message.serial;
  const futures: { left: number; session: TourcraftSession }[] = [];
  continueTourcraft(control, op => {
    for (const future of futures) {
      applyDionControl(future.session, op);
      future.session.drainSound();
      expect(future.session.captureResume()).toEqual(control.captureResume());
      future.left -= op.kind === 'advance' ? 1 : 0;
    }
    for (let i = futures.length - 1; i >= 0; i--) {
      if (futures[i]!.left === 0) {
        futures.splice(i, 1);
      }
    }
    const f = control.snapshot.tourcraft!.flight;
    if (f && control.snapshot.narrative.message.serial !== serial) {
      requests.push(f.frameWord - 1);
    }
    serial = control.snapshot.narrative.message.serial;
    const checkpoint =
      f?.mode === 'foot'
        ? 928
        : (f?.frameWord ?? (control.snapshot.tourcraft!.armed ? 0 : -1));
    if (!checkpoints.has(checkpoint) || seen.has(checkpoint)) {
      return;
    }
    seen.add(checkpoint);
    expect(
      control.snapshot.eye[1],
      `frame ${checkpoint} y`
    ).toBeGreaterThanOrEqual(0);
    expect(
      control.snapshot.eye[1],
      `frame ${checkpoint} y`
    ).toBeLessThanOrEqual(0xff_ff_ff_ff);
    const encoded = encodeTourcraftRecord(
      content,
      control.captureResume(),
      'checkpoint'
    );
    for (let branch = 0; branch < 2; branch++) {
      const session = new TourcraftSession(
        content,
        decodeTourcraftRecord(encoded, content).snapshot
      );
      expect(session.captureResume()).toEqual(control.captureResume());
      expect(prepareTourcraftFrame(session)).toEqual(
        prepareTourcraftFrame(control)
      );
      futures.push({ left: 100, session });
    }
  });
  expect([...seen].sort((a, b) => a - b)).toEqual(
    [...checkpoints].sort((a, b) => a - b)
  );
  expect(requests).toHaveLength(39);
  expect([requests[0], requests[7], requests.at(-2), requests.at(-1)]).toEqual([
    16, 152, 715, 737
  ]);
  expect(control.snapshot.tourcraft!.owners['sky']!['bodyAtmosphere']).toBe(5);
  expect(control.snapshot.tourcraft!.encounter.request).toBe(0);
}, 60_000);
