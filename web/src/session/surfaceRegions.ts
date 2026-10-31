import type { ObjectPlacement } from '../world/index.ts';
import { wrapSurfaceAxis } from '../world/surfaceCoordinates.ts';

/// Surface Regions (ADR 0084): a building's place in play. A building's Sidecar
/// placement names its region and the Talk Script that answers for it; the
/// region is the building's placed extent, and its approach that extent grown
/// by a margin on every side but below.
///
/// ```json
/// "region": { "name": "shrine", "script": "shrine", "approach": 28672 }
/// ```
export interface SurfaceRegion {
  /// Where the player is near the building.
  readonly approach: Box;
  /// The building itself: where the player arrives, and objects are left.
  readonly footprint: Box;
  readonly name: string;
  readonly script: string;
}

/// `[min, max)` across the surface, `[min, max]` in height.
export interface Box {
  readonly max: Point;
  readonly min: Point;
}

interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const extent = (object: ObjectPlacement): Box => {
  const along = (axis: 'x' | 'y' | 'z') =>
    object.vertices.map(vertex => vertex[axis]);
  const [xs, ys, zs] = [along('x'), along('y'), along('z')];
  return {
    max: { x: Math.max(...xs), y: Math.max(...ys), z: Math.max(...zs) },
    min: { x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs) }
  };
};

const grown = (box: Box, by: number): Box => ({
  max: { x: box.max.x + by, y: box.max.y + by, z: box.max.z + by },
  min: { x: box.min.x - by, y: box.min.y, z: box.min.z - by }
});

const regionOf = (object: ObjectPlacement): SurfaceRegion => {
  const placed = object.region;
  const fail = (reason: string): never => {
    throw new Error(`${object.id}: its region ${reason}`);
  };
  if (placed === undefined || typeof placed !== 'object') {
    return fail('must be { name, script, approach? }');
  }
  if (typeof placed.name !== 'string' || placed.name === '') {
    fail('needs a name');
  }
  if (typeof placed.script !== 'string' || placed.script === '') {
    fail('needs the Talk Script that answers for it');
  }
  const approach = placed.approach ?? 0;
  if (!Number.isInteger(approach) || approach < 0) {
    fail('approach must be a whole number of surface units, at least 0');
  }
  const footprint = extent(object);
  return {
    approach: grown(footprint, approach),
    footprint,
    name: placed.name,
    script: placed.script
  };
};

/// Every surface object's region its placement names. Two regions may not
/// share a name or a Talk Script: a script answers for one place.
export const surfaceRegions = (
  objects: readonly ObjectPlacement[]
): SurfaceRegion[] => {
  const regions = objects
    .filter(o => o.region !== undefined && o.placement === 'surface')
    .map(regionOf);
  for (const [i, region] of regions.entries()) {
    const earlier = regions.slice(0, i);
    if (earlier.some(other => other.name === region.name)) {
      throw new Error(`two Surface Regions are called ${region.name}`);
    }
    if (earlier.some(other => other.script === region.script)) {
      throw new Error(`two Surface Regions name Talk Script ${region.script}`);
    }
  }
  return regions;
};

export const inside = (box: Box, at: Point): boolean => {
  const x = wrapSurfaceAxis(at.x);
  const z = wrapSurfaceAxis(at.z);
  return (
    x >= box.min.x &&
    x < box.max.x &&
    z >= box.min.z &&
    z < box.max.z &&
    at.y >= box.min.y &&
    at.y <= box.max.y
  );
};

/// The names of the regions whose approach a point is in.
export const approachesAt = (
  regions: readonly SurfaceRegion[],
  at: Point
): string[] =>
  regions.filter(r => inside(r.approach, at)).map(region => region.name);

/// The names of the regions whose footprint a point is in.
export const footprintsAt = (
  regions: readonly SurfaceRegion[],
  at: Point
): string[] =>
  regions.filter(r => inside(r.footprint, at)).map(region => region.name);
