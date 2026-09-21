import {
  clampView,
  formatUnits,
  gridStep,
  zoomOf,
  type MapView
} from '../catalogue/mapView.ts';
import {
  readGammaSystem,
  type GammaSystemDocument
} from '../flyover/documents.ts';
import { assertBrowserDocument } from '../shell/documentPath.ts';
import { mountCamera, type CameraFrame } from './camera.ts';
import { drawSystemRange, frameOf, placeLabels } from './draw.ts';
import { renderPanel } from './panel.ts';
import {
  SYSTEM_RANGE,
  atlasHref,
  readAtlasState,
  type AtlasState
} from './state.ts';
import {
  fitSystem,
  markerAt,
  markerView,
  projectSystem,
  type SystemMarker,
  type SystemProjection
} from './system.ts';

/// The Atlas document (#405).
///
/// Sessionless, like the Flyover (ADR 0042): it loads no Gameplay Session and holds no Saves. It
/// opens on the System Range with a camera over every recovered Body, and hops into one Body
/// from there. The Ranges within a Body arrive in #411; it asserts its own route so a mis-served
/// document fails here rather than half-rendering.

assertBrowserDocument(window.location.pathname, 'atlas');

const node = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const title = node('title');
const status = node('status');
const scale = node('system-scale');
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
let state: AtlasState = SYSTEM_RANGE;
let projection: SystemProjection | undefined;
let view: MapView | undefined;
let fit: MapView | undefined;
/// Whether the camera is still the untouched fit, so a resize refits it rather than re-clamping
/// a span measured against a frame that no longer exists.
let atFit = true;
/// The camera the URL should carry, written on an idle timer. A wheel gesture produces a camera
/// a frame, and none of them belongs in history.
let pending: ReturnType<typeof setTimeout> | undefined;

const selectedBody = () => {
  const current = state;
  return current.level === 'body'
    ? (system?.bodies.find(body => body.id === current.bodyId) ?? null)
    : null;
};

/// `replaceState`, never `pushState`: panning is not navigation and must not bury the Back
/// button. The hop into a Body still pushes.
const recordCamera = () => {
  clearTimeout(pending);
  pending = setTimeout(() => {
    if (!view || state.level !== 'system') {
      return;
    }
    const next = atFit
      ? SYSTEM_RANGE
      : ({
          level: 'system',
          view: { span: view.span, x: view.cx, z: view.cz }
        } as const);
    history.replaceState(null, '', atlasHref(next));
  }, 250);
};

/// Writes nothing to the page but canvas pixels, the label layer, the scale readout and the
/// status line, so the ResizeObserver that calls it cannot feed the frame back on itself.
const drawRange = () => {
  if (!system || systemRange.hidden) {
    return;
  }
  const frame = frameOf(systemRange);
  // The fit span depends on the frame's aspect, so a resize changes it. A camera the reader has
  // moved is re-clamped into the new fit rather than refitted, which would throw away where
  // they were looking; a camera still sitting at the fit is refitted, or the first resize after
  // load would leave the map reading 1.1x without anyone having touched it.
  fit = fitSystem(system.bodies, frame);
  view = view && !atFit ? clampView(fit, view) : fit;
  projection = projectSystem(system.bodies, view, frame);
  const labels = drawSystemRange(canvas, projection, view, frame);
  if (labels) {
    placeLabels(labelLayer, labels);
  }
  for (const anchor of roster.querySelectorAll<HTMLAnchorElement>('a')) {
    const marker = projection.markers.find(value =>
      value.bodyIds.includes(anchor.dataset['body'] ?? '')
    );
    if (marker) {
      anchor.dataset['x'] = marker.x.toFixed(2);
      anchor.dataset['y'] = marker.y.toFixed(2);
      anchor.dataset['marker'] = marker.id;
    }
  }
  const zoom = zoomOf(fit, view);
  const scaled = projection.markers.filter(marker => marker.toScale).length;
  scale.textContent =
    `zoom ${zoom < 10 ? zoom.toFixed(1).replace(/\.0$/, '') : Math.round(zoom).toLocaleString('en-GB')}×` +
    ` · ${formatUnits(projection.unitsPerPixel)} engine units per pixel` +
    ` · grid ${formatUnits(gridStep(view.span, frame.width))} units` +
    // Which of a size and a symbol is on screen is stated rather than left to be guessed.
    (scaled
      ? ` · ${scaled} of ${projection.markers.length} discs at derived radius`
      : ' · discs are markers, not sizes');
  const grouped = projection.markers.filter(
    marker => marker.bodyIds.length > 1
  ).length;
  const withheld = labels?.suppressed.length ?? 0;
  const onFrame = projection.markers.length - (labels?.offscreen.length ?? 0);
  status.textContent = onFrame
    ? `${projection.markers.length} markers · ${system.bodies.length} recovered Bodies` +
      (grouped ? ` · ${grouped} group more than one` : '') +
      ' · X right, Z up' +
      (withheld
        ? ` · ${withheld} name${withheld === 1 ? '' : 's'} withheld, in the roster`
        : '')
    : // The recovered Bodies sit in scattered groups, so the middle of the System is genuinely
      // empty. Saying so beats leaving the reader looking at a blank grid wondering what broke.
      'No recovered Body is in view. The Gamma System is mostly empty space; Fit System ' +
      'returns to the whole of it, and the roster opens any Body directly.';
  recordCamera();
};

const render = () => {
  if (!system) {
    return;
  }
  const previous = state;
  state = readAtlasState(
    location.search,
    system.bodies.map(body => body.id)
  );
  const body = selectedBody();
  // A camera arriving in the URL wins over whatever was on screen, which is what makes a deep
  // link and the Back button restore a view rather than refit one.
  if (state.level === 'system' && previous !== state) {
    const carried = state.view;
    if (carried) {
      view = { cx: carried.x, cz: carried.z, span: carried.span };
      atFit = false;
    } else if (previous.level === 'body') {
      view = undefined;
      atFit = true;
    }
  }
  breadcrumb.replaceChildren();
  const home = document.createElement('a');
  // Carries the System camera in memory, so leaving a Body lands where the reader left rather
  // than refitting the whole System.
  home.href = atlasHref(
    view && !atFit
      ? { level: 'system', view: { span: view.span, x: view.cx, z: view.cz } }
      : SYSTEM_RANGE
  );
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
    const waiting = document.createElement('p');
    waiting.className = 'muted';
    waiting.textContent =
      'The surface of this Body is not drawn yet. Coastlines, Settlements and structure ' +
      'footprints arrive in the Ranges that follow.';
    bodyRange.append(name, waiting);
    status.textContent = `${body.name} · source slot ${body.sourceIndex}`;
    scale.textContent = '';
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
  clearTimeout(pending);
  history.pushState(null, '', atlasHref(next));
  render();
};

const mountRoster = (loaded: GammaSystemDocument) => {
  roster.replaceChildren();
  // Source order, not alphabetical: it is the recovered order, and it keeps each group of
  // Bodies that a marker stands for together in the list.
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

/// A marker standing for several Bodies opens to its members rather than hopping, because there
/// is no one Body it could mean. Only an unambiguous marker enters a Body.
const pick = (marker: SystemMarker) => {
  if (!system || !fit) {
    return;
  }
  if (marker.bodyIds.length > 1) {
    atFit = false;
    view = markerView(marker, system.bodies, fit, frameOf(systemRange));
    drawRange();
  } else {
    go({ bodyId: marker.id, level: 'body', view: null });
  }
};

const cameraFrame = (): CameraFrame => {
  const frame = frameOf(systemRange);
  return {
    aspect: frame.height / Math.max(frame.width, 1),
    height: frame.height,
    width: frame.width
  };
};

const controls = mountCamera({
  camera: () => (fit && view ? { fit, view } : null),
  element: systemRange,
  frame: cameraFrame,
  onPick: (x, y) => {
    const marker = projection && markerAt(projection, x, y);
    if (marker) {
      pick(marker);
    }
  },
  onView: next => {
    // Compared against the fit rather than flagged on every gesture, so Fit System and the `0`
    // key put the map back to a camera a later resize will refit.
    atFit =
      !!fit &&
      next.cx === fit.cx &&
      next.cz === fit.cz &&
      next.span === fit.span;
    view = next;
    drawRange();
  }
});

node('system-zoom-out').addEventListener('click', controls.zoomOut);
node('system-zoom-in').addEventListener('click', controls.zoomIn);
node('system-fit').addEventListener('click', controls.fit);

systemRange.addEventListener('pointermove', event => {
  const rect = canvas.getBoundingClientRect();
  const marker =
    projection &&
    markerAt(projection, event.clientX - rect.left, event.clientY - rect.top);
  // Cleared rather than set to `grab`, so the stylesheet keeps saying grab and grabbing.
  systemRange.style.cursor = marker
    ? marker.bodyIds.length > 1
      ? 'zoom-in'
      : 'pointer'
    : '';
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
  clearTimeout(pending);
  history.pushState(null, '', url.pathname + url.search);
  render();
});

window.addEventListener('popstate', render);
// The map is redrawn from whatever box it actually ends up with. Measuring once inside render is
// not enough: writing the status line below it can wrap to a second row and shrink the map after
// the camera has already been chosen. The canvas is out of flow, so this settles.
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
