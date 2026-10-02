import { describe, expect, test } from 'bun:test';

import { roadEdges, roadRadius } from '../src/coast/roads.ts';

describe('the shared Damocles and Mercenary III road window', () => {
  test('uses every boundary of the recovered altitude curve', () => {
    const boundaries = [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 3],
      [5, 4],
      [9, 4],
      [10, 5],
      [15, 5],
      [16, 6],
      [23, 6],
      [24, 7],
      [31, 7],
      [32, 8],
      [35, 8],
      [36, 9],
      [251, 62],
      [252, 63],
      [255, 63]
    ];
    for (const [index, radius] of boundaries) {
      expect(roadRadius(index! * 2048)).toBe(radius!);
      expect(roadRadius(index! * 2048 + 2047)).toBe(radius!);
    }
    expect(roadRadius(1_000_000)).toBe(63);
    expect(roadRadius(-63)).toBe(0);
  });

  test('selects a whole run, deduplicates repeated cells, and paints neighbours backwards', () => {
    const corners = Array<number>(256).fill(0);
    // Two cells name the same run; its endpoints extend beyond the radius-1 window.
    corners[0x88] = 0x8b_87_00_00;
    corners[0x89] = 0x8b_87_00_00;
    corners[0x77] = 0x00_00_b4_14;
    corners[0x99] = 0x00_00_d9_89;
    expect(roadEdges(corners, 8, 8, 2048)).toEqual([0xd9_89, 0xb4_14]);
    // The own run is seeded into the dedup list, and only painted above Y's high-word gate.
    expect(roadEdges(corners, 8, 8, 65_536)).toEqual([0xd9_89, 0xb4_14, 0x8b_87]);
    expect(roadEdges(corners, 8, 8, 63)).toEqual([]);
  });

  test('reselects on cell crossings and altitude-radius changes without a stale cache', () => {
    const corners = Array<number>(256).fill(0);
    corners[0x77] = 0xb4_14;
    expect(roadEdges(corners, 9, 8, 2048)).toEqual([]);
    expect(roadEdges(corners, 8, 8, 2048)).toEqual([0xb4_14]);
    expect(roadEdges(corners, 9, 8, 4096)).toEqual([0xb4_14]);
    expect(roadEdges(corners, 8, 8, 63)).toEqual([]);
  });

  test('clamps the window at each grid boundary and never wraps the cell index', () => {
    const corners = Array<number>(256).fill(0);
    corners[0] = 0x10_01;
    corners[0xff] = 0xfe_ef;
    expect(roadEdges(corners, -1, 0, 2048)).toEqual([0x10_01]);
    expect(roadEdges(corners, -2, 0, 2048)).toEqual([]);
    expect(roadEdges(corners, 16, 15, 2048)).toEqual([0xfe_ef]);
    expect(roadEdges(corners, 17, 15, 2048)).toEqual([]);
    expect(roadEdges(corners, 0, 0, 63)).toEqual([]);
  });
});
