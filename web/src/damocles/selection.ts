import type {
  Bounds,
  EntranceAttachment,
  Mesh,
  Primitive
} from '../catalogue/data.ts';
import type { Vector3 } from '../orientation/index.ts';
import type { ErisPlacement, Pose } from './world.ts';

const EYE_CLEARANCE = 11;
const LEAF_ENDPOINT_INSET = 8;
export type AttachmentUnits = (slot: number) => number;
const closedAttachment: AttachmentUnits = () => 0;

const subsets = new WeakMap<object, Mesh>();
const subset = (key: object, mesh: Mesh, faces: readonly Primitive[]): Mesh => {
  const cached = subsets.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const result = { ...mesh, faces, lines: [] };
  subsets.set(key, result);
  return result;
};
const scaledDetails = new WeakMap<object, Mesh>();

/** A world position expressed in a placement's model-local frame. */
export const structureLocalPosition = (
  placement: ErisPlacement,
  position: Vector3,
  negateZ: boolean
): Vector3 => {
  const dx = position.x - placement.position.x;
  const dz = position.z - placement.position.z;
  const cos = Math.cos(placement.heading);
  const sin = Math.sin(placement.heading);
  return {
    x: dx * cos - dz * sin,
    y: position.y - placement.position.y,
    z: (dx * sin + dz * cos) * (negateZ ? -1 : 1)
  };
};

export const insideLocalBox = (
  point: Vector3,
  box: {
    readonly x: readonly [number, number];
    readonly z: readonly [number, number];
  }
): boolean =>
  box.x[0] <= point.x &&
  point.x < box.x[1] &&
  box.z[0] <= point.z &&
  point.z < box.z[1];

export const attachmentOpenLimit = (attachment: EntranceAttachment): number => {
  const axis = attachment.constructor.motionAxis === 'x' ? 0 : 2;
  const values = attachment.mesh.vertices.map(vertex => vertex[axis]);
  const span = Math.max(...values) - Math.min(...values);
  return (
    (attachment.constructor.leafCount === 2 ? span / 2 : span) -
    LEAF_ENDPOINT_INSET
  );
};

const regionIsAvailable = (
  placement: ErisPlacement,
  region: NonNullable<
    ErisPlacement['selection']
  >['structure']['regions'][number],
  openUnits: AttachmentUnits
): boolean => {
  if (region.gate !== 'attachmentLatch') {
    return true;
  }
  const slot = region.flags & 0x03_fc;
  const attachment = placement.selection!.structure.attachments.find(
    item => item.slot === slot
  )!;
  return openUnits(slot) >= attachmentOpenLimit(attachment);
};

/** Bind-time ±11 copy on the resolved axis. `$0200` remains unresolved and uninset. */
const workspaceBounds = (
  region: NonNullable<
    ErisPlacement['selection']
  >['structure']['regions'][number]
): Bounds => {
  if (region.insetAxis === undefined) {
    return region.bounds;
  }
  const axis = region.insetAxis === 'x' ? 0 : 1;
  return region.bounds.map((pair, index) =>
    index === axis
      ? ([pair[0] + EYE_CLEARANCE, pair[1] - EYE_CLEARANCE] as const)
      : pair
  );
};

export const structureRegionAt = (
  placement: ErisPlacement,
  pose: Pose,
  negateZ: boolean,
  openUnits: AttachmentUnits = closedAttachment
): number | null => {
  const selection = placement.selection;
  if (selection === undefined) {
    return null;
  }
  const point = structureLocalPosition(placement, pose.position, negateZ);
  const local = [point.x, point.z];
  const index = selection.structure.regions.findIndex(region => {
    const bounds = workspaceBounds(region);
    return (
      regionIsAvailable(placement, region, openUnits) &&
      bounds.every(
        ([min, max], axis) => min <= local[axis]! && local[axis]! < max
      )
    );
  });
  return index < 0 ? null : index;
};

const worldPosition = (
  placement: ErisPlacement,
  local: Vector3,
  negateZ: boolean
): Vector3 => {
  const cos = Math.cos(placement.heading);
  const sin = Math.sin(placement.heading);
  const z = local.z * (negateZ ? -1 : 1);
  return {
    x: placement.position.x + local.x * cos + z * sin,
    y: placement.position.y + local.y,
    z: placement.position.z - local.x * sin + z * cos
  };
};

/** Extra clamp inset when `$7B35` is non-negative (`tst.b` / `bmi` skip). */
const clearanceFor = (flags: number): number =>
  (flags & 0x00_ff) < 0x80 ? EYE_CLEARANCE : 0;

export interface ClampedStructureStep {
  readonly pose: Pose;
  readonly regionIndex: number | null;
}

/** Apply the Working Authority's selected-region XZ eye pushback after one Mover step. */
export const clampStructureStep = (
  placement: ErisPlacement,
  from: Pose,
  to: Pose,
  negateZ: boolean,
  openUnits: AttachmentUnits,
  selectedRegionIndex: number | null
): ClampedStructureStep => {
  const selection = placement.selection;
  if (selection === undefined) {
    return { pose: to, regionIndex: null };
  }
  const regions = selection.structure.regions;
  const currentIndex =
    selectedRegionIndex ??
    structureRegionAt(placement, from, negateZ, openUnits);
  const current = currentIndex === null ? undefined : regions[currentIndex];
  if (current === undefined) {
    return {
      pose: to,
      regionIndex: structureRegionAt(placement, to, negateZ, openUnits)
    };
  }

  const local = structureLocalPosition(placement, to.position, negateZ);
  const coordinates = [local.x, local.z];
  const currentBounds = workspaceBounds(current);
  const clearance = clearanceFor(current.flags);
  const adjusted = [
    [currentBounds[0]![0] + clearance, currentBounds[0]![1] - clearance],
    [currentBounds[1]![0] + clearance, currentBounds[1]![1] - clearance]
  ] as const;

  const admitsNeighbour = (axis: number, upper: boolean): boolean => {
    const other = axis === 0 ? 1 : 0;
    const edge = currentBounds[axis]![upper ? 1 : 0];
    return regions.some((region, index) => {
      const bounds = workspaceBounds(region);
      return (
        index !== currentIndex &&
        regionIsAvailable(placement, region, openUnits) &&
        bounds[axis]![upper ? 0 : 1] === edge &&
        bounds[other]![0] + clearance <= coordinates[other]! &&
        coordinates[other]! < bounds[other]![1] - clearance
      );
    });
  };

  for (const axis of [0, 1]) {
    const [min, max] = adjusted[axis]!;
    if (coordinates[axis]! < min && !admitsNeighbour(axis, false)) {
      coordinates[axis] = min;
    } else if (coordinates[axis]! >= max && !admitsNeighbour(axis, true)) {
      coordinates[axis] = max - 1;
    }
  }

  const pose = {
    body: to.body,
    heading: to.heading,
    position: worldPosition(
      placement,
      { x: coordinates[0]!, y: local.y, z: coordinates[1]! },
      negateZ
    )
  };
  return {
    pose,
    regionIndex:
      structureRegionAt(placement, pose, negateZ, openUnits) ?? currentIndex
  };
};

const movingAttachment = (
  attachment: EntranceAttachment,
  openUnits: number
): Mesh => {
  const { mesh } = attachment;
  if (openUnits <= 0) {
    return mesh;
  }
  const axis = attachment.constructor.motionAxis === 'x' ? 0 : 2;
  const values = mesh.vertices.map(vertex => vertex[axis]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const midpoint = (minimum + maximum) / 2;
  const split = mesh.vertices.length / 2;
  return {
    ...mesh,
    vertices: mesh.vertices.map((vertex, index) => {
      const coordinate = vertex[axis];
      let delta = 0;
      if (attachment.constructor.leafCount === 2 && coordinate === midpoint) {
        delta = index < split ? -openUnits : openUnits;
      } else if (
        attachment.constructor.leafCount === 1 &&
        attachment.constructor.movingSide === 'low' &&
        coordinate === minimum
      ) {
        delta = openUnits;
      } else if (
        attachment.constructor.leafCount === 1 &&
        attachment.constructor.movingSide === 'high' &&
        coordinate === maximum
      ) {
        delta = -openUnits;
      }
      if (delta === 0) {
        return vertex;
      }
      const moved = [...vertex] as [number, number, number];
      moved[axis] += delta;
      return moved;
    })
  };
};

/** Ordered draw components for today's on-foot session. Empty selections are intentional. */
export const structureMeshes = (
  placement: ErisPlacement,
  pose: Pose,
  negateZ: boolean,
  openUnits: AttachmentUnits = closedAttachment,
  selectedRegionIndex?: number | null
): readonly Mesh[] => {
  const fallback = () => (placement.mesh === undefined ? [] : [placement.mesh]);
  const selection = placement.selection;
  if (selection === undefined) {
    return fallback();
  }
  const { groups, structure } = selection;
  const point = structureLocalPosition(placement, pose.position, negateZ);
  const local = [point.x, point.y, point.z];
  const regionIndex =
    selectedRegionIndex === undefined
      ? structureRegionAt(placement, pose, negateZ, openUnits)
      : selectedRegionIndex;
  const region =
    regionIndex === null ? undefined : structure.regions[regionIndex];
  if (region === undefined) {
    return fallback();
  }
  const plan = region.queue.flatMap(entry => {
    if (entry.kind === 'attachment') {
      const attachment = structure.attachments.find(
        item => item.slot === entry.slot
      )!;
      return [movingAttachment(attachment, openUnits(entry.slot))];
    }
    const face = structure.plan.faces.find(f => f.sourceIndex === entry.index)!;
    return [subset(face, structure.plan, [face])];
  });
  const detail: Mesh[] = [];
  if ((region.flags & 0x80_00) !== 0) {
    const scales = [structure.scale[0], 1, structure.scale[1]];
    const group = groups[1]!;
    const records =
      group.boxes.find(box =>
        box.bounds.every(([min, max], axis) => {
          const scale = scales[axis]!;
          const a =
            min === -32_768 && axis !== 1
              ? -2_147_483_647 * Math.sign(scale)
              : min * scale;
          const b =
            max === 32_767 ? 2_147_483_647 * Math.sign(scale) : max * scale;
          return (
            Math.min(a, b) < local[axis]! && local[axis]! <= Math.max(a, b)
          );
        })
      )?.records ?? group.default;
    let scaled = scaledDetails.get(selection);
    if (scaled === undefined) {
      scaled = {
        ...selection.detail,
        vertices: selection.detail.vertices.map(([x, y, z]) => [
          x * structure.scale[0],
          y,
          z * structure.scale[1]
        ])
      };
      scaledDetails.set(selection, scaled);
    }
    // Cache per scaled model as list identities may be shared by differently scaled aliases.
    let lists = detailLists.get(scaled);
    if (lists === undefined) {
      lists = new WeakMap();
      detailLists.set(scaled, lists);
    }
    let selected = lists.get(records);
    if (selected === undefined) {
      // A selection byte names a source record, which may contribute several
      // filled glyph faces, a stroke line, or nothing at all.
      const byRecord = (primitives: readonly Primitive[]) => {
        const index = new Map<number, Primitive[]>();
        for (const primitive of primitives) {
          const key = primitive.sourceIndex;
          if (key === undefined) {
            continue;
          }
          const bucket = index.get(key);
          if (bucket === undefined) {
            index.set(key, [primitive]);
          } else {
            bucket.push(primitive);
          }
        }
        return index;
      };
      const facesByRecord = byRecord(scaled.faces);
      const linesByRecord = byRecord(scaled.lines);
      selected = {
        ...scaled,
        faces: records.flatMap(i => facesByRecord.get(i) ?? []),
        lines: records.flatMap(i => linesByRecord.get(i) ?? [])
      };
      lists.set(records, selected);
    }
    detail.push(selected);
  }
  return (region.flags & 0x40_00) !== 0 && (region.flags & 0x10_00) === 0
    ? [...plan, ...detail]
    : [...detail, ...plan];
};
const detailLists = new WeakMap<Mesh, WeakMap<object, Mesh>>();
