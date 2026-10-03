import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { auditTaxiTimedFaceClasses } from '../../research/mercenary-iii-st/scripts/taxi-timed-face-audit.ts';

test('complete timed narrative analysis contains each natural control and certifies tagged face owners only on agreement', async () => {
  const audit = await auditTaxiTimedFaceClasses();
  expect(audit.controls).toHaveLength(33);
  expect(audit.controls.every(row => row.analysisComplete)).toBe(true);
  for (const row of audit.controls) {
    expect(row.faceCandidates).toContainEqual(row.observed);
    if (row.faceOwnerCertificate !== null) {
      expect(row.faceOwnerCertificate).toEqual(row.observed);
    }
  }
  expect(
    audit.controls.filter(row => row.faceOwnerCertificate !== null).length
  ).toBe(8);
  expect(audit.additionalSources).toHaveLength(4);
  for (const row of [...audit.controls, ...audit.additionalSources]) {
    if (row.faceOwnerCertificate !== null) {
      expect(row.restoredFaces).not.toBeNull();
      expect(row.futureFaceMatches).toBe(600);
    }
  }
  expect(
    audit.additionalSources.every(row => row.faceOwnerCertificate !== null)
  ).toBe(true);
  expect(audit).toEqual(
    JSON.parse(
      readFileSync(
        new URL(
          '../../research/mercenary-iii-st/taxi-timed-face-evidence.json',
          import.meta.url
        ),
        'utf8'
      )
    )
  );
}, 120_000);

test('incomplete timed narrative analysis never certifies face owners', async () => {
  const audit = await auditTaxiTimedFaceClasses({ maxStates: 1 });
  expect(audit.controls.some(row => !row.analysisComplete)).toBe(true);
  for (const row of audit.controls) {
    if (!row.analysisComplete) {
      expect(row.faceOwnerCertificate).toBeNull();
    }
  }
}, 30_000);
