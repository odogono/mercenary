/// The Atlas search section's DOM (#453). Everything it shows is decided by the caller: this
/// only writes it out, so the rules for what a result links to stay beside the map state that
/// decides them.

/// One line of the results or of a Model's placement list.
export interface SearchItemView {
  /// Where choosing it goes in the Atlas, or null where the map cannot show it.
  readonly atlasHref: string | null;
  /// The Catalogue's own view of the record, offered where the map cannot show it.
  readonly catalogueHref: string | null;
  /// Type, record id and Body, so two records sharing a name can be told apart.
  readonly context: string;
  readonly name: string;
}

export interface ModelPlacementsView {
  readonly catalogueHref: string;
  readonly groups: readonly {
    readonly items: readonly SearchItemView[];
    readonly title: string;
  }[];
  readonly heading: string;
  readonly summary: string;
}

export interface SearchView {
  readonly failed: boolean;
  /// The results to list, already cut to how many are shown.
  readonly items: readonly SearchItemView[];
  readonly model: ModelPlacementsView | null;
  /// How many more a "show more" press would add, or 0.
  readonly more: number;
  readonly status: string;
}

export interface SearchElements {
  readonly model: HTMLElement;
  readonly more: HTMLButtonElement;
  readonly results: HTMLElement;
  readonly retry: HTMLButtonElement;
  readonly status: HTMLElement;
}

const item = (view: SearchItemView): HTMLLIElement => {
  const li = document.createElement('li');
  if (view.atlasHref) {
    const link = document.createElement('a');
    link.href = view.atlasHref;
    link.className = 'search-result';
    link.textContent = view.name;
    li.append(link);
  } else {
    const name = document.createElement('span');
    name.className = 'search-result';
    name.textContent = view.name;
    li.append(name);
  }
  const context = document.createElement('span');
  context.className = 'search-context';
  context.textContent = view.context;
  if (view.catalogueHref) {
    const link = document.createElement('a');
    link.href = view.catalogueHref;
    link.className = 'search-catalogue';
    link.textContent = 'in the Catalogue';
    context.append(' · ', link);
  }
  li.append(context);
  return li;
};

export const renderSearch = (
  elements: SearchElements,
  view: SearchView
): void => {
  if (elements.status.textContent !== view.status) {
    elements.status.textContent = view.status;
  }
  elements.retry.hidden = !view.failed;
  elements.results.replaceChildren(...view.items.map(item));
  elements.more.hidden = view.more === 0;
  elements.more.textContent = `Show ${view.more} more`;
  const model = view.model;
  elements.model.hidden = model === null;
  elements.model.replaceChildren();
  if (model === null) {
    return;
  }
  const heading = document.createElement('h3');
  heading.id = 'search-model-heading';
  heading.textContent = model.heading;
  const summary = document.createElement('p');
  summary.className = 'muted';
  summary.textContent = model.summary;
  const link = document.createElement('a');
  link.href = model.catalogueHref;
  link.id = 'search-model-catalogue';
  link.textContent = 'This Model in the Catalogue';
  const linked = document.createElement('p');
  linked.append(link);
  elements.model.append(heading, summary, linked);
  for (const group of model.groups) {
    const title = document.createElement('h4');
    title.textContent = group.title;
    const list = document.createElement('ul');
    list.append(...group.items.map(item));
    elements.model.append(title, list);
  }
};
