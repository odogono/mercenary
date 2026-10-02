import { expect, test } from 'bun:test';

import { roadStroke } from '../src/rendering/roadStroke.ts';

test('road strokes retain one logical pixel at any depth and resolution', () => {
  const tangent = Math.tan(Math.PI / 8);
  for (const depth of [100, 100_000]) {
    const quad = roadStroke(
      { x: -10, y: 0, z: depth },
      { x: 10, y: 0, z: depth },
      4,
      tangent
    )!;
    const thickness = Math.abs(quad[0].y / depth - quad[3].y / depth);
    for (const height of [136, 272, 816]) {
      expect((thickness * height) / (2 * tangent)).toBeCloseTo(height / 136, 6);
    }
  }
});

test('road strokes clip the near plane and reject invisible or collapsed lines', () => {
  const a = { x: -20, y: 0, z: -100 };
  const b = { x: 10, y: 0, z: 100 };
  const quad = roadStroke(a, b, 4, 1)!;
  expect(quad.every(v => v.z >= 4)).toBe(true);
  expect(quad.flatMap(v => [v.x, v.y, v.z]).every(Number.isFinite)).toBe(true);
  expect(roadStroke(a, { ...b, z: -100 }, 4, 1)).toBeNull();
  expect(roadStroke(b, b, 4, 1)).toBeNull();
});
