import type { Mesh, Model, Point, Primitive } from './data.ts';
import { HIGH_SENTINEL, LOW_SENTINEL, axisLabel, byRecord } from './forms.ts';

/**
 * Inspection forms built from a structure's recovered region selector.
 *
 * The native on-foot renderer picks one region from the player's position and
 * draws that region's queue: plan walls, Entrance Attachments and the faces an
 * attachment contributes, in source order. Region flags say whether the linked
 * building detail joins in and which of the two lists is drawn first. The
 * catalogue cannot know where the player stands, so it offers every region as
 * its own form and uses the detail group's default record list, the list the
 * game draws when no detail box contains the player.
 */

/** Region flag bits read by the native drawing order at `$05A7F6`. */
const WITH_DETAIL = 0x80_00;
const PLAN_FIRST = 0x40_00;
const DETAIL_FIRST = 0x10_00;

const shifted = (primitive: Primitive, offset: number): Primitive => ({
  ...primitive,
  vertices: primitive.vertices.map(index => index + offset)
});

const merge = (parts: readonly Mesh[]): Mesh => {
  const vertices: Point[] = [];
  const faces: Primitive[] = [];
  const lines: Primitive[] = [];
  for (const part of parts) {
    const offset = vertices.length;
    vertices.push(...part.vertices);
    faces.push(...part.faces.map(face => shifted(face, offset)));
    lines.push(...part.lines.map(line => shifted(line, offset)));
  }
  return { faces, lines, vertices };
};

const scaled = (mesh: Mesh, [x, z]: readonly [number, number]): Mesh => ({
  ...mesh,
  vertices: mesh.vertices.map(([a, b, c]) => [a * x, b, c * z] as Point)
});

export interface RegionForm {
  /** Region forms never carry the spaceport's door or camera extras. */
  readonly doorState?: undefined;
  readonly id: string;
  readonly inspectionAngle?: undefined;
  readonly mesh: Mesh;
  readonly name: string;
  readonly view?: undefined;
}

/**
 * One inspection form per recovered region, in source order.
 *
 * Regions that name nothing drawable are left out rather than offered as an
 * empty view.
 */
export const regionForms = (
  model: Model,
  detail: Model | undefined
): readonly RegionForm[] => {
  const selection = model.structureSelection;
  if (selection === undefined) {
    return [];
  }
  const plan = byRecord(selection.plan.faces);
  const attachments = new Map(
    selection.attachments.map(item => [item.slot, item])
  );
  const detailMesh = detail?.variants.find(
    form => form.id === selection.detailVariant
  )?.mesh;
  const detailFaces =
    detailMesh === undefined ? undefined : byRecord(detailMesh.faces);
  const detailLines =
    detailMesh === undefined ? undefined : byRecord(detailMesh.lines);
  const forms: RegionForm[] = [];
  for (const [index, region] of selection.regions.entries()) {
    const planParts: Mesh[] = [];
    for (const entry of region.queue) {
      if (entry.kind === 'face') {
        const faces = plan.get(entry.index) ?? [];
        planParts.push({ ...selection.plan, faces, lines: [] });
        continue;
      }
      const attachment = attachments.get(entry.slot);
      if (attachment === undefined) {
        continue;
      }
      if (entry.kind === 'attachment') {
        planParts.push(attachment.mesh);
        continue;
      }
      const face = attachment.mesh.faces[entry.index];
      if (face !== undefined) {
        planParts.push({ ...attachment.mesh, faces: [face], lines: [] });
      }
    }
    const detailParts: Mesh[] = [];
    const group = detail?.detailSelection?.[1];
    if (
      (region.flags & WITH_DETAIL) !== 0 &&
      group !== undefined &&
      detailMesh !== undefined &&
      detailFaces !== undefined &&
      detailLines !== undefined
    ) {
      detailParts.push(
        scaled(
          {
            ...detailMesh,
            faces: group.default.flatMap(
              record => detailFaces.get(record) ?? []
            ),
            lines: group.default.flatMap(
              record => detailLines.get(record) ?? []
            )
          },
          selection.scale
        )
      );
    }
    const planFirst =
      (region.flags & PLAN_FIRST) !== 0 && (region.flags & DETAIL_FIRST) === 0;
    const mesh = merge(
      planFirst
        ? [...planParts, ...detailParts]
        : [...detailParts, ...planParts]
    );
    if (mesh.faces.length === 0 && mesh.lines.length === 0) {
      continue;
    }
    const where = [
      axisLabel('X', region.bounds[0] ?? [LOW_SENTINEL, HIGH_SENTINEL]),
      axisLabel('Z', region.bounds[1] ?? [LOW_SENTINEL, HIGH_SENTINEL])
    ].join(', ');
    forms.push({
      id: `region-${index}`,
      mesh,
      name: `Region ${index + 1} · viewer within ${where}`
    });
  }
  return forms;
};
