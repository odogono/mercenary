import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { auditTaxiEarlyCursorAmbiguity } from '../../research/mercenary-iii-st/scripts/taxi-early-cursor-audit.ts';

test('ordinary early trips lose retained face cursors even after output rebuild', async () => {
  const audit = await auditTaxiEarlyCursorAmbiguity();
  expect(audit.equalCompleteSource).toBe(true);
  expect(audit.equalSaveBytes).toBe(true);
  expect(audit.equalResumeExceptTimestamp).toBe(true);
  expect(audit.histories.map(h => h.alternateFrames)).toEqual([310, 288]);
  expect(audit.histories.map(h => h.baseRebuild['$A5'])).toEqual([
    20_480, 20_224
  ]);
  expect(audit.histories.map(h => h.faces['$A1'].base)).toEqual([17, 8]);
  expect(audit.histories.map(h => h.faces['$A5'].alternate)).toEqual([0, 9]);
  expect(audit.drawingEffect.drawingInputs.map(g => g.linePrimitives)).toEqual([
    26, 16
  ]);
  expect(audit.equalFutureSourceFrames).toBe(600);
  expect(audit.differentFutureCursorFrames).toBe(600);
  expect(audit.differentFutureOutputFrames).toBeGreaterThan(0);
  expect(audit).toEqual(
    JSON.parse(
      readFileSync(
        new URL(
          '../../research/mercenary-iii-st/taxi-early-cursor-evidence.json',
          import.meta.url
        ),
        'utf8'
      )
    )
  );
}, 30_000);
