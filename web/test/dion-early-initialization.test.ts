import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { auditTaxiEarlyInitialization } from '../../research/mercenary-iii-st/scripts/taxi-early-audit.ts';
import { TaxiFaceModel } from '../../research/mercenary-iii-st/scripts/taxi-face-model.ts';

const initial = JSON.parse(
  readFileSync(
    new URL(
      '../../payload/dion/tourcraft/presentation/gameplay.json',
      import.meta.url
    ),
    'utf8'
  )
).initial;
const programmes = JSON.parse(
  readFileSync(
    new URL(
      '../../payload/dion/tourcraft/presentation/programmes.json',
      import.meta.url
    ),
    'utf8'
  )
);

test('face sequences advance only the selected cursor and wrap past the NUL', () => {
  const face = new TaxiFaceModel(programmes, initial);
  expect(face.capture()['$A1']).toEqual({
    alternate: 0,
    base: 0,
    output: 8192
  });
  face.frame(false);
  expect(face.capture()['$A1']).toEqual({
    alternate: 0,
    base: 1,
    output: 67 << 8
  });
  for (let i = 0; i < 45; i++) {
    face.frame(true);
  }
  expect(face.capture()['$A1']).toEqual({
    alternate: 0,
    base: 1,
    output: 70 << 8
  });
  expect(face.alternateFrames).toBe(45);
});

test('all 33 pinned controls round trip, and two reachable early sources lose the last face selection', async () => {
  const audit = await auditTaxiEarlyInitialization();
  expect(audit).toEqual(
    JSON.parse(
      readFileSync(
        new URL(
          '../../research/mercenary-iii-st/taxi-early-evidence.json',
          import.meta.url
        ),
        'utf8'
      )
    )
  );
  expect(audit.controls).toHaveLength(33);
  for (const control of audit.controls) {
    expect(control.saveRoundTrip).toBe(true);
    expect(control.resumeRoundTrip).toBe(true);
    expect(control.metisPhasePreserved).toBe(true);
    expect(control.bodyPhaseComparisons).toBe(32);
  }
  const { collision } = audit;
  expect(collision.equalCompleteSource).toBe(true);
  expect(collision.equalSaveBytes).toBe(true);
  expect(collision.equalResumeExceptTimestamp).toBe(true);
  expect(collision.source.tick).toBe(6312);
  expect(collision.source.frame).toBe(573);
  expect(collision.source.messageBusy).toBe(false);
  expect(collision.source.messageAge).toBe(250);
  expect(collision.histories.map(h => h.alternateFrames)).toEqual([250, 250]);
  expect(collision.histories.map(h => h.lastAlternate)).toEqual([false, true]);
  expect(collision.histories.map(h => h.faces['$A5'].output)).toEqual([
    80 << 8,
    81 << 8
  ]);
  expect(collision.afterNextFrameEqual).toBe(true);
  expect(collision.equalFutureFrames).toBe(600);
}, 30_000);
