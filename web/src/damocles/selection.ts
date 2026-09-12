import type { Mesh, Primitive } from '../catalogue/data.ts';
import type { ErisPlacement, ErisPose } from './world.ts';

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

/** Ordered draw components for today's on-foot session. Empty selections are intentional. */
export const structureMeshes = (
  placement: ErisPlacement,
  pose: ErisPose,
  negateZ: boolean
): readonly Mesh[] => {
  const fallback = () => (placement.mesh === undefined ? [] : [placement.mesh]);
  const selection = placement.selection;
  if (selection === undefined) {
    return fallback();
  }
  const { groups, structure } = selection;
  const dx = pose.position.x - placement.position.x;
  const dz = pose.position.z - placement.position.z;
  const cos = Math.cos(placement.heading);
  const sin = Math.sin(placement.heading);
  const local = [
    dx * cos - dz * sin,
    pose.position.y - placement.position.y,
    (dx * sin + dz * cos) * (negateZ ? -1 : 1)
  ];
  const region = structure.regions.find(r =>
    r.bounds.every(([min, max], axis) => {
      const p = local[axis === 0 ? 0 : 2]!;
      return min <= p && p < max;
    })
  );
  if (region === undefined) {
    return fallback();
  }
  const plan = region.queue.map(entry => {
    if (entry.kind === 'attachment') {
      return structure.attachment!;
    }
    const face = structure.plan.faces.find(f => f.sourceIndex === entry.index)!;
    return subset(face, structure.plan, [face]);
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
