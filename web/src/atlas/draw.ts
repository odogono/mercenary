import { gridStep, project, type MapView } from '../catalogue/mapView.ts';
import { SURFACE_CELLS } from '../damocles/world.ts';
import {
  layOutLabels,
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

/// A Body's surface: sea in the Body's own recovered base colour, and a Surface Cell grid with
/// its wrapped copies. Coastlines arrive in #431; until then this is the sea and the seam, and
/// the grid is what makes a pan across the wrap read as movement rather than as a still canvas.
export const drawBodySurface = (
  canvas: HTMLCanvasElement,
  view: MapView,
  frame: SystemFrame,
  seaColour: string
): void => {
  const context = surfaceOf(canvas, frame);
  if (!context) {
    return;
  }
  // The surface has no edge to leave blank: every pixel of the frame is on it, because the
  // camera wraps. So the sea is the whole frame rather than a rectangle within it.
  context.fillStyle = seaColour;
  context.fillRect(0, 0, frame.width, frame.height);
  drawGrid(context, view, frame);
  // Every wrap image of x = 0 and z = 0 that falls in the frame. A Body Coordinate far apart in
  // number from another may be its neighbour, and this is where that happens.
  const aspect = frame.height / Math.max(frame.width, 1);
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
  const halfHeight = (view.span * aspect) / 2;
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

export const drawSystemRange = (
  canvas: HTMLCanvasElement,
  projection: SystemProjection,
  view: MapView,
  frame: SystemFrame
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
