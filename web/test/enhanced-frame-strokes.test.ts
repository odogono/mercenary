import { describe, expect, test } from 'bun:test';

import type { Mesh } from '../src/catalogue/data.ts';
import {
  DEFAULT_ENHANCED_STROKES,
  FLOATS_PER_VERTEX,
  planEnhancedFrame,
  type EnhancedStrokes
} from '../src/enhanced/frame.ts';
import { ENHANCED_PRESENTATION as presentation } from '../src/enhanced/presentation.ts';
import type { EnhancedSurface, ScenePlacement } from '../src/enhanced/scene.ts';
import { enhancedStrokesOf } from '../src/shell/preferences.ts';

/// Enhanced stroke weight and glow (#951), shared by every Title through the planner: weight
/// widens line and road strokes, and glow adds a halo stream the renderer adds over them.

const surface: EnhancedSurface = {
  baseColour: null,
  floorLabelGlyphs: {},
  grid: { cellsPerAxis: 16, cellUnits: 0x1_00_00, origin: { x: 0, z: 0 } },
  islands: [],
  placements: [],
  sky: null
};

const wall: Mesh = {
  faces: [],
  lines: [{ colour: '#00ff00', sourceColour: 0, vertices: [0, 1] }],
  vertices: [
    [-50, 50, 0],
    [50, 50, 0]
  ]
};

const placement: ScenePlacement = {
  faceCount: 0,
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

const plan = (strokes?: EnhancedStrokes) =>
  planEnhancedFrame(
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
    600,
    null,
    [],
    strokes
  );

/// The projected height of the first stroke quad: corners 0 and 2 of its first triangle sit on
/// opposite sides of a horizontal line.
const strokeHeight = (vertices: Float32Array): number => {
  const y = (index: number) =>
    vertices[index * FLOATS_PER_VERTEX + 1]! /
    vertices[index * FLOATS_PER_VERTEX + 2]!;
  return Math.abs(y(0) - y(2));
};

describe('Enhanced strokes', () => {
  test('the defaults draw one-pixel strokes with no glow', () => {
    const found = plan(DEFAULT_ENHANCED_STROKES);
    expect(found.vertices).toEqual(plan().vertices);
    expect(found.glowVertices).toBeUndefined();
  });

  test('weight widens a line stroke', () => {
    const fine = strokeHeight(plan().vertices);
    const heavy = strokeHeight(
      plan({ ...DEFAULT_ENHANCED_STROKES, lines: { glow: 0, weight: 3 } })
        .vertices
    );
    expect(heavy / fine).toBeCloseTo(3, 5);
  });

  test('glow adds a wider, dimmer halo of the line', () => {
    const found = plan({
      ...DEFAULT_ENHANCED_STROKES,
      lines: { glow: 0.5, weight: 1 }
    });
    const halo = found.glowVertices!;
    expect(halo.length).toBe(6 * FLOATS_PER_VERTEX);
    expect(strokeHeight(halo)).toBeGreaterThan(strokeHeight(found.vertices));
    expect([...halo.subarray(3, 6)]).toEqual([0, 0.5, 0]);
    expect(found.vertices).toEqual(plan().vertices);
  });
});

describe('the Enhanced stroke settings', () => {
  test('come from the player preferences', () => {
    expect(enhancedStrokesOf({})).toEqual(DEFAULT_ENHANCED_STROKES);
    expect(
      enhancedStrokesOf({
        roadGlow: 'soft',
        roadWeight: 'bold',
        wireframeGlow: 'bright',
        wireframeWeight: 'heavy'
      })
    ).toEqual({
      lines: { glow: 0.7, weight: 3 },
      roads: { glow: 0.35, weight: 2 }
    });
  });

  test('stay hairlines under Authentic', () => {
    expect(
      enhancedStrokesOf({
        presentationPreset: 'authentic',
        wireframeWeight: 'heavy'
      })
    ).toEqual(DEFAULT_ENHANCED_STROKES);
  });
});
