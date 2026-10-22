/// Runs the #671 untouched round trip for every fixture and both candidates, each Blender step in
/// its own process, and checks the results against the recovered baseline and the payload.
///
///   bun tools/geometry-spike/roundtrip.ts [--blender PATH]
///
/// Candidate A: contract → import → save .blend │ reopen → export .mgeo (twice) │ reopen → export.
/// Candidate B: contract → canonical .glb │ import → export .glb │ import that → export again.
/// Writes out/roundtrip-report.md; exits non-zero if any requirement fails.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { compose } from '../../src/geometry/compose.ts';
import { canonicalJson, type Sidecar } from '../../src/geometry/contract.ts';
import { FIXTURES, sourceRecord } from './fixtures.ts';
import {
  ASSETS,
  OUT,
  ROOT,
  SPIKE,
  readGeometry,
  readSidecar,
  say
} from './paths.ts';

const blender = (() => {
  const at = process.argv.indexOf('--blender');
  return at >= 0 ? process.argv[at + 1]! : 'blender';
})();

export const runBlender = (script: string, ...args: string[]) => {
  const result = Bun.spawnSync(
    [
      blender,
      '-b',
      '--factory-startup',
      '--python-exit-code',
      '1',
      '--python',
      join(SPIKE, 'scripts', script),
      '--',
      ...args
    ],
    { stderr: 'pipe', stdout: 'pipe' }
  );
  const output = `${result.stdout.toString()}${result.stderr.toString()}`;
  if (result.exitCode !== 0) {
    throw new Error(`blender ${script} ${args.join(' ')} failed:\n${output}`);
  }
  return output;
};

export const blenderVersion = () =>
  Bun.spawnSync([blender, '--version'])
    .stdout.toString()
    .split('\n')[0]!
    .trim();

const sameBytes = (a: string, b: string) =>
  Buffer.compare(readFileSync(a), readFileSync(b)) === 0;

const cli = (...args: string[]) => {
  const result = Bun.spawnSync(
    ['bun', join(import.meta.dir, 'cli.ts'), ...args],
    { stderr: 'pipe', stdout: 'pipe' }
  );
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString());
  }
};

const check = (
  file: string,
  recovered: string,
  sidecar: Sidecar,
  source: string
) => {
  const geometry = readGeometry(file);
  return {
    exact: canonicalJson(geometry) === recovered,
    record: canonicalJson(compose(geometry, sidecar).record) === source
  };
};

const mark = (value: boolean) => (value ? 'yes' : '**NO**');

if (import.meta.main) {
  cli('baseline');
  const rows: string[] = [];
  let failed = false;
  const payload = join(ROOT, 'payload');
  for (const fixture of FIXTURES) {
    const slug = fixture.slug;
    if (!existsSync(join(ASSETS, slug))) {
      cli('adopt', slug);
    }
    const assets = join(ASSETS, slug);
    const work = join(OUT, 'roundtrip', slug);
    runBlender('step.py', 'blend-create', slug);
    runBlender('step.py', 'blend-export', slug, '1');
    runBlender('step.py', 'blend-export', slug, '2');
    runBlender('step.py', 'glb-create', slug);
    runBlender('step.py', 'glb-cycle', slug);
    runBlender('step.py', 'glb-recycle', slug);
    const recovered = canonicalJson(
      readGeometry(join(assets, 'recovered.contract.json'))
    );
    const sidecar = readSidecar(join(assets, 'sidecar.json'));
    const source = canonicalJson(
      sourceRecord(payload, await fixture.recover(payload))
    );
    const a = check(join(work, 'a-session-2.mgeo'), recovered, sidecar, source);
    const b = check(join(work, 'b-session-2.glb'), recovered, sidecar, source);
    const aDeterministic =
      sameBytes(
        join(work, 'a-session-1.mgeo'),
        join(work, 'a-session-1-again.mgeo')
      ) &&
      sameBytes(join(work, 'a-session-1.mgeo'), join(work, 'a-session-2.mgeo'));
    const bDeterministic =
      sameBytes(join(assets, 'asset.glb'), join(work, 'b-session-1.glb')) &&
      sameBytes(join(work, 'b-session-1.glb'), join(work, 'b-session-2.glb'));
    const ok =
      a.exact &&
      a.record &&
      b.exact &&
      b.record &&
      aDeterministic &&
      bDeterministic;
    failed ||= !ok;
    rows.push(
      `| ${slug} | ${mark(a.exact)} | ${mark(a.record)} | ${mark(aDeterministic)} | ${mark(b.exact)} | ${mark(b.record)} | ${mark(bDeterministic)} |`
    );
    say(`${slug}: ${ok ? 'ok' : 'FAILED'}`);
  }
  const report = [
    '# Untouched round trip',
    '',
    `${blenderVersion()}. Each Blender step ran in its own process.`,
    '',
    '- **A exact / B exact**: the contract decoded from the final export equals the recovered baseline (coordinates, winding and loop start, polygon boundaries, explicit lines and their direction, coincident-but-distinct vertices, identities, colours, sidedness, records, scene slots, runtime inputs and external endpoints).',
    '- **record**: that contract and the sidecar compose to the payload record byte for byte (canonical JSON).',
    '- **deterministic**: A — two exports in one session and an export after reopening are identical bytes; B — the adopted GLB, its import/export and the re-import/export are identical bytes.',
    '',
    '| Fixture | A exact | A record | A deterministic | B exact | B record | B deterministic |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    ''
  ].join('\n');
  writeFileSync(join(OUT, 'roundtrip-report.md'), report);
  say(report);
  process.exit(failed ? 1 : 0);
}
