import { describe, expect, test } from 'bun:test';

import { ROAD_HORIZON_DISTANCES, roadRadius } from '../src/coast/roads.ts';
import { planEnhancedFrame } from '../src/enhanced/frame.ts';
import { ENHANCED_PRESENTATION } from '../src/enhanced/presentation.ts';
import type { EnhancedSurface, SceneIsland } from '../src/enhanced/scene.ts';

/// Roads by Horizon Distance (#952): the planner selects a Title's road runs within its Horizon
/// Distance table, or its high-altitude set from that set's altitude up.

const corners = Array.from({ length: 256 }, () => 0);
corners[8 * 16 + 8] = 0x89_d9;
corners[8 * 16 + 10] = 0x14_b4;

const island = (roads: SceneIsland['roads']): SceneIsland => ({
  boxes: [{ x: [0, 15], z: [0, 15] }],
  coastline: { edges: [], vertices: [] },
  landColour: '#00aa00',
  origin: { x: 0, z: 0 },
  roads
});

const surface = (
  roads: SceneIsland['roads'],
  horizonDistances?: readonly number[]
): EnhancedSurface => ({
  baseColour: '#0000aa',
  floorLabelGlyphs: {},
  grid: { cellsPerAxis: 16, cellUnits: 0x1_00_00, origin: { x: 0, z: 0 } },
  ...(horizonDistances === undefined ? {} : { horizonDistances }),
  islands: [island(roads)],
  placements: [],
  sky: null
});

const edgesAt = (on: EnhancedSurface, y: number) =>
  planEnhancedFrame(
    on,
    {
      body: 'test',
      heading: 0,
      pitch: 0,
      position: { x: 8.5 * 0x1_00_00, y, z: 8.5 * 0x1_00_00 }
    },
    ENHANCED_PRESENTATION,
    null,
    [],
    [],
    () => false,
    false,
    null,
    false,
    false,
    'aboard',
    600,
    null
  ).roadEdges;

describe('roads by Horizon Distance', () => {
  test('$915A is Damocles’s and Mercenary III’s table', () => {
    for (let index = 0; index < 256; index += 1) {
      expect(ROAD_HORIZON_DISTANCES[index]).toBe(roadRadius(index * 2048));
    }
  });

  test('the table selects the runs within its distance', () => {
    const roads = { corners, roadColour: '#ffffff' };
    expect(edgesAt(surface(roads, [1]), 2048)).toEqual([]);
    expect(edgesAt(surface(roads, [0, 2]), 2048)).toEqual([0x14_b4]);
    expect(edgesAt(surface(roads, ROAD_HORIZON_DISTANCES), 4096)).toEqual([
      0x14_b4
    ]);
  });

  test('above 64 KiB the occupied cell’s runs join', () => {
    const roads = { corners, roadColour: '#ffffff' };
    expect(edgesAt(surface(roads), 65_536)).toEqual([0x89_d9]);
  });

  test('a high-altitude set replaces the runs from its altitude up', () => {
    const roads = {
      corners,
      highAltitude: { edges: [0x00_ff, 0x0f_f0], fromY: 0x20_00_00 },
      roadColour: '#ffffff'
    };
    expect(edgesAt(surface(roads, [2]), 0x1f_ff_ff)).toEqual([
      0x14_b4, 0x89_d9
    ]);
    expect(edgesAt(surface(roads, [2]), 0x20_00_00)).toEqual([
      0x00_ff, 0x0f_f0
    ]);
  });
});
