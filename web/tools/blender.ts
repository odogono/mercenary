/// Open Blender with the Mercenary geometry add-on from tools/blender/ (ADR 0081).
///
///   bun run blender                          the add-on, ready to import or create an asset
///   bun run blender <assets/targ file>       and that asset, imported
///
/// Blender is BLENDER, or `blender` on PATH; the add-on targets Blender 5.2 LTS. Start an edit
/// with `bun tools/targ-assets.ts adopt <identity>`; see tools/blender/README.md.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

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
const ADDON = join(ROOT, 'tools/blender');

const blender = process.env['BLENDER'] ?? Bun.which('blender');
if (blender === null || blender === undefined) {
  process.stderr.write(
    'no Blender on PATH; set BLENDER to a Blender 5.2 LTS binary\n'
  );
  process.exit(2);
}

const [path] = process.argv.slice(2);
const steps = [
  'import sys',
  `sys.path.insert(0, ${JSON.stringify(ADDON)})`,
  'import mercenary_geometry',
  'mercenary_geometry.register()'
];
// Once the window is up: drop the startup scene (keeping preferences), then open the asset.
// Framing waits one more tick, for the reloaded screen to have a 3D view to frame in.
const open =
  path === undefined
    ? []
    : [
        'from mercenary_geometry import addon, targ_asset',
        `collection = addon.open_asset(targ_asset.relative_path(${JSON.stringify(resolve(process.cwd(), path))}))`,
        'bpy.app.timers.register(lambda: addon.frame(collection), first_interval=0.2)'
      ];
steps.push(
  'import bpy',
  'def start():',
  '    bpy.ops.wm.read_homefile(use_empty=True)',
  ...open.map(line => `    ${line}`),
  'bpy.app.timers.register(start, first_interval=0.1)'
);

const child = Bun.spawn([blender, '--python-expr', steps.join('\n')], {
  env: { ...process.env, MERCENARY_ROOT: ROOT },
  stdio: ['inherit', 'inherit', 'inherit']
});
process.exit(await child.exited);
