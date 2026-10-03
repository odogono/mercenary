import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { craftFloat } from '../src/craft/pass.ts';
import { list, record } from '../src/dion/read.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import { prepareTourcraftFrame } from '../src/dion/tourcraftPresentation.ts';
import {
  decodeTourcraftRecord,
  encodeTourcraftRecord
} from '../src/dion/tourcraftSave.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import { tourcraftView } from '../src/dion/tourcraftView.ts';
import { IDLE } from '../src/gameCore/index.ts';
import { boardOpeningTaxi } from './dion-journey.ts';
import { continueTourcraft } from './tourcraft-journey.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});
const table = list(
  record(content.support['rotationTable'], 'table')['words'],
  'words'
) as number[];
test('cabin copy rotates signed scaled tilt and clamps roll using the original Q15 table', () => {
  expect(
    tourcraftView(table, { pitch: 600, roll: 64, yaw: 12 }, 256, false)
  ).toEqual({ pitch: 543, roll: 65_463, yaw: 268 });
  expect(
    tourcraftView(table, { pitch: 600, roll: 64, yaw: 12 }, 256, true)
  ).toEqual({ pitch: 543, roll: 64, yaw: 268 });
});
test('ordinary cabin turns preserve physical playback and restore the copied first view', () => {
  const session = new TourcraftSession(content);
  boardOpeningTaxi(session);
  session.drainSound();
  let checked = false;
  continueTourcraft(session, () => {
    const f = session.snapshot.tourcraft!.flight;
    if (f?.frameWord === 60) {
      session.intent = { ...IDLE, turn: 1 };
    }
    if (f?.frameWord === 76 && !checked) {
      checked = true;
      session.intent = IDLE;
      expect(f.cabinOffset).toBe(256);
      const view = session.snapshot.tourcraft!.owners['view']!;
      expect(view['roll']).not.toBe(f.craft.roll);
      expect(view['packedHeight']).toBe(craftFloat(-f.craft.y));
      expect(view['drawingHeight']).toBe(craftFloat(-session.snapshot.eye[1]));
      expect(view['drawingHeight']).not.toBe(view['packedHeight']);
      const restored = new TourcraftSession(
        content,
        decodeTourcraftRecord(
          encodeTourcraftRecord(
            content,
            session.captureResume(),
            'turned cabin'
          ),
          content
        ).snapshot
      );
      expect(restored.captureResume()).toEqual(session.captureResume());
      expect(prepareTourcraftFrame(restored)).toEqual(
        prepareTourcraftFrame(session)
      );
      restored.advance(1 / 50);
      session.advance(1 / 50);
      expect(restored.drainSound()).toEqual(session.drainSound());
      expect(restored.captureResume()).toEqual(session.captureResume());
    }
  });
  expect(checked).toBe(true);
});
