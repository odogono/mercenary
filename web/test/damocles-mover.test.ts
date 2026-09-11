import { describe, expect, test } from 'bun:test';

import { walk, type WalkRules } from '../src/damocles/mover.ts';
import { cellOf } from '../src/damocles/world.ts';
import { IDLE, intent } from '../src/gameCore/index.ts';

const rules: WalkRules = {
  eyeHeight: 63,
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
    expect(after.position.z).toBeCloseTo(start.position.z - 327.68, 6);
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

  test('turns at the fixed rate, right being positive, and wraps the heading', () => {
    const right = walk(start, intent({ turn: 1 }), 1, rules);
    expect(right.heading).toBeCloseTo((3 * Math.PI) / 2, 9);
    const left = walk(start, intent({ turn: -1 }), 1, rules);
    expect(left.heading).toBeCloseTo(Math.PI / 2, 9);
    // A left turn faces -X; walking then moves toward -X, as the Camera convention says.
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
