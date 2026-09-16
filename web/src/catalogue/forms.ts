import type { Primitive } from './data.ts';

/**
 * Helpers shared by the selector-driven inspection forms.
 *
 * Both structure regions and building-detail visibility groups name geometry by
 * source record and bound the viewer with signed-word boxes, so the record
 * lookup and the axis wording live here rather than in either module.
 */

/** Signed-word endpoint sentinels an unbounded selector axis keeps. */
export const LOW_SENTINEL = -32_768;
export const HIGH_SENTINEL = 32_767;

/**
 * Primitives grouped by the source record they came from.
 *
 * A selector byte names a record, and one record may contribute several filled
 * glyph faces, a stroke line, or nothing at all.
 */
export const byRecord = (primitives: readonly Primitive[]) => {
  const index = new Map<number, Primitive[]>();
  for (const primitive of primitives) {
    if (primitive.sourceIndex === undefined) {
      continue;
    }
    const bucket = index.get(primitive.sourceIndex);
    if (bucket === undefined) {
      index.set(primitive.sourceIndex, [primitive]);
    } else {
      bucket.push(primitive);
    }
  }
  return index;
};

export const axisLabel = (
  name: string,
  [low, high]: readonly [number, number]
) => {
  if (low <= LOW_SENTINEL && high >= HIGH_SENTINEL) {
    return `any ${name}`;
  }
  if (low <= LOW_SENTINEL) {
    return `${name} < ${high}`;
  }
  if (high >= HIGH_SENTINEL) {
    return `${name} ≥ ${low}`;
  }
  return `${name} ${low}–${high}`;
};
