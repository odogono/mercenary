import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { repositoryRoot } from './replay/artifacts.ts';

describe('browser canonical cutover', () => {
  test('has no live Swift application', () => {
    expect(existsSync(join(repositoryRoot, 'app'))).toBeFalse();
  });

  test('has no obsolete ignore rule for the retired application', async () => {
    const ignoreRules = await Bun.file(
      join(repositoryRoot, '.gitignore')
    ).text();

    expect(ignoreRules).not.toContain('/app/');
  });

  test('is versioned as the latest release the changelog records', async () => {
    // The heading correction shipped as 0.14.0; every release since is named in the changelog
    // before the package is bumped, so the two cannot drift apart.
    const packageDocument = await Bun.file(
      join(repositoryRoot, 'web', 'package.json')
    ).json();
    const changelog = await Bun.file(
      join(repositoryRoot, 'CHANGELOG.md')
    ).text();
    const latest = /^## \[(\d+\.\d+\.\d+)] - /m.exec(changelog)?.[1];

    expect(latest).toBeDefined();
    expect(packageDocument.version).toBe(latest);
    expect(changelog).toContain('## [0.14.0] - 2026-09-07');
  });
});
