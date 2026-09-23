import { readdir } from 'node:fs/promises';
import { describe, expect, test } from 'bun:test';

import {
  CATALOGUE_PATH,
  assembleCatalogue,
  modelPath,
  parseCatalogueDocument,
  parseModelFile,
  type Catalogue
} from '../src/catalogue/data.ts';
import { ModelStore, readCatalogue } from '../src/catalogue/modelStore.ts';
import { loadCatalogue, readPayloadJson } from './fixtures/catalogue.ts';

/// The Catalogue document and one real Model file, for refusal tests to edit copies of.
const stored = async () => {
  const document: Catalogue = parseCatalogueDocument(
    await readPayloadJson(CATALOGUE_PATH)
  );
  const id = 'structure-01484e';
  const file = (await readPayloadJson(modelPath(id))) as {
    model: Record<string, unknown>;
    schemaVersion: number;
    source: Record<string, unknown>;
  };
  return { document, file, id };
};

/// The stored Catalogue (ADR 0048): one shared document and one file per Model.
describe('the stored Damocles Catalogue', () => {
  test('holds exactly one file for each Model the index names', async () => {
    const document = parseCatalogueDocument(
      await readPayloadJson(CATALOGUE_PATH)
    );
    const files = (
      await readdir(new URL('../../payload/damocles/models/', import.meta.url))
    )
      .filter(name => name.endsWith('.json'))
      .map(name => name.slice(0, -'.json'.length))
      .sort();
    expect(files).toEqual(document.modelIndex.map(entry => entry.id).sort());
  });

  test('lists for each Body every Model its Instances and roads name', async () => {
    const catalogue = await loadCatalogue();
    const bodyOf = (id: string): string | undefined => {
      const instance = catalogue.instances.find(item => item.id === id)!;
      return (
        instance.location?.body ??
        (instance.placement ? bodyOf(instance.placement.parent) : undefined)
      );
    };
    for (const body of catalogue.bodies) {
      const listed = new Set(body.models);
      for (const instance of catalogue.instances) {
        if (bodyOf(instance.id) === body.id) {
          expect(listed.has(instance.model)).toBe(true);
        }
      }
      for (const network of catalogue.roadNetworks) {
        if (network.body === body.id) {
          for (const cell of network.cells) {
            if (cell.model !== null) {
              expect(listed.has(cell.model)).toBe(true);
            }
          }
        }
      }
    }
  });

  test('reads back as the whole Catalogue in index order', async () => {
    const catalogue = await loadCatalogue();
    expect(catalogue.models.map(model => model.id)).toEqual(
      catalogue.modelIndex.map(entry => entry.id)
    );
    expect(catalogue.coverage.census.unique).toBe(catalogue.models.length);
  });

  describe('refuses', () => {
    test('a Model file from another run', async () => {
      const { document, file } = await stored();
      expect(() =>
        parseModelFile(
          { ...file, source: { ...file.source, run: 'another-run' } },
          document
        )
      ).toThrow('another run');
    });

    test('a Model file of another schema version', async () => {
      const { document, file } = await stored();
      expect(() =>
        parseModelFile({ ...file, schemaVersion: 15 }, document)
      ).toThrow('schema version');
    });

    test('a Model the index does not name', async () => {
      const { document, file } = await stored();
      expect(() =>
        parseModelFile(
          { ...file, model: { ...file.model, id: 'structure-ffffff' } },
          document
        )
      ).toThrow('not in the model index');
    });

    test('a Model whose record disagrees with its index summary', async () => {
      const { document, file } = await stored();
      expect(() =>
        parseModelFile(
          { ...file, model: { ...file.model, status: 'unresolved' } },
          document
        )
      ).toThrow('status disagrees with the model index');
      expect(() =>
        parseModelFile(
          { ...file, model: { ...file.model, slots: [999] } },
          document
        )
      ).toThrow('slots disagree with the model index');
    });

    test('an assembly missing a Model the index names', async () => {
      const { document, file } = await stored();
      expect(() =>
        assembleCatalogue(document, [parseModelFile(file, document)])
      ).toThrow('models do not match the model index');
    });

    test('a Body listing a Model the index does not name', async () => {
      const raw = (await readPayloadJson(CATALOGUE_PATH)) as {
        bodies: Record<string, unknown>[];
      };
      expect(() =>
        parseCatalogueDocument({
          ...raw,
          bodies: [{ ...raw.bodies[0], models: ['object-ffffff'] }]
        })
      ).toThrow('missing body model object-ffffff');
    });

    test('a missing Model file, naming its path', async () => {
      await expect(
        readCatalogue(async path =>
          path === modelPath('structure-01484e')
            ? Promise.reject(new Error('HTTP 404'))
            : readPayloadJson(path)
        )
      ).rejects.toThrow(
        '/payload/damocles/models/structure-01484e.json: HTTP 404'
      );
    });
  });
});

/// A store over the real payload that records every path it reads, and can refuse one.
const counted = async () => {
  const catalogue = parseCatalogueDocument(
    await readPayloadJson(CATALOGUE_PATH)
  );
  const reads: string[] = [];
  let refuse: string | undefined;
  const store = new ModelStore(catalogue, path => {
    reads.push(path);
    return path === refuse
      ? Promise.reject(new Error('HTTP 503'))
      : readPayloadJson(path);
  });
  return {
    catalogue,
    reads,
    refuse: (path: string | undefined) => {
      refuse = path;
    },
    store
  };
};

describe('the Model store', () => {
  test('reads a file once, however many ask for it at once', async () => {
    const { reads, store } = await counted();
    expect(store.peek('object-035cfc')).toBeUndefined();
    const [first, second] = await Promise.all([
      store.get('object-035cfc'),
      store.get('object-035cfc')
    ]);
    expect(first).toBe(second);
    expect(store.peek('object-035cfc')).toBe(first);
    await store.get('object-035cfc');
    expect(reads).toEqual([modelPath('object-035cfc')]);
  });

  test('admits a structure only together with the interior it binds', async () => {
    const { reads, store } = await counted();
    const spaceport = await store.get('structure-01484e');
    const interior = spaceport.structureSelection!.detailModel;
    expect(store.peek(interior)).toBeDefined();
    expect(reads).toEqual([modelPath('structure-01484e'), modelPath(interior)]);
  });

  test('forgets a failed read so a later one can succeed', async () => {
    const { refuse, store } = await counted();
    refuse(modelPath('object-035cfc'));
    expect(await store.prefetch(['object-035cfc', 'object-035d12'])).toEqual([
      new Error('/payload/damocles/models/object-035cfc.json: HTTP 503')
    ]);
    expect(store.peek('object-035d12')).toBeDefined();
    expect(store.peek('object-035cfc')).toBeUndefined();
    refuse(undefined);
    expect(await store.prefetch(['object-035cfc'])).toEqual([]);
    expect(store.peek('object-035cfc')).toBeDefined();
  });

  test('refuses an id the index does not name without reading anything', async () => {
    const { reads, store } = await counted();
    await expect(store.get('object-ffffff')).rejects.toThrow(
      "not in the Catalogue's model index"
    );
    expect(reads).toEqual([]);
  });

  test('grows only as Models land', async () => {
    const { store } = await counted();
    expect(store.size).toBe(0);
    await store.prefetch(['object-035cfc', 'object-035cfc', 'object-035d12']);
    expect(store.size).toBe(2);
  });
});
