import type { GammaBody } from '../flyover/documents.ts';

/// The Atlas System Range: a flat static orthographic projection of the recovered Gamma System
/// onto the X/Z plane, with X running right and Z running up as the Catalogue placement map
/// draws them (`web/src/catalogue/mapView.ts`). Nothing here touches the DOM.
///
/// Positions and `radiusExtent` are both raw engine units, but they cannot share one scale.
/// The recovered extents are around 10^6 units while whole groups of Bodies sit within 10^4
/// units of each other, so discs drawn to positional scale would swallow the System whole.
/// Extents therefore size a disc only *relative to the other discs*, which is the one thing
/// the recovered numbers support while the radius/extent encoding stays unresolved
/// (`payload/damocles/system.json` coverage notes). The map states that where it is drawn.

export interface SystemFrame {
  readonly height: number;
  readonly width: number;
}

export interface SystemDisc {
  readonly baseColour: string;
  readonly id: string;
  readonly name: string;
  /// Css pixels, proportional to `radiusExtent` and not to the position scale.
  readonly radius: number;
  readonly x: number;
  readonly y: number;
}

export interface SystemProjection {
  readonly discs: readonly SystemDisc[];
  /// Position units per css pixel, so a view can state its own scale.
  readonly unitsPerPixel: number;
}

/// Css pixels kept clear around the outermost disc, so a label has somewhere to sit.
const MARGIN = 32;
/// The widest recovered extent draws this big; every other disc keeps its recovered ratio.
const LARGEST_DISC = 11;
/// Css pixels between a disc's edge and its label, and between two placed labels.
const LABEL_GAP = 5;

export const projectSystem = (
  bodies: readonly GammaBody[],
  frame: SystemFrame
): SystemProjection => {
  if (!bodies.length) {
    return { discs: [], unitsPerPixel: 1 };
  }
  const xs = bodies.map(body => body.position.x);
  const zs = bodies.map(body => body.position.z);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs);
  const inset = MARGIN + LARGEST_DISC;
  const usableWidth = Math.max(frame.width - 2 * inset, 1);
  const usableHeight = Math.max(frame.height - 2 * inset, 1);
  const unitsPerPixel = Math.max(
    (maxX - minX) / usableWidth,
    (maxZ - minZ) / usableHeight,
    Number.MIN_VALUE
  );
  const centreX = (minX + maxX) / 2,
    centreZ = (minZ + maxZ) / 2;
  const widestExtent = Math.max(...bodies.map(body => body.radiusExtent));
  return {
    discs: bodies.map(body => ({
      baseColour: body.baseColour,
      id: body.id,
      name: body.name,
      radius: Math.max(
        1,
        (LARGEST_DISC * body.radiusExtent) / Math.max(widestExtent, 1)
      ),
      x: frame.width / 2 + (body.position.x - centreX) / unitsPerPixel,
      y: frame.height / 2 - (body.position.z - centreZ) / unitsPerPixel
    })),
    unitsPerPixel
  };
};

/// The Body under a pointer: the nearest disc centre among those whose own radius covers the
/// point. Nearest rather than topmost, because a satellite group projects to a stack of discs
/// a few pixels across and the small disc inside the pile is the one being aimed at.
export const bodyAt = (
  projection: SystemProjection,
  x: number,
  y: number
): string | null => {
  let found: string | null = null;
  let best = Infinity;
  for (const disc of projection.discs) {
    const distance = Math.hypot(disc.x - x, disc.y - y);
    if (distance <= disc.radius && distance < best) {
      best = distance;
      found = disc.id;
    }
  }
  return found;
};

export interface SystemLabel {
  readonly id: string;
  readonly text: string;
  /// Css pixels of the label box's top-left corner within the frame.
  readonly x: number;
  readonly y: number;
}

export interface SystemLabels {
  readonly placed: readonly SystemLabel[];
  /// Bodies whose label would have collided. They stay reachable through the roster, which is
  /// the honest outcome: these groups really are a few hundred pixels-worth of unit apart.
  readonly suppressed: readonly string[];
}

export interface LabelMetrics {
  readonly charWidth: number;
  readonly lineHeight: number;
}

interface Box {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

const overlaps = (a: Box, b: Box, gap: number): boolean =>
  a.x < b.x + b.width + gap &&
  b.x < a.x + a.width + gap &&
  a.y < b.y + b.height + gap &&
  b.y < a.y + a.height + gap;

const discBox = (disc: SystemDisc): Box => ({
  height: 2 * disc.radius,
  width: 2 * disc.radius,
  x: disc.x - disc.radius,
  y: disc.y - disc.radius
});

/// Lay a roster label beside every disc that has room for one, biggest Body first so the
/// widest recovered extent in a group keeps its name. A label may sit against its own disc but
/// never across another one, so a name is never mistaken for the Body it happens to cover.
/// Pure: text is measured from the caller's monospace metrics rather than from the document.
export const layOutLabels = (
  projection: SystemProjection,
  frame: SystemFrame,
  metrics: LabelMetrics
): SystemLabels => {
  const order = projection.discs
    .map((disc, index) => ({ disc, index }))
    .sort((a, b) => b.disc.radius - a.disc.radius || a.index - b.index);
  const placed: SystemLabel[] = [];
  const labelBoxes: Box[] = [];
  const suppressed: string[] = [];
  for (const { disc } of order) {
    const width = disc.name.length * metrics.charWidth;
    const height = metrics.lineHeight;
    const y = disc.y - height / 2;
    const right = disc.x + disc.radius + LABEL_GAP;
    const left = disc.x - disc.radius - LABEL_GAP - width;
    const x = right + width <= frame.width ? right : left;
    const box = { height, width, x, y };
    if (
      x < 0 ||
      y < 0 ||
      x + width > frame.width ||
      y + height > frame.height ||
      labelBoxes.some(other => overlaps(box, other, LABEL_GAP)) ||
      projection.discs.some(
        other => other.id !== disc.id && overlaps(box, discBox(other), 0)
      )
    ) {
      suppressed.push(disc.id);
      continue;
    }
    labelBoxes.push(box);
    placed.push({ id: disc.id, text: disc.name, x, y });
  }
  return { placed, suppressed };
};
