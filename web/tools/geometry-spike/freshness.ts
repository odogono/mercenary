/// Demonstrates the #671 fresh-baseline comparison on the edited COFFIN, without touching it.
///
///   bun tools/geometry-spike/freshness.ts [--blender PATH]
///
/// 1. Sets up an edited asset: the adopted COFFIN plus the `coffin-edits` case's edited .blend and
///    .glb, with a ledger classifying each authored change.
/// 2. Simulates a re-extraction: a payload directory that differs from the real one only in the
///    COFFIN's Model file, where three values change — one the asset never touched, one the asset
///    authored identically, and one the asset authored differently.
/// 3. Recovers a fresh baseline from it, checks that `baseline` refuses to write into an asset
///    directory, and that every file of the edited asset is byte-identical afterwards.
/// 4. Exports the edited .blend again and compares adopted, fresh and edited.
///
/// Run edits.ts first. Writes out/fresh/ and out/fresh-baseline-report.md.

import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import { canonicalJson, sha256 } from '../../src/geometrySpike/contract.ts';
import { compare } from '../../src/geometrySpike/diff.ts';
import { ASSETS, OUT, ROOT, readGeometry, say } from './paths.ts';
import { runBlender } from './roundtrip.ts';

const SLUG = 'damocles-object-03f774';
const fresh = join(OUT, 'fresh');
const asset = join(fresh, 'asset', SLUG);
rmSync(fresh, { force: true, recursive: true });
mkdirSync(asset, { recursive: true });
for (const name of ['recovered.contract.json', 'sidecar.json']) {
  copyFileSync(join(ASSETS, SLUG, name), join(asset, name));
}
copyFileSync(
  join(OUT, 'edits/coffin-edits/edited-blend.blend'),
  join(asset, 'asset.blend')
);
copyFileSync(
  join(OUT, 'edits/coffin-edits/edited.glb'),
  join(asset, 'asset.glb')
);
const element = (e: string) => `variant:record/${e}`;
writeFileSync(
  join(asset, 'ledger.json'),
  canonicalJson({
    changes: [
      {
        element: element('v6'),
        note: 'raise the lid corner for a sprung-lid variant',
        provenance: 'creative'
      },
      {
        element: element('f0'),
        evidence:
          'docs/research/damocles-filled-polygons.md (illustrative citation for the demonstration)',
        note: 'lid colour word read from the wrong palette half',
        provenance: 'correction'
      },
      {
        element: element('f5'),
        note: 'side face rebuilt as f7',
        provenance: 'creative'
      },
      {
        element: element('f7'),
        note: 'rebuilt side face',
        provenance: 'creative'
      }
      // l0 is deliberately left unclassified, so the report shows a review refusing it.
    ],
    format: 'mercenary-geometry-ledger'
  })
);

// A payload that differs only in the COFFIN's Model file.
const payload = join(fresh, 'payload');
mkdirSync(join(payload, 'damocles/models'), { recursive: true });
for (const name of readdirSync(join(ROOT, 'payload'))) {
  if (name !== 'damocles') {
    symlinkSync(join(ROOT, 'payload', name), join(payload, name));
  }
}
for (const name of readdirSync(join(ROOT, 'payload/damocles'))) {
  if (name !== 'models') {
    symlinkSync(
      join(ROOT, 'payload/damocles', name),
      join(payload, 'damocles', name)
    );
  }
}
cpSync(
  join(ROOT, 'payload/damocles/models'),
  join(payload, 'damocles/models'),
  { recursive: true }
);
const modelPath = join(payload, 'damocles/models/object-03f774.json');
const file = JSON.parse(readFileSync(modelPath, 'utf8'));
const mesh = file.model.variants[0].mesh;
mesh.vertices[0] = [-60, 0, -12]; // untouched by the asset: a recovery change to adopt
mesh.vertices[6] = [-60, 30, -10]; // what the asset authored: converged
mesh.faces[0] = { ...mesh.faces[0], colour: '#aa8866', sourceColour: 1347 }; // the asset chose otherwise: conflict
writeFileSync(modelPath, `${JSON.stringify(file, null, 2)}\n`);

const hashes = () =>
  Object.fromEntries(
    readdirSync(asset)
      .sort()
      .map(name => [name, sha256(readFileSync(join(asset, name)))])
  );
const before = hashes();
const cli = (...args: string[]) =>
  Bun.spawnSync(['bun', join(import.meta.dir, 'cli.ts'), ...args], {
    stderr: 'pipe',
    stdout: 'pipe'
  });
const refused = cli(
  'baseline',
  '--payload',
  payload,
  '--out',
  join(fresh, 'asset')
);
const baseline = cli(
  'baseline',
  '--payload',
  payload,
  '--out',
  join(fresh, 'baseline')
);
if (baseline.exitCode !== 0) {
  throw new Error(baseline.stderr.toString());
}
const after = hashes();
const untouched = canonicalJson(before) === canonicalJson(after);

// The edited asset is the .blend; export it again rather than trusting an earlier export.
runBlender(
  'fresh_export.py',
  join(asset, 'asset.blend'),
  join(fresh, 'edited.mgeo')
);
const report = compare({
  adopted: readGeometry(join(asset, 'recovered.contract.json')),
  edited: readGeometry(join(fresh, 'edited.mgeo')),
  fresh: readGeometry(join(fresh, 'baseline', SLUG, 'recovered.contract.json')),
  ledger: JSON.parse(readFileSync(join(asset, 'ledger.json'), 'utf8')),
  slug: SLUG
});
const glbAgrees =
  canonicalJson(readGeometry(join(asset, 'asset.glb'))) ===
  canonicalJson(readGeometry(join(fresh, 'edited.mgeo')));
const text = [
  report,
  '## Asset files',
  '',
  `\`baseline\` into an asset directory: ${refused.exitCode !== 0 ? `refused (${refused.stderr.toString().trim()})` : '**accepted — this is a failure**'}.`,
  '',
  `Every file of the edited asset is byte-identical after re-extraction: ${untouched ? 'yes' : '**no**'}.`,
  '',
  '| File | SHA-256 before | after |',
  '| --- | --- | --- |',
  ...Object.keys(before).map(
    name =>
      `| ${name} | ${before[name]!.slice(0, 16)}… | ${after[name]!.slice(0, 16)}… |`
  ),
  '',
  `The edited asset's .glb and a fresh export of its .blend agree: ${glbAgrees ? 'yes' : '**no**'}.`,
  ''
].join('\n');
writeFileSync(join(OUT, 'fresh-baseline-report.md'), text);
say(text);
process.exit(untouched && refused.exitCode !== 0 && glbAgrees ? 0 : 1);
