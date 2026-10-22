/// The Targ Asset Browser's entries: every Targ object model and Surface Cell structure as the
/// game draws it, with what an author needs to start editing it (#877).
///
/// Pure, so it reads the same Bundles the game loads: one with `assets/targ/` laid over the
/// Recovered Baselines, and one without, which is what drift is measured against.

import type { Recovered } from '../geometry/baseline.ts';
import type { GeometryAsset } from '../geometry/contract.ts';
import {
  assetFileName,
  baselineDigest,
  type AssetKind,
  type LoadedAsset
} from '../geometry/targAssets.ts';
import type { Bundle } from '../payload/documents.ts';

export type EntryStatus = 'authored' | 'edited' | 'recovered';

export interface BrowserEntry {
  readonly asset: GeometryAsset;
  /// Changes its Change Ledger classifies; absent for a recovered entry.
  readonly changes?: number;
  /// An edit whose Recovered Baseline has moved since its Change Ledger was reviewed.
  readonly drift: boolean;
  readonly identity: string;
  readonly kind: AssetKind;
  /// Where the asset file is, or would be once adopted, relative to the repository root.
  readonly path: string;
  /// Where the game puts it: object instances, or the Surface Cells a structure fills.
  readonly placements: readonly string[];
  readonly status: EntryStatus;
  /// For a Surface Cell, its shared structure record and the other cells that draw it too. An
  /// edit to one cell does not change the others.
  readonly structure?: {
    readonly id: string;
    readonly sharedWith: readonly number[];
  };
}

type Json = Record<string, unknown>;

const record = (recovered: Recovered): Json => recovered.sidecar.record as Json;

const instancePlacement = (instance: Bundle['objects']['instances'][number]) =>
  instance.placement === 'room'
    ? `${instance.id} · slot ${instance.slot} · Room ${instance.room}`
    : `${instance.id} · slot ${instance.slot} · surface`;

const cellPlacement = (cell: Json): string => {
  const [column, row] = (cell['grid'] as readonly number[] | undefined) ?? [];
  return `Surface Cell ${String(cell['cell'])} · grid ${column},${row}`;
};

/// The adopt command for a recovered entry, and the Blender command once its file exists. Both
/// run from `web/`.
export const adoptCommand = (entry: BrowserEntry): string =>
  `bun tools/targ-assets.ts adopt ${entry.identity}`;
export const blenderCommand = (entry: BrowserEntry): string =>
  `bun run blender ../${entry.path}`;

export const browserEntries = async (
  baseline: Bundle,
  effective: Bundle,
  assets: readonly LoadedAsset[]
): Promise<BrowserEntry[]> => {
  const files = new Map(assets.map(a => [a.asset.asset, a]));
  const baselines = new Map(
    [...baseline.objects.models, ...baseline.surface.cells].map(r => [
      r.asset.asset,
      r
    ])
  );
  const status = async (identity: string) => {
    const file = files.get(identity);
    if (file === undefined) {
      return { drift: false, status: 'recovered' as const };
    }
    const changes = file.ledger.changes.length;
    if (file.authored) {
      return { changes, drift: false, status: 'authored' as const };
    }
    const recovered = baselines.get(identity);
    const drift =
      recovered === undefined ||
      (await baselineDigest(recovered)) !== file.ledger.baseline;
    return { changes, drift, status: 'edited' as const };
  };
  const path = (kind: AssetKind, identity: string) =>
    files.get(identity)?.path === undefined
      ? `assets/targ/${kind}/${assetFileName(identity)}`
      : `assets/targ/${files.get(identity)!.path}`;

  const entries: BrowserEntry[] = [];
  for (const model of effective.objects.models) {
    const identity = model.asset.asset;
    const id = record(model)['id'];
    entries.push({
      asset: model.asset,
      identity,
      kind: 'objects',
      path: path('objects', identity),
      placements: effective.objects.instances
        .filter(instance => instance.model === id)
        .map(instancePlacement),
      ...(await status(identity))
    });
  }

  // An Authored structure is relinked into every cell it occupies, so cells group by identity.
  const cells = new Map<string, Recovered[]>();
  for (const cell of effective.surface.cells) {
    cells.set(cell.asset.asset, [...(cells.get(cell.asset.asset) ?? []), cell]);
  }
  const byStructure = new Map<string, number[]>();
  for (const cell of effective.surface.cells) {
    const { cell: index, structure } = record(cell);
    if (typeof structure === 'string') {
      byStructure.set(structure, [
        ...(byStructure.get(structure) ?? []),
        index as number
      ]);
    }
  }
  for (const [identity, occupied] of cells) {
    const first = record(occupied[0]!);
    const structure = first['structure'];
    // A cell with no structure draws nothing, so there is nothing to edit there.
    if (typeof structure !== 'string') {
      continue;
    }
    const own = new Set(occupied.map(cell => record(cell)['cell']));
    entries.push({
      asset: occupied[0]!.asset,
      identity,
      kind: 'structures',
      path: path('structures', identity),
      placements: occupied.map(cell => cellPlacement(record(cell))),
      structure: {
        id: structure,
        sharedWith: (byStructure.get(structure) ?? []).filter(
          index => !own.has(index)
        )
      },
      ...(await status(identity))
    });
  }
  return entries;
};
