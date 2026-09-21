import {
  clampView,
  clusterAll,
  fitView,
  project,
  type MapPoint,
  type MapView
} from '../catalogue/mapView.ts';
import type { GammaBody } from '../flyover/documents.ts';
import { LARGEST_DISC, type LabelTarget, type SystemFrame } from './system.ts';

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

export interface SystemMarker {
  readonly baseColour: string;
  /// Every recovered Body this marker stands for, in source order. One entry is one Body.
  readonly bodyIds: readonly string[];
  /// The marker's identity: the id of the Body whose name and extent it wears.
  readonly id: string;
  readonly name: string;
  /// Css pixels, from `radiusExtent` relative to the widest extent in the whole System and
  /// never to the position scale, so a marker is the same size at every Range.
  readonly radius: number;
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
  frame: SystemFrame
): MarkerProjection => {
  const unitsPerPixel = view.span / Math.max(frame.width, 1);
  if (!bodies.length) {
    return { markers: [], unitsPerPixel };
  }
  const aspect = aspectOf(frame);
  const widestExtent = Math.max(...bodies.map(body => body.radiusExtent));
  const markers = clusterAll(
    bodies.map(pointOf),
    MARKER_GAP * unitsPerPixel
  ).map(members => {
    // The widest recovered extent wears the marker's name, which is the rule `layOutLabels`
    // already uses to choose between colliding labels. Ties go to the lower source slot so the
    // choice is the same on every draw.
    const named = members.reduce((best, index) => {
      const a = bodies[index]!,
        b = bodies[best]!;
      return a.radiusExtent > b.radiusExtent ||
        (a.radiusExtent === b.radiusExtent && a.sourceIndex < b.sourceIndex)
        ? index
        : best;
    }, members[0]!);
    const body = bodies[named]!;
    const { u, v } = project(view, pointOf(body), aspect);
    return {
      baseColour: body.baseColour,
      bodyIds: members.map(index => bodies[index]!.id),
      id: body.id,
      name: body.name,
      radius: Math.max(
        1,
        (LARGEST_DISC * body.radiusExtent) / Math.max(widestExtent, 1)
      ),
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
