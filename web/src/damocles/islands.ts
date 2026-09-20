import type { Vector3 } from '../orientation/index.ts';
import {
  islandOriginNear,
  nearestIsland,
  type ErisGrid,
  type ErisIsland,
  type ErisSurface
} from './world.ts';

/// Where a position stands against the Damocles Island the Session measures from: the
/// three-way answer `$0560F2` publishes in `$78A6`, as `core`, `land` and `sea` rather than as
/// `0`, `1` and `$FFFF` (docs/research/damocles-eris-islands.md).
///
/// It is one query with three consumers. The renderer asks it which colour the ground plane
/// takes and which island it must not fill twice; the walk-block at `$059690` and the
/// disembark refusal at `$057D16` are the same question, and #394 exposes it for them without
/// wiring either.
export type LandSea = 'core' | 'land' | 'sea';

export interface LandSeaAnswer {
  /// The record the answer was measured against — the nearest to the position, which is what
  /// `$056490` keeps in `$7894`. Undefined only where the Body carries no record at all.
  readonly island: ErisIsland | undefined;
  readonly kind: LandSea;
}

/// One coastline edge as the scan at `$0561CE` reads it: the two vertices an edge word names.
export interface CoastlineEdge {
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
}

/// The island-local point, in fractional Surface Cells, that every stage below is tested in.
const localPoint = (
  position: Vector3,
  grid: ErisGrid,
  island: ErisIsland
): readonly [number, number] => {
  const origin = islandOriginNear(position, grid, island);
  return [
    (position.x - origin.x) / grid.cellUnits,
    (position.z - origin.z) / grid.cellUnits
  ];
};

const withinBox = (
  box: ErisIsland['boxes'][number],
  [x, z]: readonly [number, number]
): boolean => x >= box.x[0] && x < box.x[1] && z >= box.z[0] && z < box.z[1];

/// The vertex pair an edge word names.
///
/// Each half is four times a vertex index plus four: the high vertex in bits 8..15 read as
/// `(word >> 6) & $FC`, the low one in `word & $FF`. Bit 15 swaps the pair and bit 14 selects
/// the axis-reversed form; both arrange the Working Authority's own fixed-point arithmetic and
/// neither changes which two vertices the edge joins, so neither is read here.
const edgeVertices = (word: number): readonly [number, number] => [
  ((((word >> 6) & 0xfc) - 4) / 4) | 0,
  (((word & 0xff) - 4) / 4) | 0
];

/// The coastline edges of one island, in the order the backwards scan reads them.
///
/// The words are the closed cycle of the polygon, traversed against the stored vertex order.
/// They are carried rather than derived because the order is the scan's, and the scan stops at
/// the first edge that matches: a cycle rebuilt from the vertex list alone would test the same
/// edges in a different order and could stop at a different one.
export const coastlineEdges = (island: ErisIsland): readonly CoastlineEdge[] =>
  island.coastline.edges.map(word => {
    const [from, to] = edgeVertices(word);
    return {
      from: island.coastline.vertices[from]!,
      to: island.coastline.vertices[to]!
    };
  });

/// Where a position stands against the island nearest it.
///
/// This replays the staged test rather than filling the coastline polygon, because the stages
/// carry answers a fill cannot give. The core box is authored — smaller than the 16-cell
/// workspace on three of Eris's five islands — so nothing derives it from the outline, and it
/// is what tells the renderer the ground underfoot is already land. The exclusion boxes and
/// the edge order are the Working Authority's own fast path, and an island is land in it by
/// *exhausting* the edge list rather than by any containment test, which is why its two
/// concave islands need no special case.
///
/// The two do agree. Sweeping all 41 coastline records at an eighth of a cell, off the
/// authored lattice, found no point where this answer differs from an even-odd fill of the
/// same polygon: 9,151,488 points, no disagreement (#394). The one tie is a position lying
/// exactly on a coastline edge, which reads sea here.
export const classifyPosition = (
  surface: ErisSurface,
  position: Vector3
): LandSeaAnswer => {
  const island = nearestIsland(surface, position);
  // No record to measure from is no coast, and so no sea: the same answer the 21 records
  // sharing the coastline-less stub give, whose extent and core boxes are the whole plane.
  if (island === undefined) {
    return { island: undefined, kind: 'core' };
  }
  const point = localPoint(position, surface.grid, island);
  const [extent, core, ...exclusions] = island.boxes;
  if (extent === undefined || !withinBox(extent, point)) {
    return { island, kind: 'sea' };
  }
  if (core !== undefined && withinBox(core, point)) {
    return { island, kind: 'core' };
  }
  for (const exclusion of exclusions) {
    if (withinBox(exclusion, point)) {
      return { island, kind: 'sea' };
    }
  }
  const [x, z] = point;
  for (const { from, to } of coastlineEdges(island)) {
    const within =
      x >= Math.min(from[0], to[0]) &&
      x <= Math.max(from[0], to[0]) &&
      z >= Math.min(from[1], to[1]) &&
      z <= Math.max(from[1], to[1]);
    if (!within) {
      continue;
    }
    // The first edge whose own box holds the point decides, by which side of it the point
    // lies. The edges run anticlockwise seen from above with north at +z, so the island is to
    // the left of each.
    const side =
      (to[0] - from[0]) * (z - from[1]) - (to[1] - from[1]) * (x - from[0]);
    return { island, kind: side > 0 ? 'land' : 'sea' };
  }
  // Off the end of the edge list, which is how an interior point is reached: land by
  // exhaustion, never by a containment test ($0561D0).
  return { island, kind: 'land' };
};

/// One island's coastline in raw Body units, on the wrap image nearest `eye`.
///
/// The whole record is shifted once, so an island that crosses the coordinate seam is drawn
/// whole rather than torn across it.
export const coastlineInBodyUnits = (
  island: ErisIsland,
  grid: ErisGrid,
  eye: Vector3
): readonly (readonly [number, number])[] => {
  const origin = islandOriginNear(eye, grid, island);
  return island.coastline.vertices.map(([x, z]) => [
    origin.x + x * grid.cellUnits,
    origin.z + z * grid.cellUnits
  ]);
};
