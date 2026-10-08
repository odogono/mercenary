import { describe, expect, test } from 'bun:test';

import {
  LIFT_STEP_TICKS,
  floorLabelCode,
  nextLabel,
  requestLift,
  stepLift,
  type LiftRide
} from '../src/structure/lift.ts';

// The Lift Damocles and Mercenary III share (docs/research/mercenary-iii-lift.md).
const bound = (floor: number) => floor <= 9;
const ride = (from: LiftRide, ticks: number, doorShut = true) => {
  let current: LiftRide | 'arrived' = from;
  const labels = [from.label];
  for (let tick = 0; tick < ticks && current !== 'arrived'; tick += 1) {
    const step = stepLift(current, doorShut);
    current = step.kind === 'arrive' ? 'arrived' : step.ride;
    if (current !== 'arrived' && current.label !== labels.at(-1)) {
      labels.push(current.label);
    }
  }
  return { labels, state: current };
};

describe('the shared Lift', () => {
  test('walks B, G, 1 … 9, so B is below G', () => {
    expect([1, 2, 3].map(l => nextLabel(l - 1, 3))).toEqual([1, 2, 3]);
    expect(nextLabel(3, 0)).toBe(2);
    expect(nextLabel(0, 10)).toBe(10);
    expect(nextLabel(8, 10)).toBe(7);
    expect(nextLabel(10, 2)).toBe(0);
  });

  test('refuses the Floor the label shows and a Floor the table leaves zero', () => {
    expect(requestLift(null, 0, 0, bound)).toBeNull();
    expect(requestLift(null, 0, 10, bound)).toBeNull();
    expect(requestLift(null, 0, 3, bound)).toEqual({
      countdown: LIFT_STEP_TICKS,
      destination: 3,
      label: 0
    });
  });

  test('replaces a pending destination and keeps the countdown where it stands', () => {
    const pending = { countdown: 7, destination: 3, label: 1 };
    expect(requestLift(pending, 1, 0, () => true)).toEqual({
      countdown: 7,
      destination: 0,
      label: 1
    });
    expect(requestLift(pending, 1, 1, () => true)).toBeNull();
  });

  test('counts nothing while the pinned door moves', () => {
    const start = { countdown: LIFT_STEP_TICKS, destination: 3, label: 0 };
    expect(stepLift(start, false)).toEqual({ kind: 'ride', ride: start });
  });

  // The METIS ride the probe traced: G to 3 steps the label at three 25-substep
  // periods and arrives one period after it shows 3.
  test('steps once every 25 ticks and arrives one period after the label shows the destination', () => {
    const start = { countdown: LIFT_STEP_TICKS, destination: 3, label: 0 };
    expect(ride(start, 4 * LIFT_STEP_TICKS - 1)).toEqual({
      labels: [0, 1, 2, 3],
      state: { countdown: 1, destination: 3, label: 3 }
    });
    expect(ride(start, 4 * LIFT_STEP_TICKS).state).toBe('arrived');
    expect(ride({ ...start, destination: 0, label: 3 }, 100).labels).toEqual([
      3, 2, 1, 0
    ]);
  });

  test('labels G, the digits and B', () => {
    expect(String.fromCharCode(...[0, 1, 9, 10].map(floorLabelCode))).toBe(
      'G19B'
    );
  });
});
