import { describe, expect, test } from 'bun:test';

import {
  CASTER_GRID_HALF_EXTENT,
  CASTER_GRID_SIZE,
  casterGrid,
  shadowVolumeVertices
} from '../src/rendering/exactShadows.ts';
import { FLOATS_PER_VERTEX } from '../src/rendering/triangles.ts';

/// One roof triangle 100 units up and 500 ahead, wound away from the sun overhead, so the
/// builder must turn it to face the sun.
const roof = (): Float32Array => {
  const vertices = new Float32Array(3 * FLOATS_PER_VERTEX);
  const corners = [
    [0, 100, 500],
    [100, 100, 500],
    [0, 100, 600]
  ];
  corners.forEach(([x, y, z], index) => {
    vertices.set([x!, y!, z!], index * FLOATS_PER_VERTEX);
  });
  return vertices;
};
const overhead = { x: 0, y: 1, z: 0 };

describe('#380 exact Cast Shadow geometry', () => {
  test('sweeps a caster into a closed prism wound outward', () => {
    const volume = shadowVolumeVertices(roof(), overhead);
    const triangles = volume.length / (3 * FLOATS_PER_VERTEX);
    expect(triangles).toBe(8);
    const at = (index: number): [number, number, number] => [
      volume[index * FLOATS_PER_VERTEX]!,
      volume[index * FLOATS_PER_VERTEX + 1]!,
      volume[index * FLOATS_PER_VERTEX + 2]!
    ];
    const centre = [0, 0, 0];
    for (let index = 0; index < triangles * 3; index += 1) {
      at(index).forEach((value, axis) => {
        centre[axis]! += value / (triangles * 3);
      });
    }
    for (let triangle = 0; triangle < triangles; triangle += 1) {
      const [a, b, c] = [
        at(triangle * 3),
        at(triangle * 3 + 1),
        at(triangle * 3 + 2)
      ];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const normal = [
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!
      ];
      const outward =
        normal[0]! * (a[0] - centre[0]!) +
        normal[1]! * (a[1] - centre[1]!) +
        normal[2]! * (a[2] - centre[2]!);
      expect(outward).toBeGreaterThan(0);
    }
  });

  test('lists a caster in the grid cell under its footprint and no other far away', () => {
    const grid = casterGrid(roof(), overhead);
    const [lx, ly] = grid.basis;
    const point = { x: 30, y: 0, z: 530 };
    const cellOf = (p: typeof point): number => {
      const x = p.x * lx.x + p.y * lx.y + p.z * lx.z;
      const y = p.x * ly.x + p.y * ly.y + p.z * ly.z;
      const column = Math.floor((x + CASTER_GRID_HALF_EXTENT) * grid.bounds[2]);
      const row = Math.floor((y + CASTER_GRID_HALF_EXTENT) * grid.bounds[3]);
      return row * CASTER_GRID_SIZE + column;
    };
    const under = cellOf(point);
    expect(grid.cells[under * 2 + 1]).toBe(1);
    expect(grid.indices[grid.cells[under * 2]!]).toBe(0);
    expect(grid.cells[cellOf({ x: 3000, y: 0, z: 530 }) * 2 + 1]).toBe(0);
  });
});
