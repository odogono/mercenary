/// Edited and Authored Targ Geometry Assets from `assets/targ/` (ADR 0081), laid over the
/// Recovered Baselines the payload yields. The Data Payload itself is never touched.
///
/// Each file is `{objects,structures}/<name>.json`, canonical JSON holding one Geometry Asset, its
/// Asset Sidecar and its Change Ledger. `<name>` is the identity without its `targ:` title, colons
/// as hyphens: `object-model-1700`, `surface-cell-12`, `authored-beacon`.
///
/// - A `targ:` asset is an edit: it replaces the Recovered Baseline with the same Geometry
///   Identity, and its ledger names the baseline it was reviewed against.
/// - An `authored:<slug>` asset is an Authored Asset: it has no baseline, and its Sidecar's
///   placements put it in the World — object instances, or the Surface Cells a structure occupies.

import { sha256 } from '../hash/index.ts';
import type { Instance } from '../payload/documents.ts';
import type { Recovered } from './baseline.ts';
import { RejectedAsset, checkAsset } from './compose.ts';
import {
  CONTRACT_FORMAT,
  canonicalJson,
  type Family,
  type GeometryAsset,
  type Sidecar
} from './contract.ts';

export const ASSET_FILE_FORMAT = 'mercenary-targ-asset';

export type AssetKind = 'objects' | 'structures';

/// One file under `assets/targ/`, by its path relative to that directory.
export interface AssetFile {
  readonly body: string;
  readonly path: string;
}

/// How each authored change departs from the baseline; see Change Ledger in CONTEXT.md.
export interface LedgerChange {
  readonly element: string;
  readonly evidence?: string;
  readonly note: string;
  readonly provenance: 'correction' | 'creative';
}

export interface Ledger {
  /// The digest of the Recovered Baseline this edit's changes were last reviewed against.
  /// Absent for an Authored Asset, which has none.
  readonly baseline?: string;
  readonly changes: readonly LedgerChange[];
}

export interface TargAsset {
  readonly asset: GeometryAsset;
  readonly format: typeof ASSET_FILE_FORMAT;
  readonly ledger: Ledger;
  readonly sidecar: Sidecar;
}

export interface LoadedAsset extends TargAsset {
  readonly authored: boolean;
  readonly kind: AssetKind;
  readonly path: string;
}

const FAMILY: Record<AssetKind, Family> = {
  objects: 'targ-object-model',
  structures: 'targ-surface-cell'
};

const AUTHORED = /^authored:[\da-z]+(?:-[\da-z]+)*$/;

export class InvalidAsset extends Error {
  override name = 'InvalidAsset';
  constructor(path: string, reason: string) {
    super(`assets/targ/${path}: ${reason}`);
  }
}

/// The file name an identity is stored under.
export const assetFileName = (identity: string): string =>
  `${identity.replace(/^targ:/, '').replaceAll(':', '-')}.json`;

/// What freshness compares: the baseline's geometry and sidecar, without the hash of the whole
/// payload document, which changes whenever any other record in it does.
export const baselineDigest = ({
  asset,
  sidecar
}: Recovered): Promise<string> => {
  const { sidecarSha256: _, ...geometry } = asset;
  const source =
    sidecar.source === undefined
      ? undefined
      : { document: sidecar.source.document, path: sidecar.source.path };
  return sha256(canonicalJson({ geometry, sidecar: { ...sidecar, source } }));
};

export const parseAssetFile = async (file: AssetFile): Promise<LoadedAsset> => {
  const fail = (reason: string): never => {
    throw new InvalidAsset(file.path, reason);
  };
  const match = /^(objects|structures)\/([^/]+\.json)$/.exec(file.path);
  if (match === null) {
    return fail('expected objects/<name>.json or structures/<name>.json');
  }
  const kind = match[1] as AssetKind;
  let value: TargAsset;
  try {
    value = JSON.parse(file.body) as TargAsset;
  } catch (error) {
    return fail(`not JSON (${(error as Error).message})`);
  }
  if (value.format !== ASSET_FILE_FORMAT) {
    return fail(`format should be ${ASSET_FILE_FORMAT}`);
  }
  const { asset, ledger, sidecar } = value;
  if (asset?.format !== CONTRACT_FORMAT || asset.title !== 'targ') {
    return fail(`asset should be a targ ${CONTRACT_FORMAT}`);
  }
  if (sidecar?.family !== FAMILY[kind]) {
    return fail(`a ${kind} sidecar's family is ${FAMILY[kind]}`);
  }
  if (!Array.isArray(ledger?.changes)) {
    return fail('needs a ledger with its changes');
  }
  if (assetFileName(asset.asset) !== match[2]) {
    return fail(`${asset.asset} is stored as ${assetFileName(asset.asset)}`);
  }
  if (asset.sidecarSha256 !== (await sha256(canonicalJson(sidecar)))) {
    return fail('geometry is linked to a different sidecar; re-export it');
  }
  const diagnostics = checkAsset(asset, sidecar).filter(
    d => d.severity === 'error'
  );
  if (diagnostics.length > 0) {
    return fail(new RejectedAsset(diagnostics).message);
  }
  const authored = asset.asset.startsWith('authored:');
  if (authored) {
    if (!AUTHORED.test(asset.asset)) {
      return fail('an Authored Asset is authored:<lowercase-hyphenated-slug>');
    }
    if (ledger.baseline !== undefined || sidecar.source !== undefined) {
      return fail('an Authored Asset has no Recovered Baseline');
    }
    if (!Array.isArray(sidecar.placements) || sidecar.placements.length === 0) {
      return fail('an Authored Asset is placed through its sidecar placements');
    }
  } else {
    if (!asset.asset.startsWith('targ:')) {
      return fail('an identity is targ:… for an edit or authored:… for new');
    }
    if (typeof ledger.baseline !== 'string') {
      return fail('an edit names the Recovered Baseline its ledger reviewed');
    }
    if (sidecar.placements !== undefined) {
      return fail(
        'an edit keeps its payload placement; only Authored Assets place'
      );
    }
  }
  if (kind === 'objects' && sidecar.reach !== undefined) {
    return fail('only a structure has a Structure Reach');
  }
  if (
    sidecar.reach !== undefined &&
    sidecar.reach !== 'all' &&
    sidecar.reach !== 'cell'
  ) {
    return fail('reach is "all" or "cell"');
  }
  return { ...value, authored, kind, path: file.path };
};

const relink = async (asset: GeometryAsset, sidecar: Sidecar) => ({
  asset: { ...asset, sidecarSha256: await sha256(canonicalJson(sidecar)) },
  sidecar
});

type Json = Record<string, unknown>;

/// Lay the assets over the payload's recovered geometry. Each Authored structure placement
/// becomes the occupied Surface Cell's record; Authored objects add instances.
export const applyTargAssets = async (
  geometry: {
    readonly instances: readonly Instance[];
    readonly objects: readonly Recovered[];
    readonly structures: readonly Recovered[];
  },
  assets: readonly LoadedAsset[]
): Promise<{
  instances: readonly Instance[];
  objects: readonly Recovered[];
  structures: readonly Recovered[];
}> => {
  const objects = [...geometry.objects];
  const structures = [...geometry.structures];
  const instances = [...geometry.instances];
  const claimed = new Map<string, string>();
  const claim = (asset: LoadedAsset, what: string) => {
    const earlier = claimed.get(what);
    if (earlier !== undefined) {
      throw new InvalidAsset(asset.path, `${what} is already ${earlier}'s`);
    }
    claimed.set(what, asset.asset.asset);
  };

  // Edits first, so an Authored structure placement cannot hide the cell an edit replaces.
  const ordered = [
    ...assets.filter(a => !a.authored),
    ...assets.filter(a => a.authored)
  ];
  for (const loaded of ordered) {
    const { asset, sidecar } = loaded;
    const list = loaded.kind === 'objects' ? objects : structures;
    if (!loaded.authored) {
      const at = list.findIndex(r => r.asset.asset === asset.asset);
      if (at < 0) {
        throw new InvalidAsset(
          loaded.path,
          `no Recovered Baseline is ${asset.asset}; a new model is authored:<slug>`
        );
      }
      claim(loaded, asset.asset);
      list[at] = { asset, sidecar };
      continue;
    }
    claim(loaded, asset.asset);
    if (loaded.kind === 'objects') {
      const model = sidecar.record as Json;
      if (model['id'] !== asset.asset) {
        throw new InvalidAsset(
          loaded.path,
          `record id should be ${asset.asset}`
        );
      }
      objects.push({ asset, sidecar });
      for (const [i, raw] of sidecar.placements!.entries()) {
        const instance = { ...(raw as Json), model: asset.asset } as Instance;
        if (instances.some(other => other.slot === instance.slot)) {
          throw new InvalidAsset(
            loaded.path,
            `placements[${i}] takes slot ${instance.slot}, which is already placed`
          );
        }
        if (instances.some(other => other.id === instance.id)) {
          throw new InvalidAsset(
            loaded.path,
            `placements[${i}] reuses instance id ${instance.id}`
          );
        }
        instances.push(instance);
      }
      continue;
    }
    for (const [i, raw] of sidecar.placements!.entries()) {
      const cell = (raw as Json)['cell'];
      const at = structures.findIndex(
        r => (r.sidecar.record as Json)['cell'] === cell
      );
      if (at < 0) {
        throw new InvalidAsset(
          loaded.path,
          `placements[${i}] names no Surface Cell (${String(cell)})`
        );
      }
      const occupied = structures[at]!.sidecar.record as Json;
      claim(loaded, `targ:surface-cell:${String(cell)}`);
      structures[at] = await relink(asset, {
        ...sidecar,
        record: {
          structure: asset.asset,
          ...(sidecar.record as Json),
          cell,
          grid: occupied['grid']
        }
      });
    }
  }
  return { instances, objects, structures };
};
