import { loadDionCatalogue, type GeometryStore } from '../dion/catalogue.ts';
import { frameRgba } from '../dion/frame.ts';
import { assertBrowserDocument } from '../shell/documentPath.ts';
import { showDetails } from './details.ts';
import { element, node, option, paragraph, selectionLink } from './dom.ts';
import {
  catalogueEntries,
  filterEntries,
  readSelection,
  type Entry,
  type Filters
} from './inspection.ts';
import { preparePreview, type Preview } from './preview.ts';
import {
  readRenderSupport,
  supportPath,
  type RenderSupport
} from './support.ts';

let store: GeometryStore | undefined;
let support: RenderSupport | undefined;
let supportError = '';
let entries: Entry[] = [];
let preview: Preview | undefined;
let revision = 0;
let resultLimit = 100;
let heading = 128;
let distance = 1;
const canvas = node<HTMLCanvasElement>('view');
const context = canvas.getContext('2d');
const image = context?.createImageData(320, 136);
const filterKeys: Record<string, string> = {
  body: 'body',
  'floor-filter': 'floorFilter',
  group: 'group',
  kind: 'kind',
  place: 'place',
  search: 'q'
};
const read = async (path: string): Promise<unknown> => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${path}: malformed JSON`);
  }
};
const diagnostic = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
const update = (values: Record<string, string>, push = false): void => {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
  }
  history[push ? 'pushState' : 'replaceState'](null, '', url);
  void render();
};
const resize = (): void => {
  const scale = Math.max(
    1,
    Math.floor(canvas.parentElement!.clientWidth / 320)
  );
  canvas.style.width = `${320 * scale}px`;
  canvas.style.height = `${136 * scale}px`;
};
const paint = (): void => {
  if (!preview || !context || !image) {
    return;
  }
  try {
    const planned = preview.plan(
      heading,
      distance,
      readSelection(new URLSearchParams(location.search)).region
    );
    frameRgba(planned, image.data);
    context.putImageData(image, 0, 0);
    canvas.dataset['primitives'] = String(
      planned.description.primitives.length
    );
    node('preview-message').textContent = [
      preview.message,
      ...planned.stats.gaps
    ].join(' ');
  } catch (error) {
    context.clearRect(0, 0, 320, 136);
    node('preview-message').textContent =
      `Preview unavailable: ${diagnostic(error)}`;
  }
};
const render = async (): Promise<void> => {
  if (!store) {
    return;
  }
  const current = ++revision;
  const params = new URLSearchParams(location.search);
  const selection = readSelection(params);
  const filters: Filters = {
    body: params.get('body') ?? '',
    floor: params.get('floorFilter') ?? '',
    group: params.get('group') ?? '',
    kind: params.get('kind') ?? '',
    place: params.get('place') ?? '',
    q: params.get('q') ?? ''
  };
  for (const [id, key] of Object.entries(filterKeys)) {
    (node(id) as HTMLInputElement | HTMLSelectElement).value =
      params.get(key) ?? '';
  }
  const matches = filterEntries(entries, filters);
  node('result-count').textContent =
    `${matches.length} of ${entries.length} entries`;
  const results = node('results');
  results.replaceChildren();
  for (const e of matches.slice(0, resultLimit)) {
    const a = selectionLink(e.name, e.id);
    const url = new URL(a.href);
    for (const key of Object.values(filterKeys)) {
      if (params.has(key)) {
        url.searchParams.set(key, params.get(key)!);
      }
    }
    a.href = url.href;
    a.setAttribute('aria-current', String(e.id === selection.id));
    a.append(
      element(
        'small',
        `${e.kind === 'geometry' ? 'Geometry definition' : e.kind === 'placement' ? 'Placed instance' : e.kind} · ${e.note}`
      )
    );
    results.append(a);
  }
  node('more').hidden = matches.length <= resultLimit;
  if (!matches.length) {
    paragraph(
      results,
      'No matching entries. Change the search or clear the filters.'
    );
  }
  const entry = entries.find(e => e.id === selection.id);
  node('retry-preview').hidden = true;
  preview = undefined;
  context?.clearRect(0, 0, 320, 136);
  canvas.dataset['primitives'] = '0';
  node('entry-name').textContent =
    entry?.name ?? (selection.id ? 'Entry not found' : 'Choose an entry');
  node('entry-id').textContent = entry?.id ?? selection.id;
  node('entry-kind').textContent = entry?.kind ?? '';
  node('details').replaceChildren();
  const variant = node<HTMLSelectElement>('variant');
  variant.replaceChildren();
  variant.disabled = true;
  const region = node<HTMLSelectElement>('region');
  region.replaceChildren(option('0', 'By camera'));
  region.disabled = true;
  node('preview-controls').hidden = true;
  for (const id of ['floor-control', 'logos-control', 'field-control']) {
    node(id).hidden = true;
  }
  if (!entry) {
    node('preview-message').textContent = selection.id
      ? 'This direct link does not identify an entry in the validated Catalogue.'
      : 'Select an object, placed structure, Body or shared geometry definition.';
    return;
  }
  showDetails(store.catalogue, entry, selection, entries);
  if (
    entry.kind === 'area' ||
    (entry.kind === 'place' &&
      !store.catalogue.places.find(p => p.id === entry.id)?.placement)
  ) {
    node('preview-message').textContent =
      'This record has no placed geometry. Its disposition and links are listed below.';
    return;
  }
  if (!support) {
    node('retry-preview').hidden = false;
    node('preview-message').textContent =
      `Preview support unavailable: ${supportError}`;
    return;
  }
  node('preview-message').textContent = 'Loading validated preview geometry…';
  try {
    const prepared = await preparePreview(store, support, selection);
    if (current !== revision) {
      return;
    }
    preview = prepared;
    heading = 128;
    distance = 1;
    variant.replaceChildren(...preview.variants.map(v => option(v, v)));
    variant.value = preview.variant;
    variant.disabled = preview.variants.length < 2;
    region.append(
      ...Array.from({ length: preview.regions }, (_, i) =>
        option(String(i + 1), `Region ${i + 1}`)
      )
    );
    region.value = String(selection.region);
    region.disabled = preview.regions < 2;
    node('preview-controls').hidden = false;
    resize();
    paint();
  } catch (error) {
    if (current === revision) {
      node('retry-preview').hidden = false;
      node('preview-message').textContent =
        `Preview unavailable: ${diagnostic(error)}. Select another entry or retry this link.`;
    }
  }
};
const start = async (): Promise<void> => {
  node('failure').hidden = true;
  node('catalogue').hidden = true;
  node('summary').textContent = 'Loading the validated Catalogue…';
  try {
    assertBrowserDocument(location.pathname, 'dion-catalogue');
    store = await loadDionCatalogue(read);
    entries = catalogueEntries(store.catalogue);
    try {
      support = readRenderSupport(await read(supportPath), store.catalogue);
      supportError = '';
    } catch (error) {
      support = undefined;
      supportError = diagnostic(error);
    }
    const c = store.catalogue;
    node<HTMLSelectElement>('body').replaceChildren(
      option('', 'All Bodies'),
      ...c.bodies.map(b => option(b.id, b.name))
    );
    node<HTMLSelectElement>('group').replaceChildren(
      option('', 'All groups'),
      ...c.areas.map(a =>
        option(String(a.group), `${a.group} · ${a.area ?? a.disposition}`)
      )
    );
    node<HTMLSelectElement>('place').replaceChildren(
      option('', 'All places'),
      ...c.places.map(p => option(p.id, p.name))
    );
    node('source').textContent =
      `Mercenary III research baseline · ${c.source.run} · program SHA-256 ${c.source.programSha256}`;
    node('evidence-gaps').replaceChildren(
      ...c.gaps.map(g => element('p', `${g.id}: ${g.reason ?? 'Evidence gap'}`))
    );
    node('summary').textContent =
      'Read-only · all 31 Bodies · initial residences and evidenced states';
    node('catalogue').hidden = false;
    await render();
  } catch (error) {
    store = undefined;
    node('summary').textContent = 'Catalogue could not be admitted.';
    node('failure').hidden = false;
    node('failure-message').textContent = diagnostic(error);
  }
};
for (const [id, key] of Object.entries(filterKeys)) {
  node(id).addEventListener(id === 'search' ? 'input' : 'change', () => {
    resultLimit = 100;
    update({ [key]: (node(id) as HTMLInputElement).value });
  });
}
node('clear').addEventListener('click', () => {
  resultLimit = 100;
  update(Object.fromEntries(Object.values(filterKeys).map(key => [key, ''])));
});
node('more').addEventListener('click', () => {
  resultLimit += 100;
  void render();
});
for (const id of ['floor', 'variant', 'region', 'state']) {
  node(id).addEventListener('change', () =>
    update(
      {
        [id]: node<HTMLSelectElement>(id).value,
        ...(id === 'floor' ? { region: '', variant: '' } : {})
      },
      true
    )
  );
}
node('field-control').addEventListener('submit', event => {
  event.preventDefault();
  update(
    {
      fieldX: node<HTMLInputElement>('field-x').value,
      fieldZ: node<HTMLInputElement>('field-z').value
    },
    true
  );
});
const orbit = (step: number): void => {
  heading = (heading + step + 1024) % 1024;
  paint();
};
const zoom = (factor: number): void => {
  distance = Math.max(0.015_625, Math.min(64, distance * factor));
  paint();
};
node('left').addEventListener('click', () => orbit(-64));
node('right').addEventListener('click', () => orbit(64));
node('zoom-in').addEventListener('click', () => zoom(0.8));
node('zoom-out').addEventListener('click', () => zoom(1.25));
node('reset').addEventListener('click', () => {
  heading = 128;
  distance = 1;
  paint();
});
canvas.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') {
    orbit(-32);
  } else if (event.key === 'ArrowRight') {
    orbit(32);
  } else if (event.key === '+' || event.key === '=') {
    zoom(0.8);
  } else if (event.key === '-') {
    zoom(1.25);
  } else if (event.key === '0') {
    heading = 128;
    distance = 1;
    paint();
  } else {
    return;
  }
  event.preventDefault();
});
node('retry-preview').addEventListener('click', () =>
  support ? void render() : void start()
);
node('retry').addEventListener('click', () => void start());
window.addEventListener('popstate', () => void render());
document.addEventListener('click', event => {
  const a = (event.target as Element | null)?.closest?.('a') ?? null;
  if (
    !a ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  const url = new URL(a.href);
  if (url.origin !== location.origin || url.pathname !== '/dion/catalogue') {
    return;
  }
  event.preventDefault();
  history.pushState(null, '', url);
  void render();
  node('entry-name').focus();
});
new ResizeObserver(resize).observe(canvas.parentElement!);
void start();
