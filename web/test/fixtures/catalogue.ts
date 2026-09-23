import {
  CATALOGUE_PATH,
  modelPath,
  type AssembledCatalogue,
  type Catalogue
} from '../../src/catalogue/data.ts';
import { ModelStore, readCatalogue } from '../../src/catalogue/modelStore.ts';

const PAYLOAD = new URL('../../../payload/', import.meta.url);

/// One payload path, as the browser would request it, read from the checked-in payload.
export const readPayloadJson = (path: string): Promise<unknown> =>
  Bun.file(new URL(`.${path.slice('/payload'.length)}`, PAYLOAD)).json();

let loaded: Promise<AssembledCatalogue> | undefined;

/// The generated Catalogue with every Model read, the way a whole-Catalogue check reads it: the
/// shared document, then every Model file it indexes. Read once per test process; the result
/// is readonly, and a test that needs a variant derives one by spreading rather than editing.
export const loadCatalogue = (): Promise<AssembledCatalogue> =>
  (loaded ??= readCatalogue(readPayloadJson));

const stores = new WeakMap<Catalogue, ModelStore>();

/// A store already holding every Model of `catalogue`, so a session or drawing pass under test
/// sees the whole Body at once, as it would once every wave had landed. `catalogue` must be one
/// `loadCatalogue` read, or a spread of one: a spread keeps the Models it was made from.
export const modelsOf = (catalogue: Catalogue): ModelStore => {
  let store = stores.get(catalogue);
  if (store === undefined) {
    if (!('models' in catalogue)) {
      throw new Error('modelsOf needs a Catalogue read with its Models');
    }
    store = ModelStore.holding(catalogue as AssembledCatalogue);
    stores.set(catalogue, store);
  }
  return store;
};

/// The generated Catalogue as one unparsed value with its Models inline, the shape
/// `parseCatalogue` reads, for tests that edit a copy to prove a refusal.
export const readRawCatalogue = async (): Promise<
  Record<string, unknown> & { readonly models: unknown[] }
> => {
  const document = (await readPayloadJson(CATALOGUE_PATH)) as Record<
    string,
    unknown
  > & { readonly modelIndex: readonly { readonly id: string }[] };
  const models = await Promise.all(
    document.modelIndex.map(
      async ({ id }) =>
        ((await readPayloadJson(modelPath(id))) as { model: unknown }).model
    )
  );
  return { ...document, models };
};
