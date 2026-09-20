import {
  readGammaSystem,
  type GammaSystemDocument
} from '../flyover/documents.ts';
import { assertBrowserDocument } from '../shell/documentPath.ts';
import { drawSystemRange, frameOf, placeLabels } from './draw.ts';
import { renderPanel } from './panel.ts';
import { atlasHref, readAtlasState, type AtlasState } from './state.ts';
import { bodyAt, projectSystem, type SystemProjection } from './system.ts';

/// The Atlas document (#405).
///
/// Sessionless, like the Flyover (ADR 0042): it loads no Gameplay Session and holds no Saves.
/// It opens on the System Range, every recovered Body placed and selectable, and hops into one
/// Body from there. The Ranges within a Body arrive in the tasks that follow; it asserts its
/// own route so a mis-served document fails here rather than half-rendering.

assertBrowserDocument(window.location.pathname, 'atlas');

const node = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const title = node('title');
const status = node('status');
const failure = node('failure');
const breadcrumb = node('breadcrumb');
const systemRange = node('range-system');
const bodyRange = node('range-body');
const canvas = node<HTMLCanvasElement>('system-map');
const labelLayer = node('system-labels');
const roster = node('roster');
const panel = node('panel');

title.textContent = 'Gamma Atlas';

let system: GammaSystemDocument | undefined;
let state: AtlasState = { level: 'system' };
let projection: SystemProjection | undefined;

const selectedBody = () => {
  const current = state;
  return current.level === 'body'
    ? (system?.bodies.find(body => body.id === current.bodyId) ?? null)
    : null;
};

const drawRange = () => {
  if (!system || systemRange.hidden) {
    return;
  }
  const frame = frameOf(systemRange);
  projection = projectSystem(system.bodies, frame);
  const labels = drawSystemRange(canvas, projection, frame);
  if (labels) {
    placeLabels(labelLayer, labels);
  }
  for (const anchor of roster.querySelectorAll<HTMLAnchorElement>('a')) {
    const disc = projection.discs.find(
      value => value.id === anchor.dataset['body']
    );
    if (disc) {
      anchor.dataset['x'] = disc.x.toFixed(2);
      anchor.dataset['y'] = disc.y.toFixed(2);
    }
  }
  status.textContent =
    `${system.bodies.length} recovered Bodies · X right, Z up · ` +
    `${Math.round(projection.unitsPerPixel).toLocaleString('en-GB')} engine units per pixel` +
    (labels?.suppressed.length
      ? ` · ${labels.suppressed.length} labels withheld where Bodies project onto each other; every Body is in the roster`
      : '');
};

const render = () => {
  if (!system) {
    return;
  }
  state = readAtlasState(
    location.search,
    system.bodies.map(body => body.id)
  );
  const body = selectedBody();
  breadcrumb.replaceChildren();
  const home = document.createElement('a');
  home.href = atlasHref({ level: 'system' });
  home.id = 'breadcrumb-system';
  home.textContent = 'Gamma System';
  breadcrumb.append(home);
  if (body) {
    const here = document.createElement('span');
    here.id = 'breadcrumb-body';
    here.textContent = body.name;
    breadcrumb.append(here);
  }
  systemRange.hidden = body !== null;
  bodyRange.hidden = body === null;
  // The Body's own surface arrives with the wrapping camera in #411; until then the Body Range
  // states which Body the Atlas is in rather than drawing an empty map it cannot yet fill.
  bodyRange.replaceChildren();
  if (body) {
    const name = document.createElement('p');
    name.className = 'range-heading';
    name.id = 'body-name';
    name.textContent = body.name;
    const pending = document.createElement('p');
    pending.className = 'muted';
    pending.textContent =
      'The surface of this Body is not drawn yet. Coastlines, Settlements and structure ' +
      'footprints arrive in the Ranges that follow.';
    bodyRange.append(name, pending);
    status.textContent = `${body.name} · source slot ${body.sourceIndex}`;
  }
  for (const anchor of roster.querySelectorAll('a')) {
    anchor.setAttribute(
      'aria-current',
      String(anchor.dataset['body'] === body?.id)
    );
  }
  renderPanel(panel, system, body);
  if (!body) {
    drawRange();
  }
};

const go = (next: AtlasState) => {
  history.pushState(null, '', atlasHref(next));
  render();
};

const mountRoster = (loaded: GammaSystemDocument) => {
  roster.replaceChildren();
  // Source order, not alphabetical: it is the recovered order, and it keeps each group of
  // Bodies that projects onto one another together in the list.
  for (const body of loaded.bodies) {
    const anchor = document.createElement('a');
    anchor.href = atlasHref({ bodyId: body.id, level: 'body', view: null });
    anchor.dataset['body'] = body.id;
    const swatch = document.createElement('span');
    swatch.className = 'roster-swatch';
    swatch.style.background = body.baseColour;
    anchor.append(swatch, body.name);
    roster.append(anchor);
  }
};

const pointAt = (event: PointerEvent | MouseEvent) => {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
};

canvas.addEventListener('click', event => {
  if (!projection) {
    return;
  }
  const point = pointAt(event);
  const id = bodyAt(projection, point.x, point.y);
  if (id) {
    go({ bodyId: id, level: 'body', view: null });
  }
});

canvas.addEventListener('pointermove', event => {
  if (!projection) {
    return;
  }
  const point = pointAt(event);
  canvas.style.cursor = bodyAt(projection, point.x, point.y)
    ? 'pointer'
    : 'default';
});

document.addEventListener('click', event => {
  const anchor = (event.target as Element | null)?.closest('a');
  if (
    !anchor ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  ) {
    return;
  }
  const url = new URL(anchor.href);
  if (url.origin !== location.origin || url.pathname !== '/damocles/atlas') {
    return;
  }
  event.preventDefault();
  history.pushState(null, '', url.pathname + url.search);
  render();
});

window.addEventListener('popstate', render);
// The map is redrawn from whatever box it actually ends up with. Measuring once inside render
// is not enough: writing the status line below it can wrap to a second row and shrink the map
// after the projection has already been chosen. The canvas is out of flow, so this settles.
new ResizeObserver(drawRange).observe(systemRange);

const start = async () => {
  const path = '/payload/damocles/system.json';
  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Request returned HTTP ${response.status}.`);
    }
    system = readGammaSystem(await response.json());
    failure.hidden = true;
    mountRoster(system);
    render();
  } catch (error) {
    failure.hidden = false;
    failure.textContent =
      `${path}: ${error instanceof Error ? error.message : String(error)}\n` +
      'Restore the Data Payload from this checkout, or regenerate it with the Damocles laboratory extractor.';
    status.textContent = 'The recovered Gamma System could not be read.';
  }
};

void start();
