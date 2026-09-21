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
