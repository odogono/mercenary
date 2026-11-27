import type { Page } from '@playwright/test';

/// The parts of the Damocles Catalogue the harness reads, fetched once per page. The file is
/// several megabytes and Playwright's request context keeps every response body, so each helper
/// fetching its own copy grew a chapter by that much per walk.

export interface CatalogueInstance {
  readonly id: string;
  readonly location: { readonly position: readonly number[] } | null;
  readonly model: string;
  readonly placement: { readonly position: readonly number[] } | null;
}

export interface HarnessCatalogue {
  readonly instances: readonly CatalogueInstance[];
  readonly islands: readonly {
    readonly areaName: string | null;
    readonly id: string;
  }[];
}

const cache = new WeakMap<Page, Promise<HarnessCatalogue>>();

export const catalogue = (page: Page): Promise<HarnessCatalogue> => {
  let loaded = cache.get(page);
  if (loaded === undefined) {
    loaded = page.request
      .get('/payload/damocles/catalogue.json')
      .then(response => response.json() as Promise<HarnessCatalogue>);
    cache.set(page, loaded);
  }
  return loaded;
};

export const instance = async (
  page: Page,
  id: string
): Promise<CatalogueInstance | undefined> =>
  (await catalogue(page)).instances.find(item => item.id === id);
