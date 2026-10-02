import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'bun:test';

test('the historical taxi audit replays the pinned I2 source after current content changes', () => {
  const result = spawnSync(
    process.execPath,
    ['research/mercenary-iii-st/scripts/taxi-migration-audit.ts'],
    {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      encoding: 'utf8',
      timeout: 60_000
    }
  );
  expect({
    error: result.error,
    status: result.status,
    stderr: result.stderr
  }).toEqual({ error: undefined, status: 0, stderr: '' });
  const evidence = JSON.parse(result.stdout);
  expect(evidence.identity.contentSha256).toBe(
    'c50b402c04c70ab74f95a938c0f867e740ea843157e514764f2bceb84a2f44ed'
  );
  expect(evidence.controls).toHaveLength(33);
  expect(evidence.sourceRevision).toBe(
    'e4cba434069ca1fbec6e72b3a99cbf775f1663c4'
  );
  expect(evidence.controlRoundTrips).toEqual(
    evidence.controls.map((name: string) => ({
      name,
      resumeRoundTrip: true,
      saveRoundTrip: true,
      uninterruptedReplay: true
    }))
  );
  expect(
    evidence.checkpoints.map(
      (c: { sourceSnapshotSha256: string }) => c.sourceSnapshotSha256
    )
  ).toEqual([
    '96114e32b6d4b9925666328ae094222d3441d09b3660a18397b0028b82f9ecaf',
    'd19f9fb71eee1c9449b150780f458422722f2a4e80629b163a2d3adc61723ae9'
  ]);
  expect(evidence.validatorCases.unknownScriptPc).toContain(
    'unknown script continuation'
  );
  expect(evidence.validatorCases.wrongContent).toContain(
    'other Mercenary III content'
  );
}, 65_000);
