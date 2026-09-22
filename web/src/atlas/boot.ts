import { parseCatalogue, type Catalogue } from '../catalogue/data.ts';
import {
  clampView,
  formatUnits,
  gridStep,
  unproject,
  zoomOf,
  type MapPoint,
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
  labelsInBand,
  rangeOf,
  showsRoads,
  type BodyRange
} from './bodyRange.ts';
import { mountCamera, type CameraFrame } from './camera.ts';
import {
  drawBodySurface,
  drawSystemRange,
  frameOf,
  placeLabels,
  placeSurfaceLabels
} from './draw.ts';
import { renderPanel } from './panel.ts';
import { centreReadout, type ReadoutRow } from './readout.ts';
import {
  SYSTEM_RANGE,
  atlasHref,
  readAtlasState,
  type AtlasState
} from './state.ts';
import {
  ROAD_GAP_NOTICE,
  islandAt,
  readBodySurface,
  roadRecovery,
  surfaceAnchor,
  type BodySurface,
  type PlacedLabel,
  type SurfaceLabel,
  type SurfaceLabelKind
} from './surface.ts';
import {
  fitSystem,
  insideSurface,
  markerAt,
  markerView,
  projectSystem,
  showsSurface,
  surfaceWindow,
  systemBounds,
  systemWindow,
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
const systemCentre = node('system-centre');
const bodyCentre = node('body-centre');
const bodyLabelLayer = node('body-labels');

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
/// Which band the Body Range's camera is in, so the panel can describe the layers that band
/// actually draws. Written by `drawBodyRange`, which is what discovers it.
let bodyBand: BodyRange | undefined;
/// The Body whose surface is currently drawn on its disc at the System Range, and its islands.
/// Separate from `surface`, which belongs to the Body Range.
let onDisc: string | undefined;
let discSurface: BodySurface | undefined;
/// Where that Body's surface is centred, in Surface Cells: its islands' own wrap-aware centre.
let discAnchor: MapPoint | undefined;

/// A camera's own centre as a point, which is what a coordinate readout names.
const cellOf = (view: MapView): MapPoint => ({ x: view.cx, z: view.cz });

/// Where the camera's centre is, written into the map's own corner.
const placeCentre = (into: HTMLElement, rows: readonly ReadoutRow[]) => {
  into.replaceChildren();
  for (const row of rows) {
    const label = document.createElement('span');
    label.className = 'centre-label';
    label.textContent = row.label;
    const value = document.createElement('span');
    value.className = row.authored
      ? 'centre-value centre-authored'
      : 'centre-value';
    value.textContent = row.value;
    into.append(label, value);
  }
};

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
                placeId: current.placeId,
                view: { span: bodyView.span, x: bodyView.cx, z: bodyView.cz }
              }
            : {
                bodyId: current.bodyId,
                islandId: current.islandId,
                level: 'body',
                placeId: current.placeId,
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

/// The sidebar panel. Separate from `render` because `drawRange` is what discovers whether a
/// Body's surface is on its disc, and that decides whether the authored-scale note belongs here.
/// The panel is in the sidebar, which scrolls on its own, so writing a long note into it cannot
/// shrink the frame the ResizeObserver has just measured.
const renderSelectionPanel = () => {
  if (!system) {
    return;
  }
  // Read out of the union into a local, or the mutable module-level `state` defeats narrowing.
  const settled = state;
  const pickedId = settled.level === 'body' ? settled.islandId : null;
  const placeId = settled.level === 'body' ? settled.placeId : null;
  const place = placeId
    ? catalogue?.places.find(candidate => candidate.id === placeId)
    : undefined;
  const roads =
    settled.level === 'body' && surface && bodyBand && showsRoads(bodyBand)
      ? {
          lines: surface.roads.reduce(
            (total, road) => total + road.lines.length,
            0
          ),
          networks: surface.roads.length,
          recovery: roadRecovery(surface.roads)
        }
      : null;
  renderPanel(panel, system, selectedBody(), {
    island: pickedId
      ? (catalogue?.islands.find(island => island.id === pickedId) ?? null)
      : null,
    place: place
      ? {
          // The point the map wrote the name at, so the panel and the map cannot disagree
          // about where a Place is.
          at: surface?.labels.find(label => label.id === place.id)?.at ?? null,
          instances: place.instances.flatMap(
            id => catalogue?.instances.filter(value => value.id === id) ?? []
          ),
          place
        }
      : null,
    roads,
    surfaceOnDisc: onDisc
  });
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
  // Re-clamped through `systemBounds`, not the bare fit: a bare fit means the kernel's own
  // ceiling, which would undo the System Range's deeper one on every single draw.
  view = view && !atFit ? clampView(systemBounds(fit), view) : fit;
  projection = projectSystem(system.bodies, view, frame);
  // A single Body close enough to draw its own surface on. The scale relating the surface to the
  // disc is authored; the islands on it are recovered (#437, amending #405).
  const near = projection.markers.find(marker => {
    const body = system!.bodies.find(value => value.id === marker.id);
    return body
      ? showsSurface(marker, body, view!, projection!.unitsPerPixel)
      : false;
  });
  const nearBody = near && system.bodies.find(value => value.id === near.id);
  const wasOnDisc = onDisc;
  if (near && nearBody) {
    if (onDisc !== nearBody.id) {
      onDisc = nearBody.id;
      discSurface = catalogue
        ? readBodySurface(catalogue, nearBody.sourceIndex)
        : undefined;
      discAnchor = discSurface && surfaceAnchor(discSurface);
      // Only now is the Catalogue worth 40 MiB (#435): a reader who never zooms this far in
      // never pays for it.
      loadSurface(nearBody.sourceIndex, () => {
        discSurface = catalogue
          ? readBodySurface(catalogue, nearBody.sourceIndex)
          : undefined;
        discAnchor = discSurface && surfaceAnchor(discSurface);
        drawRange();
      });
    }
  } else {
    onDisc = undefined;
    discSurface = undefined;
    discAnchor = undefined;
  }
  // The authored-scale note appears and goes with the surface it describes.
  if (onDisc !== wasOnDisc) {
    renderSelectionPanel();
  }
  const labels = drawSystemRange(
    canvas,
    projection,
    view,
    frame,
    near && nearBody && discSurface && discAnchor
      ? { anchor: discAnchor, body: nearBody, surface: discSurface }
      : undefined
  );
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
      : ' · discs are markers, not sizes') +
    // The scale relating a surface to a disc is authored, so it is named every time one is
    // drawn rather than explained once in the panel and then left implicit (#437).
    (discSurface && nearBody
      ? ` · ${nearBody.name} surface at an authored scale`
      : '');
  placeCentre(
    systemCentre,
    centreReadout(
      view,
      discSurface && nearBody && discAnchor
        ? {
            authored: true,
            body: nearBody,
            cell: cellOf(surfaceWindow(nearBody, discAnchor, view)),
            kind: 'body',
            surface: discSurface
          }
        : { kind: 'system' }
    )
  );
  const grouped = projection.markers.filter(
    marker => marker.bodyIds.length > 1
  ).length;
  const withheld = labels?.suppressed.length ?? 0;
  // A marker's centre can be off screen while the reader is deep inside that very Body, so a
  // surface on the disc counts as a Body in view. Saying the System is empty here would be
  // plainly wrong.
  const onFrame =
    projection.markers.length -
    (labels?.offscreen.length ?? 0) +
    (discSurface ? 1 : 0);
  status.textContent = onFrame
    ? `${projection.markers.length} markers · ${system.bodies.length} recovered Bodies` +
      (grouped ? ` · ${grouped} group more than one` : '') +
      (discSurface && nearBody
        ? ` · ${discSurface.islands.length} recovered islands drawn on ${nearBody.name} at an authored scale; keep zooming to enter it`
        : '') +
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

const count = (labels: readonly SurfaceLabel[], kind: SurfaceLabelKind) =>
  labels.filter(label => label.kind === kind).length;

/// Where a name on the surface links to: the same Body and camera, with that name picked. A
/// Settlement is carried by an island record, so picking one picks the island the Catalogue can
/// actually show; a Damocles Place is its own record and the panel reaches its Instances.
const labelHref = (label: PlacedLabel): string => {
  const body = selectedBody();
  if (!body) {
    return '/damocles/atlas';
  }
  return atlasHref({
    bodyId: body.id,
    islandId: label.kind === 'settlement' ? label.id : null,
    level: 'body',
    placeId: label.kind === 'place' ? label.id : null,
    view: bodyView
      ? { span: bodyView.span, x: bodyView.cx, z: bodyView.cz }
      : null
  });
};

/// What this band has to say about the Body's roads.
///
/// The gap is stated in the two bands that draw the layer and nowhere else: outward of the
/// Settlement Range a network is a few pixels of smudge, so a notice there would be about
/// something the reader could not have seen either way. A recovered network is still counted
/// outward of it, with where to go to see it, exactly as the Place names are.
const roadNote = (band: BodyRange): string => {
  if (!surface) {
    return '';
  }
  const runs = surface.roads.reduce(
    (total, road) => total + road.lines.length,
    0
  );
  const recovery = roadRecovery(surface.roads);
  if (!showsRoads(band)) {
    return recovery === 'recovered'
      ? ` \u00b7 ${runs} road run${runs === 1 ? '' : 's'}, from the Settlement Range`
      : '';
  }
  if (recovery === 'gap') {
    return ` \u00b7 ${ROAD_GAP_NOTICE}`;
  }
  // Recovered and empty is not a gap: the record was read and it holds no run.
  if (recovery === 'none') {
    return ' \u00b7 no road run is recovered here: this Settlement\u2019s network is empty';
  }
  return (
    ` \u00b7 ${runs} road run${runs === 1 ? '' : 's'} in ` +
    `${surface.roads.length} recovered network${surface.roads.length === 1 ? '' : 's'}`
  );
};

/// Writes nothing to the page but canvas pixels, the name layer and the two readouts, so the
/// ResizeObserver that calls it cannot feed the frame back on itself. The names are absolutely
/// positioned over the map, so they cannot change the frame either.
const drawBodyRange = () => {
  const body = selectedBody();
  if (!body || bodyRange.hidden) {
    return;
  }
  const frame = frameOf(bodyRange);
  bodyView = bodyView ?? fitBody(frame);
  const current = state;
  const band = rangeOf(bodyView, frame.width);
  const picked =
    current.level === 'body' ? (current.placeId ?? current.islandId) : null;
  const shown = labelsInBand(surface?.labels ?? [], band);
  // The band decides which layers are drawn, and the panel describes the layers of the band it
  // is in, so a change of band re-renders it — the same arrangement the authored-scale note has.
  if (bodyBand !== band) {
    bodyBand = band;
    renderSelectionPanel();
  }
  const roads = showsRoads(band) ? (surface?.roads ?? []) : [];
  const layout = drawBodySurface(
    bodyCanvas,
    bodyView,
    frame,
    body.baseColour,
    surface,
    current.level === 'body' ? current.islandId : null,
    { labels: shown, selectedId: picked },
    roads
  );
  placeSurfaceLabels(bodyLabelLayer, layout, picked, labelHref);
  const cells = bodyView.span / Math.max(frame.width, 1);
  scale.textContent =
    `${RANGE_LABEL[band]} · ${formatUnits(cells)} Surface Cells per pixel` +
    ` · grid ${formatUnits(gridStep(bodyView.span, frame.width))} cells`;
  placeCentre(
    bodyCentre,
    centreReadout(bodyView, {
      // Direct here rather than through the authored scale: the Body Range is in Body
      // Coordinates, so its centre needs no conversion and carries no authored mark.
      authored: false,
      body,
      cell: cellOf(bodyView),
      kind: 'body',
      surface
    })
  );
  const surfaceNote = surface
    ? `${surface.islands.length} recovered island${surface.islands.length === 1 ? '' : 's'}` +
      (surface.gaps.length
        ? ` · ${surface.gaps.length} record${surface.gaps.length === 1 ? '' : 's'} carry no coastline and are not drawn`
        : '')
    : 'reading the Catalogue for this Body\u2019s islands';
  // Named separately, because a Settlement and a Damocles Place are recovered from different
  // records and neither is a count of the other.
  const names = surface
    ? ` · ${count(surface.labels, 'settlement')} Settlement name${count(surface.labels, 'settlement') === 1 ? '' : 's'}` +
      ` · ${count(surface.labels, 'place')} Damocles Place${count(surface.labels, 'place') === 1 ? '' : 's'}` +
      // Which names this band is showing, so a reader who can see neither knows to zoom rather
      // than concluding there are none.
      (count(shown, 'place') ? '' : ', from the Settlement Range') +
      (layout.suppressed
        ? ` · ${layout.suppressed} name${layout.suppressed === 1 ? '' : 's'} withheld where they would collide`
        : '')
    : '';
  status.textContent =
    `${body.name} · source slot ${body.sourceIndex} · surface ${SURFACE_SPAN} Surface Cells ` +
    `an axis, wrapping on both · ${surfaceNote}${names}${roadNote(band)}` +
    ' · structure footprints are not drawn yet';
  recordCamera();
};

/// The Catalogue is read once and kept. A failure leaves the sea and the grid drawn, and says so
/// in the status line, rather than blanking a Range that is already telling the reader something.
const loadSurface = (sourceIndex: number, then: () => void) => {
  if (catalogue) {
    then();
    return;
  }
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
    if (catalogue) {
      then();
    }
  });
};

/// The Body Range's islands, once the Catalogue is readable.
const loadBodySurface = (sourceIndex: number) => {
  surface = catalogue ? readBodySurface(catalogue, sourceIndex) : undefined;
  loadSurface(sourceIndex, () => {
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
      loadBodySurface(body.sourceIndex);
    }
  }
  for (const anchor of roster.querySelectorAll('a')) {
    anchor.setAttribute(
      'aria-current',
      String(anchor.dataset['body'] === body?.id)
    );
  }
  renderSelectionPanel();
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
      placeId: null,
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
    go({
      bodyId: marker.id,
      islandId: null,
      level: 'body',
      placeId: null,
      view: null
    });
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

/// The System camera has zoomed past the point where a Body's disc adds anything: the authored
/// surface axis now exceeds the frame, so less than the whole surface is on screen. Hand over to
/// the Body Range on exactly the same window, and the islands stay where they are.
const handOver = (next: MapView): boolean => {
  if (!system || !projection || !onDisc) {
    return false;
  }
  const body = system.bodies.find(value => value.id === onDisc);
  const marker = projection.markers.find(value => value.id === onDisc);
  if (!body || !marker) {
    return false;
  }
  const frame = frameOf(systemRange);
  // Hand over once the frame is wholly inside the Body's authored surface, so nothing appears or
  // vanishes as the Ranges change hands: no disc edge, no space beyond it, and no wrap copies
  // arriving from off screen. Later than filling the frame's shorter side, which still left the
  // rim in view and popped worst on an island near the edge.
  if (!insideSurface(body, next, frame)) {
    return false;
  }
  if (!discAnchor) {
    return false;
  }
  const window = surfaceWindow(body, discAnchor, next);
  bodyView = window;
  go({
    bodyId: body.id,
    islandId: null,
    level: 'body',
    placeId: null,
    view: { span: window.span, x: window.cx, z: window.cz }
  });
  return true;
};

const controls = mountCamera({
  camera: () => (fit && view ? { bounds: systemBounds(fit), fit, view } : null),
  element: systemRange,
  frame: cameraFrame,
  onPick: (x, y) => {
    const marker = projection && markerAt(projection, x, y);
    if (marker) {
      pick(marker);
    }
  },
  onView: next => {
    if (handOver(next)) {
      return;
    }
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
    // Body without leaving it. A press on the map is never a Place: a name takes its own
    // pointer events, so a Place is only ever picked by its label.
    if ((picked?.id ?? null) !== state.islandId || state.placeId) {
      go({
        bodyId: body.id,
        islandId: picked?.id ?? null,
        level: 'body',
        placeId: null,
        view: { span: bodyView.span, x: bodyView.cx, z: bodyView.cz }
      });
    }
  },
  onView: next => {
    bodyView = next;
    drawBodyRange();
  },
  // A surface that wraps has no edge to reach, so zooming out past it is the way back up. The
  // System camera is set to the window the Body camera was on, so the picture matches across the
  // hop exactly as it does on the way in.
  onZoomedOut: () => {
    const body = selectedBody();
    if (!system || !body || !bodyView) {
      go(SYSTEM_RANGE);
      return;
    }
    // The Body Range's own islands give the anchor here: the reader may have arrived by a deep
    // link rather than by zooming, so the disc's anchor may never have been computed.
    const matched = systemWindow(
      body,
      surfaceAnchor(
        surface ?? { gaps: [], islands: [], labels: [], roads: [] }
      ),
      bodyView
    );
    view = matched;
    atFit = false;
    go({
      level: 'system',
      view: { span: matched.span, x: matched.cx, z: matched.cz }
    });
  }
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
