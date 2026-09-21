import { gridStep, project, type MapView } from '../catalogue/mapView.ts';
import {
  layOutLabels,
  type SystemFrame,
  type SystemLabels,
  type SystemProjection
} from './system.ts';
import { markerLabels, type MarkerProjection } from './systemCamera.ts';

/// Canvas 2D for the discs, a DOM layer for the labels, in the Catalogue placement map's
/// pattern (`web/src/catalogue/map.ts`). The canvas carries no text, so the labels stay
/// selectable, scale with the reader's type size, and never need re-rastering.

/// Mirrors the tokens in `atlas.css`; the canvas cannot read a custom property.
const OUTLINE = '#2d7697';
const LABEL_FONT_SIZE = 11;
const LABEL_FONT = `${LABEL_FONT_SIZE}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
/// Every disc is outlined, because a recovered `baseColour` may be black: DAMOCLES's slot
/// masks to `$000` and would otherwise be an invisible hole in the map.
const OUTLINE_WIDTH = 1;
/// The Catalogue placement map's grid colour, drawn only by the camera prototype.
const GRID = '#28445144';
const GRID_WIDTH = 1;
/// Css pixels between a marker's edge and the ring that says it stands for several Bodies.
const GROUP_RING = 3;

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

export const drawSystemRange = (
  canvas: HTMLCanvasElement,
  projection: SystemProjection,
  frame: SystemFrame
): SystemLabels | null => {
  const context = surfaceOf(canvas, frame);
  if (!context) {
    return null;
  }
  for (const disc of projection.discs) {
    context.beginPath();
    context.arc(disc.x, disc.y, disc.radius, 0, 2 * Math.PI);
    context.fillStyle = disc.baseColour;
    context.fill();
    context.lineWidth = OUTLINE_WIDTH;
    context.strokeStyle = OUTLINE;
    context.stroke();
  }
  context.font = LABEL_FONT;
  return layOutLabels(
    projection.discs.map(disc => ({ ...disc, text: disc.name })),
    frame,
    {
      charWidth: context.measureText('M').width,
      lineHeight: LABEL_FONT_SIZE * 1.4
    }
  );
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

/// PROTOTYPE (not production; reachable only behind `?camera=1`). The camera-driven Range:
/// `drawSystemRange` above with a grid under it, and a ring around any marker that stands for
/// more than one Body. The grid is what makes a pan over near-empty space read as movement
/// rather than as a frozen canvas.
export const drawMarkerRange = (
  canvas: HTMLCanvasElement,
  projection: MarkerProjection,
  view: MapView,
  frame: SystemFrame
): SystemLabels | null => {
  const context = surfaceOf(canvas, frame);
  if (!context) {
    return null;
  }
  const aspect = frame.height / Math.max(frame.width, 1);
  const step = gridStep(view.span, frame.width);
  const pixels = (step / view.span) * frame.width;
  const origin = project(view, { x: 0, z: 0 }, aspect);
  context.lineWidth = GRID_WIDTH;
  context.strokeStyle = GRID;
  context.beginPath();
  for (
    let x = (((origin.u * frame.width) % pixels) + pixels) % pixels;
    x < frame.width;
    x += pixels
  ) {
    context.moveTo(x, 0);
    context.lineTo(x, frame.height);
  }
  for (
    let y = (((origin.v * frame.height) % pixels) + pixels) % pixels;
    y < frame.height;
    y += pixels
  ) {
    context.moveTo(0, y);
    context.lineTo(frame.width, y);
  }
  context.stroke();
  for (const marker of projection.markers) {
    context.beginPath();
    context.arc(marker.x, marker.y, marker.radius, 0, 2 * Math.PI);
    context.fillStyle = marker.baseColour;
    context.fill();
    context.lineWidth = OUTLINE_WIDTH;
    context.strokeStyle = OUTLINE;
    context.stroke();
    if (marker.bodyIds.length > 1) {
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
  return layOutLabels(
    markerLabels(projection),
    frame,
    {
      charWidth: context.measureText('M').width,
      lineHeight: LABEL_FONT_SIZE * 1.4
    },
    true
  );
};
