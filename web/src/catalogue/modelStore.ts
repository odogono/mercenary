import { DocumentStore, atDocument } from '../payload/documentStore.ts';
import {
  CATALOGUE_PATH,
  assembleCatalogue,
  checkDetailBinding,
  modelPath,
  modelSummaryById,
  parseCatalogueDocument,
  parseModelFile,
  type AssembledCatalogue,
  type Catalogue,
  type Model
} from './data.ts';

/// The Models a drawing pass has in hand. `peek` never waits: a Model not read yet is absent,
/// exactly as if it were not there, and the caller draws around it.
export interface ModelLookup {
  peek(id: string | undefined): Model | undefined;
}

/// The Damocles Catalogue's Models, read one file at a time as they are needed (ADR 0048).
///
/// Each file is read once. Requests in flight are shared, a failed read is forgotten so it can
/// be retried, and a structure is admitted only together with the interior its selector binds,
/// so a drawn structure never lacks its detail.
export class ModelStore extends DocumentStore<Model> implements ModelLookup {
  constructor(
    readonly catalogue: Catalogue,
    private readonly read: (path: string) => Promise<unknown>
  ) {
    super(id => this.fetch(id));
  }

  /// A store holding every Model already, for tests and whole-Catalogue checks.
  static holding(catalogue: AssembledCatalogue): ModelStore {
    const store = new ModelStore(catalogue, path =>
      Promise.reject(new Error(`${path} was not preloaded`))
    );
    for (const model of catalogue.models) {
      store.hold(model.id, model);
    }
    return store;
  }

  private async fetch(id: string): Promise<Model> {
    const path = modelPath(id);
    if (modelSummaryById(this.catalogue, id) === undefined) {
      throw new Error(`${path}: not in the Catalogue's model index`);
    }
    const model = await atDocument(path, async () =>
      parseModelFile(await this.read(path), this.catalogue)
    );
    const selection = model.structureSelection;
    if (selection !== undefined) {
      const detail = await this.get(selection.detailModel);
      await atDocument(path, () => checkDetailBinding(model, detail));
    }
    return model;
  }
}

/// Reads the whole stored Catalogue: the shared document, then every Model file it indexes.
/// Nothing in the browser needs every Model; tests and whole-Catalogue checks do.
export const readCatalogue = async (
  read: (path: string) => Promise<unknown>
): Promise<AssembledCatalogue> => {
  const catalogue = await atDocument(CATALOGUE_PATH, async () =>
    parseCatalogueDocument(await read(CATALOGUE_PATH))
  );
  const store = new ModelStore(catalogue, read);
  const failures = await store.prefetch(
    catalogue.modelIndex.map(entry => entry.id)
  );
  if (failures.length > 0) {
    throw failures[0]!;
  }
  return assembleCatalogue(
    catalogue,
    catalogue.modelIndex.map(entry => store.peek(entry.id)!)
  );
};
