import { describe, expect, test } from 'bun:test';

import {
  WEATHER_SCALE,
  describeWeather,
  parseWeather,
  weatherOn,
  weatherScale,
  weathered
} from '../src/enhanced/weather.ts';
import { bodyDays, bodyTime } from '../src/sky/bodyTime.ts';
import { TargPresentationClock } from '../src/sky/time.ts';

const BODY = 'body-11';
/// A day's local noon, as local Body Days.
const noon = (day: number): number => day + 0.5;

describe('Weather (ADR 0090)', () => {
  test('one pick per Body Day, the same every time it is asked', () => {
    for (let day = 0; day < 50; day += 1) {
      expect(weatherOn(BODY, day)).toBe(weatherOn(BODY, day));
    }
  });

  test('the default profile reaches every state, Hazy most often', () => {
    const counts = { clear: 0, hazy: 0, mist: 0 };
    for (let day = 0; day < 2000; day += 1) {
      counts[weatherOn(BODY, day)] += 1;
    }
    expect(counts.clear).toBeGreaterThan(400);
    expect(counts.mist).toBeGreaterThan(200);
    expect(counts.hazy).toBeGreaterThan(counts.clear);
    expect(counts.hazy).toBeGreaterThan(counts.mist);
  });

  test("Bodies' days differ", () => {
    const days = Array.from({ length: 40 }, (_, day) => day);
    expect(days.map(day => weatherOn('body-11', day))).not.toEqual(
      days.map(day => weatherOn('body-12', day))
    );
  });

  test('a weighted profile picks only what it weights', () => {
    for (let day = 0; day < 100; day += 1) {
      expect(weatherOn(BODY, day, { clear: 0, hazy: 0, mist: 1 })).toBe('mist');
    }
  });

  test("noon reads the day's pick; dawn is misty", () => {
    for (let day = 0; day < 20; day += 1) {
      expect(weatherScale(BODY, noon(day))).toBeCloseTo(
        WEATHER_SCALE[weatherOn(BODY, day)]
      );
      expect(weatherScale(BODY, day + 0.25)).toBeCloseTo(WEATHER_SCALE.mist);
    }
  });

  test('the change of pick at local midnight is continuous', () => {
    for (let day = 1; day < 20; day += 1) {
      const before = weatherScale(BODY, day - 1e-9);
      const after = weatherScale(BODY, day + 1e-9);
      expect(after).toBeCloseTo(before, 6);
    }
  });

  test('no step is sudden through a day', () => {
    let last = weatherScale(BODY, 3);
    for (let step = 1; step <= 2400; step += 1) {
      const next = weatherScale(BODY, 3 + step / 2400);
      expect(Math.abs(Math.log2(next / last))).toBeLessThan(0.05);
      last = next;
    }
  });

  test('an override pins one state at every hour', () => {
    for (const time of [0, 0.25, 0.5, 0.99]) {
      expect(weatherScale(BODY, 7 + time, 'clear')).toBe(2);
      expect(weatherScale(BODY, 7 + time, 'hazy')).toBe(1);
      expect(weatherScale(BODY, 7 + time, 'mist')).toBe(0.25);
    }
  });

  test('Weather scales only an Atmosphere that has Haze', () => {
    expect(weathered({ hazeHalfDistance: 0x4_00_00 }, 2)).toEqual({
      hazeHalfDistance: 0x8_00_00
    });
    expect(weathered({ hazeHalfDistance: null }, 2)).toEqual({
      hazeHalfDistance: null
    });
    expect(weathered(null, 2)).toBeNull();
  });

  test('the console argument and reply', () => {
    expect(parseWeather('mist')).toBe('mist');
    expect(parseWeather('auto')).toBeNull();
    expect(() => parseWeather('fog')).toThrow();
    expect(describeWeather(null, null)).toBe('weather none');
    expect(describeWeather(null, 'clear')).toBe('weather clear (pinned)');
    expect(describeWeather({ body: BODY, localDays: noon(4) }, null)).toBe(
      `weather ${weatherOn(BODY, 4)} today, haze x${WEATHER_SCALE[weatherOn(BODY, 4)].toFixed(2)} now`
    );
  });
});

describe('local Body Days', () => {
  test('their fraction is Body Time', () => {
    for (const longitude of [0, 100, 777, 1500, 70_000.5]) {
      const days = bodyDays(longitude, 300, 40);
      expect((days - Math.floor(days)) * 86_400).toBeCloseTo(
        bodyTime(longitude, 300, 40)
      );
    }
  });

  test('a whole turn east is the next day', () => {
    expect(bodyDays(1024 + 10, 300, 40)).toBeCloseTo(bodyDays(10, 300, 40) + 1);
  });

  test("Targ's day turns at midnight on its clock", () => {
    const clock = new TargPresentationClock(() => 24);
    // The epoch is 09:00; a 24-minute day reaches midnight 15 minutes in.
    expect(clock.days(0)).toBeCloseTo(9 / 24);
    expect(clock.days(15 * 60)).toBeCloseTo(1);
    clock.set(0, 12 * 3600);
    expect(clock.days(0) % 1).toBeCloseTo(0.5);
  });
});
