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

  test('identifies the game-typefaces milestone as 0.6.0', async () => {
    const packageDocument = await Bun.file(
      join(repositoryRoot, 'web', 'package.json')
    ).json();

    expect(packageDocument.version).toBe('0.6.0');
  });
});
