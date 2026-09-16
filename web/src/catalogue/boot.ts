import { assertBrowserDocument } from '../shell/documentPath.ts';
import {
  parseCatalogue,
  selectModels,
  type Catalogue,
  type Model
} from './data.ts';
import { detailForms } from './details.ts';
import { address, element, link, node } from './dom.ts';
import { mountMap, renderMap, type MapFocus } from './map.ts';
import { regionForms } from './regions.ts';
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
    ground: 'Ground',
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
  node('model-status').textContent =
    model.recordClass === 'geometry'
      ? model.status
      : `${model.status} · ${model.recordClass}`;
  if (model.kind !== 'object') {
    paragraph(
      details,
      model.kind === 'interior'
        ? 'Building-detail geometry can appear outside or inside. This source bank does not identify a model as an interior.'
        : model.kind === 'ground'
          ? 'Per-cell ground, pad and road record. Scene point slots resolve to world grid corners from the authored seed table, and $6000 records paint vector text flat on the cell; intentional empty records contribute no geometry, and the viewport background is a raster fill rather than geometry.'
          : 'Building plan and linked detail. Available inspection views are listed under Form; original scene visibility remains incomplete.'
    );
  }
  const keyed = model.structureSelection?.attachments.filter(
    item => item.keyIndex !== undefined
  );
  if (keyed?.length) {
    paragraph(
      details,
      `${keyed.length === 1 ? 'One entrance takes' : `${keyed.length} entrances take`} a key letter from the cell rather than from this record: $054CBE turns the cell's $ABDC entry byte into the $7AFB base, and $059FA0 forms the label as key index plus base plus $23, so base $1E reads A. ${keyed.map(item => `Slot $${item.slot.toString(16).toUpperCase()} key index ${item.keyIndex}`).join(' · ')}. The constructor reads only bits 8, 9 and 15, so the shape is the same whichever path runs; observed letters are listed under evidence.`
    );
  }
  const unreferenced = model.variants[0]?.mesh.unreferencedRecords;
  if (unreferenced?.length) {
    paragraph(
      details,
      `Records ${unreferenced.join(', ')} name shared vertex slots above this record's own list, which $053D32 never fills, so they could only draw whatever the previous model left behind. No box list or group default selects them, so the game never tabulates them and they are kept here as selector ordinals that draw nothing.`
    );
  }
  if (model.detailSelection?.length) {
    paragraph(
      details,
      'Both recovered visibility groups are listed under Form: one box list per authored box, plus the default list the game draws when no box contains the player. $053CC2 picks group 2 on foot inside a structure and group 1 otherwise. Boxes are stated in raw model coordinates, which a placement scales by its structure X and Z factors. Record lists do not vary by palette, so the forms use the first palette listed.'
    );
  }
  if (model.sceneColours?.length) {
    paragraph(
      details,
      `Cell background colours ${model.sceneColours.map(entry => entry.colour ?? `$${entry.sourceColour.toString(16).toUpperCase()}`).join(' and ')}. The frame loop pre-fills the viewport with a raster block at $059CE2 and installs these from the record, so the background is not geometry this model can hold.`
    );
  }
  if (model.conditions.length) {
    paragraph(
      details,
      `The game selects among these forms by ${model.conditions.join(', ')}; free inspection shows each form separately.`
    );
  }
  if (model.reason) {
    paragraph(details, model.reason);
  }
  const instance = data.instances.find(item => item.id === instanceId);
  if (instance) {
    details.append(element('h3', instance.name));
    if (instance.location) {
      paragraph(
        details,
        `${data.bodies.find(b => b.id === instance.location!.body)?.name} · ${instance.location.position.map(value => value.toFixed(3)).join(', ')} · ${instance.location.coordinateSystem}${instance.location.heading === null ? '' : ` · source heading ${instance.location.heading}`}`
      );
    } else if (instance.placement) {
      const parent = data.instances.find(
        value => value.id === instance.placement!.parent
      )!;
      const placement = element('p', 'Inside ');
      placement.append(
        link(parent.name, 'instance', parent.id),
        ` · ${instance.placement.position.join(', ')} · ${instance.placement.coordinateSystem}. ${instance.reason}`
      );
      details.append(placement);
    } else {
      paragraph(details, instance.reason);
    }
    if (instance.association) {
      const association = instance.association;
      const hex = (value: number) =>
        `$${value.toString(16).padStart(2, '0').toUpperCase()}`;
      paragraph(
        details,
        `${data.bodies.find(b => b.id === association.body)?.name} selectors · structure group ${hex(association.structureGroupSelector)} · insertion group ${hex(association.insertionGroupSelector)} · level ${hex(association.levelSelector)} · cell ${hex(association.cell)}`
      );
      if (association.insertions.length) {
        paragraph(
          details,
          `Authored region/insertion selectors · ${association.insertions.map(item => `${hex(item.regionSelector)}→${hex(item.insertionKey)}`).join(' · ')}`
        );
      }
    }
  }
  // Each recovered region, and each building-detail visibility list, is offered
  // beside the model's own forms, so the decoded lists can be inspected rather
  // than only described.
  const forms = [
    ...model.variants,
    ...regionForms(
      model,
      data.models.find(
        item => item.id === model.structureSelection?.detailModel
      )
    ),
    ...detailForms(model)
  ];
  const chosen = new URL(location.href).searchParams.get('variant');
  const selected =
    forms.find(form => form.id === chosen) ??
    forms.find(form => form.id === model.id) ??
    forms[0];
  door.value = selected?.doorState ?? 'open';
  const populateForms = (id: string | undefined) => {
    variant.replaceChildren();
    for (const form of forms.filter(
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
    const form = forms.find(value => value.id === variant.value);
    node('door-control').hidden = !form?.doorState;
    door.disabled = !viewer;
    statistics.textContent = form
      ? `${form.mesh.vertices.length} vertices · ${form.mesh.faces.length} faces · ${form.mesh.lines.length} lines`
      : '';
    try {
      viewer?.show(form?.mesh ?? null, preserveView, form?.inspectionAngle);
      message(
        viewerError ||
          (form
            ? ''
            : model.recordClass === 'procedural'
              ? 'No authored polygons: the game draws this record with a native routine. See the recovery details below.'
              : model.recordClass === 'empty' || model.recordClass === 'null'
                ? 'Authored empty: this record parses cleanly to its terminator and holds no geometry. See the recovery details below.'
                : 'Geometry unresolved. See the recovery details below.')
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
  variant.disabled = forms.length < 2;
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
      !forms.length || !viewer;
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
        `${value.name}${value.location || value.placement ? '' : ' · location unknown'}`,
        'instance',
        value.id
      )
    );
    list.append(li);
  }
  details.append(list);
};

const render = (focus: MapFocus) => {
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
    a.append(
      element(
        'small',
        `${kindLabel(entry.kind)} · ${entry.status}${
          entry.recordClass === 'geometry' ? '' : ` · ${entry.recordClass}`
        }`
      )
    );
    nav.append(a);
  }
  showModel(model, instanceId);
  body.value = params.get('body') ?? instance?.location?.body ?? 'body-11';
  if (!body.value) {
    body.selectedIndex = 0;
  }
  renderMap(data, body.value, instanceId, focus);
};

const start = async () => {
  try {
    assertBrowserDocument(location.pathname, 'catalogue');
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
    const census = data.coverage.census;
    paragraph(
      ledger,
      `${census.unique} unique records · ${census.decoded} decoded · ${census.partial} partial · ${census.unresolved} unresolved`
    );
    const classes = data.coverage.classifications;
    if (Object.keys(classes).length) {
      paragraph(
        ledger,
        `Classes: ${classes.geometry ?? 0} geometry · ${classes.alias ?? 0} alias · ${classes.empty ?? 0} empty · ${classes.null ?? 0} NULL · ${classes.procedural ?? 0} procedural · ${classes.conditionalForms ?? 0} conditional forms · ${classes.scenePoint ?? 0} scene point · ${classes.viewConditioned ?? 0} view-conditioned · ${classes.articulated ?? 0} articulated · ${classes.specialPolygon ?? 0} special polygon · ${classes.paletteBinding ?? 0} palette · ${classes.liveText ?? 0} live text · ${classes.attachments ?? 0} attachments`
      );
    }
    const ledgerTables =
      data.coverage.tables.length > 0
        ? data.coverage.tables
        : data.tables.map(table => ({
            address: table.address,
            aliases: 0,
            decoded: 0,
            empty: 0,
            extentEvidence: table.extentEvidence,
            kind: table.kind,
            nullRecords: 0,
            partial: 0,
            slots: table.entryCount,
            unique: new Set(table.entries).size,
            unresolved: 0
          }));
    for (const table of ledgerTables) {
      const row = element('div');
      row.className = 'ledger-row';
      row.append(
        element('span', kindLabel(table.kind)),
        element('span', `${table.slots} slots · ${table.unique} unique`)
      );
      ledger.append(row);
      paragraph(ledger, table.extentEvidence);
      paragraph(
        ledger,
        `${table.decoded} decoded · ${table.partial} partial · ${table.unresolved} unresolved · ${table.aliases} alias · ${table.empty} empty · ${table.nullRecords} NULL · ${address(table.address)}`
      );
    }
    paragraph(
      ledger,
      data.coverage.complete
        ? 'Source census complete'
        : 'Source coverage incomplete'
    );
    if (data.coverage.diskLoad.length) {
      paragraph(ledger, 'Examined disk-load and resident-bank paths');
      const loads = element('ul');
      for (const item of data.coverage.diskLoad) {
        loads.append(element('li', `${item.path}: ${item.finding}`));
      }
      ledger.append(loads);
    }
    if (data.coverage.unexplored.length) {
      paragraph(ledger, 'Unexplored coverage');
      const missing = element('ul');
      for (const note of data.coverage.unexplored) {
        missing.append(element('li', note));
      }
      ledger.append(missing);
    }
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
    render('cluster');
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
    render('keep');
  });
}
body.addEventListener('change', () => {
  replaceQuery('body', body.value);
  renderMap(
    data,
    body.value,
    new URL(location.href).searchParams.get('instance'),
    'fit'
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
mountMap();
node('retry').addEventListener('click', () => void start());
window.addEventListener('popstate', () => {
  if (data) {
    render('keep');
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
  render('cluster');
  node('model-name').setAttribute('tabindex', '-1');
  node('model-name').focus();
  node('model-name').scrollIntoView({ block: 'start' });
});
void start();
