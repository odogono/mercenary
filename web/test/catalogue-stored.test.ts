import { readdir } from 'node:fs/promises';
import { describe, expect, test } from 'bun:test';

import {
  CATALOGUE_PATH,
  assembleCatalogue,
  modelPath,
  parseCatalogueDocument,
  parseModelFile,
  readCatalogue,
  type CatalogueDocument
} from '../src/catalogue/data.ts';
import { loadCatalogue, readPayloadJson } from './fixtures/catalogue.ts';

/// The Catalogue document and one real Model file, for refusal tests to edit copies of.
const stored = async () => {
  const document: CatalogueDocument = parseCatalogueDocument(
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
