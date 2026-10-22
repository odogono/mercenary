import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { AssetFile } from '../geometry/targAssets.ts';

/// Every file under `assets/targ/{objects,structures}/`, by its path relative to `directory`.
/// A missing directory holds no assets.
export const readTargAssets = async (
  directory: string
): Promise<AssetFile[]> => {
  const files: AssetFile[] = [];
  for (const kind of ['objects', 'structures']) {
    let names: string[];
    try {
      names = await readdir(join(directory, kind));
    } catch {
      continue;
    }
    for (const name of names.filter(n => n.endsWith('.json')).sort()) {
      files.push({
        body: await Bun.file(join(directory, kind, name)).text(),
        path: `${kind}/${name}`
      });
    }
  }
  return files;
};

export const TARG_ASSETS_PATH = '/assets/targ.json';

/// The browser cannot list a directory, so the server answers with all of them at once.
export const assetsResponse = async (
  pathname: string,
  directory: string
): Promise<Response | undefined> =>
  pathname === TARG_ASSETS_PATH
    ? Response.json(await readTargAssets(directory))
    : undefined;
