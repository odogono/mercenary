import { describe, expect, test } from 'bun:test';

import { walk, type WalkRules } from '../src/damocles/mover.ts';
import { cellOf } from '../src/damocles/world.ts';
import { IDLE, intent } from '../src/gameCore/index.ts';

const rules: WalkRules = {
  eyeHeight: 63,
  runMultiplier: 5 / 3,
  runTurnMultiplier: 3 / 2,
  turnRadiansPerSecond: Math.PI / 2,
  unitsPerSecond: 327.68
};
const start = {
  heading: 0,
  position: { x: 0x00_47_70_b1, y: 63, z: 0x00_88_6c_2d }
};
const grid = { cellsPerAxis: 16, cellUnits: 65_536, origin: { x: 64, z: 128 } };

describe('the Eris on-foot Mover', () => {
  test('is a fixed step along the heading with the eye pinned', () => {
    const after = walk(start, intent({ walk: 1 }), 1, rules);
    expect(after.heading).toBe(0);
    expect(after.position.x).toBeCloseTo(start.position.x, 6);
    // A zero bearing is north, which is +z on Eris.
    expect(after.position.z).toBeCloseTo(start.position.z + 327.68, 6);
    expect(after.position.y).toBe(63);
    const lifted = walk(
      { ...start, position: { ...start.position, y: 500 } },
      IDLE,
      1,
      rules
    );
    expect(lifted.position.y).toBe(63);
  });

  test('changes nothing while idle', () => {
    expect(walk(start, IDLE, 5, rules)).toEqual(start);
  });

  test('running applies the recovered step and initial turn ratios', () => {
    const run = walk(start, intent({ running: true, walk: 1 }), 1, rules);
    expect(run.position.z).toBeCloseTo(start.position.z + (5 / 3) * 327.68, 6);

    const turned = walk(start, intent({ running: true, turn: 1 }), 1, rules);
    expect(turned.heading).toBeCloseTo((3 * Math.PI) / 4, 9);

    // Standing still is standing still, however the run toggle is set.
    expect(walk(start, intent({ running: true }), 5, rules)).toEqual(start);
  });

  test('turns at the fixed rate, right being positive, and wraps the heading', () => {
    const right = walk(start, intent({ turn: 1 }), 1, rules);
    expect(right.heading).toBeCloseTo(Math.PI / 2, 9);
    const left = walk(start, intent({ turn: -1 }), 1, rules);
    expect(left.heading).toBeCloseTo((3 * Math.PI) / 2, 9);
    // A left turn from north faces west, which is -X on Eris; walking then moves that way.
    const ahead = walk(left, intent({ walk: 1 }), 1, rules);
    expect(ahead.position.x).toBeCloseTo(start.position.x - 327.68, 6);
    expect(ahead.position.z).toBeCloseTo(start.position.z, 6);
  });

  test('reaches the neighbouring cell after the derived walk', () => {
    let pose = walk(start, intent({ turn: -1 }), 1, rules);
    let seconds = 0;
    while (cellOf(pose.position, grid).x === 7) {
      pose = walk(pose, intent({ walk: 1 }), 1 / 60, rules);
      seconds += 1 / 60;
    }
    expect(cellOf(pose.position, grid)).toEqual({ x: 6, z: 8 });
    // 0.4402 cells at 0.005 cells per second is about 88 seconds.
    expect(seconds).toBeGreaterThan(87);
    expect(seconds).toBeLessThan(89);
  });
});
