import {
  parseCatalogue,
  selectModels,
  type Catalogue,
  type Model
} from './data.ts';
import { address, element, link, node } from './dom.ts';
import { renderMap } from './map.ts';
import { createViewer } from './viewer.ts';

let data: Catalogue;
let viewer: ReturnType<typeof createViewer> | undefined;
let viewerError = '';
const search = node<HTMLInputElement>('search'),
  kind = node<HTMLSelectElement>('kind'),
  recovery = node<HTMLSelectElement>('recovery'),
  variant = node<HTMLSelectElement>('variant'),
  door = node<HTMLSelectElement>('door'),
  body = node<HTMLSelectElement>('body');
// Legacy dataset kind keys remain stable for existing deep links.
const kindLabel = (value: Model['kind']) =>
  ({
    interior: 'Building detail',
    object: 'Object',
    structure: 'Surface assembly'
  })[value];
const paragraph = (parent: HTMLElement, text: string) =>
  parent.append(element('p', text));
const message = (text: string) => {
  node('viewer-message').textContent = text;
  node('viewer-message').hidden = !text;
};
const replaceQuery = (key: string, value: string) => {
  const url = new URL(location.href);
  if (value) {
    url.searchParams.set(key, value);
  } else {
    url.searchParams.delete(key);
  }
  history.replaceState(null, '', url);
};

const showModel = (model: Model | undefined, instanceId: string | null) => {
  const details = node('details');
  details.replaceChildren();
  variant.replaceChildren();
  node('door-control').hidden = true;
  if (!model) {
    node('model-name').textContent = 'Model not found';
    node('model-id').textContent = 'Choose an entry from the catalogue.';
    node('model-kind').textContent = '';
    node('model-status').textContent = '';
    viewer?.show(null);
    message('This link does not identify a model in this dataset.');
    return;
  }
  node('model-name').textContent = model.name;
  node('model-kind').textContent = kindLabel(model.kind);
  node('model-id').textContent =
    `${model.id} · ${model.nameStatus === 'unknown' ? 'Unidentified' : `${model.nameStatus} name`}`;
  node('model-status').textContent = model.status;
  if (model.kind !== 'object') {
    paragraph(
      details,
      model.kind === 'interior'
        ? 'Building-detail geometry can appear outside or inside. This source bank does not identify a model as an interior.'
        : 'Building plan and linked detail. Available inspection views are listed under Form; original scene visibility remains incomplete.'
    );
  }
  if (model.reason) {
    paragraph(details, model.reason);
  }
  const instance = data.instances.find(item => item.id === instanceId);
  if (instance) {
    details.append(element('h3', instance.name));
    paragraph(
      details,
      instance.location
        ? `${data.bodies.find(b => b.id === instance.location!.body)?.name} · ${instance.location.position.map(value => value.toFixed(3)).join(', ')} · ${instance.location.coordinateSystem}`
        : instance.reason
    );
  }
  const chosen = new URL(location.href).searchParams.get('variant');
  const selected =
    model.variants.find(form => form.id === chosen) ??
    model.variants.find(form => form.id === model.id) ??
    model.variants[0];
  door.value = selected?.doorState ?? 'open';
  const populateForms = (id: string | undefined) => {
    variant.replaceChildren();
    for (const form of model.variants.filter(
      form => !form.doorState || form.doorState === door.value
    )) {
      const option = element('option', form.name);
      option.value = form.id;
      variant.append(option);
    }
    if (id) {
      variant.value = id;
    }
  };
  populateForms(selected?.id);
  const statistics = element('p');
  const showForm = (preserveView = false) => {
    const form = model.variants.find(value => value.id === variant.value);
    node('door-control').hidden = !form?.doorState;
    door.disabled = !viewer;
    statistics.textContent = form
      ? `${form.mesh.vertices.length} vertices · ${form.mesh.faces.length} faces · ${form.mesh.lines.length} lines`
      : '';
    try {
      viewer?.show(form?.mesh ?? null, preserveView);
      message(
        viewerError ||
          (!form ? 'Geometry unresolved. See the recovery details below.' : '')
      );
    } catch (error) {
      viewer?.show(null);
      message(error instanceof Error ? error.message : String(error));
    }
    node('model-view').setAttribute(
      'aria-label',
      `${model.name}. Arrow keys orbit, plus and minus zoom, zero resets.`
    );
  };
  variant.disabled = model.variants.length < 2;
  variant.onchange = () => {
    replaceQuery('variant', variant.value);
    showForm();
  };
  door.onchange = () => {
    const current = model.variants.find(form => form.id === variant.value);
    const next = model.variants.find(
      form => form.view === current?.view && form.doorState === door.value
    );
    if (!next) {
      return;
    }
    populateForms(next.id);
    replaceQuery('variant', next.id);
    showForm(true);
  };
  for (const id of ['wireframe', 'zoom-in', 'zoom-out', 'reset']) {
    (node(id) as HTMLInputElement | HTMLButtonElement).disabled =
      !model.variants.length || !viewer;
  }
  showForm();
  details.append(statistics);
  paragraph(
    details,
    `Source ${address(model.sourceAddress)} · Table slots ${model.slots.join(', ')}`
  );
  if (model.evidence.length) {
    details.append(element('h3', 'Recovery evidence'));
    const evidence = element('ul');
    for (const item of model.evidence) {
      evidence.append(
        element('li', `${item.confidence}: ${item.claim} · ${item.source}`)
      );
    }
    details.append(evidence);
  }
  if (model.relatedModels.length) {
    details.append(element('h3', 'Related geometry'));
    for (const id of model.relatedModels) {
      const related = data.models.find(m => m.id === id)!;
      const p = element('p');
      p.append(link(related.name, 'model', id));
      details.append(p);
    }
  }
  if (model.linkedInstances.length) {
    details.append(element('h3', 'Linked instances'));
    for (const id of model.linkedInstances) {
      const related = data.instances.find(value => value.id === id)!;
      const p = element('p');
      p.append(link(related.name, 'instance', id));
      details.append(p);
    }
  }
  const instances = data.instances.filter(value => value.model === model.id);
  details.append(element('h3', `${instances.length} recovered instances`));
  if (!instances.length) {
    paragraph(details, 'No instance relationship recovered yet.');
  }
  const list = element('ul');
  for (const value of instances) {
    const li = element('li');
    li.append(
      link(
        `${value.name}${value.location ? '' : ' · location unknown'}`,
        'instance',
        value.id
      )
    );
    list.append(li);
  }
  details.append(list);
};

const render = () => {
  const params = new URL(location.href).searchParams;
  search.value = params.get('q') ?? '';
  kind.value = params.get('kind') ?? '';
  recovery.value = params.get('status') ?? '';
  const instanceId = params.get('instance');
  const instance = data.instances.find(item => item.id === instanceId);
  const requested = params.get('model');
  const model = instanceId
    ? data.models.find(item => item.id === instance?.model)
    : requested
      ? data.models.find(item => item.id === requested)
      : data.models.find(item => item.status === 'decoded');
  const results = selectModels(data, search.value, kind.value, recovery.value);
  node('result-count').textContent =
    `${results.length} of ${data.models.length} models`;
  const nav = node('results');
  nav.replaceChildren();
  if (!results.length) {
    paragraph(
      nav,
      'No matching models. Try another name or clear the filters.'
    );
  }
  for (const entry of results) {
    const a = link(entry.name, 'model', entry.id);
    a.setAttribute('aria-current', String(entry.id === model?.id));
    a.append(element('small', `${kindLabel(entry.kind)} · ${entry.status}`));
    nav.append(a);
  }
  showModel(model, instanceId);
  body.value = params.get('body') ?? instance?.location?.body ?? 'body-11';
  if (!body.value) {
    body.selectedIndex = 0;
  }
  renderMap(data, body.value, instanceId);
};

const start = async () => {
  try {
    const response = await fetch('/payload/damocles/catalogue.json');
    if (!response.ok) {
      throw new Error(`Dataset request returned HTTP ${response.status}.`);
    }
    data = parseCatalogue(await response.json());
    node('error').hidden = true;
    node('catalogue').hidden = false;
    const decoded = data.models.filter(
        model => model.status === 'decoded'
      ).length,
      partial = data.models.filter(model => model.status === 'partial').length;
    node('summary').textContent =
      `${data.models.length} models · ${decoded} decoded · ${partial} partial · ${data.models.length - decoded - partial} unresolved`;
    if (!viewer) {
      try {
        viewer = createViewer(node<HTMLCanvasElement>('model-view'));
      } catch (error) {
        viewerError = error instanceof Error ? error.message : String(error);
      }
    }
    const ledger = node('ledger');
    ledger.replaceChildren();
    for (const table of data.tables) {
      const row = element('div');
      row.className = 'ledger-row';
      row.append(
        element('span', kindLabel(table.kind)),
        element('span', `${table.entryCount} entries`)
      );
      ledger.append(row);
      paragraph(ledger, table.extentEvidence);
      paragraph(
        ledger,
        `${new Set(table.entries).size} unique records · ${address(table.address)}`
      );
    }
    paragraph(
      ledger,
      data.coverage.complete
        ? 'Source census complete'
        : 'Source coverage incomplete'
    );
    const notes = element('ul');
    for (const note of data.coverage.notes) {
      notes.append(element('li', note));
    }
    ledger.append(notes);
    const src = node('source');
    src.replaceChildren();
    for (const [key, value] of Object.entries(data.source)) {
      src.append(element('h3', key), element('code', value));
    }
    body.replaceChildren();
    for (const item of data.bodies) {
      const option = element('option', item.name);
      option.value = item.id;
      body.append(option);
    }
    render();
  } catch (error) {
    node('catalogue').hidden = true;
    node('error').hidden = false;
    node('summary').textContent = 'Recovered content could not be loaded.';
    node('error-message').textContent =
      error instanceof Error ? error.message : String(error);
  }
};
for (const [input, key] of [
  [search, 'q'],
  [kind, 'kind'],
  [recovery, 'status']
] as const) {
  input.addEventListener('input', () => {
    replaceQuery(key, input.value);
    render();
  });
}
body.addEventListener('change', () => {
  replaceQuery('body', body.value);
  renderMap(
    data,
    body.value,
    new URL(location.href).searchParams.get('instance')
  );
});
node('wireframe').addEventListener('change', event =>
  viewer?.wireframe((event.target as HTMLInputElement).checked)
);
node('reset').addEventListener('click', () => viewer?.reset());
node('zoom-in').addEventListener('click', () => viewer?.zoomIn());
node('zoom-out').addEventListener('click', () => viewer?.zoomOut());
node('model-view').addEventListener('viewer-error', event =>
  message((event as CustomEvent<string>).detail)
);
node('retry').addEventListener('click', () => void start());
window.addEventListener('popstate', () => {
  if (data) {
    render();
  }
});
document.addEventListener('click', event => {
  const a = (event.target as Element).closest('a');
  if (
    !a ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  ) {
    return;
  }
  const url = new URL(a.href);
  if (url.pathname !== '/catalogue' || url.origin !== location.origin) {
    return;
  }
  event.preventDefault();
  history.pushState(null, '', url);
  render();
  node('model-name').setAttribute('tabindex', '-1');
  node('model-name').focus();
  node('model-name').scrollIntoView({ block: 'start' });
});
void start();
