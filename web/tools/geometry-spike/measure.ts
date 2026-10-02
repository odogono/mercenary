/// Size and load/decode time for #671: current JSON against both candidates, per fixture and
/// across every Damocles Model the contract represents.
///
///   bun tools/geometry-spike/measure.ts
///
/// Needs roundtrip.ts (fixture assets), `cli.ts sweep` and scripts/encode_corpus.py (corpus).
/// Sizes are exact bytes, raw and gzip -9 per file. Times are medians over repeated runs in this
/// process (Bun's JavaScriptCore), each path ending in the same parsed Model or Targ record.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  parseCatalogueDocument,
  parseModelFile,
  type Catalogue
} from '../../src/catalogue/data.ts';
import {
  checkAsset,
  checkReferences,
  checkSidecarHash,
  compose,
  composeValidated
} from '../../src/geometrySpike/compose.ts';
import {
  canonicalJson,
  type GeometryAsset,
  type Sidecar
} from '../../src/geometrySpike/contract.ts';
import { decodeGlb } from '../../src/geometrySpike/glb.ts';
import { decodeMgeo } from '../../src/geometrySpike/mgeo.ts';
import { FIXTURES, sourceRecord } from './fixtures.ts';
import { ASSETS, OUT, ROOT, say } from './paths.ts';
import { blenderVersion } from './roundtrip.ts';

const payload = join(ROOT, 'payload');
const gz = (bytes: Uint8Array | string) =>
  Bun.gzipSync(
    typeof bytes === 'string'
      ? new TextEncoder().encode(bytes)
      : new Uint8Array(bytes),
    { level: 9 }
  ).byteLength;
const size = (bytes: Uint8Array | string) =>
  typeof bytes === 'string'
    ? new TextEncoder().encode(bytes).byteLength
    : bytes.byteLength;
const kb = (n: number) =>
  n < 10_240 ? `${(n / 1024).toFixed(1)}` : `${Math.round(n / 1024)}`;
const pair = (bytes: Uint8Array | string) =>
  `${kb(size(bytes))} / ${kb(gz(bytes))}`;

const median = (run: () => unknown, budgetMs = 300): number => {
  for (let i = 0; i < 5; i++) {
    run();
  }
  const samples: number[] = [];
  const end = performance.now() + budgetMs;
  while (performance.now() < end || samples.length < 15) {
    const t = performance.now();
    run();
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]!;
};
const us = (ms: number) =>
  ms < 1 ? `${Math.round(ms * 1000)} µs` : `${ms.toFixed(2)} ms`;

const catalogue: Catalogue = parseCatalogueDocument(
  JSON.parse(readFileSync(join(payload, 'damocles/catalogue.json'), 'utf8'))
);
const finish = (record: unknown, sidecar: Sidecar) =>
  sidecar.title === 'damocles' ? parseModelFile(record, catalogue) : record;

const toRecord = (
  decode: (b: Uint8Array) => GeometryAsset,
  bytes: Uint8Array,
  sidecarText: string,
  sidecar: Sidecar
) =>
  median(() =>
    finish(
      compose(decode(bytes), JSON.parse(sidecarText) as Sidecar).record,
      sidecar
    )
  );

const fixtureRows: string[] = [];
const timeRows: string[] = [];
for (const fixture of FIXTURES) {
  const dir = join(ASSETS, fixture.slug);
  const recovered = await fixture.recover(payload);
  const json = canonicalJson(sourceRecord(payload, recovered));
  const sidecarText = readFileSync(join(dir, 'sidecar.json'), 'utf8');
  const sidecar = JSON.parse(sidecarText) as Sidecar;
  const mgeo = new Uint8Array(
    readFileSync(join(OUT, 'roundtrip', fixture.slug, 'a-session-2.mgeo'))
  );
  const glb = new Uint8Array(readFileSync(join(dir, 'asset.glb')));
  const blend = new Uint8Array(readFileSync(join(dir, 'asset.blend')));
  fixtureRows.push(
    `| ${fixture.slug} | ${pair(json)} | ${pair(sidecarText)} | ${pair(mgeo)} | ${pair(glb)} | ${pair(blend)} |`
  );
  const viaJson = median(() => finish(JSON.parse(json), sidecar));
  timeRows.push(
    `| ${fixture.slug} | ${us(viaJson)} | ${us(median(() => decodeMgeo(mgeo)))} | ${us(toRecord(decodeMgeo, mgeo, sidecarText, sidecar))} | ${us(median(() => decodeGlb(glb)))} | ${us(toRecord(decodeGlb, glb, sidecarText, sidecar))} |`
  );
}

// The corpus: every Damocles Model the contract composes exactly (out/sweep).
const sweep = join(OUT, 'sweep');
const names = readdirSync(sweep)
  .filter(n => n.endsWith('.contract.json'))
  .map(n => n.replace('.contract.json', ''))
  .sort();
const totals = { glb: [0, 0], json: [0, 0], mgeo: [0, 0], sidecar: [0, 0] };
const add = (key: keyof typeof totals, bytes: Uint8Array | string) => {
  totals[key][0]! += size(bytes);
  totals[key][1]! += gz(bytes);
};
const corpus = names.map(name => {
  const json = readFileSync(
    join(payload, 'damocles/models', `${name}.json`),
    'utf8'
  );
  const sidecar = readFileSync(join(sweep, `${name}.sidecar.json`), 'utf8');
  const mgeo = new Uint8Array(
    readFileSync(join(OUT, 'corpus/mgeo', `${name}.mgeo`))
  );
  const glb = new Uint8Array(
    readFileSync(join(OUT, 'corpus/glb', `${name}.glb`))
  );
  add('json', json);
  add('sidecar', sidecar);
  add('mgeo', mgeo);
  add('glb', glb);
  return { glb, json, mgeo, sidecar };
});
// Timed paths use identical in-memory bytes, with no disk I/O or gzip decoding.
const corpusJson = median(
  () => corpus.forEach(c => parseModelFile(JSON.parse(c.json), catalogue)),
  1000
);
const load = (
  decode: (bytes: Uint8Array) => GeometryAsset,
  format: 'mgeo' | 'glb',
  validated: boolean
) =>
  median(
    () =>
      corpus.forEach(c => {
        const asset = decode(c[format]);
        const sidecar = JSON.parse(c.sidecar) as Sidecar;
        const result = validated
          ? composeValidated(asset, sidecar)
          : compose(asset, sidecar);
        parseModelFile(result.record, catalogue);
      }),
    1000
  );
const prepared = corpus.map(c => ({
  asset: decodeMgeo(c.mgeo),
  sidecar: JSON.parse(c.sidecar) as Sidecar
}));
for (const { asset, sidecar } of prepared) {
  if (checkAsset(asset, sidecar).some(d => d.severity === 'error')) {
    throw new Error(`invalid benchmark asset ${asset.asset}`);
  }
}
const corpusMgeo = load(decodeMgeo, 'mgeo', false);
const corpusGlb = load(decodeGlb, 'glb', false);
const validatedMgeo = load(decodeMgeo, 'mgeo', true);
const validatedGlb = load(decodeGlb, 'glb', true);
const sidecarParse = median(
  () => corpus.forEach(c => JSON.parse(c.sidecar)),
  1000
);
const sidecarHash = median(
  () => prepared.forEach(c => checkSidecarHash(c.asset, c.sidecar)),
  1000
);
const references = median(
  () => prepared.forEach(c => checkReferences(c.asset, c.sidecar)),
  1000
);
const composition = median(
  () =>
    prepared.forEach(c =>
      parseModelFile(composeValidated(c.asset, c.sidecar).record, catalogue)
    ),
  1000
);
const tableCount = prepared.reduce(
  (sum, c) => sum + c.sidecar.references.length,
  0
);
const sidecarParts = { record: [0, 0], references: [0, 0] };
for (const { sidecar } of prepared) {
  for (const key of ['record', 'references'] as const) {
    const text = canonicalJson(sidecar[key]);
    sidecarParts[key][0]! += size(text);
    sidecarParts[key][1]! += gz(text);
  }
}
const mb = ([raw, packed]: number[]) =>
  `${(raw! / 1_048_576).toFixed(1)} MiB / ${(packed! / 1_048_576).toFixed(1)} MiB`;
const plus = (a: number[], b: number[]) => [a[0]! + b[0]!, a[1]! + b[1]!];

const report = [
  '# Size and load/decode time',
  '',
  `${blenderVersion()} wrote the candidates; Bun ${Bun.version} read them.`,
  '',
  '## Fixtures',
  '',
  'KiB raw / KiB gzip -9. "Payload JSON" is the record as the payload stores it (canonical JSON). Both candidates ship the sidecar JSON alongside their geometry. The `.blend` is saved uncompressed.',
  '',
  '| Fixture | Payload JSON | Sidecar JSON | MGEO | GLB | .blend |',
  '| --- | --- | --- | --- | --- | --- |',
  ...fixtureRows,
  '',
  'Median time to a parsed record (Damocles: through the Catalogue Model reader). "Decode" is the geometry alone; "to record" adds the sidecar parse, reference checks and composition.',
  '',
  '| Fixture | JSON to record | MGEO decode | MGEO to record | GLB decode | GLB to record |',
  '| --- | --- | --- | --- | --- | --- |',
  ...timeRows,
  '',
  `## Damocles corpus (${names.length} Models)`,
  '',
  'All times below are medians (five warm-ups, at least fifteen samples). Load includes geometry decoding, sidecar parsing, composition and the existing Model reader. Full checks also include geometry structure, the canonical sidecar hash and every reference; prevalidated load omits these checks, representing an unchanged asset checked at build time. Production loading is unchanged.',
  '',
  '| | Raw / gzip -9 (sum of per-file sizes) | Load, full checks | Load, prevalidated |',
  '| --- | --- | --- | --- |',
  `| Payload JSON model files | ${mb(totals.json)} | ${corpusJson.toFixed(0)} ms | — |`,
  `| MGEO + sidecar JSON | ${mb(plus(totals.mgeo, totals.sidecar))} (geometry ${mb(totals.mgeo)}) | ${corpusMgeo.toFixed(0)} ms | ${validatedMgeo.toFixed(0)} ms |`,
  `| GLB + sidecar JSON | ${mb(plus(totals.glb, totals.sidecar))} (geometry ${mb(totals.glb)}) | ${corpusGlb.toFixed(0)} ms | ${validatedGlb.toFixed(0)} ms |`,
  '',
  `Sidecar: ${mb(totals.sidecar)}. Only ${tableCount} positional attachmentFace references enter the table. Record and reference sizes below serialize each field independently (their indentation differs from its nesting in the complete sidecar, and their gzip sizes cannot be added).`,
  '',
  '| Sidecar field | Raw / gzip -9 |',
  '| --- | --- |',
  `| Record | ${mb(sidecarParts.record)} |`,
  `| Positional reference table | ${kb(sidecarParts.references[0]!)} KiB / ${kb(sidecarParts.references[1]!)} KiB |`,
  '',
  'Isolated stages over the same corpus, starting with parsed geometry and sidecars except for the JSON parse row. Composition includes the existing Model reader; separately timed stages need not sum to total load.',
  '',
  '| Stage | Time |',
  '| --- | --- |',
  `| Sidecar JSON parse | ${sidecarParse.toFixed(0)} ms |`,
  `| Canonical sidecar hash | ${sidecarHash.toFixed(0)} ms |`,
  `| Inline and positional reference checks | ${references.toFixed(0)} ms |`,
  `| Composition to parsed Models | ${composition.toFixed(0)} ms |`,
  ''
].join('\n');
writeFileSync(join(OUT, 'measure-report.md'), report);
say(report);
