import {
  CATALOGUE_PATH,
  modelPath,
  readCatalogue,
  type Catalogue
} from '../../src/catalogue/data.ts';

const PAYLOAD = new URL('../../../payload/', import.meta.url);

/// One payload path, as the browser would request it, read from the checked-in payload.
export const readPayloadJson = (path: string): Promise<unknown> =>
  Bun.file(new URL(`.${path.slice('/payload'.length)}`, PAYLOAD)).json();

let loaded: Promise<Catalogue> | undefined;

/// The generated Catalogue, read the way the browser reads it: the shared document, then
/// every Model file it indexes. Read once per test process; the result is readonly, and a
/// test that needs a variant derives one by spreading rather than by editing it.
export const loadCatalogue = (): Promise<Catalogue> =>
  (loaded ??= readCatalogue(readPayloadJson));

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
