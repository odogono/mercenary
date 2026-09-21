import { parseCatalogue, type Catalogue } from '../catalogue/data.ts';
import {
  clampView,
  formatUnits,
  gridStep,
  unproject,
  zoomOf,
  type MapView
} from '../catalogue/mapView.ts';
import {
  readGammaSystem,
  type GammaSystemDocument
} from '../flyover/documents.ts';
import { assertBrowserDocument } from '../shell/documentPath.ts';
import {
  RANGE_LABEL,
  SURFACE_SPAN,
  bodyBounds,
  fitBody,
  rangeOf
} from './bodyRange.ts';
import { mountCamera, type CameraFrame } from './camera.ts';
import {
  drawBodySurface,
  drawSystemRange,
  frameOf,
  placeLabels
} from './draw.ts';
import { renderPanel } from './panel.ts';
import {
  SYSTEM_RANGE,
  atlasHref,
  readAtlasState,
  type AtlasState
} from './state.ts';
import { islandAt, readBodySurface, type BodySurface } from './surface.ts';
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
const bodyCanvas = node<HTMLCanvasElement>('body-map');
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
/// The Body Range's own camera, in Surface Cells. It has no `atFit` twin: the surface is exactly
/// SURFACE_SPAN on a side however the frame is shaped, so a resize never moves what the widest
/// view means.
let bodyView: MapView | undefined;
/// The Catalogue, and the islands of the Body currently open.
///
/// Fetched only on first entering a Body, never for the System Range. `catalogue.json` is 40 MiB
/// because it carries 1,241 Models and 1,746 Instances, and the Atlas needs 60 KiB of coastlines
/// out of it. `/damocles` and `/damocles/catalogue` both fetch the whole thing already, so this
/// is the established cost rather than a new one, but there is no reason to pay it for a reader
/// who only ever looks at the System Range.
let catalogue: Catalogue | undefined;
let catalogueRequest: Promise<void> | undefined;
let surface: BodySurface | undefined;

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
    const current = state;
    if (current.level === 'body') {
      history.replaceState(
        null,
        '',
        atlasHref(
          bodyView
            ? {
                bodyId: current.bodyId,
                islandId: current.islandId,
                level: 'body',
                view: { span: bodyView.span, x: bodyView.cx, z: bodyView.cz }
              }
            : {
                bodyId: current.bodyId,
                islandId: current.islandId,
                level: 'body',
                view: null
              }
        )
      );
      return;
    }
    if (!view) {
      return;
    }
    history.replaceState(
      null,
      '',
      atlasHref(
        atFit
          ? SYSTEM_RANGE
          : {
              level: 'system',
              view: { span: view.span, x: view.cx, z: view.cz }
            }
      )
    );
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

/// Writes nothing to the page but canvas pixels and the two readouts, so the ResizeObserver
/// that calls it cannot feed the frame back on itself.
const drawBodyRange = () => {
  const body = selectedBody();
  if (!body || bodyRange.hidden) {
    return;
  }
  const frame = frameOf(bodyRange);
  bodyView = bodyView ?? fitBody(frame);
  const current = state;
  drawBodySurface(
    bodyCanvas,
    bodyView,
    frame,
    body.baseColour,
    surface,
    current.level === 'body' ? current.islandId : null
  );
  const band = rangeOf(bodyView, frame.width);
  const cells = bodyView.span / Math.max(frame.width, 1);
  scale.textContent =
    `${RANGE_LABEL[band]} · ${formatUnits(cells)} Surface Cells per pixel` +
    ` · grid ${formatUnits(gridStep(bodyView.span, frame.width))} cells`;
  const surfaceNote = surface
    ? `${surface.islands.length} recovered island${surface.islands.length === 1 ? '' : 's'}` +
      (surface.gaps.length
        ? ` · ${surface.gaps.length} record${surface.gaps.length === 1 ? '' : 's'} carry no coastline and are not drawn`
        : '')
    : 'reading the Catalogue for this Body\u2019s islands';
  status.textContent =
    `${body.name} · source slot ${body.sourceIndex} · surface ${SURFACE_SPAN} Surface Cells ` +
    `an axis, wrapping on both · ${surfaceNote} · Settlements and structure footprints are ` +
    'not drawn yet';
  recordCamera();
};

/// The Catalogue is read once and kept. A failure leaves the sea and the grid drawn, and says so
/// in the status line, rather than blanking a Range that is already telling the reader something.
const loadSurface = (sourceIndex: number) => {
  if (catalogue) {
    surface = readBodySurface(catalogue, sourceIndex);
    return;
  }
  surface = undefined;
  catalogueRequest =
    catalogueRequest ??
    fetch('/payload/damocles/catalogue.json')
      .then(async response => {
        if (!response.ok) {
          throw new Error(`Request returned HTTP ${response.status}.`);
        }
        catalogue = parseCatalogue(await response.json());
      })
      .catch(error => {
        catalogueRequest = undefined;
        failure.hidden = false;
        failure.textContent =
          `/payload/damocles/catalogue.json: ${error instanceof Error ? error.message : String(error)}\n` +
          'The sea and the Surface Cell grid are drawn from the System authority; coastlines need the Catalogue.';
      });
  void catalogueRequest.then(() => {
    const body = selectedBody();
    if (!catalogue || !body) {
      return;
    }
    surface = readBodySurface(catalogue, body.sourceIndex);
    // `render` rather than `drawBodyRange`: a deep link may name a picked island, and until the
    // Catalogue is read there is no record to put in the panel. Re-rendering is idempotent here
    // because the state has not moved, so the camera survives and nothing is refetched.
    render();
  });
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
  node('system-fit').textContent = body ? 'Fit Surface' : 'Fit System';
  // The Range is a map rather than a heading, so the Body it shows is named to assistive
  // technology here and in the breadcrumb rather than written over the surface.
  bodyRange.setAttribute(
    'aria-label',
    `${body ? `${body.name}. ` : ''}Body Range. The surface of one Body, which wraps on both ` +
      'axes. Drag to pan, scroll or double-click to zoom, arrow keys pan, plus and minus zoom, ' +
      'zero fits the surface, zooming out past the surface returns to the Gamma System.'
  );
  if (body) {
    // A camera in the URL wins; otherwise the whole surface. Entering a different Body starts
    // from its own surface rather than inheriting where the reader was on the last one.
    const carried = state.level === 'body' ? state.view : null;
    const same = previous.level === 'body' && previous.bodyId === body.id;
    bodyView = carried
      ? { cx: carried.x, cz: carried.z, span: carried.span }
      : same
        ? bodyView
        : undefined;
    if (!same) {
      loadSurface(body.sourceIndex);
    }
  }
  for (const anchor of roster.querySelectorAll('a')) {
    anchor.setAttribute(
      'aria-current',
      String(anchor.dataset['body'] === body?.id)
    );
  }
  // Read out of the union into a local, or the mutable module-level `state` defeats narrowing.
  const settled = state;
  const pickedId = settled.level === 'body' ? settled.islandId : null;
  renderPanel(
    panel,
    system,
    body,
    pickedId
      ? (catalogue?.islands.find(island => island.id === pickedId) ?? null)
      : null
  );
  if (body) {
    drawBodyRange();
  } else {
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
    anchor.href = atlasHref({
      bodyId: body.id,
      islandId: null,
      level: 'body',
      view: null
    });
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
    go({ bodyId: marker.id, islandId: null, level: 'body', view: null });
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
  camera: () => (fit && view ? { bounds: fit, fit, view } : null),
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

/// The Body Range's own gestures, on the same module: it takes a surface descriptor rather than
/// element ids precisely so a second Range can mount it unchanged.
const bodyControls = mountCamera({
  camera: () => {
    if (!bodyView || !selectedBody()) {
      return null;
    }
    const frame = frameOf(bodyRange);
    return { bounds: bodyBounds(frame), fit: fitBody(frame), view: bodyView };
  },
  element: bodyRange,
  frame: () => {
    const frame = frameOf(bodyRange);
    return {
      aspect: frame.height / Math.max(frame.width, 1),
      height: frame.height,
      width: frame.width
    };
  },
  onPick: (x, y) => {
    const body = selectedBody();
    if (!body || !surface || !bodyView || state.level !== 'body') {
      return;
    }
    const frame = frameOf(bodyRange);
    const aspect = frame.height / Math.max(frame.width, 1);
    // Tested in Body Coordinates rather than in pixels, so a pick is against the recovered ring
    // and not against a rasterised one.
    const point = unproject(
      bodyView,
      x / Math.max(frame.width, 1),
      y / Math.max(frame.height, 1),
      aspect
    );
    const picked = islandAt(surface, bodyView, aspect, point);
    // Picking the sea clears the selection, which is the only way to put the panel back to the
    // Body without leaving it.
    if ((picked?.id ?? null) !== state.islandId) {
      go({
        bodyId: body.id,
        islandId: picked?.id ?? null,
        level: 'body',
        view: { span: bodyView.span, x: bodyView.cx, z: bodyView.cz }
      });
    }
  },
  onView: next => {
    bodyView = next;
    drawBodyRange();
  },
  // A surface that wraps has no edge to reach, so zooming out past it is the way back up.
  onZoomedOut: () => go(SYSTEM_RANGE)
});

const rangeControls = () => (selectedBody() === null ? controls : bodyControls);

node('system-zoom-out').addEventListener('click', () =>
  rangeControls().zoomOut()
);
node('system-zoom-in').addEventListener('click', () =>
  rangeControls().zoomIn()
);
node('system-fit').addEventListener('click', () => rangeControls().fit());

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
new ResizeObserver(drawBodyRange).observe(bodyRange);

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
