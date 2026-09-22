import {
  gridStep,
  project,
  type MapPoint,
  type MapView
} from '../catalogue/mapView.ts';
import { SURFACE_CELLS } from '../damocles/world.ts';
import type { GammaBody } from '../flyover/documents.ts';
import {
  layOutSurfaceLabels,
  nearestImage,
  wrapImages,
  type BodySurface,
  type PlacedLabel,
  type SurfaceLabel,
  type SurfaceLabelLayout
} from './surface.ts';
import {
  layOutLabels,
  surfacePoint,
  surfaceWindow,
  type SystemFrame,
  type SystemLabels,
  type SystemProjection
} from './system.ts';

/// Canvas 2D for the geometry, a DOM layer for the labels, in the Catalogue placement map's
/// pattern. The canvas carries no text, so labels stay selectable, scale with the reader's type
/// size and never need re-rastering.

/// Mirrors the tokens in `atlas.css`; the canvas cannot read a custom property.
const OUTLINE = '#2d7697';
const GRID = '#28445144';
const LABEL_FONT_SIZE = 11;
const LABEL_FONT = `${LABEL_FONT_SIZE}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
/// Every disc is outlined, because a recovered `baseColour` may be black: DAMOCLES's slot masks
/// to `$000` and would otherwise be an invisible hole in the map.
const OUTLINE_WIDTH = 1;
/// Css pixels between a marker's edge and the ring that says it stands for several Bodies.
const GROUP_RING = 3;
/// The Body Coordinate seam, where the surface wraps. Brighter than the grid because a uniform
/// lattice looks the same everywhere, and a reader panning across the wrap needs to see that
/// they have crossed something rather than that nothing happened.
const SEAM = '#2d769788';
/// The picked island's ring, matching the accent the roster and breadcrumb use for selection.
const SELECTED = '#61c8ff';
const SELECTED_WIDTH = 2;
/// The mark under a name on a Body's surface. A name with nothing under it says roughly where
/// something is; the mark says exactly where, which is the whole of what the Catalogue recovered
/// about a Damocles Place's position.
const MARK = '#cfe6f2';
const PLACE_MARK_RADIUS = 2;
const SETTLEMENT_MARK_RADIUS = 3.5;

export const frameOf = (element: HTMLElement): SystemFrame => {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0
    ? { height: rect.height, width: rect.width }
    : { height: 640, width: 960 };
};

/// Size the canvas to the frame at the device's pixel ratio and hand back a cleared context in
/// css pixel coordinates.
const surfaceOf = (
  canvas: HTMLCanvasElement,
  frame: SystemFrame
): CanvasRenderingContext2D | null => {
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(frame.width * ratio));
  canvas.height = Math.max(1, Math.round(frame.height * ratio));
  canvas.style.width = `${frame.width}px`;
  canvas.style.height = `${frame.height}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, frame.width, frame.height);
  return context;
};

/// A grid anchored on the world origin. Without it a pan across the System's empty middle reads
/// as a frozen canvas rather than as movement.
const drawGrid = (
  context: CanvasRenderingContext2D,
  view: MapView,
  frame: SystemFrame
) => {
  const pixels = (gridStep(view.span, frame.width) / view.span) * frame.width;
  const origin = project(
    view,
    { x: 0, z: 0 },
    frame.height / Math.max(frame.width, 1)
  );
  context.lineWidth = 1;
  context.strokeStyle = GRID;
  context.beginPath();
  const start = (offset: number) => ((offset % pixels) + pixels) % pixels;
  for (let x = start(origin.u * frame.width); x < frame.width; x += pixels) {
    context.moveTo(x, 0);
    context.lineTo(x, frame.height);
  }
  for (let y = start(origin.v * frame.height); y < frame.height; y += pixels) {
    context.moveTo(0, y);
    context.lineTo(frame.width, y);
  }
  context.stroke();
};

/// A Body's surface: sea in the Body's own recovered base colour, every recovered Damocles
/// Island filled in its own land colour with each of its wrap images, and a Surface Cell grid
/// over the top. The grid and the seam sit above the land so the coordinate reference stays
/// readable on it, and the seam is brighter than the grid because a uniform lattice looks
/// identical everywhere.
/// Every wrap image of x = 0 and z = 0 that falls in the frame. A Body Coordinate far apart in
/// number from another may be its neighbour, and this is where that happens.
const drawSeams = (
  context: CanvasRenderingContext2D,
  view: MapView,
  frame: SystemFrame
) => {
  const aspect = frame.height / Math.max(frame.width, 1);
  const halfHeight = (view.span * aspect) / 2;
  context.lineWidth = 1;
  context.strokeStyle = SEAM;
  context.beginPath();
  for (
    let seam =
      Math.floor((view.cx - view.span / 2) / SURFACE_CELLS) * SURFACE_CELLS;
    seam <= view.cx + view.span / 2;
    seam += SURFACE_CELLS
  ) {
    const x = project(view, { x: seam, z: 0 }, aspect).u * frame.width;
    context.moveTo(x, 0);
    context.lineTo(x, frame.height);
  }
  for (
    let seam =
      Math.floor((view.cz - halfHeight) / SURFACE_CELLS) * SURFACE_CELLS;
    seam <= view.cz + halfHeight;
    seam += SURFACE_CELLS
  ) {
    const y = project(view, { x: 0, z: seam }, aspect).v * frame.height;
    context.moveTo(0, y);
    context.lineTo(frame.width, y);
  }
  context.stroke();
};

/// A name's own point, drawn as the map draws a marker: a Damocles Place as a filled dot, a
/// Settlement as a ring, because a Settlement is an area whose name is written at the origin its
/// Structure Workspace is built at rather than a single thing standing there.
const drawLabelMarks = (
  context: CanvasRenderingContext2D,
  layout: SurfaceLabelLayout,
  selectedId: string | null
) => {
  for (const label of layout.placed) {
    const picked = label.id === selectedId;
    context.beginPath();
    context.arc(
      label.x,
      label.y,
      label.kind === 'place' ? PLACE_MARK_RADIUS : SETTLEMENT_MARK_RADIUS,
      0,
      2 * Math.PI
    );
    if (label.kind === 'place') {
      context.fillStyle = picked ? SELECTED : MARK;
      context.fill();
    } else {
      context.lineWidth = picked ? SELECTED_WIDTH : OUTLINE_WIDTH;
      context.strokeStyle = picked ? SELECTED : MARK;
      context.stroke();
    }
  }
};

export const drawBodySurface = (
  canvas: HTMLCanvasElement,
  view: MapView,
  frame: SystemFrame,
  seaColour: string,
  surface: BodySurface | undefined,
  selectedIslandId: string | null,
  /// The names this band shows, already gated by `labelsInBand`, and whichever is picked.
  names: {
    readonly labels: readonly SurfaceLabel[];
    readonly selectedId: string | null;
  } = { labels: [], selectedId: null }
): SurfaceLabelLayout => {
  const context = surfaceOf(canvas, frame);
  if (!context) {
    return { placed: [], suppressed: 0 };
  }
  // The surface has no edge to leave blank: every pixel of the frame is on it, because the
  // camera wraps. So the sea is the whole frame rather than a rectangle within it.
  context.fillStyle = seaColour;
  context.fillRect(0, 0, frame.width, frame.height);
  const aspect = frame.height / Math.max(frame.width, 1);
  for (const island of surface?.islands ?? []) {
    const selected = island.id === selectedIslandId;
    context.fillStyle = island.landColour;
    context.strokeStyle = selected ? SELECTED : OUTLINE;
    context.lineWidth = selected ? SELECTED_WIDTH : OUTLINE_WIDTH;
    for (const image of wrapImages(island.outline, view, aspect)) {
      context.beginPath();
      for (const [index, point] of image.entries()) {
        const { u, v } = project(view, point, aspect);
        const x = u * frame.width,
          y = v * frame.height;
        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      // A coastline is a closed ring, so the fill and the stroke both close it rather than
      // relying on the vertex list repeating its first point.
      context.closePath();
      context.fill();
      context.stroke();
    }
  }
  drawGrid(context, view, frame);
  drawSeams(context, view, frame);
  context.font = LABEL_FONT;
  const layout = layOutSurfaceLabels(names.labels, view, frame, {
    charWidth: context.measureText('M').width,
    lineHeight: LABEL_FONT_SIZE * 1.4
  });
  drawLabelMarks(context, layout, names.selectedId);
  return layout;
};

/// A Body's recovered islands drawn on its own disc, through the authored scale, with the same
/// Surface Cell grid and coordinate seam the Body Range will draw.
///
/// The grid and the seam are the point. Without them the hand-over pops: the System Range's grid
/// is stepped in position units and the Body Range's in Surface Cells, so the lattice would jump
/// spacing and origin at the moment of the switch. Drawing the Body Range's own grid here, from
/// the very same converted camera, means nothing moves when the Ranges change hands.
///
/// Each island is drawn **once**, at the wrap image nearest the surface's anchor, and everything
/// is clipped to the surface square. A disc is a sphere seen from outside, and you cannot see
/// the same island twice on one: wrapped copies belong to the flat torus of the Body Range, and
/// on a disc they only ever showed SNOW ISLAND and KEY WEST twice apiece.
const drawSurfaceOnDisc = (
  context: CanvasRenderingContext2D,
  view: MapView,
  frame: SystemFrame,
  onBody: {
    readonly anchor: MapPoint;
    readonly body: GammaBody;
    readonly surface: BodySurface;
  }
) => {
  const aspect = frame.height / Math.max(frame.width, 1);
  const { anchor, body, surface } = onBody;
  const corner = (x: number, z: number) => {
    const { u, v } = project(
      view,
      surfacePoint(body, anchor, { x, z }),
      aspect
    );
    return { x: u * frame.width, y: v * frame.height };
  };
  const from = corner(
    anchor.x - SURFACE_CELLS / 2,
    anchor.z + SURFACE_CELLS / 2
  );
  const to = corner(anchor.x + SURFACE_CELLS / 2, anchor.z - SURFACE_CELLS / 2);
  context.save();
  context.beginPath();
  context.rect(from.x, from.y, to.x - from.x, to.y - from.y);
  context.clip();
  // The Body Range's own camera over the same pixels, so its grid and seam land identically.
  const asSurface = surfaceWindow(body, anchor, view);
  drawGrid(context, asSurface, frame);
  drawSeams(context, asSurface, frame);
  for (const island of surface.islands) {
    context.fillStyle = island.landColour;
    context.strokeStyle = OUTLINE;
    context.lineWidth = OUTLINE_WIDTH;
    context.beginPath();
    for (const [index, cell] of nearestImage(
      island.outline,
      anchor
    ).entries()) {
      const { u, v } = project(view, surfacePoint(body, anchor, cell), aspect);
      const x = u * frame.width,
        y = v * frame.height;
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.closePath();
    context.fill();
    context.stroke();
  }
  context.restore();
};

export const drawSystemRange = (
  canvas: HTMLCanvasElement,
  projection: SystemProjection,
  view: MapView,
  frame: SystemFrame,
  /// A Body's recovered surface to draw on its own disc, once the camera is close enough. The
  /// scale relating the two is authored; see `unitsPerCell`.
  onBody?: {
    readonly anchor: MapPoint;
    readonly body: GammaBody;
    readonly surface: BodySurface;
  }
): SystemLabels | null => {
  const context = surfaceOf(canvas, frame);
  if (!context) {
    return null;
  }
  drawGrid(context, view, frame);
  for (const marker of projection.markers) {
    context.beginPath();
    context.arc(marker.x, marker.y, marker.radius, 0, 2 * Math.PI);
    context.fillStyle = marker.baseColour;
    context.fill();
    context.lineWidth = OUTLINE_WIDTH;
    context.strokeStyle = OUTLINE;
    context.stroke();
    if (marker.bodyIds.length > 1) {
      // A concentric ring says "more than one Body here" without spending a word on it.
      context.beginPath();
      context.arc(
        marker.x,
        marker.y,
        marker.radius + GROUP_RING,
        0,
        2 * Math.PI
      );
      context.stroke();
    }
    if (onBody && onBody.body.id === marker.id) {
      drawSurfaceOnDisc(context, view, frame, onBody);
    }
  }
  context.font = LABEL_FONT;
  return layOutLabels(projection, frame, {
    charWidth: context.measureText('M').width,
    lineHeight: LABEL_FONT_SIZE * 1.4
  });
};

/// The labels duplicate the roster, which is the keyboard and assistive path, so they are
/// decoration here and take no pointer events.
export const placeLabels = (layer: HTMLElement, labels: SystemLabels): void => {
  layer.replaceChildren();
  for (const label of labels.placed) {
    const span = document.createElement('span');
    span.className = 'system-label';
    span.textContent = label.text;
    span.dataset['body'] = label.id;
    span.style.left = `${label.x.toFixed(2)}px`;
    span.style.top = `${label.y.toFixed(2)}px`;
    layer.append(span);
  }
};

/// The names on a Body's surface, as selectable links rather than as decoration.
///
/// Unlike the System Range's labels these take pointer events: there is no roster of Settlements
/// or Damocles Places, so the name on the map is the only way to reach one, and it has to be
/// reachable by keyboard and readable by assistive technology as well as clickable. `camera.ts`
/// leaves a press that starts on one alone for the same reason.
export const placeSurfaceLabels = (
  layer: HTMLElement,
  layout: SurfaceLabelLayout,
  selectedId: string | null,
  href: (label: PlacedLabel) => string
): void => {
  layer.replaceChildren();
  for (const label of layout.placed) {
    const anchor = document.createElement('a');
    anchor.className = `surface-label surface-${label.kind}`;
    anchor.href = href(label);
    anchor.textContent = label.name;
    anchor.dataset['label'] = label.id;
    anchor.dataset['kind'] = label.kind;
    if (label.id === selectedId) {
      anchor.setAttribute('aria-current', 'true');
    }
    anchor.style.left = `${label.box.x.toFixed(2)}px`;
    anchor.style.top = `${label.box.y.toFixed(2)}px`;
    layer.append(anchor);
  }
};
