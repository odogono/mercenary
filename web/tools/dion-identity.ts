import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { tourcraftContentIdentity } from '../src/dion/tourcraftContent.ts';

const MANIFEST = '/payload/dion/tourcraft/manifest.json';
const PREFIX = '/payload/dion/tourcraft/';
interface Pin {
  readonly identity: 'baseline' | 'current';
  readonly lines: readonly number[];
  readonly path: string;
}
interface IdentityReport {
  readonly baseline: string | null;
  readonly current: string;
  readonly documents: number;
  readonly pins: readonly Pin[];
}

/// Hash the manifest's ordered, exact served bytes with the runtime encoder. A git
/// revision supplies the comparison identity; pin files are read without mutation.
export const payloadIdentityReport = async (
  root: string,
  ref?: string
): Promise<IdentityReport> => {
  const revision = ref
    ? execFileSync(
        'git',
        ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`],
        { cwd: root, encoding: 'utf8' }
      ).trim()
    : null;
  const read = (path: string, commit: string | null): string =>
    commit
      ? execFileSync('git', ['show', `${commit}:${path.slice(1)}`], {
          cwd: root,
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024
        })
      : readFileSync(resolve(root, '.' + path), 'utf8');
  const identity = async (commit: string | null) => {
    const text = read(MANIFEST, commit);
    const manifest = JSON.parse(text) as {
      readonly playableDocuments?: unknown;
    };
    if (!Array.isArray(manifest.playableDocuments)) {
      throw new Error('Invalid playableDocuments inventory');
    }
    const paths = new Set<string>();
    for (const entry of manifest.playableDocuments as {
      path?: unknown;
      sha256?: unknown;
    }[]) {
      if (
        !entry ||
        typeof entry.path !== 'string' ||
        !entry.path.startsWith(PREFIX) ||
        entry.path.split('/').some(part => part === '..' || part === '.') ||
        entry.path === MANIFEST ||
        !/^[\w./-]+\.json$/.test(entry.path)
      ) {
        throw new Error('Invalid playable document path');
      }
      if (paths.has(entry.path)) {
        throw new Error('Duplicate playable document path');
      }
      paths.add(entry.path);
    }
    const documents = (
      manifest.playableDocuments as { path: string; sha256: unknown }[]
    ).map(entry => {
      const bytes = read(entry.path, commit);
      if (
        new Bun.CryptoHasher('sha256').update(bytes).digest('hex') !==
        entry.sha256
      ) {
        throw new Error(`${entry.path}: manifest hash differs`);
      }
      return { path: entry.path, text: bytes };
    });
    documents.push({ path: MANIFEST, text });
    return {
      count: documents.length,
      hash: await tourcraftContentIdentity(documents)
    };
  };
  const current = await identity(null);
  const baseline = revision ? (await identity(revision)).hash : null;
  const files = execFileSync(
    'git',
    [
      'ls-files',
      '-z',
      '--',
      'web/test',
      'web/e2e',
      'research/mercenary-iii-st',
      'docs/dion-tourcraft-content-contract.md'
    ],
    { cwd: root, encoding: 'utf8' }
  )
    .split('\0')
    .filter(path => /\.(?:ts|py|json|md)$/.test(path));
  const pins: Pin[] = [];
  for (const path of files) {
    const lines = readFileSync(resolve(root, path), 'utf8').split('\n');
    for (const [kind, hash] of [
      ['current', current.hash],
      ['baseline', baseline]
    ] as const) {
      if (!hash || (kind === 'baseline' && hash === current.hash)) {
        continue;
      }
      const matches = lines.flatMap((line, index) =>
        line.includes(hash) ? [index + 1] : []
      );
      if (matches.length) {
        pins.push({ identity: kind, lines: matches, path });
      }
    }
  }
  return { baseline, current: current.hash, documents: current.count, pins };
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === '--ref' && args[1])) {
    process.stderr.write(
      'Usage: bun run dion:identity [--ref <git revision>]\n'
    );
    process.exitCode = 1;
  } else {
    const report = await payloadIdentityReport(
      resolve(import.meta.dir, '../..'),
      args[1]
    );
    process.stdout.write(
      `Current:  ${report.current} (${report.documents} documents, manifest included)\n`
    );
    if (report.baseline) {
      process.stdout.write(`Baseline: ${report.baseline}\n`);
    }
    process.stdout.write('Tracked identity pins (report only):\n');
    for (const pin of report.pins) {
      process.stdout.write(
        `${pin.path}:${pin.lines.join(',')} (${pin.identity})\n`
      );
    }
  }
}
