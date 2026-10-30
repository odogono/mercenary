import { wrapSurfaceAxis } from '../world/surfaceCoordinates.ts';

/// Surface Regions (ADR 0084): named areas of the surface the Gameplay Session
/// knows the player and loose objects to be in or out of. They are play, not
/// drawing, so they live here rather than in a Geometry Asset.
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

/// The Shrine stands at the centre of Surface Cell (20,20), outside the city.
const SHRINE_CENTRE = { x: 20.5 * CELL, z: 20.5 * CELL };
/// Half the Shrine's footprint, out to its pillars.
const SHRINE_HALF = 0x3_00;

export const SURFACE_REGIONS: readonly SurfaceRegion[] = [
  {
    maxX: 21 * CELL,
    maxZ: 21 * CELL,
    minX: 20 * CELL,
    minZ: 20 * CELL,
    name: 'shrine grounds'
  },
  {
    maxX: SHRINE_CENTRE.x + SHRINE_HALF,
    maxZ: SHRINE_CENTRE.z + SHRINE_HALF,
    minX: SHRINE_CENTRE.x - SHRINE_HALF,
    minZ: SHRINE_CENTRE.z - SHRINE_HALF,
    name: 'shrine'
  }
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
export const regionsAt = (at: {
  readonly x: number;
  readonly z: number;
}): string[] =>
  SURFACE_REGIONS.filter(region => inside(region, at)).map(r => r.name);

export const surfaceRegion = (name: string): SurfaceRegion => {
  const region = SURFACE_REGIONS.find(r => r.name === name);
  if (region === undefined) {
    throw new Error(`no Surface Region is called ${name}`);
  }
  return region;
};

export const within = (
  name: string,
  at: { readonly x: number; readonly z: number }
): boolean => inside(surfaceRegion(name), at);
