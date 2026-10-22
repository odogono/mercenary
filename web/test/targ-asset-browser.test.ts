import { describe, expect, test } from 'bun:test';

import { canonicalJson } from '../src/geometry/contract.ts';
import {
  ASSET_FILE_FORMAT,
  assetFileName,
  baselineDigest,
  parseAssetFile,
  type AssetFile
} from '../src/geometry/targAssets.ts';
import { load } from '../src/payload/load.ts';
import { planInspection } from '../src/shell/frame.ts';
import {
  adoptCommand,
  blenderCommand,
  browserEntries
} from '../src/targAssetBrowser/entries.ts';
import {
  DEFAULT_ORBIT,
  orbitCamera,
  previewGeometry
} from '../src/targAssetBrowser/preview.ts';
import { readPayloadFile } from './replay/artifacts.ts';

const read = async (name: string) => {
  try {
    return await readPayloadFile(name);
  } catch {
    return undefined;
  }
};
const baseline = await load(read);

/// An edit of `identity` as `adopt` writes it, reviewed against `digest`.
const adopted = async (
  identity: string,
  digest?: string
): Promise<AssetFile> => {
  const recovered = [
    ...baseline.objects.models,
    ...baseline.surface.cells
  ].find(r => r.asset.asset === identity)!;
  const kind =
    recovered.sidecar.family === 'targ-object-model' ? 'objects' : 'structures';
  return {
    body: canonicalJson({
      ...recovered,
      format: ASSET_FILE_FORMAT,
      ledger: {
        baseline: digest ?? (await baselineDigest(recovered)),
        changes: []
      }
    }),
    path: `${kind}/${assetFileName(identity)}`
  };
};

const entriesWith = async (files: readonly AssetFile[]) =>
  browserEntries(
    baseline,
    await load(read, async () => files),
    await Promise.all(files.map(parseAssetFile))
  );

describe('Targ Asset Browser entries', () => {
  test('lists every object model and every cell that draws a structure', async () => {
    const entries = await entriesWith([]);
    const objects = entries.filter(e => e.kind === 'objects');
    expect(objects).toHaveLength(baseline.objects.models.length);
    expect(entries.every(e => e.status === 'recovered' && !e.drift)).toBe(true);
    const structures = entries.filter(e => e.kind === 'structures');
    expect(structures.length).toBeGreaterThan(0);
    expect(structures.every(e => e.structure !== undefined)).toBe(true);
  });

  test('places a model by its instances and a cell by its grid', async () => {
    const entries = await entriesWith([]);
    const placed = baseline.objects.instances[0]!;
    const model = entries.find(e => e.identity === `targ:${placed.model}`)!;
    expect(model.placements.some(p => p.startsWith(placed.id))).toBe(true);
    const cell = entries.find(e => e.kind === 'structures')!;
    expect(cell.placements).toHaveLength(1);
    expect(cell.placements[0]).toMatch(/^Surface Cell \d+ · grid \d+,\d+$/);
  });

  test('names the cells that share a structure', async () => {
    const entries = await entriesWith([]);
    const shared = entries.find(
      e => (e.structure?.sharedWith.length ?? 0) > 0
    )!;
    const other = entries.find(
      e => e.identity === `targ:surface-cell:${shared.structure!.sharedWith[0]}`
    )!;
    expect(other.structure!.id).toBe(shared.structure!.id);
  });

  test('marks an edit, and flags drift once its baseline moves', async () => {
    const fresh = await adopted('targ:object-model:1700');
    const stale = await adopted('targ:surface-cell:5', '0'.repeat(64));
    const entries = await entriesWith([fresh, stale]);
    const model = entries.find(e => e.identity === 'targ:object-model:1700')!;
    expect(model).toMatchObject({
      changes: 0,
      drift: false,
      path: 'assets/targ/objects/object-model-1700.json',
      status: 'edited'
    });
    expect(entries.find(e => e.identity === 'targ:surface-cell:5')!.drift).toBe(
      true
    );
  });

  test('gives the adopt and Blender commands, run from web/', async () => {
    const entry = (await entriesWith([])).find(
      e => e.identity === 'targ:object-model:1700'
    )!;
    expect(adoptCommand(entry)).toBe(
      'bun tools/targ-assets.ts adopt targ:object-model:1700'
    );
    expect(blenderCommand(entry)).toBe(
      'bun run blender ../assets/targ/objects/object-model-1700.json'
    );
  });
});

describe('Targ Asset Browser preview', () => {
  test('frames every drawn line of a model in view', () => {
    const asset = baseline.objects.models[0]!.asset;
    const geometry = previewGeometry(asset);
    expect(geometry.segments.length).toBeGreaterThan(0);
    const size = { height: 400, width: 640 };
    const camera = orbitCamera(geometry, DEFAULT_ORBIT);
    for (const { a, b } of geometry.segments) {
      for (const point of [a, b]) {
        expect(camera.viewSpace(point).z).toBeGreaterThan(0);
      }
    }
    const plan = planInspection(camera, geometry, size);
    expect(plan.lines).toBe(geometry.segments.length);
  });
});
