import { describe, expect, test } from 'bun:test';

import { FixedStepClock } from '../src/shell/clock.ts';

const STEP = 1 / 60;

describe('the Browser Shell fixed-step clock', () => {
  test('the first timestamp seeds the clock without advancing play', () => {
    const clock = new FixedStepClock();
    const steps: number[] = [];

    expect(clock.frame(1000, step => steps.push(step))).toBe(0);
    expect(steps).toEqual([]);
  });

  test('retains fractional display frames until a whole simulation step exists', () => {
    const clock = new FixedStepClock();
    const steps: number[] = [];

    clock.frame(0, step => steps.push(step));
    expect(clock.frame(1000 / 120, step => steps.push(step))).toBe(0);
    expect(clock.frame(2000 / 120, step => steps.push(step))).toBe(1);
    expect(steps).toEqual([STEP]);
  });

  test('advances once for a 60 Hz display callback', () => {
    const clock = new FixedStepClock();
    const steps: number[] = [];

    clock.frame(0, step => steps.push(step));
    expect(clock.frame(1000 / 60, step => steps.push(step))).toBe(1);
    expect(steps).toEqual([STEP]);
  });

  test('advances twice for a 30 Hz display callback and always supplies 1/60', () => {
    const clock = new FixedStepClock();
    const steps: number[] = [];

    clock.frame(0, step => steps.push(step));
    expect(clock.frame(1000 / 30, step => steps.push(step))).toBe(2);
    expect(steps).toEqual([STEP, STEP]);
  });

  test('bounds one stalled display frame to a quarter second', () => {
    const clock = new FixedStepClock();
    const steps: number[] = [];

    clock.frame(0, step => steps.push(step));
    expect(clock.frame(10_000, step => steps.push(step))).toBe(15);
    expect(steps).toEqual(Array.from({ length: 15 }, () => STEP));
  });

  test('reset discards the timestamp and fractional backlog', () => {
    const clock = new FixedStepClock();
    const steps: number[] = [];

    clock.frame(0, step => steps.push(step));
    clock.frame(1000 / 120, step => steps.push(step));
    clock.reset();
    expect(clock.frame(20_000, step => steps.push(step))).toBe(0);
    expect(clock.frame(20_000 + 1000 / 60, step => steps.push(step))).toBe(1);
    expect(steps).toEqual([STEP]);
  });
});
