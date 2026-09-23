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

/// How many Model files are in flight at once. Chrome refuses fetches outright once too many
/// are outstanding, and 1,241 at once is past that; measured on localhost, 16 to 64 read every
/// file in about 0.4 s and 6 takes twice as long.
const READS_IN_FLIGHT = 32;

/// `each` over `items`, at most `READS_IN_FLIGHT` at a time, results in item order.
const inPool = async <T, R>(
  items: readonly T[],
  each: (item: T) => Promise<R>
): Promise<R[]> => {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await each(items[index]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(READS_IN_FLIGHT, items.length) }, worker)
  );
  return results;
};

const labelled = async <T>(
  path: string,
  read: () => Promise<T>
): Promise<T> => {
  try {
    return await read();
  } catch (error) {
    throw new Error(
      `${path}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

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
export class ModelStore implements ModelLookup {
  private readonly models = new Map<string, Model>();
  private readonly requests = new Map<string, Promise<Model>>();

  constructor(
    readonly catalogue: Catalogue,
    private readonly read: (path: string) => Promise<unknown>
  ) {}

  /// A store holding every Model already, for tests and whole-Catalogue checks.
  static holding(catalogue: AssembledCatalogue): ModelStore {
    const store = new ModelStore(catalogue, path =>
      Promise.reject(new Error(`${path} was not preloaded`))
    );
    for (const model of catalogue.models) {
      store.models.set(model.id, model);
    }
    return store;
  }

  /// How many Models are in hand. It only grows, so a drawing pass that remembers the count it
  /// was built at can tell whether anything has landed since.
  get size(): number {
    return this.models.size;
  }

  peek(id: string | undefined): Model | undefined {
    return id === undefined ? undefined : this.models.get(id);
  }

  get(id: string): Promise<Model> {
    const held = this.models.get(id);
    if (held !== undefined) {
      return Promise.resolve(held);
    }
    let request = this.requests.get(id);
    if (request === undefined) {
      request = this.fetch(id);
      this.requests.set(id, request);
      request.then(
        () => this.requests.delete(id),
        () => this.requests.delete(id)
      );
    }
    return request;
  }

  /// Reads every one of `ids` that is not in hand, a few dozen at a time, and settles when all
  /// have: the failures are returned rather than thrown, so one missing file leaves the rest.
  async prefetch(ids: Iterable<string>): Promise<readonly Error[]> {
    const wanted = [...new Set(ids)].filter(id => !this.models.has(id));
    const outcomes = await inPool(wanted, id =>
      this.get(id).then(
        () => undefined,
        (error: unknown) =>
          error instanceof Error ? error : new Error(String(error))
      )
    );
    return outcomes.filter(outcome => outcome !== undefined);
  }

  private async fetch(id: string): Promise<Model> {
    const path = modelPath(id);
    if (modelSummaryById(this.catalogue, id) === undefined) {
      throw new Error(`${path}: not in the Catalogue's model index`);
    }
    const model = await labelled(path, async () =>
      parseModelFile(await this.read(path), this.catalogue)
    );
    const selection = model.structureSelection;
    if (selection !== undefined) {
      const detail = await this.get(selection.detailModel);
      labelledSync(path, () => checkDetailBinding(model, detail));
    }
    this.models.set(id, model);
    return model;
  }
}

const labelledSync = (path: string, check: () => void): void => {
  try {
    check();
  } catch (error) {
    throw new Error(
      `${path}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/// Reads the whole stored Catalogue: the shared document, then every Model file it indexes.
/// Nothing in the browser needs every Model; tests and whole-Catalogue checks do.
export const readCatalogue = async (
  read: (path: string) => Promise<unknown>
): Promise<AssembledCatalogue> => {
  const catalogue = await labelled(CATALOGUE_PATH, async () =>
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
