import type { ObjectPlacement } from '../world/index.ts';
import { wrapSurfaceAxis } from '../world/surfaceCoordinates.ts';

/// Surface Regions (ADR 0084): named areas of the surface the Gameplay Session
/// knows the player and loose objects to be in or out of. A building's own
/// region is its footprint, named by its Sidecar placement; an area that is no
/// building's lives in this table.
///
/// A region is a rectangle in surface units, `[min, max)` on each axis, at
/// any altitude.
export interface SurfaceRegion {
  readonly maxX: number;
  readonly maxZ: number;
  readonly minX: number;
  readonly minZ: number;
  readonly name: string;
}

const CELL = 0x1_00_00;

/// The areas that belong to no building.
const OPEN_REGIONS: readonly SurfaceRegion[] = [
  // The open ground around the Shrine, the whole of Surface Cell (20,20).
  {
    maxX: 21 * CELL,
    maxZ: 21 * CELL,
    minX: 20 * CELL,
    minZ: 20 * CELL,
    name: 'shrine grounds'
  }
];

/// The footprint an object stands on: its placed vertices' extent.
const footprint = (object: ObjectPlacement, name: string): SurfaceRegion => {
  const xs = object.vertices.map(v => v.x);
  const zs = object.vertices.map(v => v.z);
  return {
    maxX: Math.max(...xs),
    maxZ: Math.max(...zs),
    minX: Math.min(...xs),
    minZ: Math.min(...zs),
    name
  };
};

/// Every Surface Region of a world: the open ones, then each surface object's
/// footprint that its placement names.
export const surfaceRegions = (
  objects: readonly ObjectPlacement[]
): SurfaceRegion[] => [
  ...OPEN_REGIONS,
  ...objects.flatMap(object =>
    object.region !== undefined && object.placement === 'surface'
      ? [footprint(object, object.region)]
      : []
  )
];

const inside = (
  region: SurfaceRegion,
  at: { readonly x: number; readonly z: number }
): boolean => {
  const x = wrapSurfaceAxis(at.x);
  const z = wrapSurfaceAxis(at.z);
  return (
    x >= region.minX && x < region.maxX && z >= region.minZ && z < region.maxZ
  );
};

/// The names of the regions a surface point is in, in table order.
export const regionsAt = (
  regions: readonly SurfaceRegion[],
  at: { readonly x: number; readonly z: number }
): string[] =>
  regions.filter(region => inside(region, at)).map(region => region.name);
