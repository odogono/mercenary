/// Locate bindings in the record instead of persisting their paths in every sidecar entry.
import type { Part, ReferenceTarget } from './contract.ts';

type Json = Record<string, unknown>;
export interface ReferenceSite {
  readonly reference?: number;
  readonly site: string;
  readonly target?: ReferenceTarget;
}

export const referenceSites = (record: unknown): ReferenceSite[] => {
  const model = (record as Json)?.['model'] as Json | undefined;
  if (model === undefined) {
    return [];
  }
  const out: ReferenceSite[] = [];
  const entry = (value: Json, site: string) => {
    if (value['kind'] === 'face') {
      out.push({
        site,
        target: {
          kind: 'record',
          part: 'plan',
          record: value['index'] as number
        }
      });
    } else if (value['kind'] === 'attachmentFace') {
      out.push({
        reference: (value['index'] as Json)?.['$ref'] as number,
        site
      });
    }
  };
  const selection = model['structureSelection'] as Json | undefined;
  if (selection !== undefined) {
    for (const key of ['wallTexts', 'floorLabels']) {
      ((selection[key] ?? []) as Json[]).forEach((item, i) =>
        entry(item['face'] as Json, `structureSelection.${key}[${i}].face`)
      );
    }
    ((selection['regions'] ?? []) as Json[]).forEach((region, r) => {
      (region['queue'] as Json[]).forEach((item, q) =>
        entry(item, `structureSelection.regions[${r}].queue[${q}]`)
      );
    });
  }
  const records = (values: number[], site: string) =>
    values.forEach((record, i) =>
      out.push({
        site: `${site}[${i}]`,
        target: { kind: 'record', part: 'variant:*', record }
      })
    );
  ((model['detailSelection'] ?? []) as Json[]).forEach((group, g) => {
    (group['boxes'] as Json[]).forEach((box, b) =>
      records(
        box['records'] as number[],
        `detailSelection[${g}].boxes[${b}].records`
      )
    );
    records(group['default'] as number[], `detailSelection[${g}].default`);
  });
  return out;
};

export const partsMatching = (
  parts: readonly Part[],
  name: string
): readonly Part[] =>
  name === 'variant:*'
    ? parts.filter(part => part.role === 'display')
    : parts.filter(part => part.id === name);

export const resolves = (
  parts: readonly Part[],
  target: ReferenceTarget
): boolean => {
  const matching = partsMatching(parts, target.part);
  return (
    matching.length > 0 &&
    matching.every(part =>
      target.kind === 'record'
        ? part.faces.some(face => face.record === target.record) ||
          part.lines.some(line => line.record === target.record)
        : part.faces.some(face => face.id === target.id)
    )
  );
};
