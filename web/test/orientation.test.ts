import { describe, expect, test } from 'bun:test';

import { apply, fromBytes } from '../src/orientation/index.ts';

describe('the moving surface craft orientation', () => {
  test('turns its model nose into the direction of its positive-Z velocity', () => {
    const orientation = fromBytes([0, 0, 0x20]);
    if (orientation === undefined) {
      throw new Error('the three orientation bytes should decode');
    }

    const nose = apply(orientation, { x: 0, y: 0, z: -1 });

    expect(nose.x).toBeCloseTo(0, 6);
    expect(nose.z).toBeCloseTo(1, 6);
  });
});
