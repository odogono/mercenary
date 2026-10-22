/// The Blender add-on in tools/blender/ against `assets/targ/` (ADR 0081), headless. Every Targ
/// Recovered Baseline is adopted into a scratch checkout, and Blender must hand each back
/// byte-identical; its edits, Authored Assets and Distant Structures must load as the game does.
///
/// Needs Blender 5.2 LTS, from BLENDER or PATH. Without it every test is skipped with a warning,
/// which is what CI does.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { canonicalJson } from '../src/geometry/contract.ts';
import {
  ASSET_FILE_FORMAT,
  assetFileName,
  baselineDigest,
  parseAssetFile,
  type AssetFile,
  type LoadedAsset
} from '../src/geometry/targAssets.ts';
import { sha256 } from '../src/hash/index.ts';
import { load } from '../src/payload/load.ts';
import { readTargAssets } from '../src/server/assets.ts';
import { World } from '../src/world/index.ts';
import { readPayloadFile } from './replay/artifacts.ts';

const CASES = join(
  import.meta.dir,
  '../../tools/blender/tests/blender_cases.py'
);

const findBlender = (): { path: string } | { skip: string } => {
  const path = process.env['BLENDER'] ?? Bun.which('blender');
  if (path === null || path === undefined) {
    return { skip: 'no Blender on PATH and BLENDER is unset' };
  }
  let output = '';
  try {
    output = Bun.spawnSync([path, '--version']).stdout.toString();
  } catch {
    return { skip: `${path} does not run` };
  }
  const version = /^Blender (\d+)\.(\d+)\.\d+/m.exec(output);
  if (version?.[1] !== '5' || version[2] !== '2') {
    return { skip: `${path} is not Blender 5.2 LTS` };
  }
  return { path };
};

const blender = findBlender();
if ('skip' in blender) {
  process.stderr.write(
    `blender-roundtrip: skipped, ${blender.skip}. Set BLENDER to a Blender 5.2 LTS binary to run it.\n`
  );
}

const read = async (name: string) => {
  try {
    return await readPayloadFile(name);
  } catch {
    return undefined;
  }
};
const payload = await load(read);
const recovered = [
  ...payload.objects.models.map(r => ['objects', r] as const),
  ...payload.surface.cells.map(r => ['structures', r] as const)
];

/// A scratch checkout whose `assets/targ/` holds every Recovered Baseline, adopted as
/// `bun tools/targ-assets.ts adopt` would.
const scratch = async (): Promise<string> => {
  const root = mkdtempSync(join(tmpdir(), 'mercenary-blender-'));
  for (const [kind, baseline] of recovered) {
    const path = join(
      root,
      'assets/targ',
      kind,
      assetFileName(baseline.asset.asset)
    );
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      canonicalJson({
        ...baseline,
        format: ASSET_FILE_FORMAT,
        ledger: { baseline: await baselineDigest(baseline), changes: [] }
      })
    );
  }
  return root;
};

const run = (root: string, ...args: string[]): unknown => {
  if ('skip' in blender) {
    throw new Error(blender.skip);
  }
  const { exitCode, stderr, stdout } = Bun.spawnSync(
    [
      blender.path,
      '-b',
      '--factory-startup',
      '--python-exit-code',
      '1',
      '--python',
      CASES,
      '--',
      ...args
    ],
    { env: { ...process.env, MERCENARY_ROOT: root } }
  );
  const result = /^RESULT (.*)$/m.exec(stdout.toString());
  if (exitCode !== 0 || result === null) {
    throw new Error(
      `blender ${args.join(' ')} exited ${exitCode}\n${stdout.toString()}\n${stderr.toString()}`
    );
  }
  return JSON.parse(result[1]!);
};

const assets = (root: string) => readTargAssets(join(root, 'assets/targ'));

const asset = async (root: string, path: string): Promise<LoadedAsset> =>
  parseAssetFile((await assets(root)).find(f => f.path === path)!);

/// The assets as the game loads them, over the payload.
const loadWith = (files: readonly AssetFile[]) => load(read, async () => files);

const objectPath = (identity: string) => `objects/${assetFileName(identity)}`;
const structurePath = (identity: string) =>
  `structures/${assetFileName(identity)}`;

const world = new World(payload);
const firstPlaced = world.objects.find(o => o.withinWorld)!;
const occupiedCell = world.cells.find(
  c => c.index !== 0 && c.segments(0).length > 0
)!;
const occupied = `targ:surface-cell:${occupiedCell.index}`;

const TIMEOUT = 300_000;

const moved = (a: LoadedAsset) => a.asset.parts[0]!.vertices[0]!.co;

describe.skipIf('skip' in blender)('Blender add-on', () => {
  test(
    'the plain-Python asset file rules hold inside Blender',
    () => {
      const result = run(
        mkdtempSync(join(tmpdir(), 'mercenary-blender-')),
        'unit'
      );
      expect(result).toMatchObject({ ok: true });
    },
    TIMEOUT
  );

  test(
    'every Targ Recovered Baseline comes back byte-identical',
    async () => {
      const result = run(await scratch(), 'roundtrip');
      expect(result).toEqual({ changed: [], checked: recovered.length });
    },
    TIMEOUT
  );

  test(
    'an edit made with the operators loads in place of its baseline',
    async () => {
      const root = await scratch();
      const path = objectPath(`targ:${firstPlaced.model}`);
      const before = await asset(root, path);
      expect(run(root, 'edit', path)).toEqual({ result: ['FINISHED'] });
      const after = await asset(root, path);
      expect(moved(after)).toEqual([
        moved(before)[0] + 256,
        moved(before)[1],
        moved(before)[2]
      ]);
      expect(after.ledger).toEqual(before.ledger);
      expect(after.sidecar).toEqual(before.sidecar);
      const edited = new World(await loadWith(await assets(root)));
      const object = edited.objects.find(o => o.id === firstPlaced.id)!;
      expect(object.vertices).not.toEqual(firstPlaced.vertices);
    },
    TIMEOUT
  );

  test(
    'a new Authored Asset loads once its placements are written by hand',
    async () => {
      const root = mkdtempSync(join(tmpdir(), 'mercenary-blender-'));
      expect(run(root, 'authored')).toEqual({
        probe: ['FINISHED'],
        'probe-tower': ['FINISHED']
      });
      const files = await assets(root);
      expect(files.map(f => f.path)).toEqual([
        'objects/authored-probe.json',
        'structures/authored-probe-tower.json'
      ]);
      // As written, neither is placed, so the game refuses both.
      await expect(loadWith(files.slice(0, 1))).rejects.toThrow(
        /placed through its sidecar placements/
      );

      const freeSlot =
        Math.max(...payload.objects.instances.map(i => i.slot)) + 1;
      const placements = {
        'objects/authored-probe.json': [
          {
            id: 'authored-instance:probe',
            placement: 'surface',
            position: [
              firstPlaced.origin.x,
              firstPlaced.origin.y,
              firstPlaced.origin.z
            ],
            room: 0,
            rotatable: false,
            slot: freeSlot,
            stateFlags: 0,
            visibility: {
              detailCubePerAxis: 65_536,
              farRepresentation: 'point'
            }
          }
        ],
        'structures/authored-probe-tower.json': [{ cell: occupiedCell.index }]
      };
      const placed = await Promise.all(
        files.map(async file => {
          const value = JSON.parse(file.body);
          value.sidecar.placements =
            placements[file.path as keyof typeof placements];
          value.asset.sidecarSha256 = await sha256(
            canonicalJson(value.sidecar)
          );
          return { ...file, body: canonicalJson(value) };
        })
      );
      const edited = new World(await loadWith(placed));
      const object = edited.objects.find(o => o.model === 'authored:probe')!;
      expect(object.slot).toBe(freeSlot);
      expect(object.vertices).toHaveLength(2);
      const cell = edited.cells.find(c => c.index === occupiedCell.index)!;
      expect(cell.structure).toBe('authored:probe-tower');
      expect(cell.segments(0)).toHaveLength(1);
    },
    TIMEOUT
  );

  test(
    "a structure's Distant Structure collection adds and removes its distant part",
    async () => {
      const root = await scratch();
      const path = structurePath(occupied);
      const hasDistant = async () =>
        (await asset(root, path)).asset.parts.map(p => p.role);

      expect(run(root, 'distant-add', path)).toEqual({ result: ['FINISHED'] });
      expect(await hasDistant()).toEqual(['wireframe', 'distant']);
      const added = new World(await loadWith(await assets(root)));
      const cell = added.cells.find(c => c.index === occupiedCell.index)!;
      expect(cell.distantSegments(0)).toHaveLength(1);

      expect(run(root, 'distant-remove', path)).toEqual({
        result: ['FINISHED']
      });
      expect(await hasDistant()).toEqual(['wireframe']);
    },
    TIMEOUT
  );
});
