import { describe, expect, test } from 'bun:test';

import type { Mesh } from '../src/catalogue/data.ts';
import { FLOATS_PER_VERTEX, planEnhancedFrame } from '../src/enhanced/frame.ts';
import { ENHANCED_PRESENTATION as presentation } from '../src/enhanced/presentation.ts';
import type { EnhancedSurface, ScenePlacement } from '../src/enhanced/scene.ts';

/// Line records drawn by the shared Enhanced planner (#806): one output pixel wide, after the
/// placement's faces, in the plane of the face they lie in.

const surface: EnhancedSurface = {
  baseColour: null,
  floorLabelGlyphs: {},
  grid: { cellsPerAxis: 16, cellUnits: 0x1_00_00, origin: { x: 0, z: 0 } },
  islands: [],
  placements: [],
  sky: null
};

/// A wall facing the eye, with one line drawn on it and one standing off it.
const wall: Mesh = {
  faces: [{ colour: '#ff0000', sourceColour: 0, vertices: [0, 1, 2, 3] }],
  lines: [
    { colour: '#00ff00', sourceColour: 0, vertices: [0, 2] },
    { colour: '#0000ff', sourceColour: 0, vertices: [4, 5] }
  ],
  vertices: [
    [-50, 0, 0],
    [50, 0, 0],
    [50, 100, 0],
    [-50, 100, 0],
    [0, 50, -20],
    [0, 80, -20]
  ]
};

const placement: ScenePlacement = {
  faceCount: 1,
  heading: 0,
  id: 'wall',
  keyBase: null,
  kind: 'object',
  mesh: wall,
  modelId: 'wall',
  name: 'wall',
  position: { x: 0x80_00, y: 0, z: 0x80_00 + 500 },
  status: 'decoded'
};

const strokes = (colour: readonly number[]) => {
  const plan = planEnhancedFrame(
    surface,
    {
      body: 'test',
      heading: 0,
      pitch: 0,
      position: { x: 0x80_00, y: 50, z: 0x80_00 }
    },
    presentation,
    null,
    [placement],
    [],
    () => false,
    false,
    null,
    false,
    false,
    'aboard',
    600
  );
  const found: { plane: number[]; view: number[] }[] = [];
  for (let i = 0; i < plan.vertices.length; i += FLOATS_PER_VERTEX) {
    const vertex = [...plan.vertices.subarray(i, i + FLOATS_PER_VERTEX)];
    if (vertex.slice(3, 6).every((value, index) => value === colour[index])) {
      found.push({ plane: vertex.slice(6), view: vertex.slice(0, 3) });
    }
  }
  return { found, plan };
};

describe('line records in the shared Enhanced planner', () => {
  test('a line on a face takes the face plane and follows its faces', () => {
    const { found: onWall } = strokes([0, 1, 0]);
    const { found: face } = strokes([1, 0, 0]);
    expect(onWall.length).toBe(12);
    expect(
      onWall.every(vertex => vertex.plane.join() === face[0]!.plane.join())
    ).toBe(true);
    expect(face[0]!.plane.some(value => value !== 0)).toBe(true);
  });

  test('a line off every face takes its own depth', () => {
    const { found } = strokes([0, 0, 1]);
    expect(found.length).toBe(12);
    expect(
      found.every(vertex => vertex.plane.every(value => value === 0))
    ).toBe(true);
  });

  test('a stroke is one output pixel wide', () => {
    const { found } = strokes([0, 0, 1]);
    // The vertical line's two long edges sit one output pixel apart across the 600-row view.
    const xs = found.map(vertex => vertex.view[0]! / vertex.view[2]!);
    const width = Math.max(...xs) - Math.min(...xs);
    expect(width).toBeCloseTo((2 * Math.tan(Math.PI / 8)) / 600, 6);
  });
});
