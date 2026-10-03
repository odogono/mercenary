import { describe, expect, test } from 'bun:test';

import {
  CASTER_GRID_HALF_EXTENT,
  CASTER_GRID_SIZE,
  casterGrid
} from '../src/rendering/castShadows.ts';
import { FLOATS_PER_VERTEX } from '../src/rendering/triangles.ts';

/// One roof triangle 100 units up and 500 ahead.
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

describe('the Cast Shadow caster grid', () => {
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
