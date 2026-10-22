import { describe, expect, test } from 'bun:test';

import type { Recovered } from '../src/geometry/baseline.ts';
import {
  canonicalJson,
  type GeometryAsset,
  type Part,
  type Sidecar
} from '../src/geometry/contract.ts';
import {
  ASSET_FILE_FORMAT,
  assetFileName,
  baselineDigest,
  type AssetFile,
  type LedgerChange
} from '../src/geometry/targAssets.ts';
import { sha256 } from '../src/hash/index.ts';
import { load } from '../src/payload/load.ts';
import { visible } from '../src/projection/index.ts';
import { World } from '../src/world/index.ts';
import { readPayloadFile } from './replay/artifacts.ts';

const read = async (name: string) => {
  try {
    return await readPayloadFile(name);
  } catch {
    return undefined;
  }
};
const payload = await load(read);
const world = new World(payload);

const file = async (
  kind: 'objects' | 'structures',
  asset: Omit<GeometryAsset, 'sidecarSha256'>,
  sidecar: Sidecar,
  baseline?: string,
  changes: readonly LedgerChange[] = []
): Promise<AssetFile> => ({
  body: canonicalJson({
    asset: { ...asset, sidecarSha256: await sha256(canonicalJson(sidecar)) },
    format: ASSET_FILE_FORMAT,
    ledger: { ...(baseline === undefined ? {} : { baseline }), changes },
    sidecar
  }),
  path: `${kind}/${assetFileName(asset.asset)}`
});

const shifted = (part: Part, dx: number): Part => ({
  ...part,
  vertices: part.vertices.map(v => ({
    ...v,
    co: [v.co[0] + dx, v.co[1], v.co[2]] as const
  }))
});

const edit = async (
  kind: 'objects' | 'structures',
  recovered: Recovered,
  dx: number
) =>
  file(
    kind,
    {
      ...recovered.asset,
      parts: recovered.asset.parts.map(p => shifted(p, dx))
    },
    recovered.sidecar,
    await baselineDigest(recovered),
    [{ element: 'wireframe', note: 'moved', provenance: 'creative' }]
  );

const withAssets = (files: readonly AssetFile[]) =>
  load(read, async () => files);

const firstPlaced = world.objects.find(o => o.withinWorld)!;
const placedModel = payload.objects.models.find(
  m => m.asset.asset === `targ:${firstPlaced.model}`
)!;
const occupiedCell = world.cells.find(
  c => c.index !== 0 && c.segments(0).length > 0
)!;
const occupiedRecovered = payload.surface.cells.find(
  c => c.asset.asset === `targ:surface-cell:${occupiedCell.index}`
)!;

describe('edited Targ assets', () => {
  test('an edit replaces the Recovered Baseline with the same Geometry Identity', async () => {
    const bundle = await withAssets([
      await edit('objects', placedModel, 64),
      await edit('structures', occupiedRecovered, 64)
    ]);
    const edited = new World(bundle);
    const object = edited.objects.find(o => o.id === firstPlaced.id)!;
    expect(object.vertices).not.toEqual(firstPlaced.vertices);
    expect(object.origin).toEqual(firstPlaced.origin);
    const cell = edited.cells.find(c => c.index === occupiedCell.index)!;
    expect(cell.segments(0)).not.toEqual(occupiedCell.segments(0));
    expect(bundle.objects.models).toHaveLength(payload.objects.models.length);
  });

  test('an edit with no Recovered Baseline is refused', async () => {
    const asset = { ...placedModel.asset, asset: 'targ:object-model:abcd' };
    const sidecar = { ...placedModel.sidecar, asset: asset.asset };
    await expect(
      withAssets([await file('objects', asset, sidecar, 'x')])
    ).rejects.toThrow(/no Recovered Baseline is targ:object-model:abcd/);
  });

  test('an edit linked to another sidecar is refused', async () => {
    const good = await edit('objects', placedModel, 0);
    const value = JSON.parse(good.body);
    value.sidecar.record.id = 'changed';
    await expect(
      withAssets([{ ...good, body: JSON.stringify(value) }])
    ).rejects.toThrow(/linked to a different sidecar/);
  });

  test('the ledger baseline names the Recovered Baseline until a re-extraction moves it', async () => {
    const digest = await baselineDigest(placedModel);
    // A change elsewhere in objects.json changes the document hash, not this baseline.
    expect(
      await baselineDigest({
        ...placedModel,
        sidecar: {
          ...placedModel.sidecar,
          source: { ...placedModel.sidecar.source!, sha256: '0'.repeat(64) }
        }
      })
    ).toBe(digest);
    const moved = await baselineDigest({
      ...placedModel,
      asset: {
        ...placedModel.asset,
        parts: placedModel.asset.parts.map(p => shifted(p, 1))
      }
    });
    expect(moved).not.toBe(digest);
  });
});

const beacon = (placements: readonly unknown[]) => {
  const sidecar: Sidecar = {
    asset: 'authored:beacon',
    family: 'targ-object-model',
    format: 'mercenary-geometry-sidecar',
    placements,
    record: {
      edges: { $edges: 'wireframe' },
      id: 'authored:beacon',
      vertices: { $vertices: 'wireframe' }
    },
    references: [],
    title: 'targ',
    version: 2
  };
  return file(
    'objects',
    {
      ...placedModel.asset,
      asset: 'authored:beacon',
      parts: [
        {
          colourModel: 'none',
          externals: [],
          faces: [],
          id: 'wireframe',
          lines: [{ ends: [0, 1], id: 0 }],
          role: 'wireframe',
          vertices: [
            { co: [0, 0, 0], id: 0 },
            { co: [0, 512, 0], id: 1 }
          ]
        }
      ]
    },
    sidecar
  );
};
const instance = (slot: number) => ({
  id: 'authored-instance:beacon',
  placement: 'surface',
  position: [firstPlaced.origin.x, firstPlaced.origin.y, firstPlaced.origin.z],
  room: 0,
  rotatable: false,
  slot,
  stateFlags: 0,
  visibility: { detailCubePerAxis: 65_536, farRepresentation: 'point' }
});
const freeSlot = Math.max(...payload.objects.instances.map(i => i.slot)) + 1;

test('Authored: an Authored object is placed through its sidecar', async () => {
  const edited = new World(
    await withAssets([await beacon([instance(freeSlot)])])
  );
  const placed = edited.objects.find(o => o.model === 'authored:beacon')!;
  expect(placed.slot).toBe(freeSlot);
  expect(placed.vertices).toHaveLength(2);
});

test('Authored: an Authored object may not take a slot the payload places', async () => {
  await expect(
    withAssets([await beacon([instance(firstPlaced.slot)])])
  ).rejects.toThrow(/already placed/);
});

test('Authored: an Authored Asset needs a placement and no baseline', async () => {
  await expect(withAssets([await beacon([])])).rejects.toThrow(
    /placed through its sidecar/
  );
});

const tower = async (
  cells: readonly number[],
  extra: { distant?: boolean; reach?: 'all' | 'cell' } = {}
) => {
  const wireframe: Part = {
    colourModel: 'ink',
    externals: [],
    faces: [],
    id: 'wireframe',
    lines: [{ colour: { ink: 1, kind: 'ink' }, ends: [0, 1], id: 0 }],
    role: 'wireframe',
    vertices: [
      { co: [1000, 0, 1000], id: 0 },
      { co: [1000, 4000, 1000], id: 1 }
    ]
  };
  const sidecar: Sidecar = {
    asset: 'authored:tower',
    family: 'targ-surface-cell',
    format: 'mercenary-geometry-sidecar',
    placements: cells.map(cell => ({ cell })),
    ...(extra.reach === undefined ? {} : { reach: extra.reach }),
    record: {
      edges: { $surfaceEdges: 'wireframe' },
      vertices: { $surfaceVertices: 'wireframe' }
    },
    references: [],
    title: 'targ',
    version: 2
  };
  return file(
    'structures',
    {
      ...occupiedRecovered.asset,
      asset: 'authored:tower',
      parts: [
        wireframe,
        ...(extra.distant === true
          ? [
              {
                ...wireframe,
                id: 'distant',
                lines: [],
                role: 'distant' as const
              }
            ]
          : [])
      ]
    },
    sidecar
  );
};

test('Authored: an Authored structure occupies the Surface Cells its sidecar places it in', async () => {
  const edited = new World(
    await withAssets([await tower([occupiedCell.index])])
  );
  const cell = edited.cells.find(c => c.index === occupiedCell.index)!;
  expect(cell.structure).toBe('authored:tower');
  expect(cell.column).toBe(occupiedCell.column);
  expect(cell.segments(0)).toHaveLength(1);
});

test('Authored: two assets may not occupy one Surface Cell', async () => {
  await expect(
    withAssets([
      await edit('structures', occupiedRecovered, 0),
      await tower([occupiedCell.index])
    ])
  ).rejects.toThrow(/already/);
});

const distantFrom = (edited: World) => {
  const neighbour = edited.cells.find(
    c =>
      c.index !== 0 &&
      c.index !== occupiedCell.index &&
      Math.abs(c.column - occupiedCell.column) <= 2 &&
      Math.abs(c.row - occupiedCell.row) <= 2
  )!;
  return visible(edited, neighbour.centre, {
    rules: { farPoints: 'horizon', reach: 'all' }
  }).distant;
};

test("Authored: a structure's Reach in its sidecar keeps it out of the Distant Structures", async () => {
  const all = new World(await withAssets([await tower([occupiedCell.index])]));
  const cell = new World(
    await withAssets([await tower([occupiedCell.index], { reach: 'cell' })])
  );
  expect(distantFrom(cell).length).toBe(distantFrom(all).length - 1);
});

test('Authored: a Distant Structure is drawn from its own part', async () => {
  const all = new World(await withAssets([await tower([occupiedCell.index])]));
  const distant = new World(
    await withAssets([await tower([occupiedCell.index], { distant: true })])
  );
  expect(distantFrom(distant).length).toBe(distantFrom(all).length - 1);
  const placed = distant.cells.find(c => c.index === occupiedCell.index)!;
  expect(placed.segments(0)).toHaveLength(1);
  expect(placed.distantSegments(0)).toHaveLength(0);
});
