#!/usr/bin/env bun
// Prints or releases the unreleased changelog: every fragment under
// changelog/unreleased/, grouped by section as changelog/README.md describes.
//
//   bun tools/commits/changelog.ts                    print ## [Unreleased]
//   bun tools/commits/changelog.ts release VERSION    write the fragments into
//       CHANGELOG.md as ## [VERSION] - today, delete them, add the compare
//       link and set web/package.json's version. Tagging stays by hand.
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { SECTIONS, parseFragment, type Fragment } from './fragment';

const ROOT = resolve(import.meta.dir, '../..');
const DIR = join(ROOT, 'changelog/unreleased');
const CHANGELOG = join(ROOT, 'CHANGELOG.md');
const PACKAGE = join(ROOT, 'web/package.json');
const REPO = 'https://github.com/odogono/mercenary';

const HEADINGS: Record<Fragment['section'], string> = {
  added: 'Added',
  changed: 'Changed',
  fixed: 'Fixed',
  known: 'Known',
  removed: 'Removed'
};

// One version's section, `## <title>` then a `###` heading per section that
// has entries. A breaking entry comes first in its section, marked.
export const renderSection = (title: string, fragments: Fragment[]): string => {
  const lines = [`## ${title}`];
  for (const section of SECTIONS) {
    const entries = fragments
      .filter(fragment => fragment.section === section)
      .sort((a, b) => Number(b.breaking) - Number(a.breaking));
    if (entries.length > 0) {
      lines.push('', `### ${HEADINGS[section]}`, '');
      for (const { breaking, entry } of entries) {
        const text = entry.replaceAll(/\n(?!\n)/g, '\n  ');
        lines.push(`- ${breaking ? '**Breaking.** ' : ''}${text}`);
      }
    }
  }
  return lines.join('\n');
};

// CHANGELOG.md with `section` ahead of the newest release, and the link
// references at its foot given VERSION's compare link.
export const insertRelease = (
  changelog: string,
  version: string,
  section: string
): string => {
  const previous = /^## \[(?<version>\d[^\]]*)\]/m.exec(changelog);
  if (!previous?.groups || previous.index === undefined) {
    throw new Error('CHANGELOG.md has no released version to follow');
  }
  if (changelog.includes(`## [${version}]`)) {
    throw new Error(`CHANGELOG.md already has ${version}`);
  }
  const link = `[${version}]: ${REPO}/compare/v${previous.groups.version}...v${version}`;
  const head = changelog.slice(0, previous.index);
  const tail = changelog
    .slice(previous.index)
    .replace(/^\[\d/m, match => `${link}\n${match}`);
  return `${head}${section}\n\n${tail}`;
};

const readFragments = (): {
  failed: boolean;
  fragments: Fragment[];
  names: string[];
} => {
  const fragments: Fragment[] = [];
  const names = readdirSync(DIR)
    .filter(name => name.endsWith('.md'))
    .sort();
  let failed = false;
  for (const name of names) {
    const result = parseFragment(readFileSync(join(DIR, name), 'utf8'));
    if ('errors' in result) {
      failed = true;
      for (const error of result.errors) {
        console.error(`changelog/unreleased/${name}: ${error}`);
      }
    } else {
      fragments.push(result.fragment);
    }
  }
  return { failed, fragments, names };
};

if (import.meta.main) {
  const [mode, version] = process.argv.slice(2);
  const { failed, fragments, names } = readFragments();
  if (mode === undefined) {
    console.log(renderSection('[Unreleased]', fragments));
    process.exit(failed ? 1 : 0);
  }
  if (mode !== 'release' || !version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('usage: bun tools/commits/changelog.ts [release X.Y.Z]');
    process.exit(2);
  }
  if (failed) {
    process.exit(1);
  }
  if (fragments.length === 0) {
    console.error(
      'changelog: changelog/unreleased/ has no fragments to release'
    );
    process.exit(1);
  }
  const date = new Date().toISOString().slice(0, 10);
  const section = renderSection(`[${version}] - ${date}`, fragments);
  writeFileSync(
    CHANGELOG,
    insertRelease(readFileSync(CHANGELOG, 'utf8'), version, section)
  );
  const pkg = readFileSync(PACKAGE, 'utf8');
  writeFileSync(
    PACKAGE,
    pkg.replace(/"version": "[^"]*"/, `"version": "${version}"`)
  );
  for (const name of names) {
    rmSync(join(DIR, name));
  }
  console.log(
    `Released ${version}: ${names.length} fragments into CHANGELOG.md. Tag it with "git tag v${version}" once merged.`
  );
}
