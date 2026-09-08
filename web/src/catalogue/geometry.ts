import type { Point } from './data.ts';

/** Ear clipping in the polygon's dominant plane, preserving concave silhouettes. */
export const triangulate = (
  vertices: readonly Point[],
  sourceFace: readonly number[]
): number[] => {
  const face = sourceFace.filter((index, i) => {
    const previous =
      vertices[sourceFace[(i + sourceFace.length - 1) % sourceFace.length]!]!;
    return vertices[index]!.some((value, axis) => value !== previous[axis]);
  });
  if (face.length < 3) {
    return [];
  }
  const normal = [0, 0, 0];
  for (let i = 0; i < face.length; i++) {
    const a = vertices[face[i]!]!,
      b = vertices[face[(i + 1) % face.length]!]!;
    normal[0]! += (a[1] - b[1]) * (a[2] + b[2]);
    normal[1]! += (a[2] - b[2]) * (a[0] + b[0]);
    normal[2]! += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const drop = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
  const axes = [0, 1, 2].filter(axis => axis !== drop);
  const points = vertices.map(v => [v[axes[0]!]!, v[axes[1]!]!] as const);
  const cross = (a: number, b: number, c: number) =>
    (points[b]![0] - points[a]![0]) * (points[c]![1] - points[a]![1]) -
    (points[b]![1] - points[a]![1]) * (points[c]![0] - points[a]![0]);
  let area = 0;
  for (let i = 0; i < face.length; i++) {
    const a = points[face[i]!]!,
      b = points[face[(i + 1) % face.length]!]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (Math.abs(area) < 1e-9) {
    return [];
  }
  const sign = Math.sign(area),
    pending = [...face],
    result: number[] = [];
  while (pending.length > 3) {
    let clipped = false;
    for (let i = 0; i < pending.length; i++) {
      const a = pending[(i + pending.length - 1) % pending.length]!,
        b = pending[i]!,
        c = pending[(i + 1) % pending.length]!;
      if (cross(a, b, c) * sign <= 1e-9) {
        continue;
      }
      if (
        pending.some(
          p =>
            p !== a &&
            p !== b &&
            p !== c &&
            cross(a, b, p) * sign >= -1e-9 &&
            cross(b, c, p) * sign >= -1e-9 &&
            cross(c, a, p) * sign >= -1e-9
        )
      ) {
        continue;
      }
      result.push(a, b, c);
      pending.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      throw new Error(
        'Polygon cannot be triangulated; inspect source geometry.'
      );
    }
  }
  result.push(...pending);
  return result;
};
