/// Which placed structure residents a player can stand beside in the port (#1002).
///
/// A resident is reachable when the port, standing somewhere a player can stand, draws it and
/// admits it to the selection. This walks the same rules the session runs, as a graph rather
/// than frame by frame, so it can visit every structure of every admitted Body at once:
///
/// - **Surface travel is assumed, not walked.** The player stands at every admitted arrival Pose
///   and, by Atlas Travel, in the cell of every resident's parent.
/// - **Selection applies only in the cell's central half**, and the selection takes the nearest
///   drawn resident within 512 units, so a resident counts only where a standable point of a
///   reachable region exposing it is that close.
/// - **Regions connect as the clamp lets the eye pass.** From a region the eye can leave its own
///   box only at an edge another region's opposite edge lies on; past it the regions are walked
///   and the first available one holding the point is entered (`clampRegionStep`).
/// - **A gated region is available while its door is open**, and a keyed door opens only while
///   its key is carried. A door with no key opens on approach.
/// - **A lift links the Floors its Floor Table binds.** A ride arrives at the same X and Z, and
///   the region there is taken afresh with every door shut.
/// - **Keys are a fixed point.** Start with nothing carried, carry every door key that becomes
///   reachable, and walk again until nothing changes.
///
/// Transporters are not counted: the port does not implement them.

import type { Catalogue } from '../src/catalogue/data.ts';
import {
  catalogueResidence,
  insertionsInRegion
} from '../src/damocles/residence.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import {
  floorPlacement,
  floorsOf,
  structureInCell
} from '../src/damocles/world.ts';
import type { ScenePlacement as ErisPlacement } from '../src/enhanced/scene.ts';
import {
  clearanceFor,
  regionAt,
  type ClampRegion
} from '../src/onFoot/index.ts';
import { LIFT_REGION } from '../src/structure/lift.ts';
import { workspaceBounds } from '../src/structure/selection.ts';

type Region = NonNullable<
  ErisPlacement['selection']
>['structure']['regions'][number];

/// `selection()`: the nearest drawn resident closer than this is selected.
const SELECTION_RANGE = 512;

/// One node of the graph: a region on a Floor of a structure placed in a cell.
export interface Node {
  readonly floor: number;
  readonly region: number;
}
const nodeKey = ({ floor, region }: Node): string => `${floor}:${region}`;
/// Standing in the cell but in no region: the eye is not clamped, and the first available region
/// it walks into is selected.
export const OUTSIDE = -1;

/// A structure as the graph needs it: its placement on each Floor it binds.
export interface Structure {
  readonly body: string;
  readonly cell: string;
  /// The central half of its cell, in its local X and Z.
  readonly central: Box;
  /// A fresh session standing at each start, by node.
  readonly enter: Map<string, () => DamoclesSession>;
  /// The eye's height above a Floor, the storey pitch, and whether model Z is negated.
  readonly eye: number;
  readonly floors: ReadonlyMap<number, ErisPlacement>;
  readonly ground: ErisPlacement;
  readonly negate: boolean;
  /// Where an arrival Pose or Atlas Travel stands the player, before any walking.
  readonly starts: Node[];
  readonly storey: number;
}

/// The door key a gated region waits on, or null where its door opens on approach.
const regionKey = (placement: ErisPlacement, region: Region): number | null => {
  if (region.gate !== 'attachmentLatch') {
    return null;
  }
  const attachment = placement.selection!.structure.attachments.find(
    item => item.slot === (region.flags & 0x03_fc)
  );
  return attachment?.keyIndex === undefined || placement.keyBase === null
    ? null
    : placement.keyBase + attachment.keyIndex;
};

const clampRegions = (
  placement: ErisPlacement,
  available: (region: Region) => boolean
): ClampRegion[] =>
  placement.selection!.structure.regions.map(region => ({
    available: available(region),
    bounds: workspaceBounds(region),
    flags: region.flags
  }));

type Point2 = readonly [number, number];

/// How a node was first entered: a walk across an edge, from a point just inside the box left to a
/// point just inside the box entered, or a lift ride from the car's centre.
export type Step =
  | { readonly after: Point2; readonly before: Point2; readonly kind: 'walk' }
  | { readonly at: Point2; readonly floor: number; readonly kind: 'ride' };

/// The central half of the structure's cell, in its local X and Z: the only part of the cell
/// where a region is selected and the eye clamped. Past it the region is cleared and the step
/// stands unclamped; walking back in, the first available region at the point is selected.
type Box = readonly (readonly [number, number])[];
const within = (box: Box, point: readonly number[]): boolean =>
  box.every(([min, max], axis) => min <= point[axis]! && point[axis]! < max);

/// Three points along the half-open span `[low, high)`, middle first.
const along = (low: number, high: number): number[] =>
  low >= high ? [] : [Math.floor((low + high) / 2), low, high - 1];

const pointOn = (axis: number, at: number, other: number): Point2 =>
  (axis === 0 ? [at, other] : [other, at]) as unknown as Point2;

/// The regions the eye can enter from `from` in one walk across an edge of its own box, and
/// whether it can walk out of the central half from it.
const walkedFrom = (
  regions: readonly ClampRegion[],
  from: number,
  central: Box,
  leave: boolean
): { readonly region: number; readonly step: Step }[] => {
  const current = regions[from]!;
  const clearance = clearanceFor(current.flags);
  const found = new Map<number, Step>();
  for (const axis of [0, 1]) {
    const other = axis === 0 ? 1 : 0;
    for (const upper of [false, true]) {
      const edge = current.bounds[axis]![upper ? 1 : 0];
      const before = upper ? edge - 1 : edge;
      const after = upper ? edge : edge - 1;
      if (
        !within([central[axis]!], [before]) ||
        !within([central[axis]!], [after])
      ) {
        continue;
      }
      for (const [index, region] of regions.entries()) {
        // `standsAtEdge`: some region, whatever its gate, has its opposite edge here.
        if (index === from || region.bounds[axis]![upper ? 0 : 1] !== edge) {
          continue;
        }
        const span = along(
          Math.max(
            current.bounds[other]![0] + clearance,
            region.bounds[other]![0] + clearance,
            central[other]![0]
          ),
          Math.min(
            current.bounds[other]![1] - clearance,
            region.bounds[other]![1] - clearance,
            central[other]![1]
          )
        );
        for (const at of span) {
          const entered = regionAt(regions, pointOn(axis, after, at));
          if (entered !== null && entered !== from && !found.has(entered)) {
            found.set(entered, {
              after: pointOn(axis, after, at),
              before: pointOn(axis, before, at),
              kind: 'walk'
            });
          }
        }
      }
      // Out of the central half: the inset box reaches past its edge.
      const boundary = central[axis]![upper ? 1 : 0];
      const inside = upper ? boundary - 1 : boundary;
      const outside = upper ? boundary : boundary - 1;
      if (
        leave &&
        !found.has(OUTSIDE) &&
        current.bounds[axis]![0] + clearance <= inside &&
        inside < current.bounds[axis]![1] - clearance
      ) {
        const [at] = along(
          Math.max(current.bounds[other]![0] + clearance, central[other]![0]),
          Math.min(current.bounds[other]![1] - clearance, central[other]![1])
        );
        if (at !== undefined) {
          found.set(OUTSIDE, {
            after: pointOn(axis, outside, at),
            before: pointOn(axis, inside, at),
            kind: 'walk'
          });
        }
      }
    }
  }
  return [...found].map(([region, step]) => ({ region, step }));
};

/// The regions an unclamped eye selects first, walking in no region: across the central half's
/// edge into the first available region there, or within the central half into a point just
/// inside an available region's edge whose neighbour lies in no available region.
const enteredFromOutside = (
  regions: readonly ClampRegion[],
  central: Box
): { readonly region: number; readonly step: Step }[] => {
  const found = new Map<number, Step>();
  for (const region of regions) {
    if (!region.available) {
      continue;
    }
    for (const axis of [0, 1]) {
      const other = axis === 0 ? 1 : 0;
      const span = along(
        Math.max(region.bounds[other]![0], central[other]![0]),
        Math.min(region.bounds[other]![1], central[other]![1])
      );
      for (const upper of [false, true]) {
        const edge = region.bounds[axis]![upper ? 1 : 0];
        const boundary = central[axis]![upper ? 1 : 0];
        const crossings: [number, number][] = [
          [upper ? edge - 1 : edge, upper ? edge : edge - 1],
          [upper ? boundary - 1 : boundary, upper ? boundary : boundary - 1]
        ];
        for (const [index, [inside, outside]] of crossings.entries()) {
          if (!within([region.bounds[axis]!], [inside])) {
            continue;
          }
          if (!within([central[axis]!], [inside])) {
            continue;
          }
          for (const at of span) {
            const into = pointOn(axis, inside, at);
            const from = pointOn(axis, outside, at);
            // Within the central half the neighbour must lie in no available region; across
            // its edge the neighbour is past it, where nothing is selected.
            if (
              (index === 0 &&
                (!within(central, from) || regionAt(regions, from) !== null)) ||
              (index === 1 && within(central, from))
            ) {
              continue;
            }
            const entered = regionAt(regions, into);
            if (entered !== null && !found.has(entered)) {
              found.set(entered, { after: into, before: from, kind: 'walk' });
            }
          }
        }
      }
    }
  }
  return [...found].map(([region, step]) => ({ region, step }));
};

/// A reached node, and the node and step it was first reached by: null for a start.
export interface Reached {
  readonly from: Node | null;
  readonly node: Node;
  readonly step: Step | null;
}

/// Every node of `structure` a player can stand in while carrying `keys`, breadth first.
export const reachableNodes = (
  structure: Structure,
  keys: ReadonlySet<number>,
  starts: readonly Node[] = structure.starts
): ReadonlyMap<string, Reached> => {
  const seen = new Map<string, Reached>();
  const queue: Reached[] = starts.map(node => ({
    from: null,
    node,
    step: null
  }));
  while (queue.length > 0) {
    const reached = queue.shift()!;
    const { node } = reached;
    if (seen.has(nodeKey(node))) {
      continue;
    }
    seen.set(nodeKey(node), reached);
    const placement = structure.floors.get(node.floor)!;
    const regions = clampRegions(placement, region => {
      const key = regionKey(placement, region);
      return region.gate !== 'attachmentLatch' || key === null || keys.has(key);
    });
    const next =
      node.region === OUTSIDE
        ? enteredFromOutside(regions, structure.central)
        : walkedFrom(
            regions,
            node.region,
            structure.central,
            // Past the central half the port keeps the Floor; whether a Floor other than the
            // ground can be left that way is not claimed.
            node.floor === 0
          );
    for (const { region, step } of next) {
      queue.push({ from: node, node: { floor: node.floor, region }, step });
    }
    if (node.region === OUTSIDE) {
      continue;
    }
    const here = placement.selection!.structure.regions[node.region]!;
    if ((here.flags & LIFT_REGION) === 0) {
      continue;
    }
    // A ride arrives at the same X and Z with every door shut.
    const at: Point2 = [
      Math.floor((here.bounds[0]![0] + here.bounds[0]![1]) / 2),
      Math.floor((here.bounds[1]![0] + here.bounds[1]![1]) / 2)
    ];
    for (const [floor, floored] of structure.floors) {
      if (floor === node.floor) {
        continue;
      }
      const arrived = regionAt(
        clampRegions(floored, region => region.gate !== 'attachmentLatch'),
        at
      );
      if (arrived !== null) {
        queue.push({
          from: node,
          node: { floor, region: arrived },
          step: { at, floor, kind: 'ride' }
        });
      }
    }
  }
  return seen;
};

/// Where in `node` a player stands closest to the resident at `residence`, if close enough to
/// select it: the nearest point of the region's inset box within the central half.
export const selectablePoint = (
  structure: Structure,
  node: Node,
  residence: { readonly position: { x: number; y: number; z: number } }
): Point2 | null => {
  if (node.region === OUTSIDE) {
    return null;
  }
  const region = structure.floors.get(node.floor)!.selection!.structure.regions[
    node.region
  ]!;
  const clearance = clearanceFor(region.flags);
  const box = workspaceBounds(region).map(([min, max], axis) => [
    Math.max(min + clearance, structure.central[axis]![0]),
    Math.min(max - clearance, structure.central[axis]![1]) - 1
  ]);
  if (box.some(([min, max]) => min! > max!)) {
    return null;
  }
  // The session places a structure resident at its parent's position plus its own, unturned.
  const { heading } = structure.ground;
  const { x, y, z } = residence.position;
  const resident = [
    x * Math.cos(heading) - z * Math.sin(heading),
    (x * Math.sin(heading) + z * Math.cos(heading)) *
      (structure.negate ? -1 : 1)
  ];
  const point = box.map(([min, max], axis) =>
    Math.min(Math.max(resident[axis]!, min!), max!)
  ) as unknown as Point2;
  const rise =
    structure.ground.position.y +
    y -
    (node.floor * structure.storey + structure.eye);
  return Math.hypot(point[0] - resident[0]!, point[1] - resident[1]!, rise) <
    SELECTION_RANGE
    ? point
    : null;
};

/// The steps from a start to `target`, in order.
export const routeTo = (
  reached: ReadonlyMap<string, Reached>,
  target: Node
): Reached[] => {
  const route: Reached[] = [];
  let at = reached.get(nodeKey(target));
  while (at !== undefined) {
    route.unshift(at);
    at = at.from === null ? undefined : reached.get(nodeKey(at.from));
  }
  return route;
};

/// The central half of `placement`'s cell in its local X and Z: the world box's corners taken into
/// the local frame.
const centralHalf = (
  placement: ErisPlacement,
  content: DamoclesContent
): Box => {
  const { cellUnits } = content.doc.grid;
  const negate = content.doc.orientation.modelZ === 'negate';
  const cell = (value: number): number => Math.floor(value / cellUnits);
  const x = cell(placement.position.x);
  const z = cell(placement.position.z);
  const corners = [0.25, 0.75].flatMap(fx =>
    [0.25, 0.75].map(fz => {
      const dx = (x + fx) * cellUnits - placement.position.x;
      const dz = (z + fz) * cellUnits - placement.position.z;
      const cos = Math.cos(placement.heading);
      const sin = Math.sin(placement.heading);
      return [
        dx * cos - dz * sin,
        (dx * sin + dz * cos) * (negate ? -1 : 1)
      ] as const;
    })
  );
  return [0, 1].map(axis => {
    const values = corners.map(corner => corner[axis]!);
    return [
      Math.ceil(Math.min(...values)),
      Math.floor(Math.max(...values))
    ] as const;
  });
};

/// The structures of every admitted on-foot Pose's Body, each with where a player is stood in it.
export const admittedStructures = async (
  content: DamoclesContent
): Promise<{
  /// Parents Atlas Travel would not stand the player at, and why.
  readonly declined: ReadonlyMap<string, string>;
  readonly structures: readonly Structure[];
}> => {
  const structures = new Map<string, Structure>();
  const declined = new Map<string, string>();
  const structureOf = (body: string, ground: ErisPlacement, cell: string) => {
    const key = `${body}/${ground.id}`;
    let structure = structures.get(key);
    if (structure === undefined) {
      const floors = new Map<number, ErisPlacement>([[0, ground]]);
      for (const entry of floorsOf(ground, content.models)) {
        const floored = floorPlacement(ground, content.models, entry.level);
        if (floored?.selection !== undefined) {
          floors.set(entry.level, floored);
        }
      }
      structure = {
        body,
        cell,
        central: centralHalf(ground, content),
        enter: new Map(),
        eye: content.doc.eye.heightUnits,
        floors,
        ground,
        negate: content.doc.orientation.modelZ === 'negate',
        starts: [],
        storey: content.models.peek(ground.modelId)?.storeyHeight ?? 0
      };
      structures.set(key, structure);
    }
    return structure;
  };
  const visit = (
    session: DamoclesSession,
    cell: string,
    pose: string | null,
    enter: () => DamoclesSession
  ): void => {
    const bound = session.snapshot.structure;
    if (bound === null) {
      return;
    }
    // A Pose on an upper Floor publishes that Floor's placement as the surface's, so the
    // ground placement is read from the same Pose stood back on Floor 0.
    let grounded = session;
    if (bound.floor !== 0) {
      if (pose === null) {
        throw new Error(`${cell} stands on Floor ${bound.floor}`);
      }
      grounded = new DamoclesSession(content);
      grounded.switchToPose(pose);
      if (grounded.changeFloor(0).kind !== 'moved') {
        throw new Error(
          `${cell} cannot stand on Floor 0 of ${bound.instanceId}`
        );
      }
    }
    const ground = structureInCell(
      grounded.snapshot.surface,
      grounded.snapshot.pose.position
    );
    if (ground?.id !== bound.instanceId) {
      throw new Error(`${cell} binds ${bound.instanceId}, not ${ground?.id}`);
    }
    const structure = structureOf(session.snapshot.pose.body, ground, cell);
    const region = bound.regionIndex ?? OUTSIDE;
    if (
      region !== OUTSIDE &&
      structure.floors.get(bound.floor)?.selection?.structure.regions[
        region
      ] === undefined
    ) {
      throw new Error(
        `${cell} stands in region ${region} of Floor ${bound.floor} of ${ground.id}, which the graph does not hold`
      );
    }
    const node = { floor: bound.floor, region };
    if (!structure.enter.has(nodeKey(node))) {
      structure.starts.push(node);
      structure.enter.set(nodeKey(node), enter);
    }
  };
  for (const pose of content.poses.poses) {
    if (!pose.onFoot) {
      continue;
    }
    const arrival = new DamoclesSession(content);
    if (arrival.switchToPose(pose.id).kind !== 'switched') {
      continue;
    }
    visit(arrival, `pose ${pose.id}`, pose.id, () => {
      const session = new DamoclesSession(content);
      session.switchToPose(pose.id);
      return session;
    });
  }
  // Atlas Travel to the centre of every resident's parent's cell, standing in for the flight there.
  const parents = new Set(
    content.catalogue.instances.flatMap(item =>
      item.placement === null ? [] : [item.placement.parent]
    )
  );
  for (const parent of [...parents].sort()) {
    const location = content.catalogue.instances.find(
      item => item.id === parent
    )?.location;
    if (location === undefined || location === null) {
      declined.set(parent, 'its parent has no location');
      continue;
    }
    // The cell's centre, or where Atlas Travel refuses it, a point a quarter-cell away.
    let target: { bodyId: string; x: number; z: number } | undefined;
    let session: DamoclesSession | undefined;
    let reason = '';
    for (const [dx, dz] of [
      [0.5, 0.5],
      [0.25, 0.5],
      [0.75, 0.5],
      [0.5, 0.25],
      [0.5, 0.75]
    ] as const) {
      const pin = {
        bodyId: location.body,
        // Body Coordinates are whole Surface Cells.
        x: Math.floor(location.position[0]) + dx,
        z: Math.floor(location.position[2]) + dz
      };
      await DamoclesSession.prepareAtlasTravel(content, pin);
      const tried = new DamoclesSession(content);
      const travelled = tried.travelToAtlas(pin);
      if (travelled.kind === 'travelled') {
        target = pin;
        session = tried;
        break;
      }
      reason = travelled.reason;
    }
    if (target === undefined || session === undefined) {
      declined.set(parent, reason);
      continue;
    }
    const pin = target;
    visit(session, `${parent} cell`, null, () => {
      const entered = new DamoclesSession(content);
      entered.travelToAtlas(pin);
      return entered;
    });
  }
  return { declined, structures: [...structures.values()] };
};

export type Reach =
  /// Selected with no door key carried.
  | { readonly kind: 'noKey' }
  /// Selected once these door keys, themselves reachable, are carried.
  | { readonly keys: readonly number[]; readonly kind: 'keyed' }
  /// Its parent is in a reached cell, but no reachable region on its Floor exposes it in range.
  | { readonly keys: readonly number[]; readonly kind: 'unexposed' }
  /// Atlas Travel stands no player in its parent's cell.
  | { readonly kind: 'untravelled'; readonly reason: string };

export interface Reachability {
  /// The door keys every reached structure's doors want, and the keys the fixed point carried.
  readonly carried: readonly number[];
  readonly reach: ReadonlyMap<string, Reach>;
  readonly wanted: readonly number[];
}

/// Every placed structure resident's reach, keys carried to a fixed point. With `groundOnly`,
/// only starts on Floor 0 are walked from, so every upper Floor is reached by lift.
export const residentReachability = (
  catalogue: Catalogue,
  { declined, structures }: Awaited<ReturnType<typeof admittedStructures>>,
  groundOnly = false
): Reachability => {
  const residents = catalogue.instances.filter(
    item => item.placement !== null && item.association !== null
  );
  const wanted = new Set<number>();
  for (const structure of structures) {
    for (const placement of structure.floors.values()) {
      for (const region of placement.selection!.structure.regions) {
        const key = regionKey(placement, region);
        if (key !== null) {
          wanted.add(key);
        }
      }
    }
  }
  const byParent = new Map<string, Structure[]>();
  for (const structure of structures) {
    byParent.set(structure.ground.id, [
      ...(byParent.get(structure.ground.id) ?? []),
      structure
    ]);
  }
  const reachedWith = (keys: ReadonlySet<number>): Set<string> => {
    const reached = new Set<string>();
    const nodes = new Map(
      structures.map(structure => [
        structure,
        [
          ...reachableNodes(
            structure,
            keys,
            groundOnly
              ? structure.starts.filter(node => node.floor === 0)
              : structure.starts
          ).values()
        ].map(item => item.node)
      ])
    );
    for (const item of residents) {
      const residence = catalogueResidence(catalogue, item.id);
      if (residence?.kind !== 'structure') {
        continue;
      }
      for (const structure of byParent.get(residence.parent) ?? []) {
        if (
          nodes
            .get(structure)!
            .some(
              node =>
                node.floor === residence.level &&
                insertionsInRegion(
                  catalogue,
                  item.id,
                  residence,
                  node.region + 1
                ) > 0 &&
                selectablePoint(structure, node, residence) !== null
            )
        ) {
          reached.add(item.id);
        }
      }
    }
    return reached;
  };
  const reach = new Map<string, Reach>();
  const carried = new Set<number>();
  for (;;) {
    const reached = reachedWith(carried);
    for (const id of reached) {
      if (!reach.has(id)) {
        reach.set(
          id,
          carried.size === 0 ? { kind: 'noKey' } : { keys: [], kind: 'keyed' }
        );
      }
    }
    const more = [...wanted].filter(
      slot => !carried.has(slot) && reached.has(`object-slot-${slot}`)
    );
    if (more.length === 0) {
      break;
    }
    for (const slot of more) {
      carried.add(slot);
    }
  }
  // Name, for each keyed resident, the keys without any one of which it is not reached.
  const needs = new Map(
    [...reach]
      .filter(([, item]) => item.kind === 'keyed')
      .map(([id]) => [id, [] as number[]])
  );
  for (const slot of carried) {
    const without = reachedWith(
      new Set([...carried].filter(item => item !== slot))
    );
    for (const [id, keys] of needs) {
      if (!without.has(id)) {
        keys.push(slot);
      }
    }
  }
  for (const [id, keys] of needs) {
    reach.set(id, { keys: keys.sort((a, b) => a - b), kind: 'keyed' });
  }
  for (const item of residents) {
    if (reach.has(item.id)) {
      continue;
    }
    const residence = catalogueResidence(catalogue, item.id);
    reach.set(
      item.id,
      residence?.kind === 'structure' && byParent.has(residence.parent)
        ? { keys: [...carried].sort((a, b) => a - b), kind: 'unexposed' }
        : {
            kind: 'untravelled',
            reason:
              (residence?.kind === 'structure'
                ? declined.get(residence.parent)
                : undefined) ?? 'its parent is bound in no cell travelled to'
          }
    );
  }
  return {
    carried: [...carried].sort((a, b) => a - b),
    reach,
    wanted: [...wanted].sort((a, b) => a - b)
  };
};

const wrap = (angle: number): number =>
  Math.atan2(Math.sin(angle), Math.cos(angle));
const sameNode = (here: Node | null, node: Node): boolean =>
  here !== null && nodeKey(here) === nodeKey(node);

/// Walk `route` in a live session carrying `keys`, as a player would, then on to `finish`: turn to face each crossing, walk to it, wait
/// at a door until it opens, and ride each lift. Returns the session where the route ends, or
/// throws naming the step the session refused.
export const walkRoute = (
  content: DamoclesContent,
  structure: Structure,
  route: readonly Reached[],
  keys: readonly number[] = [],
  finish?: Point2
): DamoclesSession => {
  const start = route[0]!;
  const session = structure.enter.get(nodeKey(start.node))!();
  // The keys are taken from afar, as the console's `get` does: where each was reached is the
  // graph's claim, and a walk to it is its own route.
  for (const slot of keys) {
    if (session.takeObject(slot).kind !== 'took') {
      throw new Error(`door key ${slot} could not be taken`);
    }
  }
  const negate = content.doc.orientation.modelZ === 'negate';
  const { heading, position } = structure.ground;
  const world = ([x, z]: Point2): { x: number; z: number } => {
    const local = z * (negate ? -1 : 1);
    return {
      x: position.x + x * Math.cos(heading) + local * Math.sin(heading),
      z: position.z - x * Math.sin(heading) + local * Math.cos(heading)
    };
  };
  const at = (): Node | null => {
    const bound = session.snapshot.structure;
    return bound === null
      ? null
      : { floor: bound.floor, region: bound.regionIndex ?? OUTSIDE };
  };
  /// Face `target` and walk towards it until within two units of it or, given `until`, on past it
  /// until `until` holds, waiting at a door while it opens. Gives up after two minutes.
  const walkTo = (
    target: Point2,
    until?: (node: Node | null) => boolean
  ): void => {
    const goal = world(target);
    for (let elapsed = 0; elapsed < 120;) {
      if (until?.(at()) === true) {
        break;
      }
      const here = session.snapshot.pose;
      const dx = goal.x - here.position.x;
      const dz = goal.z - here.position.z;
      const distance = Math.hypot(dx, dz);
      const turn = wrap(Math.atan2(dx, dz) - here.heading);
      if (distance < 2 && until === undefined) {
        break;
      }
      session.intent =
        distance >= 2 && Math.abs(turn) > 0.02
          ? { ...session.intent, turn: Math.sign(turn), walk: 0 }
          : { ...session.intent, turn: 0, walk: 1 };
      // Long strides while far off, fine ones near a crossing.
      const seconds = distance > 400 && Math.abs(turn) <= 0.02 ? 0.05 : 0.005;
      session.advance(seconds);
      elapsed += seconds;
    }
    session.intent = { ...session.intent, turn: 0, walk: 0 };
  };
  for (const [index, reached] of route.entries()) {
    const { node, step } = reached;
    if (step === null) {
      continue;
    }
    if (step.kind === 'walk') {
      walkTo(step.before);
      walkTo(step.after, here => sameNode(here, node));
    } else {
      walkTo(step.at);
      if (session.rideLift(step.floor).kind !== 'admitted') {
        throw new Error(`step ${index}: the lift refused Floor ${step.floor}`);
      }
      for (let tick = 0; tick < 6000 && !sameNode(at(), node); tick += 1) {
        session.advance(0.01);
      }
    }
    if (!sameNode(at(), node)) {
      const here = session.snapshot.pose.position;
      const dx = here.x - position.x;
      const dz = here.z - position.z;
      const local = [
        Math.round(dx * Math.cos(heading) - dz * Math.sin(heading)),
        Math.round(
          (dx * Math.sin(heading) + dz * Math.cos(heading)) * (negate ? -1 : 1)
        )
      ];
      throw new Error(
        `step ${index}: stood in ${JSON.stringify(at())} at local ${JSON.stringify(local)}, not ${JSON.stringify(node)}; doors ${JSON.stringify(session.snapshot.structure?.attachments)}`
      );
    }
  }
  if (finish !== undefined) {
    walkTo(finish);
  }
  return session;
};

/// Walk to object `id` by the graph's route carrying `keys`, from `starts` (every start by
/// default), and stand where it is selectable.
export const walkToResident = (
  content: DamoclesContent,
  structures: readonly Structure[],
  id: string,
  keys: readonly number[] = [],
  starts?: (structure: Structure) => readonly Node[]
): DamoclesSession => {
  const residence = catalogueResidence(content.catalogue, id);
  if (residence?.kind !== 'structure') {
    throw new Error(`${id} is not a structure resident`);
  }
  for (const structure of structures) {
    if (structure.ground.id !== residence.parent) {
      continue;
    }
    const reached = reachableNodes(
      structure,
      new Set(keys),
      starts?.(structure) ?? structure.starts
    );
    for (const item of reached.values()) {
      const point =
        item.node.floor === residence.level &&
        insertionsInRegion(
          content.catalogue,
          id,
          residence,
          item.node.region + 1
        ) > 0
          ? selectablePoint(structure, item.node, residence)
          : null;
      if (point !== null) {
        return walkRoute(
          content,
          structure,
          routeTo(reached, item.node),
          keys,
          point
        );
      }
    }
  }
  throw new Error(`no route reaches ${id}`);
};
