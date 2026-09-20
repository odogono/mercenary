import {
  layOutLabels,
  type SystemFrame,
  type SystemLabels,
  type SystemProjection
} from './system.ts';

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

export const frameOf = (element: HTMLElement): SystemFrame => {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0
    ? { height: rect.height, width: rect.width }
    : { height: 640, width: 960 };
};

export const drawSystemRange = (
  canvas: HTMLCanvasElement,
  projection: SystemProjection,
  frame: SystemFrame
): SystemLabels | null => {
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
