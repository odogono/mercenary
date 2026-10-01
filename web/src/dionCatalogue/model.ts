import type { CatalogueGeometry } from '../dion/catalogue.ts';
import { ints, list, record } from '../dion/read.ts';
import { readModel, type DionModel } from '../dion/world.ts';

export const addressOf = (g: CatalogueGeometry): number =>
  Number.parseInt(g.record.slice(1), 16);
export const chosenVariant = (
  g: CatalogueGeometry,
  requested: string
): string => {
  if (requested && !Object.hasOwn(g.variants, requested)) {
    throw new Error(
      `${g.id}: variant ${requested} is not in the validated geometry`
    );
  }
  return requested || Object.keys(g.variants)[0]!;
};
export const modelForm = (
  g: CatalogueGeometry,
  variant: string,
  entry: number,
  colours: number[]
): DionModel => {
  const v = g.variants[variant]!;
  const faces = list(v['faces'], `${g.id}.${variant}.faces`).map((value, i) => {
    const face = record(value, `${g.id}.faces[${i}]`);
    if (face['kind'] === 'line' || face['kind'] === 'polygon') {
      if (face['stColour'] === undefined) {
        return face;
      }
      const colour = Number(face['stColour']);
      let index = colours.indexOf(colour);
      if (index < 0) {
        index = colours.length;
        colours.push(colour);
      }
      return {
        ...face,
        at: '$00000',
        colour: index,
        refs: ints(face['refs'], `${g.id}.refs`).map(r => r * 4)
      };
    }
    return face;
  });
  const turn = v['turn'] === undefined ? {} : record(v['turn'], `${g.id}.turn`);
  const header = {
    mode:
      (turn['kind'] === 'view' ? 1 : turn['kind'] === 'yaw' ? 0x40 : 0) |
      (turn['scale'] === 16 ? 0x20 : 0),
    op: 1,
    yawOffset: turn['yawOffset'] ?? 0
  };
  return readModel(
    {
      ...v,
      alternatives: [],
      entry,
      faces,
      header,
      name: g.name ?? g.id,
      provenance: v['provenance'] ?? g.provenance[0]
    },
    g.id,
    entry
  );
};
