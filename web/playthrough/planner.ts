import type { Point } from './steering.ts';

/// A route on foot through a structure's regions, from the region boxes the Data Payload
/// publishes for each Floor. Regions are axis-aligned boxes in structure-local X and Z; two that
/// share an edge are joined, and a door is a thin region between two rooms. The route crosses
/// each shared edge at its middle, square on, so a walk never grazes a door frame.
///
/// This is the harness's own pathfinding, not the session's: a route it finds is a route to try.

export interface RegionBox {
  /// `[[x0, x1], [z0, z1]]`, half-open.
  readonly bounds: readonly [
    readonly [number, number],
    readonly [number, number]
  ];
  /// The region's flags: bit 14 outdoors, bit 13 a lift car.
  readonly flags?: number;
}

const contains = (region: RegionBox, point: Point): boolean => {
  const [[x0, x1], [z0, z1]] = region.bounds;
  return point.x >= x0 && point.x < x1 && point.z >= z0 && point.z < z1;
};

const area = (region: RegionBox): number => {
  const [[x0, x1], [z0, z1]] = region.bounds;
  return (x1 - x0) * (z1 - z0);
};

/// The smallest region holding the point: outdoor regions are vast and may surround a small one.
const regionOf = (
  regions: readonly RegionBox[],
  point: Point
): number | undefined => {
  let best: number | undefined;
  for (const [index, region] of regions.entries()) {
    if (
      contains(region, point) &&
      (best === undefined || area(region) < area(regions[best]!))
    ) {
      best = index;
    }
  }
  return best;
};

interface Crossing {
  readonly at: number;
  /// The axis the edge lies across: `x` for an edge at constant X.
  readonly axis: 'x' | 'z';
  /// +1 when the crossing goes towards increasing `axis`.
  readonly direction: 1 | -1;
  readonly from: number;
  readonly to: number;
}

const overlap = (
  [a0, a1]: readonly [number, number],
  [b0, b1]: readonly [number, number]
): readonly [number, number] | null => {
  const low = Math.max(a0, b0);
  const high = Math.min(a1, b1);
  return high > low ? [low, high] : null;
};

/// Where `a` meets `b`, if they share an edge long enough to walk through.
const crossing = (a: RegionBox, b: RegionBox): Crossing | null => {
  const [[ax0, ax1], [az0, az1]] = a.bounds;
  const [[bx0, bx1], [bz0, bz1]] = b.bounds;
  const zSpan = overlap([az0, az1], [bz0, bz1]);
  if (zSpan !== null && zSpan[1] - zSpan[0] >= 40) {
    if (ax1 === bx0) {
      return { at: ax1, axis: 'x', direction: 1, from: zSpan[0], to: zSpan[1] };
    }
    if (bx1 === ax0) {
      return {
        at: ax0,
        axis: 'x',
        direction: -1,
        from: zSpan[0],
        to: zSpan[1]
      };
    }
  }
  const xSpan = overlap([ax0, ax1], [bx0, bx1]);
  if (xSpan !== null && xSpan[1] - xSpan[0] >= 40) {
    if (az1 === bz0) {
      return { at: az1, axis: 'z', direction: 1, from: xSpan[0], to: xSpan[1] };
    }
    if (bz1 === az0) {
      return {
        at: az0,
        axis: 'z',
        direction: -1,
        from: xSpan[0],
        to: xSpan[1]
      };
    }
  }
  return null;
};

/// How far either side of an edge the route places its approach and exit points, held inside
/// both regions so a thin door region still has its own point.
const STANDOFF = 60;

const depth = (region: RegionBox, axis: 'x' | 'z'): number => {
  const [[x0, x1], [z0, z1]] = region.bounds;
  return axis === 'x' ? x1 - x0 : z1 - z0;
};

/// Waypoints from `from` to `to`, or null when no chain of shared edges joins their regions.
export const planRoute = (
  regions: readonly RegionBox[],
  from: Point,
  to: Point,
  passable: (index: number) => boolean = () => true
): readonly Point[] | null => {
  const start = regionOf(regions, from);
  const goal = regionOf(regions, to);
  if (start === undefined || goal === undefined) {
    return null;
  }
  const previous = new Map<number, number>([[start, start]]);
  const queue = [start];
  while (queue.length > 0) {
    const here = queue.shift()!;
    if (here === goal) {
      break;
    }
    for (const [next, region] of regions.entries()) {
      if (
        !previous.has(next) &&
        passable(next) &&
        crossing(regions[here]!, region) !== null
      ) {
        previous.set(next, here);
        queue.push(next);
      }
    }
  }
  if (!previous.has(goal)) {
    return null;
  }
  const chain = [goal];
  while (chain[0] !== start) {
    chain.unshift(previous.get(chain[0]!)!);
  }
  const points: Point[] = [];
  for (let step = 1; step < chain.length; step += 1) {
    const a = regions[chain[step - 1]!]!;
    const b = regions[chain[step]!]!;
    const edge = crossing(a, b)!;
    const middle = (edge.from + edge.to) / 2;
    const before =
      edge.at - edge.direction * Math.min(STANDOFF, depth(a, edge.axis) / 2);
    const after =
      edge.at + edge.direction * Math.min(STANDOFF, depth(b, edge.axis) / 2);
    for (const along of [before, after]) {
      points.push(
        edge.axis === 'x' ? { x: along, z: middle } : { x: middle, z: along }
      );
    }
  }
  points.push(to);
  return points.filter(
    (point, index) =>
      index === 0 ||
      point.x !== points[index - 1]!.x ||
      point.z !== points[index - 1]!.z
  );
};

const OUTDOOR = 0x40_00;
const LIFT = 0x20_00;

export const isOutdoor = (region: RegionBox): boolean =>
  ((region.flags ?? 0) & OUTDOOR) !== 0;

const centre = (region: RegionBox): Point => {
  const [[x0, x1], [z0, z1]] = region.bounds;
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
};

/// Where to stand outside a structure to walk in: past the middle of an edge an indoor region
/// shares with an outdoor one, `distance` out. The first such edge in region order is used.
export const entrance = (
  regions: readonly RegionBox[],
  distance: number
): Point | null => {
  for (const inside of regions) {
    if (isOutdoor(inside)) {
      continue;
    }
    for (const outside of regions) {
      if (!isOutdoor(outside)) {
        continue;
      }
      const edge = crossing(inside, outside);
      if (edge !== null) {
        const middle = (edge.from + edge.to) / 2;
        const along = edge.at + edge.direction * distance;
        return edge.axis === 'x'
          ? { x: along, z: middle }
          : { x: middle, z: along };
      }
    }
  }
  return null;
};

/// The middle of a lift car on this Floor, if the Floor has one.
export const liftCar = (regions: readonly RegionBox[]): Point | null => {
  const car = regions.find(region => ((region.flags ?? 0) & LIFT) !== 0);
  return car === undefined ? null : centre(car);
};
