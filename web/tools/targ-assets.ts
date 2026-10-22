/// Edited and Authored Targ Geometry Assets under `assets/targ/` (ADR 0081).
///
///   bun tools/targ-assets.ts check             every asset loads, and no edit has gone stale
///   bun tools/targ-assets.ts adopt <identity>  start an edit from its Recovered Baseline
///   bun tools/targ-assets.ts review <path>     record that an edit was re-reviewed against
///                                              today's Recovered Baseline
///
/// An edit is stale when the Recovered Baseline beneath it has changed since its Change Ledger
/// was reviewed: a re-extraction moved something the edit may have been built on. `check` fails
/// until someone compares the edit with the fresh baseline, updates the ledger's changes, and runs
/// `review`. `bun run check` runs `check`.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Recovered } from '../src/geometry/baseline.ts';
import { canonicalJson } from '../src/geometry/contract.ts';
import {
  ASSET_FILE_FORMAT,
  assetFileName,
  baselineDigest,
  parseAssetFile,
  type TargAsset
} from '../src/geometry/targAssets.ts';
import { load, type ReadDocument } from '../src/payload/load.ts';
import { readTargAssets } from '../src/server/assets.ts';

const findRoot = (): string => {
  let directory = import.meta.dir;
  while (!existsSync(join(directory, 'trace-scenarios.json'))) {
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error('could not find the repository root');
    }
    directory = parent;
  }
  return directory;
};

const ROOT = findRoot();
const ASSETS = join(ROOT, 'assets/targ');

const read: ReadDocument = async name => {
  const file = Bun.file(join(ROOT, 'payload', name));
  return (await file.exists()) ? await file.text() : undefined;
};

const baselines = async (): Promise<Map<string, Recovered>> => {
  const bundle = await load(read);
  return new Map(
    [...bundle.objects.models, ...bundle.surface.cells].map(r => [
      r.asset.asset,
      r
    ])
  );
};

/// Every stale edit, by path. Loading with the assets as the game does catches invalid ones.
const staleAssets = async (): Promise<string[]> => {
  const files = await readTargAssets(ASSETS);
  await load(read, async () => files);
  const recovered = await baselines();
  const stale: string[] = [];
  for (const file of files) {
    const asset = await parseAssetFile(file);
    if (asset.authored) {
      continue;
    }
    const baseline = recovered.get(asset.asset.asset)!;
    if ((await baselineDigest(baseline)) !== asset.ledger.baseline) {
      stale.push(file.path);
    }
  }
  return stale;
};

const write = (path: string, value: TargAsset) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, canonicalJson(value));
};

const [command, argument] = process.argv.slice(2);
if (command === 'check') {
  const stale = await staleAssets();
  for (const path of stale) {
    process.stderr.write(
      `assets/targ/${path}: its Recovered Baseline changed since its Change Ledger was reviewed.\n` +
        '  Compare the edit with what the payload now yields, classify every change in its ledger,\n' +
        `  then record the review: bun tools/targ-assets.ts review ${path}\n`
    );
  }
  process.exit(stale.length === 0 ? 0 : 1);
} else if (command === 'adopt' && argument !== undefined) {
  const baseline = (await baselines()).get(argument);
  if (baseline === undefined) {
    throw new Error(`no Recovered Baseline is ${argument}`);
  }
  const kind =
    baseline.sidecar.family === 'targ-object-model' ? 'objects' : 'structures';
  const path = join(ASSETS, kind, assetFileName(argument));
  if (existsSync(path)) {
    throw new Error(`${path} already exists; an edit is never overwritten`);
  }
  write(path, {
    ...baseline,
    format: ASSET_FILE_FORMAT,
    ledger: { baseline: await baselineDigest(baseline), changes: [] }
  });
  process.stdout.write(`${path}\n`);
} else if (command === 'review' && argument !== undefined) {
  const file = (await readTargAssets(ASSETS)).find(f => f.path === argument);
  if (file === undefined) {
    throw new Error(`no assets/targ/${argument}`);
  }
  const { asset, authored, format, ledger, sidecar } =
    await parseAssetFile(file);
  const baseline = (await baselines()).get(asset.asset);
  if (authored || baseline === undefined) {
    throw new Error(
      `${asset.asset} has no Recovered Baseline to review against`
    );
  }
  write(join(ASSETS, argument), {
    asset,
    format,
    ledger: { ...ledger, baseline: await baselineDigest(baseline) },
    sidecar
  });
} else {
  process.stderr.write(
    'usage: bun tools/targ-assets.ts check | adopt <identity> | review <path>\n'
  );
  process.exit(2);
}
