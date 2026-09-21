import {
  clampView,
  clusterAll,
  fitView,
  project,
  type MapPoint,
  type MapView
} from '../catalogue/mapView.ts';
import { bodySize, type GammaBody } from '../flyover/documents.ts';

/// The Atlas System Range: the recovered Gamma System projected onto the X/Z plane through a
/// camera, X right and Z up as the Catalogue placement map draws them. Nothing here touches the
/// DOM and nothing here holds the camera; `boot.ts` owns that and passes it in.
///
/// Two things the recovered numbers force, both of which the map states rather than hides.
///
/// Bodies that would land on top of each other are drawn as one marker. Whole satellite groups
/// sit within 14,000 engine units while the System spans 4.7 million, so at a whole-System
/// camera a group is a one-or-two-pixel pile. The threshold is in css pixels rather than engine
/// units because the recovered separations leave no clean gap in units: within groups the widest
/// separation is 30,735 while the nearest separation between two groups is 16,000
/// (PERSEUS/JASON). A marker is a statement about this drawing at this Range and never about a
/// relationship: no `Primary` is recovered (ADR 0014, `CONTEXT.md`) and this projection discards
/// Y, so nearness here is nearness on screen.
///
/// A Body's size comes from `bodySize`, which decodes the packed binary float in `radiusExtent`
/// (#424). The decoded sizes span 500-fold, so far out they are drawn as markers on an authored
/// scale and close in as the Body itself on the derived one. `SystemMarker.toScale` says which.

export interface SystemFrame {
  readonly height: number;
  readonly width: number;
}

/// Css pixels within which two Bodies are drawn as one marker at the current camera. Measured
/// against the recovered positions: at a 900x600 frame the whole System fits a span of
/// 8,883,000 units, or 9,870 units per pixel, and every gap from 6 to 19 px draws the same ten
/// markers. Below 6 px DIALIS separates from ICARUS (58,807 units, 5.96 px); at 20 px DAMOCLES
/// chains into the GAEA group (193,250 units). 14 px is the middle of that plateau.
const MARKER_GAP = 14;
/// A marker smaller than this is still picked within this many css pixels of its centre, so a
/// one-pixel Body is a reachable target.
const PICK_RADIUS = 9;
/// Widest marker in css pixels, and the narrowest a marker may shrink to.
const WIDEST_MARKER = 11;
const NARROWEST_MARKER = 3;
/// Position units per unit of decoded size. **Derived, not decoded** (ADR 0014): #424 decodes
/// the sizes but not their physical unit, and nothing recovered ties that unit to the positional
/// one. The bound is that no two of the thirty Bodies may overlap, which needs at least 166.4
/// from the tightest pair, ERIS and VESTA at 2,400 units. 256 is the power of two above it and a
/// shift on a 68000. Being a lower bound, a Body may be smaller than drawn and never larger.
const RADIUS_DIVISOR = 256;
/// Css pixels between a marker's edge and its label, and between two placed labels.
const LABEL_GAP = 5;

/// A Body's radius in position units, so a disc can be drawn against the distance scale.
export const bodyRadius = (body: GammaBody): number =>
  bodySize(body) / RADIUS_DIVISOR;

/// A marker's size, for when a Body is too small to draw at its own radius. Authored, and about
/// symbols rather than Bodies: the decoded sizes span 500-fold, so drawn in proportion the
/// smallest moon would be a fiftieth of a pixel beside DIALIS. The cube root compresses that to
/// a legible spread while keeping the order, as a star atlas does with magnitudes.
const markerRadius = (body: GammaBody, widest: number): number =>
  Math.min(
    WIDEST_MARKER,
    Math.max(
      NARROWEST_MARKER,
      WIDEST_MARKER * (bodySize(body) / Math.max(widest, 1)) ** (1 / 3)
    )
  );

export interface SystemMarker {
  readonly baseColour: string;
  /// Every recovered Body this marker stands for, in source order. One entry is one Body.
  readonly bodyIds: readonly string[];
  /// The marker's identity: the id of the Body whose name and size it wears.
  readonly id: string;
  readonly name: string;
  /// Css pixels: the Body's own derived radius once that covers more than its marker, and an
  /// authored marker size before then.
  readonly radius: number;
  /// True when `radius` is the Body's derived radius rather than a marker, so the map can say
  /// whether what is on screen is a size or a symbol.
  readonly toScale: boolean;
  /// The named Body's own recovered position, so a marker never sits on a centroid no Body
  /// occupies.
  readonly world: MapPoint;
  readonly x: number;
  readonly y: number;
}

export interface SystemProjection {
  /// Widest first, so a small marker is never buried under a large one it overlaps.
  readonly markers: readonly SystemMarker[];
  /// Position units per css pixel at this camera, so a view can state its own scale.
  readonly unitsPerPixel: number;
}

const pointOf = (body: GammaBody): MapPoint => ({
  x: body.position.x,
  z: body.position.z
});

const aspectOf = (frame: SystemFrame): number =>
  frame.height / Math.max(frame.width, 1);

/// The camera that shows the whole recovered System in this frame. `fitView`'s own padding
/// leaves the outermost marker a fifth of the span to put a label in, so no pixel margin is
/// added on top: one measured in pixels would move the marker partition with the frame width.
export const fitSystem = (
  bodies: readonly GammaBody[],
  frame: SystemFrame
): MapView =>
  bodies.length
    ? fitView(bodies.map(pointOf), aspectOf(frame))
    : { cx: 0, cz: 0, span: 1 };

export const projectSystem = (
  bodies: readonly GammaBody[],
  view: MapView,
  frame: SystemFrame
): SystemProjection => {
  const unitsPerPixel = view.span / Math.max(frame.width, 1);
  if (!bodies.length) {
    return { markers: [], unitsPerPixel };
  }
  const aspect = aspectOf(frame);
  const widest = Math.max(...bodies.map(bodySize));
  // A flat threshold serves every camera. Markers are bounded by WIDEST_MARKER, and two Bodies
  // drawn at their derived radii cannot intersect, because non-overlap is the bound
  // RADIUS_DIVISOR was chosen to satisfy.
  const markers = clusterAll(
    bodies.map(pointOf),
    MARKER_GAP * unitsPerPixel
  ).map(members => {
    // The largest decoded size wears the marker's name, the rule `layOutLabels` already uses to
    // choose between colliding labels. Ties go to the lower source slot, so the choice is the
    // same on every draw.
    const named = members.reduce((best, index) => {
      const a = bodies[index]!,
        b = bodies[best]!;
      return bodySize(a) > bodySize(b) ||
        (bodySize(a) === bodySize(b) && a.sourceIndex < b.sourceIndex)
        ? index
        : best;
    }, members[0]!);
    const body = bodies[named]!;
    const { u, v } = project(view, pointOf(body), aspect);
    const marker = markerRadius(body, widest);
    const derived = bodyRadius(body) / unitsPerPixel;
    return {
      baseColour: body.baseColour,
      bodyIds: members.map(index => bodies[index]!.id),
      id: body.id,
      name: body.name,
      radius: Math.max(marker, derived),
      toScale: derived > marker,
      world: pointOf(body),
      x: u * frame.width,
      y: v * frame.height
    };
  });
  return {
    markers: [...markers].sort((a, b) => b.radius - a.radius),
    unitsPerPixel
  };
};

/// The camera that opens a marker standing for several Bodies: its members fitted to the frame,
/// which always separates them by more than MARKER_GAP and so always splits the marker.
export const markerView = (
  marker: SystemMarker,
  bodies: readonly GammaBody[],
  fit: MapView,
  frame: SystemFrame
): MapView =>
  clampView(
    fit,
    fitView(
      bodies.filter(body => marker.bodyIds.includes(body.id)).map(pointOf),
      aspectOf(frame)
    )
  );

/// The marker under a pointer: the nearest centre among those whose own circle covers the point.
/// Nearest rather than topmost, because markers of very different sizes still overlap when their
/// centres are only MARKER_GAP apart.
export const markerAt = (
  projection: SystemProjection,
  x: number,
  y: number
): SystemMarker | null => {
  let found: SystemMarker | null = null;
  let best = Infinity;
  for (const marker of projection.markers) {
    const distance = Math.hypot(marker.x - x, marker.y - y);
    if (distance <= Math.max(marker.radius, PICK_RADIUS) && distance < best) {
      best = distance;
      found = marker;
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
  /// The marker's centre is outside the frame, so there was nothing to label. Distinct from
  /// `suppressed`: a camera leaves most of the System off screen, and calling those names
  /// withheld would be untrue.
  readonly offscreen: readonly string[];
  readonly placed: readonly SystemLabel[];
  /// Markers on screen whose label would have collided. They stay reachable through the roster,
  /// and zooming in makes room.
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

const discBox = (marker: SystemMarker): Box => ({
  height: 2 * marker.radius,
  width: 2 * marker.radius,
  x: marker.x - marker.radius,
  y: marker.y - marker.radius
});

/// A marker standing for more than one Body says so as a count. Deliberately a count and not
/// "ERIS system" or "ERIS and its moons", neither of which the payload establishes.
export const labelOf = (marker: SystemMarker): string =>
  marker.bodyIds.length > 1
    ? `${marker.name} +${marker.bodyIds.length - 1}`
    : marker.name;

/// Lay a label beside every marker with room for one, biggest first so the largest decoded size
/// in a group keeps its name. A label may sit against its own disc but never across another, so
/// a name is never mistaken for the Body it happens to cover. Beside is tried first, then above,
/// below and the other side: with beside alone only six of the ten markers at the fit camera can
/// be named, and with the fallbacks nine. Pure — text is measured from the caller's monospace
/// metrics rather than from the document.
export const layOutLabels = (
  projection: SystemProjection,
  frame: SystemFrame,
  metrics: LabelMetrics
): SystemLabels => {
  const order = projection.markers
    .map((marker, index) => ({ index, marker }))
    .sort((a, b) => b.marker.radius - a.marker.radius || a.index - b.index);
  const placed: SystemLabel[] = [];
  const labelBoxes: Box[] = [];
  const offscreen: string[] = [];
  const suppressed: string[] = [];
  for (const { marker } of order) {
    if (
      marker.x < 0 ||
      marker.y < 0 ||
      marker.x > frame.width ||
      marker.y > frame.height
    ) {
      offscreen.push(marker.id);
      continue;
    }
    const text = labelOf(marker);
    const width = text.length * metrics.charWidth;
    const height = metrics.lineHeight;
    const beside = marker.y - height / 2;
    const right = marker.x + marker.radius + LABEL_GAP;
    const left = marker.x - marker.radius - LABEL_GAP - width;
    const outward = right + width <= frame.width ? right : left;
    const inward = right + width <= frame.width ? left : right;
    const box = (
      [
        { height, width, x: outward, y: beside },
        {
          height,
          width,
          x: marker.x - width / 2,
          y: marker.y - marker.radius - LABEL_GAP - height
        },
        {
          height,
          width,
          x: marker.x - width / 2,
          y: marker.y + marker.radius + LABEL_GAP
        },
        { height, width, x: inward, y: beside }
      ] as const
    ).find(
      candidate =>
        candidate.x >= 0 &&
        candidate.y >= 0 &&
        candidate.x + width <= frame.width &&
        candidate.y + height <= frame.height &&
        !labelBoxes.some(other => overlaps(candidate, other, LABEL_GAP)) &&
        !projection.markers.some(
          other =>
            other.id !== marker.id && overlaps(candidate, discBox(other), 0)
        )
    );
    if (!box) {
      suppressed.push(marker.id);
      continue;
    }
    labelBoxes.push(box);
    placed.push({ id: marker.id, text, x: box.x, y: box.y });
  }
  return { offscreen, placed, suppressed };
};
