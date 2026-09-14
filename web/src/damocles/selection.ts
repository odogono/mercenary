import type { Mesh, Primitive } from '../catalogue/data.ts';
import type { Vector3 } from '../orientation/index.ts';
import type { ErisPlacement, ErisPose } from './world.ts';

const ATTACHMENT_SLOT = 0x03_fc;

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

type Segment = readonly [readonly [number, number], readonly [number, number]];

const verticalSegments = (mesh: Mesh): readonly Segment[] =>
  mesh.faces.flatMap(face => {
    const points = face.vertices.map(index => mesh.vertices[index]!);
    const heights = new Set(points.map(point => point[1]));
    // Plan Refusal follows grounded vertical boundaries. Horizontal floors/roofs and raised
    // bands such as the doorway lintel do not close an aperture in XZ.
    if (heights.size < 2 || Math.min(...heights) !== 0) {
      return [];
    }
    const footprint = new Map(
      points.map(point => [
        `${point[0]},${point[2]}`,
        [point[0], point[2]] as const
      ])
    );
    const endpoints = [...footprint.values()];
    return endpoints.length === 2
      ? [[endpoints[0]!, endpoints[1]!] as const]
      : [];
  });

const planSegments = new WeakMap<object, readonly Segment[]>();
const attachmentSegments = new WeakMap<object, readonly Segment[]>();

const crosses = (
  from: readonly [number, number],
  to: readonly [number, number],
  wall: Segment
): boolean => {
  const moveX = to[0] - from[0];
  const moveZ = to[1] - from[1];
  const wallX = wall[1][0] - wall[0][0];
  const wallZ = wall[1][1] - wall[0][1];
  const denominator = moveX * wallZ - moveZ * wallX;
  if (denominator === 0) {
    return false;
  }
  const dx = wall[0][0] - from[0];
  const dz = wall[0][1] - from[1];
  const alongMove = (dx * wallZ - dz * wallX) / denominator;
  const alongWall = (dx * moveZ - dz * moveX) / denominator;
  return alongMove > 0 && alongMove <= 1 && alongWall >= 0 && alongWall <= 1;
};

/** Whether a free Mover step crosses a vertical plan boundary or closed attachment. */
export const planRefusesStep = (
  placement: ErisPlacement,
  from: ErisPose,
  to: ErisPose,
  negateZ: boolean,
  entranceLatched: boolean
): boolean => {
  const selection = placement.selection;
  if (selection === undefined) {
    return false;
  }
  const localFrom = structureLocalPosition(placement, from.position, negateZ);
  const localTo = structureLocalPosition(placement, to.position, negateZ);
  let plan = planSegments.get(selection.structure);
  if (plan === undefined) {
    plan = verticalSegments(selection.structure.plan);
    planSegments.set(selection.structure, plan);
  }
  let segments = plan;
  const attachment = selection.structure.attachment;
  if (!entranceLatched && attachment !== null) {
    let closed = attachmentSegments.get(attachment);
    if (closed === undefined) {
      closed = verticalSegments(attachment);
      attachmentSegments.set(attachment, closed);
    }
    segments = [...plan, ...closed];
  }
  return segments.some(segment =>
    crosses([localFrom.x, localFrom.z], [localTo.x, localTo.z], segment)
  );
};

/** Ordered draw components for today's on-foot session. Empty selections are intentional. */
export const structureMeshes = (
  placement: ErisPlacement,
  pose: ErisPose,
  negateZ: boolean,
  entranceLatched = false
): readonly Mesh[] => {
  const fallback = () => (placement.mesh === undefined ? [] : [placement.mesh]);
  const selection = placement.selection;
  if (selection === undefined) {
    return fallback();
  }
  const { groups, structure } = selection;
  const point = structureLocalPosition(placement, pose.position, negateZ);
  const local = [point.x, point.y, point.z];
  const region = structure.regions.find(r => {
    if ((r.flags & 0x0f_ff) === ATTACHMENT_SLOT && !entranceLatched) {
      return false;
    }
    return r.bounds.every(([min, max], axis) => {
      const p = local[axis === 0 ? 0 : 2]!;
      return min <= p && p < max;
    });
  });
  if (region === undefined) {
    return fallback();
  }
  const plan = region.queue.flatMap(entry => {
    if (entry.kind === 'attachment') {
      return entranceLatched ? [] : [structure.attachment!];
    }
    const face = structure.plan.faces.find(f => f.sourceIndex === entry.index)!;
    return [subset(face, structure.plan, [face])];
  });
  const detail: Mesh[] = [];
  if ((region.flags & 0x80_00) !== 0) {
    const scales = [structure.scale[0], 1, structure.scale[1]];
    const group = groups[1]!;
    const faces =
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
      )?.faces ?? group.default;
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
    let selected = lists.get(faces);
    if (selected === undefined) {
      selected = {
        ...scaled,
        faces: faces.map(i => scaled!.faces[i]!),
        lines: []
      };
      lists.set(faces, selected);
    }
    detail.push(selected);
  }
  return (region.flags & 0x40_00) !== 0 && (region.flags & 0x10_00) === 0
    ? [...plan, ...detail]
    : [...detail, ...plan];
};
const detailLists = new WeakMap<Mesh, WeakMap<object, Mesh>>();
