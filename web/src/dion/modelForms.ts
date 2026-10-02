import type { CatalogueGeometry, DionCatalogue } from './catalogue.ts';
import { ints, list, record } from './read.ts';
import { readModel, type DionModel } from './world.ts';

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
  colours: number[],
  lettering?: DionCatalogue['objects'][number]['lettering'],
  playable = false
): DionModel => {
  const v = g.variants[variant]!;
  const faces = list(v['faces'], `${g.id}.${variant}.faces`).map((value, i) => {
    const face = record(value, `${g.id}.faces[${i}]`);
    if (face['kind'] === 'text' && lettering) {
      const token = Number.parseInt(lettering.token.slice(1), 16);
      return {
        ...face,
        text: ints(face['text'], `${g.id}.text`).flatMap(code =>
          code === token ? lettering.text : [code]
        )
      };
    }
    if (face['kind'] === 'line' || face['kind'] === 'polygon') {
      if (face['stColour'] === undefined) {
        return face;
      }
      if (playable) {
        return {
          ...face,
          at: '$00000',
          refs: ints(face['refs'], `${g.id}.refs`).map(r => r * 4)
        };
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
  const recovered = record(
    (g as unknown as Record<string, unknown>)['header'] ?? {},
    `${g.id}.header`
  );
  const header =
    playable &&
    recovered['op'] !== undefined &&
    recovered['op'] !== 3 &&
    recovered['op'] !== 0xa
      ? recovered
      : {
          mode:
            (turn['kind'] === 'view' ? 1 : turn['kind'] === 'yaw' ? 0x40 : 0) |
            (turn['scale'] === 16 ? 0x20 : 0),
          op: 1,
          yawOffset: turn['yawOffset'] ?? 0
        };
  const tagged = new Set(
    playable ? ints(v['articulated'] ?? [], `${g.id}.articulated`) : []
  );
  const vertices = list(v['vertices'], `${g.id}.vertices`).map((p, i) => {
    const xyz = ints(p, `${g.id}.vertices[${i}]`, 3);
    return tagged.has(i + 1) ? [xyz[0], ~xyz[1]!, xyz[2]] : xyz;
  });
  return readModel(
    {
      ...v,
      alternatives: v['alternatives'] ?? [],
      entry,
      faces,
      header,
      name: g.name ?? g.id,
      provenance: v['provenance'] ?? g.provenance[0],
      vertices
    },
    g.id,
    entry
  );
};

/// Export-time selection has already resolved each form. The existing model reader
/// and planner keep vehicle headers, viewer boxes and live articulation title-local.
export const playableModel = (
  g: CatalogueGeometry,
  entry: number,
  colours: number[],
  prefix = ''
): DionModel => {
  const base = g.variants['base'] ? 'base' : `${prefix}form=default`;
  const model = modelForm(g, base, entry, colours, undefined, true);
  const alternatives = Object.entries(g.variants)
    .filter(([key]) => key.startsWith(`${prefix}form=view-`))
    .map(([key, v]) => {
      const box = record(v['box'], `${g.id}.${key}.box`);
      const view = modelForm(g, key, entry, colours, undefined, true);
      return {
        faces: view.faces,
        min: ints(box['min'], `${g.id}.${key}.min`, 3) as [
          number,
          number,
          number
        ],
        size: ints(box['size'], `${g.id}.${key}.size`, 3) as [
          number,
          number,
          number
        ]
      };
    });
  const passenger = g.variants['state=passenger;form=default']
    ? modelForm(
        g,
        'state=passenger;form=default',
        entry,
        colours,
        undefined,
        true
      )
    : undefined;
  return {
    ...model,
    alternatives: base === 'base' ? model.alternatives : alternatives,
    passenger
  };
};
