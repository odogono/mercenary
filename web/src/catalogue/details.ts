import type { Bounds, Model } from './data.ts';
import { HIGH_SENTINEL, LOW_SENTINEL, axisLabel, byRecord } from './forms.ts';

/**
 * Inspection forms built from a building detail's recovered visibility groups.
 *
 * `$053BF2` builds the record's first group into `$C13C` and its second into
 * `$C2FE`; `$053CC2` picks the second when the player is on foot inside
 * (`$7A8E` is 1 with `$7AF6` and `$7B02` clear and `$7B34` negative) and the
 * first otherwise. `$0539DC` then walks the chosen group's boxes in order,
 * taking the first that contains the player and falling back to the list after
 * the terminator. Free orbit has no player position, so every list is offered
 * as its own form instead of one being guessed.
 *
 * Record lists are palette-independent — the palette variants of a detail all
 * share a record count — so the forms are drawn from the first listed palette.
 */

const AXES = ['X', 'Y', 'Z'];

const where = (bounds: Bounds) =>
  AXES.map((name, axis) =>
    axisLabel(name, bounds[axis] ?? [LOW_SENTINEL, HIGH_SENTINEL])
  ).join(', ');

export interface DetailForm {
  /** Detail forms never carry the spaceport's door or camera extras. */
  readonly doorState?: undefined;
  readonly id: string;
  readonly inspectionAngle?: undefined;
  readonly mesh: Model['variants'][number]['mesh'];
  readonly name: string;
  readonly view?: undefined;
}

/**
 * One inspection form per box and per group default, in source order.
 *
 * A list that names nothing drawable is left out rather than offered as an
 * empty view.
 */
export const detailForms = (model: Model): readonly DetailForm[] => {
  const groups = model.detailSelection;
  const base = model.variants[0];
  if (groups === undefined || base === undefined) {
    return [];
  }
  const faces = byRecord(base.mesh.faces);
  const lines = byRecord(base.mesh.lines);
  const forms: DetailForm[] = [];
  for (const [index, group] of groups.entries()) {
    const lists = [
      ...group.boxes.map((box, order) => ({
        id: `group-${index}-box-${order}`,
        name: `Group ${index + 1} · box ${order + 1} · viewer within ${where(box.bounds)}`,
        records: box.records
      })),
      {
        id: `group-${index}-default`,
        name: `Group ${index + 1} · default · viewer in no box`,
        records: group.default
      }
    ];
    for (const list of lists) {
      const mesh = {
        ...base.mesh,
        faces: list.records.flatMap(record => faces.get(record) ?? []),
        lines: list.records.flatMap(record => lines.get(record) ?? [])
      };
      if (mesh.faces.length === 0 && mesh.lines.length === 0) {
        continue;
      }
      forms.push({ id: list.id, mesh, name: list.name });
    }
  }
  return forms;
};
