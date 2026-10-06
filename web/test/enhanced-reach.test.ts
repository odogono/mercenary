import { describe, expect, test } from 'bun:test';

import type { Mesh } from '../src/catalogue/data.ts';
import { FLOATS_PER_VERTEX, planEnhancedFrame } from '../src/enhanced/frame.ts';
import { ENHANCED_PRESENTATION } from '../src/enhanced/presentation.ts';
import type { EnhancedSurface, ScenePlacement } from '../src/enhanced/scene.ts';

/// An object's reach (#817): `$053674` draws an object only while no axis of its position less
/// the eye's exceeds its range, one cell unless `$800C` sets another. Past it a lit beacon or an
/// `$800B` far marker is one point (`$053688`), and anything else is not drawn.

const surface: EnhancedSurface = {
  baseColour: null,
  floorLabelGlyphs: {},
  grid: { cellsPerAxis: 16, cellUnits: 0x1_00_00, origin: { x: 0, z: 0 } },
  islands: [],
  placements: [],
  sky: null
};

const cube: Mesh = {
  faces: [{ colour: '#ff0000', sourceColour: 0, vertices: [0, 1, 2, 3] }],
  lines: [],
  vertices: [
    [-500, 0, 0],
    [500, 0, 0],
    [500, 1000, 0],
    [-500, 1000, 0]
  ]
};

const eye = { x: 0x80_00, y: 63, z: 0x80_00 };

const object = (
  cells: number,
  reach: ScenePlacement['reach'],
  flash?: { readonly gateSlot: number | null; readonly phase: number }
): ScenePlacement => ({
  faceCount: 1,
  ...(flash === undefined
    ? {}
    : {
        forms: {
          flash,
          own: 'record',
          variants: [
            { id: 'record', mesh: cube },
            { id: 'flash-dark', mesh: cube }
          ]
        }
      }),
  heading: 0,
  id: 'object',
  keyBase: null,
  kind: 'object',
  mesh: cube,
  modelId: 'object',
  name: 'object',
  position: { x: eye.x, y: 0, z: eye.z + cells * 0x1_00_00 },
  ...(reach === undefined ? {} : { reach }),
  status: 'decoded'
});

const plan = (placement: ScenePlacement, frame = 0) =>
  planEnhancedFrame(
    surface,
    { body: 'test', heading: 0, pitch: 0, position: eye },
    ENHANCED_PRESENTATION,
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
    { angle: 0, frame, television: 0, textStep: 0 }
  );

const colours = (vertices: Float32Array) => {
  const found = new Set<string>();
  for (let i = 0; i < vertices.length; i += FLOATS_PER_VERTEX) {
    found.add([3, 4, 5].map(c => Math.round(vertices[i + c]! * 255)).join(','));
  }
  return found;
};

describe('an object’s reach', () => {
  test('one cell by default: drawn within it, not past it', () => {
    expect(plan(object(0.99, { cells: 1 })).drawnPlacements).toEqual([
      'object'
    ]);
    const far = plan(object(1.01, { cells: 1 }));
    expect(far.drawnPlacements).toEqual([]);
    expect(far.triangleCount).toBe(0);
  });

  test('an $800C range reaches further', () => {
    expect(plan(object(39.5, { cells: 40 })).drawnPlacements).toEqual([
      'object'
    ]);
    expect(plan(object(40.5, { cells: 40 })).drawnPlacements).toEqual([]);
  });

  test('a placement without a reach is drawn at any range', () => {
    expect(plan(object(100, undefined)).drawnPlacements).toEqual(['object']);
  });

  test('past its range a far marker is one point in its colour', () => {
    const far = plan(object(3, { cells: 1, point: { colour: '#cccc88' } }));
    expect(far.drawnPlacements).toEqual(['object']);
    expect(far.triangleCount).toBe(4);
    expect(colours(far.vertices)).toEqual(new Set(['204,204,136']));
    // One ST pixel: 1/256 of a unit tangent across.
    const xs: number[] = [];
    for (let i = 0; i < far.vertices.length; i += FLOATS_PER_VERTEX) {
      xs.push(far.vertices[i]! / far.vertices[i + 2]!);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1 / 256, 9);
  });

  test('a far beacon is a point only while it is lit', () => {
    const beacon = object(
      3,
      { cells: 1, point: { colour: '#eeeeee' } },
      { gateSlot: null, phase: 0 }
    );
    expect(plan(beacon, 0).triangleCount).toBe(4);
    expect(plan(beacon, 4).triangleCount).toBe(0);
  });
});
