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
import {
  drawMarkerRange,
  drawSystemRange,
  frameOf,
  placeLabels
} from './draw.ts';
import { renderPanel } from './panel.ts';
import { atlasHref, readAtlasState, type AtlasState } from './state.ts';
import { bodyAt, projectSystem, type SystemProjection } from './system.ts';
import {
  fitSystem,
  markerAt,
  markerView,
  projectSystemAt,
  sizeGrowth,
  type MarkerProjection
} from './systemCamera.ts';

/// The Atlas document (#405).
///
/// Sessionless, like the Flyover (ADR 0042): it loads no Gameplay Session and holds no Saves.
/// It opens on the System Range, every recovered Body placed and selectable, and hops into one
/// Body from there. The Ranges within a Body arrive in the tasks that follow; it asserts its
/// own route so a mis-served document fails here rather than half-rendering.

assertBrowserDocument(window.location.pathname, 'atlas');

/// PROTOTYPE gate. `?camera=1` swaps the System Range for the camera-driven prototype in
/// `systemCamera.ts`; without it this document is exactly what #410 landed, so the two can be
/// judged side by side. Read once from the entry URL, because hopping into a Body does not
/// carry the flag in `atlasHref`.
const CAMERA =
  new URLSearchParams(window.location.search).get('camera') === '1';

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
/// Prototype only: the camera, the fit that bounds it, and the markers it last drew.
let view: MapView | undefined;
let fit: MapView | undefined;
let markers: MarkerProjection | undefined;
/// Prototype only: whether discs grow as the camera closes in. A toggle rather than a setting,
/// so the authored growth can be judged against the extent ratio on its own.
let growing = true;
/// Prototype only: whether the camera is still the untouched fit, so a resize refits it.
let atFit = true;

const selectedBody = () => {
  const current = state;
  return current.level === 'body'
    ? (system?.bodies.find(body => body.id === current.bodyId) ?? null)
    : null;
};

/// Prototype only. Writes nothing to the page but canvas pixels, the label layer and the
/// status line, so the ResizeObserver that calls it cannot feed the frame back on itself.
const drawCameraRange = () => {
  if (!system) {
    return;
  }
  const frame = frameOf(systemRange);
  // The fit span depends on the frame's aspect, so a resize changes it. A camera the reader has
  // moved is re-clamped into the new fit rather than refitted, which would throw away where
  // they were looking; a camera still sitting at the fit is refitted, or the first resize after
  // load would leave the map reading 1.1x without anyone having touched it.
  fit = fitSystem(system.bodies, frame);
  view = view && !atFit ? clampView(fit, view) : fit;
  const growth = growing ? sizeGrowth(fit, view) : 1;
  markers = projectSystemAt(system.bodies, view, frame, growth);
  const labels = drawMarkerRange(canvas, markers, view, frame);
  if (labels) {
    placeLabels(labelLayer, labels);
  }
  for (const anchor of roster.querySelectorAll<HTMLAnchorElement>('a')) {
    const marker = markers.markers.find(value =>
      value.bodyIds.includes(anchor.dataset['body'] ?? '')
    );
    if (marker) {
      anchor.dataset['x'] = marker.x.toFixed(2);
      anchor.dataset['y'] = marker.y.toFixed(2);
      anchor.dataset['marker'] = marker.id;
    }
  }
  const grouped = markers.markers.filter(
    marker => marker.bodyIds.length > 1
  ).length;
  const zoom = zoomOf(fit, view);
  // The scale readout lives in the toolbar rather than the status line, as the Catalogue's
  // does. The toolbar's height never changes, so the longest reading cannot shrink the frame
  // this function has already measured.
  // The ratio to the recovered extent is stated rather than implied: a disc is a fraction of
  // what the recovered number would draw against the distance scale, and never that number.
  const widest = Math.max(...system.bodies.map(body => body.radiusExtent));
  const recovered = widest / markers.unitsPerPixel;
  const drawn = Math.max(...markers.markers.map(marker => marker.radius));
  node('system-scale').textContent =
    `zoom ${zoom < 10 ? zoom.toFixed(1).replace(/\.0$/, '') : Math.round(zoom).toLocaleString('en-GB')}×` +
    ` · ${formatUnits(markers.unitsPerPixel)} engine units per pixel` +
    ` · grid ${formatUnits(gridStep(view.span, frame.width))} units` +
    ` · discs 1/${Math.round(recovered / Math.max(drawn, 1))} of recovered extent`;
  const withheld = labels?.suppressed.length ?? 0;
  const onFrame = markers.markers.length - (labels?.offscreen.length ?? 0);
  status.textContent = onFrame
    ? `${markers.markers.length} markers · ${system.bodies.length} recovered Bodies` +
      (grouped ? ` · ${grouped} group more than one` : '') +
      ' · X right, Z up' +
      (withheld
        ? ` · ${withheld} name${withheld === 1 ? '' : 's'} withheld, in the roster`
        : '')
    : // The recovered Bodies sit in scattered groups, so the middle of the System is genuinely
      // empty. Saying so beats leaving the reader looking at a blank grid wondering what broke.
      'No recovered Body is in view. The Gamma System is mostly empty space; Fit System ' +
      'returns to the whole of it, and the roster opens any Body directly.';
};

const drawRange = () => {
  if (!system || systemRange.hidden) {
    return;
  }
  if (CAMERA) {
    drawCameraRange();
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
  if (CAMERA || !projection) {
    return;
  }
  const point = pointAt(event);
  const id = bodyAt(projection, point.x, point.y);
  if (id) {
    go({ bodyId: id, level: 'body', view: null });
  }
});

canvas.addEventListener('pointermove', event => {
  if (CAMERA || !projection) {
    return;
  }
  const point = pointAt(event);
  canvas.style.cursor = bodyAt(projection, point.x, point.y)
    ? 'pointer'
    : 'default';
});

/// Prototype only: the gestures, the three buttons, and the three-way press. A marker standing
/// for several Bodies opens to its members rather than hopping, because there is no one Body it
/// could mean; only an unambiguous marker enters a Body.
const mountPrototypeCamera = () => {
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
      const marker = markers && markerAt(markers, x, y);
      if (!marker || !system || !fit) {
        return;
      }
      if (marker.bodyIds.length > 1) {
        atFit = false;
        view = markerView(marker, system.bodies, fit, frameOf(systemRange));
        drawRange();
      } else {
        go({ bodyId: marker.id, level: 'body', view: null });
      }
    },
    onView: next => {
      // Comparing against the fit rather than flagging every gesture, so Fit System and the
      // `0` key put the map back to a camera a later resize will refit.
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
  const sizes = node('system-sizes');
  sizes.addEventListener('click', () => {
    growing = !growing;
    sizes.setAttribute('aria-pressed', String(growing));
    sizes.textContent = growing ? 'Sizes: growing' : 'Sizes: fixed';
    drawRange();
  });
  systemRange.addEventListener('pointermove', event => {
    const point = pointAt(event);
    const marker = markers && markerAt(markers, point.x, point.y);
    // Cleared rather than set to `grab`, so the stylesheet keeps saying grab and grabbing.
    systemRange.style.cursor = marker
      ? marker.bodyIds.length > 1
        ? 'zoom-in'
        : 'pointer'
      : '';
  });
};

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

if (CAMERA) {
  node('atlas').classList.add('camera');
  mountPrototypeCamera();
}

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
