import { readdir } from 'node:fs/promises';
import { describe, expect, test } from 'bun:test';

import {
  GeometryStore,
  cataloguePath,
  readCatalogueDocument,
  readGeometryFile
} from '../src/dion/catalogue.ts';
import { DION_DOCUMENTS, dionDocumentPath } from '../src/dion/documents.ts';
import { DionDocumentError } from '../src/dion/read.ts';
import { DocumentStore } from '../src/payload/documentStore.ts';
import { payloadResponse } from '../src/server/payload.ts';

const read = (path: string): Promise<unknown> =>
  Bun.file(new URL(`../..${path}`, import.meta.url)).json();
const raw = () => read(cataloguePath);
const replace = (
  value: unknown,
  keys: readonly (number | string)[],
  replacement: unknown
): void => {
  let target = value as Record<string | number, unknown>;
  for (const key of keys.slice(0, -1)) {
    target = target[key] as Record<string | number, unknown>;
  }
  target[keys.at(-1)!] = replacement;
};

describe('the title-local Dion Catalogue', () => {
  test('reconciles the full stored export and admits every geometry file', async () => {
    const catalogue = readCatalogueDocument(await raw());
    expect(catalogue.objects).toHaveLength(246);
    expect(catalogue.placements).toHaveLength(795);
    expect(catalogue.geometryIndex).toHaveLength(529);
    const files = await readdir(
      new URL('../../payload/dion/catalogue/geometry', import.meta.url)
    );
    expect(files.sort()).toEqual(
      catalogue.geometryIndex.map(g => `${g.id}.json`).sort()
    );
    const store = new GeometryStore(catalogue, read);
    expect(
      await store.prefetch(catalogue.geometryIndex.map(g => g.id))
    ).toEqual([]);
    expect(store.size).toBe(529);
    expect(catalogue.field.physicalCount).toBeNull();
    expect(catalogue.constructions.states.map(s => s.id)).toEqual([
      'initial',
      'constructed'
    ]);
    expect(catalogue.objects[103]!.position).toBeNull();
    expect(catalogue.objects[100]!.host).toEqual({ cell: 105, field: 'midas' });
    const companies = catalogue.objects.find(o => o.slot === 30)!;
    expect(companies.floor).toBe(4);
    expect(
      catalogue.placements.find(p => p.id === companies.host!.placement)!
        .bodyCell
    ).toEqual(companies.bodyCell!);
  });

  test('rejects foreign titles, duplicates, missing references, mistyped fields and inconsistent bindings', async () => {
    for (const [keys, replacement, message] of [
      [['source', 'title'], 'damocles', 'source.title'],
      [['objects', 1, 'id'], 'object-001', 'duplicate'],
      [['objects', 0, 'host', 'placement'], 'absent', 'placement'],
      [['objects', 0, 'position'], 'bad', 'position'],
      [['placements', 0, 'slot'], 999, 'structure'],
      [['objects', 0, 'floor'], 9, 'floor'],
      [['coverage', 'authoredBindings'], 794, 'coverage'],
      [['field', 'period'], 17, 'field'],
      [['areas', 0, 'authoredBindings'], 1, 'authoredBindings'],
      [['objects', 100, 'host', 'cell'], 104, 'host.cell'],
      [['objects', 0, 'indoor', 'localPosition'], [0, 0, 0], 'localPosition'],
      [['source', 'programSha256'], '0'.repeat(64), 'programSha256'],
      [['schemaVersion'], 2, 'schemaVersion'],
      [['bodies', 4, 'geometry'], [], 'geometry']
    ] as const) {
      const value = await raw();
      replace(value, keys, replacement);
      expect(() => readCatalogueDocument(value)).toThrow(message);
      expect(() => readCatalogueDocument(value)).toThrow(DionDocumentError);
    }
  });

  test('geometry admission checks source, requested identity and recovered content digest', async () => {
    const catalogue = readCatalogueDocument(await raw());
    const id = catalogue.geometryIndex[0]!.id;
    const path = `/payload/dion/catalogue/geometry/${id}.json`;
    for (const [keys, replacement, message] of [
      [['source', 'run'], 'another-run', 'source'],
      [['geometry', 'id'], 'detail-abcdef', 'id'],
      [['geometry', 'variants', 'base', 'vertices'], [[0, 0, 0]], 'sha256'],
      [['geometry', 'variants', 'base', 'vertices'], 'bad', 'vertices']
    ] as const) {
      const value = await read(path);
      replace(value, keys, replacement);
      await expect(readGeometryFile(value, catalogue, id)).rejects.toThrow(
        message
      );
    }
    const store = new GeometryStore(catalogue, async () => {
      throw new Error('404');
    });
    await expect(store.get(id)).rejects.toThrow(path);
    await expect(store.get('../world')).rejects.toThrow('geometry index');
  });

  test('serves the geometry route and preserves playable document selection', async () => {
    const path = '/payload/dion/catalogue/geometry/model-02edd6.json';
    expect(
      (
        await payloadResponse(
          path,
          new URL('../../payload', import.meta.url).pathname
        )
      )?.status
    ).toBe(200);
    for (const path of [
      '/payload/a/b/c/d.json',
      '/payload/dion/catalogue/../world.json'
    ]) {
      expect(
        (
          await payloadResponse(
            path,
            new URL('../../payload', import.meta.url).pathname
          )
        )?.status
      ).toBe(404);
    }
    expect(DION_DOCUMENTS.map(dionDocumentPath)).toEqual(
      ['world', 'panel', 'messages', 'scripts', 'sound', 'service'].map(
        k => `/payload/dion/${k}.json`
      )
    );
  });
});

describe('shared Catalogue document loading', () => {
  test('shares in-flight reads, retains admitted values and retries failures', async () => {
    let calls = 0;
    let release!: (value: string) => void;
    const store = new DocumentStore<string>(() => {
      calls++;
      if (calls === 1) {
        return Promise.reject(new Error('missing'));
      }
      return new Promise(resolve => {
        release = resolve;
      });
    });
    await expect(store.get('one')).rejects.toThrow('missing');
    const first = store.get('one');
    expect(store.get('one')).toBe(first);
    release('held');
    expect(await first).toBe('held');
    expect(await store.get('one')).toBe('held');
    expect(calls).toBe(2);
  });

  test('bounds prefetch concurrency and reports failures while retaining successes', async () => {
    let active = 0;
    let peak = 0;
    const store = new DocumentStore(async (id: string) => {
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      if (id === '2') {
        throw new Error('2 missing');
      }
      return id;
    });
    const errors = await store.prefetch(
      Array.from({ length: 70 }, (_, i) => String(i))
    );
    expect(peak).toBe(32);
    expect(errors.map(e => e.message)).toEqual(['2 missing']);
    expect(store.size).toBe(69);
  });
});
