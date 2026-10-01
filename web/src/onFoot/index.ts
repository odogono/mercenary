import { footAxes, type Intent } from '../gameCore/index.ts';
import type { Vector3 } from '../orientation/index.ts';

/// On foot in the Novagen ST engine, shared by Damocles and Mercenary III.
///
/// The two titles run the same foot Mover and the same region scan and eye clamp. In the
/// pinned images the foot Mover is Damocles `$58CFE` and MIII `$59A36`: 100 of 106
/// instructions align once addresses are masked, and they differ only in the
/// demo-playback record they read. The region scan, queue build and clamp are Damocles
/// `$5A30E..$5A65C` and MIII `$5B2D2..$5B620`: 261 of 265 align, and MIII adds its
/// attachment-slot and queue-byte rebasing. Both hold the same step (`$7B36` /
/// `$71CE` = 6.0) and turn (`$7B3A` / `$71D2` = 2) (docs/research/mercenary-iii-i1-content-boundary.md).
/// Each title keeps its own structure records; this module sees only poses, intents and
/// region boxes.

/// The rates a title walks at. Damocles authors seconds-based averages (#205); Mercenary
/// III calls one step a substep at the recovered increments.
export interface WalkRules {
  readonly eyeHeight: number;
  readonly runMultiplier: number;
  readonly runTurnMultiplier: number;
  readonly turnRadiansPerSecond: number;
  readonly unitsPerSecond: number;
}

/// What walking reads and writes of a pose: a bearing clockwise from north in radians,
/// forward at north being +z and at east +x.
export interface FootPose {
  readonly heading: number;
  readonly position: Vector3;
}

const TURN = 2 * Math.PI;

const wrap = (heading: number): number => {
  const wrapped = heading % TURN;
  return wrapped < 0 ? wrapped + TURN : wrapped;
};

/// One step of walking. Pure: the same pose, intent and time always give the same pose.
///
/// `intent.turn` is positive to the right, so it is added. Strafe, an Extension (ADR 0059),
/// is the same step at right angles to the heading: east of north is its right. The rest of
/// the pose is carried through untouched: walking never tilts the view.
export const walk = <P extends FootPose>(
  pose: P,
  intent: Intent,
  seconds: number,
  rules: WalkRules
): P => {
  const turnMultiplier = intent.running ? rules.runTurnMultiplier : 1;
  const heading = wrap(
    pose.heading +
      intent.turn * rules.turnRadiansPerSecond * turnMultiplier * seconds
  );
  const axes = footAxes(intent);
  const run = intent.running ? rules.runMultiplier : 1;
  const step = axes.walk * rules.unitsPerSecond * run * seconds;
  const sidestep = axes.strafe * rules.unitsPerSecond * run * seconds;
  return {
    ...pose,
    heading,
    position: {
      x:
        pose.position.x +
        Math.sin(heading) * step +
        (sidestep === 0 ? 0 : Math.cos(heading) * sidestep),
      y: pose.position.y,
      z:
        pose.position.z +
        Math.cos(heading) * step -
        (sidestep === 0 ? 0 : Math.sin(heading) * sidestep)
    }
  };
};

/// A region as the scan and clamp see it, in the structure's local X and Z: its box after
/// the bind's door inset, its flags, and whether its gate lets it be selected now.
export interface ClampRegion {
  readonly available: boolean;
  readonly bounds: readonly (readonly [number, number])[];
  readonly flags: number;
}

/// `$7B35` / `$71CD`, the flags' low byte: non-negative keeps the eye eleven units in.
const EYE_CLEARANCE = 11;
const clearanceFor = (flags: number): number =>
  (flags & 0x00_ff) < 0x80 ? EYE_CLEARANCE : 0;

const inside = (
  bounds: ClampRegion['bounds'],
  point: readonly number[]
): boolean =>
  bounds.every(([min, max], axis) => min <= point[axis]! && point[axis]! < max);

/// The region scan: the first selectable region whose box holds the point.
export const regionAt = (
  regions: readonly ClampRegion[],
  point: readonly [number, number]
): number | null => {
  const index = regions.findIndex(
    region => region.available && inside(region.bounds, point)
  );
  return index < 0 ? null : index;
};

export interface ClampedStep {
  readonly point: readonly [number, number];
  /// The step reached the clamp, which raises the contact flag (Damocles `$5A646`, MIII
  /// `$5B618`): the eye was held back rather than standing past an edge or entering
  /// another region.
  readonly refused: boolean;
  readonly regionIndex: number | null;
  /// The step left the current region's own box, so the regions were walked again.
  readonly reselected: boolean;
}

/// The eye pushback after one Mover step. Inside the current region's inset box the step
/// stands. Past an inset edge but inside the region's own box, it stands where another
/// region's opposite edge is this edge and its inset span holds the other coordinate, and
/// is otherwise clamped to the inset. Past the region's own box the regions are walked: a
/// region selected becomes current, and with none the step is clamped to the own box. A
/// pending ride refuses every region.
export const clampRegionStep = (
  regions: readonly ClampRegion[],
  currentIndex: number | null,
  to: readonly [number, number],
  ridePending = false
): ClampedStep => {
  const current = currentIndex === null ? undefined : regions[currentIndex];
  if (current === undefined) {
    return {
      point: to,
      refused: false,
      regionIndex: regionAt(regions, to),
      reselected: false
    };
  }
  const coordinates = [to[0], to[1]];
  const clearance = clearanceFor(current.flags);
  const withinOwnBox = inside(current.bounds, coordinates);
  let refused = false;
  if (withinOwnBox) {
    const standsAtEdge = (axis: number, upper: boolean): boolean => {
      const other = axis === 0 ? 1 : 0;
      const edge = current.bounds[axis]![upper ? 1 : 0];
      return regions.some(
        (region, index) =>
          index !== currentIndex &&
          region.bounds[axis]![upper ? 0 : 1] === edge &&
          region.bounds[other]![0] + clearance <= coordinates[other]! &&
          coordinates[other]! < region.bounds[other]![1] - clearance
      );
    };
    for (const axis of [0, 1]) {
      const min = current.bounds[axis]![0] + clearance;
      const max = current.bounds[axis]![1] - clearance;
      if (coordinates[axis]! < min && !standsAtEdge(axis, false)) {
        coordinates[axis] = min;
        refused = true;
      } else if (coordinates[axis]! >= max && !standsAtEdge(axis, true)) {
        coordinates[axis] = max - 1;
        refused = true;
      }
    }
  } else {
    const selected = ridePending ? null : regionAt(regions, to);
    if (selected !== null) {
      return {
        point: to,
        refused: false,
        regionIndex: selected,
        reselected: true
      };
    }
    refused = true;
    for (const axis of [0, 1]) {
      const [min, max] = current.bounds[axis]!;
      coordinates[axis] = Math.min(Math.max(coordinates[axis]!, min), max - 1);
    }
  }
  const point = [coordinates[0]!, coordinates[1]!] as const;
  return {
    point,
    refused,
    regionIndex: regionAt(regions, point) ?? currentIndex,
    reselected: !withinOwnBox
  };
};
