import {
  clampView,
  clusterAll,
  fitView,
  project,
  type MapPoint,
  type MapView
} from '../catalogue/mapView.ts';
import type { GammaBody } from '../flyover/documents.ts';
import type { LabelTarget, SystemFrame } from './system.ts';

/// PROTOTYPE (not production; reachable only behind `?camera=1`).
///
/// The System Range with a camera instead of a fixed fit, and with Bodies that would land on
/// top of each other drawn as one marker. It answers one question: does the Atlas read better
/// as a pannable, zoomable map of ten markers than as a static picture of thirty overlapping
/// discs? See `docs/research/atlas-system-camera-prototype.md`.
///
/// It sits beside `system.ts` rather than replacing it so the landed static Range and its tests
/// stay exactly as #410 left them and the two can be compared side by side.
///
/// What a marker does NOT say: nothing here establishes a Primary. The payload records no type
/// and no parent (ADR 0014), and this projection discards Y, so two Bodies being near each
/// other on screen is a fact about this drawing at this Range and not a relationship.

/// Css pixels within which two Bodies are drawn as one marker at the current camera.
///
/// The threshold has to be in pixels rather than engine units, because the recovered numbers
/// leave no clean gap: within satellite groups the widest separation is 30,735 units while the
/// nearest separation between two groups is 16,000 (PERSEUS/JASON), so no unit threshold both
/// groups the satellites and keeps the groups apart. In pixels there is a wide plateau. At a
/// 900x600 frame the whole System fits a span of 8,883,000 units, or 9,870 units per pixel, and
/// every gap from 10 to 18 px draws the same ten markers; 6 px separates DIALIS from ICARUS,
/// and 19.6 px chains DAMOCLES into the GAEA group. 14 px is the middle of that plateau.
///
/// Measuring in pixels also makes a marker dissolve exactly when its members are far enough
/// apart to be told apart, which needs no thresholds per Range and no state per marker.
const MARKER_GAP = 14;
/// A marker smaller than this is still picked within this many css pixels of its centre, so a
/// one-pixel Body is a reachable target.
const PICK_RADIUS = 9;
/// `radiusExtent` is a **packed binary float**, not the integer it looks like: the low word is
/// a mantissa normalised into `[0x1000, 0x2000)`, so an implicit 1 at bit 12, and the high word
/// is a binary exponent. `bodySize` below decodes it.
///
/// Decoded, not derived. Four things agree:
///
/// - Every one of the thirty recovered mantissas lies in `[0x1000, 0x2000)`, across only 11
///   distinct values. Nothing normalises an integer field by accident.
/// - The antilog table at `$60000` emits exactly that form, `4096 * 2^(i/4096)`, so its outputs
///   land in 4096..8191. That is why `$052EBC` indexes it with `d1.w`, the mantissa alone.
/// - The star, DIALIS, becomes the largest object in the System at 5,120,000, and in every
///   satellite group the Body the structural reading calls the Primary outranks its satellites
///   (`docs/research/damocles-gamma-system.md`). Read as an integer none of that holds.
/// - Decoded, ERIS is 3.33 times VESTA. Measured off a captured game frame of the ERIS group,
///   where the two are at nearly equal range, ERIS draws 3.24 times VESTA. A 2.8% agreement
///   with a number the decode did not see.
///
/// Read as an integer the whole System spans 1.69x, which is why an earlier pass of this
/// prototype drew every Body nearly the same size. Decoded it spans 500x.
export const bodySize = (body: GammaBody): number =>
  ((body.radiusExtent & 0xff_ff) / 0x10_00) * 2 ** (body.radiusExtent >>> 16);

/// Position units per unit of decoded size. **Derived, not decoded** (ADR 0014): the decode
/// gives sizes in their own unit, and nothing recovered yet ties that unit to the positional
/// one. The bound is that no two of the thirty Bodies may overlap, which needs at least 166.4
/// from the tightest pair, ERIS and VESTA at 2,400 units. 256 is the power of two above it and
/// a shift on a 68000. It is a lower bound, so a Body may be smaller than drawn, never larger.
const RADIUS_DIVISOR = 256;

/// A Body's radius in position units, so a disc can be drawn against the distance scale.
export const bodyRadius = (body: GammaBody): number =>
  bodySize(body) / RADIUS_DIVISOR;

/// Widest marker in css pixels, and the narrowest a marker is allowed to shrink to.
const WIDEST_MARKER = 11;
const NARROWEST_MARKER = 3;

/// A marker's size, for when a Body is too small to draw at its own radius. Authored, and about
/// symbols rather than Bodies: the decoded sizes span 500x, so drawn in proportion the smallest
/// moon would be a fiftieth of a pixel beside DIALIS. The cube root compresses that to a legible
/// spread while keeping the order, as a star atlas does with magnitudes.
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
  /// The marker's identity: the id of the Body whose name and extent it wears.
  readonly id: string;
  readonly name: string;
  /// Css pixels: the Body's own derived radius once that covers more than its marker, and a
  /// marker before then.
  readonly radius: number;
  /// True when `radius` is this Body's derived radius rather than a marker, so the map can say
  /// whether what is on screen is a size or a symbol.
  readonly toScale: boolean;
  /// The named Body's own recovered position, so a marker never sits on a centroid no Body
  /// occupies.
  readonly world: MapPoint;
  readonly x: number;
  readonly y: number;
}

export interface MarkerProjection {
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

/// The camera that shows the whole recovered System in this frame.
export const fitSystem = (
  bodies: readonly GammaBody[],
  frame: SystemFrame
): MapView =>
  bodies.length
    ? fitView(bodies.map(pointOf), aspectOf(frame))
    : { cx: 0, cz: 0, span: 1 };

export const projectSystemAt = (
  bodies: readonly GammaBody[],
  view: MapView,
  frame: SystemFrame,
  /// When set, a Body whose derived radius covers more than its marker draws at that radius
  /// instead, so a disc becomes the Body itself once the camera is close enough to show it.
  toScale = true
): MarkerProjection => {
  const unitsPerPixel = view.span / Math.max(frame.width, 1);
  if (!bodies.length) {
    return { markers: [], unitsPerPixel };
  }
  const aspect = aspectOf(frame);
  const widest = Math.max(...bodies.map(bodySize));
  // A flat threshold is enough at every camera. Markers are bounded by WIDEST_MARKER, and two
  // Bodies drawn at their derived radii cannot intersect, because non-overlap is the bound
  // RADIUS_DIVISOR was chosen to satisfy.
  const markers = clusterAll(
    bodies.map(pointOf),
    MARKER_GAP * unitsPerPixel
  ).map(members => {
    // The largest decoded size wears the marker's name, which is the rule `layOutLabels`
    // already uses to choose between colliding labels. Ties go to the lower source slot so the
    // choice is the same on every draw.
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
    const derived = toScale ? bodyRadius(body) / unitsPerPixel : 0;
    return {
      baseColour: body.baseColour,
      bodyIds: members.map(index => bodies[index]!.id),
      id: body.id,
      name: body.name,
      // A marker until the Body is genuinely wider than its marker, then the Body itself.
      // Nothing is invented and nothing is compressed: the growth is the derived radius
      // arriving.
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

/// The marker under a pointer: the nearest centre among those whose own circle covers the
/// point, as the static Range does, because markers of very different extents still overlap
/// when their centres are only MARKER_GAP apart.
export const markerAt = (
  projection: MarkerProjection,
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

/// A marker standing for more than one Body says so as a count. Deliberately a count and not
/// "ERIS system" or "ERIS and its moons", neither of which the payload establishes.
export const markerLabels = (
  projection: MarkerProjection
): readonly LabelTarget[] =>
  projection.markers.map(marker => ({
    id: marker.id,
    radius: marker.radius,
    text:
      marker.bodyIds.length > 1
        ? `${marker.name} +${marker.bodyIds.length - 1}`
        : marker.name,
    x: marker.x,
    y: marker.y
  }));
