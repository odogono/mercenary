import type { Catalogue } from '../catalogue/data.ts';
import type { MapPoint, MapView } from '../catalogue/mapView.ts';
import { SURFACE_CELLS } from '../damocles/world.ts';

/// A Body's surface as the Atlas draws it: sea everywhere, with each recovered Damocles Island's
/// coastline filled in its own land colour. Nothing here touches the DOM.
///
/// An island carries no name of its own (`CONTEXT.md`). `areaName` belongs to the Structure
/// Workspace the record binds, so it travels with the island only as the published Settlement
/// label, and 33 of the 62 records have none at all.

/// The Catalogue keys a Body by slot where `system.json` keys it by slug. Both derive from the
/// same recovered source index, so this is the join and not a lookup table.
export const catalogueBodyId = (sourceIndex: number): string =>
  `body-${sourceIndex}`;

export interface SurfaceIsland {
  readonly areaName: string | null;
  readonly id: string;
  readonly landColour: string;
  /// The record's own origin in Body Coordinates, which an Island-Local Cell counts from.
  readonly origin: MapPoint;
  /// The closed ring in Body Coordinates: the record's origin plus its island-local vertices,
  /// both in whole Surface Cells.
  ///
  /// Deliberately **not** wrapped onto the surface. Five records cross the coordinate seam, and
  /// wrapping vertex by vertex would send one side of such a polygon to the far edge and tear it
  /// across the map. The ring stays whole with coordinates outside 0..SURFACE_CELLS, and
  /// `wrapImages` offsets it bodily instead.
  readonly outline: readonly MapPoint[];
}

export interface SurfaceGap {
  readonly areaName: string | null;
  readonly id: string;
  readonly reason: string;
}

export interface BodySurface {
  /// Records carrying no coastline at all: 21 of the 62 share a stub whose extent is the whole
  /// coordinate plane. They are neither land to draw nor sea, so the map states the gap rather
  /// than covering a Body in invented ground (ADR 0014).
  readonly gaps: readonly SurfaceGap[];
  readonly islands: readonly SurfaceIsland[];
}

/// The islands of one Body, by its recovered source index.
export const readBodySurface = (
  catalogue: Catalogue,
  sourceIndex: number
): BodySurface => {
  const bodyId = catalogueBodyId(sourceIndex);
  const records = catalogue.islands.filter(island => island.body === bodyId);
  return {
    gaps: records
      .filter(island => !island.coastline.vertices.length)
      .map(island => ({
        areaName: island.areaName,
        id: island.id,
        reason: island.reason
      })),
    islands: records
      .filter(island => island.coastline.vertices.length)
      .map(island => ({
        areaName: island.areaName,
        id: island.id,
        landColour: island.landColour,
        origin: { x: island.origin[0], z: island.origin[1] },
        outline: island.coastline.vertices.map(([x, z]) => ({
          x: island.origin[0] + x,
          z: island.origin[1] + z
        }))
      }))
  };
};

/// Which whole-surface offsets of a span put it inside a window. An image offset by k surfaces
/// overlaps when `min + k * S <= viewMax` and `max + k * S >= viewMin`, which bounds k exactly,
/// so no copy is computed and thrown away.
const imageRange = (
  viewMin: number,
  viewMax: number,
  min: number,
  max: number
) => ({
  first: Math.ceil((viewMin - max) / SURFACE_CELLS),
  last: Math.floor((viewMax - min) / SURFACE_CELLS)
});

const bounds = (outline: readonly MapPoint[]) => ({
  maxX: Math.max(...outline.map(point => point.x)),
  maxZ: Math.max(...outline.map(point => point.z)),
  minX: Math.min(...outline.map(point => point.x)),
  minZ: Math.min(...outline.map(point => point.z))
});

/// Every wrap image of one outline that the camera can see, offset bodily by whole surfaces.
///
/// The range is computed from the camera rather than fixed at plus or minus one, because a span
/// may exceed the surface: a frame wider than it is tall shows more than one image side by side
/// at its widest view, and on a torus that is not a defect.
export const wrapImages = (
  outline: readonly MapPoint[],
  view: MapView,
  aspect: number
): readonly (readonly MapPoint[])[] => {
  if (!outline.length) {
    return [];
  }
  const box = bounds(outline);
  const halfWidth = view.span / 2;
  const halfHeight = (view.span * aspect) / 2;
  const across = imageRange(
    view.cx - halfWidth,
    view.cx + halfWidth,
    box.minX,
    box.maxX
  );
  const down = imageRange(
    view.cz - halfHeight,
    view.cz + halfHeight,
    box.minZ,
    box.maxZ
  );
  const images: (readonly MapPoint[])[] = [];
  for (let i = across.first; i <= across.last; i += 1) {
    for (let j = down.first; j <= down.last; j += 1) {
      const dx = i * SURFACE_CELLS;
      const dz = j * SURFACE_CELLS;
      images.push(outline.map(point => ({ x: point.x + dx, z: point.z + dz })));
    }
  }
  return images;
};

/// Whether a Body Coordinate falls inside a closed ring, by ray casting. A coastline is a
/// simple closed polygon of at most 14 vertices, so nothing cleverer earns its keep.
const inside = (ring: readonly MapPoint[], point: MapPoint): boolean => {
  let within = false;
  for (const [index, a] of ring.entries()) {
    const b = ring[(index + 1) % ring.length]!;
    if (
      a.z > point.z !== b.z > point.z &&
      point.x < a.x + ((point.z - a.z) / (b.z - a.z)) * (b.x - a.x)
    ) {
      within = !within;
    }
  }
  return within;
};

/// The island under a Body Coordinate, tested against every wrap image the camera can see so a
/// record picked on one side of the seam is the same record on the other.
///
/// Islands do not overlap one another, so the first hit is the only hit; the order is the
/// Catalogue's, which makes the answer the same on every pick.
export const islandAt = (
  surface: BodySurface,
  view: MapView,
  aspect: number,
  point: MapPoint
): SurfaceIsland | null =>
  surface.islands.find(island =>
    wrapImages(island.outline, view, aspect).some(image => inside(image, point))
  ) ?? null;

/// The mean of some Surface Cell coordinates on a wrapping axis: the angle they average to,
/// brought back into 0..SURFACE_CELLS.
const circularMean = (values: readonly number[]): number => {
  const turns = values.map(value => (value / SURFACE_CELLS) * 2 * Math.PI);
  const angle = Math.atan2(
    turns.reduce((sum, turn) => sum + Math.sin(turn), 0) / turns.length,
    turns.reduce((sum, turn) => sum + Math.cos(turn), 0) / turns.length
  );
  return (
    ((((angle / (2 * Math.PI)) * SURFACE_CELLS) % SURFACE_CELLS) +
      SURFACE_CELLS) %
    SURFACE_CELLS
  );
};

/// One coordinate counted from another on a wrapping axis, taken on the nearest image so a cell
/// across the seam from its origin reads as a small signed offset rather than as four thousand.
const nearestOffset = (from: number, origin: number): number => {
  const raw = from - origin;
  return raw - Math.round(raw / SURFACE_CELLS) * SURFACE_CELLS;
};

/// How far one coordinate must move, in whole surfaces, to sit nearest an anchor.
const wholeSurfaces = (from: number, to: number): number =>
  -Math.round((from - to) / SURFACE_CELLS) * SURFACE_CELLS;

/// The wrap-aware centre of a Body's islands, in Surface Cells: where the Atlas centres that
/// Body's surface when drawing it on the Body's own disc.
///
/// A circular mean rather than an arithmetic one, because the surface is a torus. LUCAN's twelve
/// records ring the coordinate origin, so their arithmetic mean is the far side of the surface
/// and cell 2048 puts the ring in all four corners as four broken arcs. Their circular mean is
/// cell (6, 6) — the ring's own centre — which draws it whole and in the middle.
///
/// (2048, 2048) when a Body has no coastline at all, which keeps the surface square where it was
/// for the 21 Bodies carrying only the coastline-less stub.
export const surfaceAnchor = (surface: BodySurface): MapPoint => {
  if (!surface.islands.length) {
    return { x: SURFACE_CELLS / 2, z: SURFACE_CELLS / 2 };
  }
  const centres = surface.islands.map(island => ({
    x:
      island.outline.reduce((sum, point) => sum + point.x, 0) /
      island.outline.length,
    z:
      island.outline.reduce((sum, point) => sum + point.z, 0) /
      island.outline.length
  }));
  return {
    x: circularMean(centres.map(centre => centre.x)),
    z: circularMean(centres.map(centre => centre.z))
  };
};

/// One outline shifted bodily to the wrap image nearest an anchor. The whole ring moves by the
/// same whole surfaces, so a record crossing the seam stays one polygon.
///
/// Every vertex of every recovered Body then lies within half a surface of its own anchor — the
/// worst is ERIS at 1,952 cells of the 2,048 available — so a Body's islands all fit in one
/// square and none needs a copy. `atlas-surface.test.ts` pins that, because it is a property of
/// the recovered data rather than something the code can guarantee.
export const nearestImage = (
  outline: readonly MapPoint[],
  anchor: MapPoint
): readonly MapPoint[] => {
  if (!outline.length) {
    return outline;
  }
  const centre = {
    x: outline.reduce((sum, point) => sum + point.x, 0) / outline.length,
    z: outline.reduce((sum, point) => sum + point.z, 0) / outline.length
  };
  const dx = wholeSurfaces(centre.x, anchor.x);
  const dz = wholeSurfaces(centre.z, anchor.z);
  return dx === 0 && dz === 0
    ? outline
    : outline.map(point => ({ x: point.x + dx, z: point.z + dz }));
};

/// The island a Body Coordinate falls in, tested against every wrap image so a cell on either
/// side of the seam finds the same record. Unlike `islandAt` this needs no camera, because a
/// coordinate is not a pointer.
export const islandAtCell = (
  surface: BodySurface,
  cell: MapPoint
): SurfaceIsland | null => {
  for (const island of surface.islands) {
    for (let i = -1; i <= 1; i += 1) {
      for (let j = -1; j <= 1; j += 1) {
        if (
          inside(island.outline, {
            x: cell.x + i * SURFACE_CELLS,
            z: cell.z + j * SURFACE_CELLS
          })
        ) {
          return island;
        }
      }
    }
  }
  return null;
};

/// An Island-Local Cell: a Surface Cell counted from a Damocles Island's origin rather than from
/// the Body's (`CONTEXT.md`). Signed, and taken on the wrap image nearest the record, so a cell
/// across the seam from its island still reads as a small offset rather than as four thousand.
export const islandLocalCell = (
  island: SurfaceIsland,
  cell: MapPoint
): MapPoint => ({
  x: nearestOffset(cell.x, island.origin.x),
  z: nearestOffset(cell.z, island.origin.z)
});
