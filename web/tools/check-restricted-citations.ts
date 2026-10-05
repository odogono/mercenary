import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Every `restricted/<dir>` a doc cites must exist in the main checkout's
// Restricted Material, where evidence lives so deleting a worktree cannot strand it.
const root = resolve(import.meta.dir, '../..');
const commonDir = Bun.spawnSync([
  'git',
  'rev-parse',
  '--path-format=absolute',
  '--git-common-dir'
])
  .stdout.toString()
  .trim();
const restricted = resolve(dirname(commonDir), 'restricted');

// Cited before evidence was kept in the main checkout; their worktrees are gone.
const lost = new Set([
  'mercenary-iii-609',
  'mercenary-iii-615',
  'mercenary-iii-618',
  'mercenary-iii-619',
  'mercenary-iii-636',
  'mercenary-iii-637',
  'mercenary-iii-642',
  'mercenary-iii-643',
  'mercenary-iii-644',
  'mercenary-iii-645',
  'mercenary-iii-646',
  'mercenary-iii-707-followup',
  // Deleted with the #756 rescope; the reports note it.
  'mercenary-iii-770',
  'mercenary-iii-771',
  'mercenary-iii-772',
  'mercenary-iii-778'
]);

if (!existsSync(restricted)) {
  process.stdout.write(`skipped: no Restricted Material at ${restricted}\n`);
  process.exit(0);
}

const missing: Array<string> = [];
for await (const path of new Bun.Glob('docs/**/*.md').scan(root)) {
  const text = await Bun.file(resolve(root, path)).text();
  for (const [index, line] of text.split('\n').entries()) {
    for (const match of line.matchAll(/(?:^|[^\w./-])restricted\/([\w.-]+)/g)) {
      const dir = match[1]!.replace(/\.$/, '');
      if (!lost.has(dir) && !existsSync(resolve(restricted, dir))) {
        missing.push(`${path}:${index + 1}: restricted/${dir}`);
      }
    }
  }
}

if (missing.length) {
  process.stderr.write(
    `Docs cite Restricted Material missing from ${restricted}.\n` +
      `Move it there from the worktree that produced it:\n${missing.join('\n')}\n`
  );
  process.exit(1);
}
