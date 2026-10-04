import { NO_BOXES, bindBoxes, type BoundBoxes } from '../craft/pass.ts';
import { int, list, pair, record } from './read.ts';
import type { TourcraftContent } from './tourcraftContent.ts';

/// The selected Dion detail's two recovered box lists, bound to its own
/// workspace cell. Drawing groups are distinct from these collision lists.
export const tourcraftBoxes = (
  content: TourcraftContent,
  body: number,
  point: { readonly x: number; readonly z: number }
): BoundBoxes => {
  const group = body === 100 ? 23 : 3;
  const home = content.promotion.bodyPlacements
    .find(b => b.offset === body)!
    .islands.find(i => i.group === group)!;
  const cell =
    (((point.z >>> 16) - home.origin[1]) & 15) * 16 +
    (((point.x >>> 16) - home.origin[0]) & 15);
  const placement = content.promotion.placements.find(
    p => p.group === group && p.cell === cell
  );
  if (!placement) {
    return NO_BOXES;
  }
  const geometry = content.geometry.get(placement.detail)!;
  const detail = geometry.variants['base']!;
  const source = list(content.promotion.raw['structures'], 'structures')
    .map(v => record(v, 'structure'))
    .find(v => v['slot'] === placement.slot)!;
  const boxes = (name: string) =>
    list(detail[name], name).map(value => {
      const box = record(value, name);
      return {
        x: pair(box['x'], `${name}.x`),
        y: pair(box['y'], `${name}.y`),
        z: pair(box['z'], `${name}.z`)
      };
    });
  const supports = boxes('supports').map((box, i) => ({
    ...box,
    tag: int(
      record(list(detail['supports'], 'supports')[i], 'support')['tag'],
      'support.tag',
      0,
      65_535
    )
  }));
  return bindBoxes(
    { supports, walls: boxes('walls') },
    pair(source['scale'], 'scale'),
    { x: placement.origin[0], z: placement.origin[1] }
  );
};
