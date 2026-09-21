// Pure view arithmetic for the per-body Surface placement map. A view is the
// world-space window the map shows: its centre and the span, in body-local
// surface grid units, across the map's full width. Nothing here touches the DOM.

export type MapPoint = { readonly x: number; readonly z: number };
export type MapView = {
  readonly cx: number;
  readonly cz: number;
  readonly span: number;
};

// Fit all keeps the previous framing: placements occupy the middle 80%.
const FIT_PADDING = 1.25;
// Placements separated by more than this fraction of the full-body span are
// not part of the same local cluster.
const CLUSTER_GAP = 0.02;
// A lone placement is shown at this zoom so its surroundings stay legible.
const LONE_ZOOM = 8;
export const MAX_ZOOM = 8192;

// `aspect` is the map's height over its width. Because a view's span is measured across the
// width, a taller-than-wide extent has to be divided by the aspect to fit vertically too. The
// default of 1 is the square Catalogue map, whose callers pass no aspect.
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

// Keep the span within [fit / MAX_ZOOM, fit] and the centre inside the full-body
// extent so the placements can never be panned out of reach.
export const clampView = (fit: MapView, view: MapView): MapView => {
  const span = Math.min(fit.span, Math.max(fit.span / MAX_ZOOM, view.span));
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
  fit: MapView,
  view: MapView,
  factor: number,
  u = 0.5,
  v = 0.5,
  aspect = 1
): MapView => {
  const anchor = unproject(view, u, v, aspect);
  const span = Math.min(
    fit.span,
    Math.max(fit.span / MAX_ZOOM, view.span / factor)
  );
  return clampView(fit, {
    cx: anchor.x - (u - 0.5) * span,
    cz: anchor.z + (v - 0.5) * span * aspect,
    span
  });
};

// Pan by a fraction of the map's width and height, as a drag would.
export const panView = (
  fit: MapView,
  view: MapView,
  du: number,
  dv: number,
  aspect = 1
): MapView =>
  clampView(fit, {
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

// The local cluster around one placement: every placement reachable through
// gaps no wider than CLUSTER_GAP of the full-body span.
export const clusterOf = (
  points: readonly MapPoint[],
  index: number,
  fit: MapView
): number[] => [
  ...(clusterAll(points, fit.span * CLUSTER_GAP).find(members =>
    members.includes(index)
  ) ?? [index])
];

// The view that opens a placement: its local cluster filling the map, or the
// placement alone at LONE_ZOOM when nothing else shares its neighbourhood.
export const clusterView = (
  points: readonly MapPoint[],
  index: number,
  fit: MapView
): MapView => {
  const members = clusterOf(points, index, fit).map(i => points[i]!);
  const local = fitView(members);
  const extent = local.span / FIT_PADDING;
  if (members.length === 1 || extent <= 1) {
    return clampView(fit, { ...local, span: fit.span / LONE_ZOOM });
  }
  return clampView(fit, local);
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

export const describeView = (
  fit: MapView,
  view: MapView,
  widthPixels: number
): string => {
  const zoom = zoomOf(fit, view);
  const zoomText =
    zoom < 10
      ? zoom.toFixed(1).replace(/\.0$/, '')
      : Math.round(zoom).toLocaleString('en-GB');
  return `Zoom ${zoomText}× · view spans ${formatUnits(view.span)} units · grid ${formatUnits(gridStep(view.span, widthPixels))} units`;
};
