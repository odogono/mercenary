import { describe, expect, test } from 'bun:test';

import {
  TargPresentationClock,
  formatTargTime,
  parseTargTime
} from '../src/sky/time.ts';

describe('Targ local time', () => {
  test('shares one parser for one- or two-digit hours', () => {
    expect(parseTargTime('9:00')).toBe(9 * 3600);
    expect(parseTargTime('09:00:01')).toBe(9 * 3600 + 1);
    expect(parseTargTime('7-08-09')).toBe(7 * 3600 + 8 * 60 + 9);

    for (const invalid of ['24:00', '9:0', '12:60', '12:30:60', 'noon']) {
      expect(() => parseTargTime(invalid)).toThrow(
        'a time must be H:MM or H:MM:SS'
      );
    }
  });

  test('shares one formatter between console and panel punctuation', () => {
    expect(formatTargTime(9 * 3600 + 8 * 60 + 7)).toBe('09:08:07');
    expect(formatTargTime(9 * 3600 + 8 * 60 + 7, '-')).toBe('09-08-07');
    expect(formatTargTime(86_400)).toBe('00:00:00');
  });

  test('adjusts presentation while leaving session elapsed independent', () => {
    const clock = new TargPresentationClock(() => 24);
    const sessionElapsed = 34 * 60;

    expect(formatTargTime(clock.secondsOfDay(sessionElapsed))).toBe('19:00:00');
    clock.set(sessionElapsed, parseTargTime('7:30:15'));
    expect(formatTargTime(clock.secondsOfDay(sessionElapsed))).toBe('07:30:15');
    expect(clock.elapsed(sessionElapsed)).toBeCloseTo(
      24 * 60 + (22 * 3600 + 30 * 60 + 15) / 60,
      9
    );

    clock.reset();
    expect(clock.elapsed(sessionElapsed)).toBe(sessionElapsed);
  });

  test('round-trips every whole second', () => {
    const clock = new TargPresentationClock(() => 24);
    for (let seconds = 0; seconds < 86_400; seconds += 1) {
      clock.set(0, seconds);
      expect(formatTargTime(clock.secondsOfDay(0))).toBe(
        formatTargTime(seconds)
      );
    }
  });
});
