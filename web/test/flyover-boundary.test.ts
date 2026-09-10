import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

const imports = /(?:from\s+|import\s*)["'](\.[^"']+)["']/g;

const sourceGraph = async (entry: string): Promise<readonly string[]> => {
  const root = resolve('src');
  const pending = [resolve(entry)];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const path = pending.pop()!;
    if (visited.has(path)) {
      continue;
    }
    visited.add(path);
    const source = await readFile(path, 'utf8');
    for (const match of source.matchAll(imports)) {
      pending.push(resolve(dirname(path), match[1]!));
    }
  }
  return [...visited].map(path => relative(root, path)).sort();
};

describe('the Flyover document boundary', () => {
  test('has its own HTML and transitively imports no gameplay ownership graph', async () => {
    const html = await readFile('flyover.html', 'utf8');
    expect(html).toContain('/src/flyover/boot.ts');
    expect(html).not.toContain('/src/shell/boot.ts');

    const graph = await sourceGraph('src/flyover/boot.ts');
    expect(graph).toContain('flyover/system.ts');
    expect(graph).not.toContain('shell/boot.ts');
    expect(graph).not.toContain('shell/ownership.ts');
    expect(graph).not.toContain('shell/resume.ts');
    expect(graph).not.toContain('shell/saves.ts');
    expect(graph).not.toContain('shell/session.ts');
    expect(graph).not.toContain('shell/storage.ts');
  });
});
