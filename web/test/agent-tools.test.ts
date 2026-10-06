import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'bun:test';

import { payloadIdentityReport } from '../tools/dion-identity.ts';
import { checkDocumentLinks, localMarkdownLinks } from '../tools/doc-links.ts';

const roots: string[] = [];
const checkout = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'mercenary-agent-tools-'));
  roots.push(root);
  execFileSync('git', ['init', '-q', root]);
  return root;
};
const write = (root: string, path: string, text: string): void => {
  const target = join(root, path);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, text);
};
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

test('documentation checks report missing local files, including reference links, with source lines', () => {
  const root = checkout();
  write(
    root,
    'docs/guide.md',
    '[good](../web/src/README.md#engine)\n[bad](missing.md)\n[ref][owner]\n\n[owner]: absent.md\n'
  );
  write(root, 'web/src/README.md', '# Engine\n');
  expect(checkDocumentLinks(root, ['docs/guide.md'])).toEqual([
    'docs/guide.md:2: missing.md does not exist',
    'docs/guide.md:5: absent.md does not exist'
  ]);
});

test('Markdown code examples, external URLs and private evidence are not portable file requirements', () => {
  const text =
    '```md\n[example](missing.md)\n```\n~~~md\n[example](also-missing.md)\n~~~\n`[example](inline.md)`\n[web](https://example.org)\n[anchor](#section)\n[private](../restricted/run/start.ram)\n[space](<a%20file.md> "Title")\n';
  expect(localMarkdownLinks(text)).toEqual([
    { line: 10, target: '../restricted/run/start.ram' },
    { line: 11, target: 'a%20file.md' }
  ]);
  const root = checkout();
  write(root, 'docs/guide.md', text);
  write(root, 'docs/a file.md', '# File\n');
  expect(checkDocumentLinks(root, ['docs/guide.md'])).toEqual([]);
});

test('nested list links are checked while blockquoted code examples are ignored', () => {
  expect(
    localMarkdownLinks(
      '- Outer\n    - [nested](missing.md)\n\n> ```md\n> [example](example.md)\n> ```\n'
    )
  ).toEqual([{ line: 2, target: 'missing.md' }]);
});

test('deleted Markdown sources are skipped but incoming links to them fail', () => {
  const root = checkout();
  write(root, 'docs/live.md', '[deleted](deleted.md)\n');
  expect(checkDocumentLinks(root, ['docs/deleted.md', 'docs/live.md'])).toEqual(
    ['docs/live.md:1: deleted.md does not exist']
  );
});

test('a declared ADR supersession links to a successor that acknowledges its predecessor', () => {
  const root = checkout();
  write(
    root,
    'docs/adr/0001-old.md',
    '# Old\n\nSuperseded in part by [ADR 0002](0002-new.md).\n'
  );
  write(root, 'docs/adr/0002-new.md', '# New\n');
  expect(checkDocumentLinks(root, ['docs/adr/0001-old.md'])).toEqual([
    'docs/adr/0001-old.md:3: ADR 0002 does not acknowledge ADR 0001'
  ]);
  write(root, 'docs/adr/0002-new.md', '# New\n\nSupersedes ADR 0001.\n');
  expect(checkDocumentLinks(root, ['docs/adr/0001-old.md'])).toEqual([]);
});

test('supersession notices must provide a local successor link, including wrapped ADR acknowledgements', () => {
  const root = checkout();
  write(root, 'docs/adr/0001-old.md', '# Old\n\nSuperseded by ADR 0002.\n');
  expect(checkDocumentLinks(root, ['docs/adr/0001-old.md'])).toEqual([
    'docs/adr/0001-old.md:3: supersession must link ADR 0002'
  ]);
  write(
    root,
    'docs/adr/0001-old.md',
    '# Old\n\nSuperseded by [ADR 0002](0002-new.md).\n'
  );
  write(root, 'docs/adr/0002-new.md', '# New\n\nThis supersedes ADR\n0001.\n');
  expect(checkDocumentLinks(root, ['docs/adr/0001-old.md'])).toEqual([]);
});

test('ADR successor fragments and repository-root links still require predecessor acknowledgement', () => {
  const root = checkout();
  write(root, 'docs/adr/0002-new.md', '# New\n');
  for (const target of [
    '0002-new.md#decision',
    '/docs/adr/0002-new.md#decision'
  ]) {
    write(
      root,
      'docs/adr/0001-old.md',
      `# Old\n\nSuperseded by [ADR 0002](${target}).\n`
    );
    expect(checkDocumentLinks(root, ['docs/adr/0001-old.md'])).toEqual([
      'docs/adr/0001-old.md:3: ADR 0002 does not acknowledge ADR 0001'
    ]);
  }
});

test('payload reports preserve historical pins and compare current served bytes against a git revision', async () => {
  const root = checkout();
  const prefix = 'payload/dion/tourcraft/';
  const path = `/${prefix}world.json`;
  const oldText = '{"value":1}\n';
  const manifest = (text: string): string =>
    JSON.stringify({
      playableDocuments: [
        {
          path,
          sha256: new Bun.CryptoHasher('sha256').update(text).digest('hex')
        }
      ]
    });
  write(root, prefix + 'world.json', oldText);
  write(root, prefix + 'manifest.json', manifest(oldText));
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.org',
      'commit',
      '-qm',
      'Fixture'
    ],
    { cwd: root }
  );
  const before = await payloadIdentityReport(root);
  write(
    root,
    'research/mercenary-iii-st/scripts/taxi-source.ts',
    'historical-pin'
  );
  write(root, 'web/test/expanded.test.ts', before.current);
  execFileSync('git', ['add', '.'], { cwd: root });
  const nextText = '{"value":2}\n';
  write(root, prefix + 'world.json', nextText);
  write(root, prefix + 'manifest.json', manifest(nextText));
  const report = await payloadIdentityReport(root, 'HEAD');
  expect(report.baseline).toBe(before.current);
  expect(report.current).not.toBe(before.current);
  expect(report.pins).toEqual([
    { identity: 'baseline', lines: [1], path: 'web/test/expanded.test.ts' }
  ]);
  expect(report.documents).toBe(2);
  expect(
    await Bun.file(
      join(root, 'research/mercenary-iii-st/scripts/taxi-source.ts')
    ).text()
  ).toBe('historical-pin');
  write(root, prefix + 'world.json', '{"corrupt":true}');
  await expect(payloadIdentityReport(root)).rejects.toThrow(
    'world.json: manifest hash differs'
  );
});

test('payload reporting refuses duplicate and escaping manifest paths', async () => {
  const root = checkout();
  const manifest = join(root, 'payload/dion/tourcraft/manifest.json');
  mkdirSync(join(manifest, '..'), { recursive: true });
  writeFileSync(
    manifest,
    JSON.stringify({
      playableDocuments: [
        {
          path: '/payload/dion/tourcraft/../escape.json',
          sha256: 'a'.repeat(64)
        }
      ]
    })
  );
  await expect(payloadIdentityReport(root)).rejects.toThrow(
    'Invalid playable document path'
  );
  const row = {
    path: '/payload/dion/tourcraft/world.json',
    sha256: 'a'.repeat(64)
  };
  writeFileSync(manifest, JSON.stringify({ playableDocuments: [row, row] }));
  await expect(payloadIdentityReport(root)).rejects.toThrow(
    'Duplicate playable document path'
  );
});
