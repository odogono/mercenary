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
export const LARGEST_DISC = 11;
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
  /// Whatever the label stood for has its centre outside the frame, so there was nothing to
  /// label here. Distinct from `suppressed`: a camera leaves most of the System off screen,
  /// and calling those names withheld would be untrue.
  readonly offscreen: readonly string[];
  readonly placed: readonly SystemLabel[];
  /// Bodies whose label would have collided. They stay reachable through the roster, which is
  /// the honest outcome: these groups really are a few hundred pixels-worth of unit apart.
  readonly suppressed: readonly string[];
}

/// What a label is laid out against: a disc's identity, the text it wears and its circle.
/// Taking this rather than a `SystemProjection` lets the camera-driven prototype
/// (`systemCamera.ts`) share one layout rule with the static Range.
export interface LabelTarget {
  readonly id: string;
  readonly radius: number;
  readonly text: string;
  readonly x: number;
  readonly y: number;
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

const discBox = (disc: {
  readonly radius: number;
  readonly x: number;
  readonly y: number;
}): Box => ({
  height: 2 * disc.radius,
  width: 2 * disc.radius,
  x: disc.x - disc.radius,
  y: disc.y - disc.radius
});

/// Lay a roster label beside every disc that has room for one, biggest Body first so the
/// widest recovered extent in a group keeps its name. A label may sit against its own disc but
/// never across another one, so a name is never mistaken for the Body it happens to cover.
/// Pure: text is measured from the caller's monospace metrics rather than from the document.
/// `fallbackSides` is the camera prototype's option: when the label beside a disc will not fit,
/// try above it, below it, and then its other side before withholding the name. The static
/// Range leaves it off, so its layout is exactly what #410 landed.
export const layOutLabels = (
  targets: readonly LabelTarget[],
  frame: SystemFrame,
  metrics: LabelMetrics,
  fallbackSides = false
): SystemLabels => {
  const order = targets
    .map((disc, index) => ({ disc, index }))
    .sort((a, b) => b.disc.radius - a.disc.radius || a.index - b.index);
  const placed: SystemLabel[] = [];
  const labelBoxes: Box[] = [];
  const offscreen: string[] = [];
  const suppressed: string[] = [];
  for (const { disc } of order) {
    if (
      disc.x < 0 ||
      disc.y < 0 ||
      disc.x > frame.width ||
      disc.y > frame.height
    ) {
      offscreen.push(disc.id);
      continue;
    }
    const width = disc.text.length * metrics.charWidth;
    const height = metrics.lineHeight;
    const beside = disc.y - height / 2;
    const right = disc.x + disc.radius + LABEL_GAP;
    const left = disc.x - disc.radius - LABEL_GAP - width;
    const candidates: Box[] = [
      {
        height,
        width,
        x: right + width <= frame.width ? right : left,
        y: beside
      }
    ];
    if (fallbackSides) {
      candidates.push(
        {
          height,
          width,
          x: disc.x - width / 2,
          y: disc.y - disc.radius - LABEL_GAP - height
        },
        {
          height,
          width,
          x: disc.x - width / 2,
          y: disc.y + disc.radius + LABEL_GAP
        },
        {
          height,
          width,
          x: right + width <= frame.width ? left : right,
          y: beside
        }
      );
    }
    const box = candidates.find(
      candidate =>
        candidate.x >= 0 &&
        candidate.y >= 0 &&
        candidate.x + width <= frame.width &&
        candidate.y + height <= frame.height &&
        !labelBoxes.some(other => overlaps(candidate, other, LABEL_GAP)) &&
        !targets.some(
          other =>
            other.id !== disc.id && overlaps(candidate, discBox(other), 0)
        )
    );
    if (!box) {
      suppressed.push(disc.id);
      continue;
    }
    labelBoxes.push(box);
    placed.push({ id: disc.id, text: disc.text, x: box.x, y: box.y });
  }
  return { offscreen, placed, suppressed };
};
