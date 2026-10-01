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
import { compose } from '../../src/geometrySpike/compose.ts';
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
const once = (run: () => void) => {
  run();
  const t = performance.now();
  run();
  const a = performance.now() - t;
  const u = performance.now();
  run();
  return Math.min(a, performance.now() - u);
};
const corpusJson = once(() =>
  corpus.forEach(c => parseModelFile(JSON.parse(c.json), catalogue))
);
const corpusMgeo = once(() =>
  corpus.forEach(c =>
    parseModelFile(
      compose(decodeMgeo(c.mgeo), JSON.parse(c.sidecar) as Sidecar).record,
      catalogue
    )
  )
);
const corpusGlb = once(() =>
  corpus.forEach(c =>
    parseModelFile(
      compose(decodeGlb(c.glb), JSON.parse(c.sidecar) as Sidecar).record,
      catalogue
    )
  )
);
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
  '| | Raw / gzip -9 (sum of per-file sizes) | Load to parsed Models |',
  '| --- | --- | --- |',
  `| Payload JSON model files | ${mb(totals.json)} | ${corpusJson.toFixed(0)} ms |`,
  `| MGEO + sidecar JSON | ${mb(plus(totals.mgeo, totals.sidecar))} (geometry ${mb(totals.mgeo)}) | ${corpusMgeo.toFixed(0)} ms |`,
  `| GLB + sidecar JSON | ${mb(plus(totals.glb, totals.sidecar))} (geometry ${mb(totals.glb)}) | ${corpusGlb.toFixed(0)} ms |`,
  ''
].join('\n');
writeFileSync(join(OUT, 'measure-report.md'), report);
say(report);
