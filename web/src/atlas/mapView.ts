/// Pure view arithmetic for every Atlas camera. A view is the world-space window a Range shows:
/// its centre and the span, in that Range's own units, across the map's full width. Nothing here
/// touches the DOM.
///
/// The kernel predates the Atlas: it was written for the Catalogue's per-body marker map, which
/// the Atlas has since absorbed (#415). It lives here because the Atlas is now its only caller,
/// and it stays free of Ranges, Bodies and elements so both of the Atlas's cameras — engine
/// units across the System, Surface Cells across a torus — can be built out of it.

export type MapPoint = { readonly x: number; readonly z: number };
export type MapView = {
  readonly cx: number;
  readonly cz: number;
  readonly span: number;
};

// A fit leaves a margin: what is fitted occupies the middle 80%.
const FIT_PADDING = 1.25;
export const MAX_ZOOM = 8192;

// `aspect` is the map's height over its width. Because a view's span is measured across the
// width, a taller-than-wide extent has to be divided by the aspect to fit vertically too. The
// default of 1 is a square frame, for a caller that has none to measure.
export const fitView = (points: readonly MapPoint[], aspect = 1): MapView => {
  const xs = points.map(point => point.x),
    zs = points.map(point => point.z);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs);
  return {
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    span:
      Math.max(
        maxX - minX,
        (maxZ - minZ) / Math.max(aspect, Number.MIN_VALUE),
        1
      ) * FIT_PADDING
  };
};

export const zoomOf = (fit: MapView, view: MapView): number =>
  fit.span / view.span;

// What bounds a camera. A span is always bounded the same way, inside
// [fit / MAX_ZOOM, fit]; the two worlds differ only in what happens to the
// centre. A bounded world clamps it into the fit, so placements can never be
// panned out of reach. A world that wraps takes it modulo `period` instead: a
// Body's surface is a torus 4096 Surface Cells an axis, where clamping to a
// square would put a hard edge through an island that crosses it.
// `maxZoom` overrides how far in a camera may go. It exists because a threshold keyed to the
// size of the thing being looked at needs depth in proportion: the Atlas System Range hands over
// to a Body when that Body's surface fills the frame, and the smallest recovered Body is 500
// times smaller than the largest, so a single ceiling that suits DIALIS strands THEON. Omitted
// everywhere else, which keeps MAX_ZOOM the default.
export type MapBounds =
  | {
      readonly centre: 'clamp';
      readonly fit: MapView;
      readonly maxZoom?: number;
    }
  | {
      readonly centre: 'wrap';
      readonly fit: MapView;
      readonly maxZoom?: number;
      readonly period: number;
    };

// A bare fit means 'clamp', which is every caller that predates the torus.
// Written as a widening rather than a required argument so the bounded case
// stays the quiet default and the wrapping one has to say so.
const boundsOf = (bounds: MapBounds | MapView): MapBounds =>
  'fit' in bounds ? bounds : { centre: 'clamp', fit: bounds };

const wrapped = (value: number, period: number): number =>
  ((value % period) + period) % period;

export const clampView = (
  bounds: MapBounds | MapView,
  view: MapView
): MapView => {
  const resolved = boundsOf(bounds);
  const { fit } = resolved;
  const span = Math.min(
    fit.span,
    Math.max(fit.span / (resolved.maxZoom ?? MAX_ZOOM), view.span)
  );
  if (resolved.centre === 'wrap') {
    return {
      cx: wrapped(view.cx, resolved.period),
      cz: wrapped(view.cz, resolved.period),
      span
    };
  }
  const half = fit.span / 2;
  return {
    cx: Math.min(fit.cx + half, Math.max(fit.cx - half, view.cx)),
    cz: Math.min(fit.cz + half, Math.max(fit.cz - half, view.cz)),
    span
  };
};

// `u` and `v` are fractions of the map's width and height from its top-left
// corner; `aspect` is height over width. X runs right and Z runs up.
export const project = (
  view: MapView,
  point: MapPoint,
  aspect: number
): { readonly u: number; readonly v: number } => ({
  u: 0.5 + (point.x - view.cx) / view.span,
  v: 0.5 - (point.z - view.cz) / (view.span * aspect)
});

export const unproject = (
  view: MapView,
  u: number,
  v: number,
  aspect: number
): MapPoint => ({
  x: view.cx + (u - 0.5) * view.span,
  z: view.cz - (v - 0.5) * view.span * aspect
});

// Zoom by `factor` keeping the world point under (u, v) still.
export const zoomView = (
  bounds: MapBounds | MapView,
  view: MapView,
  factor: number,
  u = 0.5,
  v = 0.5,
  aspect = 1
): MapView => {
  const resolved = boundsOf(bounds);
  const { fit } = resolved;
  const anchor = unproject(view, u, v, aspect);
  const span = Math.min(
    fit.span,
    Math.max(fit.span / (resolved.maxZoom ?? MAX_ZOOM), view.span / factor)
  );
  return clampView(bounds, {
    cx: anchor.x - (u - 0.5) * span,
    cz: anchor.z + (v - 0.5) * span * aspect,
    span
  });
};

// Pan by a fraction of the map's width and height, as a drag would.
export const panView = (
  bounds: MapBounds | MapView,
  view: MapView,
  du: number,
  dv: number,
  aspect = 1
): MapView =>
  clampView(bounds, {
    cx: view.cx - du * view.span,
    cz: view.cz + dv * view.span * aspect,
    span: view.span
  });

// Every point partitioned into groups reachable through gaps no wider than
// `gap`, in world units. Single-linkage, so a chain of close points is one
// group however far its ends are apart. Members are ascending indices, and the
// groups come in the order their lowest member appears.
export const clusterAll = (
  points: readonly MapPoint[],
  gap: number
): readonly (readonly number[])[] => {
  const seen = new Set<number>();
  const groups: number[][] = [];
  for (const start of points.keys()) {
    if (seen.has(start)) {
      continue;
    }
    seen.add(start);
    const members = [start];
    const queue = [start];
    while (queue.length) {
      const a = points[queue.pop()!]!;
      for (const [candidate, b] of points.entries()) {
        if (!seen.has(candidate) && Math.hypot(a.x - b.x, a.z - b.z) <= gap) {
          seen.add(candidate);
          members.push(candidate);
          queue.push(candidate);
        }
      }
    }
    groups.push(members.sort((a, b) => a - b));
  }
  return groups;
};

// A grid square is the first 1, 2 or 5 × 10ⁿ units that is at least 40 pixels.
export const gridStep = (span: number, widthPixels: number): number => {
  const raw = (span * 40) / Math.max(widthPixels, 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map(n => n * magnitude).find(step => step >= raw)!;
};

export const formatUnits = (value: number): string =>
  value >= 100
    ? Math.round(value).toLocaleString('en-GB')
    : String(Number(value.toPrecision(3)));
