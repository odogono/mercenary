import { describe, expect, test } from 'bun:test';

import { ScenePalette } from '../src/scene/index.ts';
import { defaultSettings } from '../src/settings/index.ts';
import {
  createTargOrrery,
  kepler,
  skyColourAt,
  skyStateAt,
  skyZenithColourAt,
  starVisibilityAt,
  targOrreryFor
} from '../src/sky/index.ts';
import { onRecordingLibm } from './replay/platform.ts';

const degrees = (radians: number): number => (radians * 180) / Math.PI;
const radians = (degrees: number): number => (degrees * Math.PI) / 180;
const angleBetween = (
  a: { readonly x: number; readonly y: number; readonly z: number },
  b: { readonly x: number; readonly y: number; readonly z: number }
): number =>
  Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)));

const defaults = defaultSettings().presentation.sky;
const orrery = createTargOrrery(defaults);
const daySeconds = defaults.dayLengthMinutes * 60;

describe('the four-step Kepler solve', () => {
  for (const eccentricity of [0, 0.06, 0.11, 0.18]) {
    test(`leaves a sub-nanoradian residual at eccentricity ${eccentricity}`, () => {
      for (let index = -32; index <= 32; index += 1) {
        const mean = (index / 32) * Math.PI;
        const eccentric = kepler(mean, eccentricity);
        expect(
          Math.abs(eccentric - eccentricity * Math.sin(eccentric) - mean)
        ).toBeLessThan(1e-9);
      }
    });
  }
});

describe('the authored Targ Orrery', () => {
  test.skipIf(!onRecordingLibm)(
    'keeps the existing celestial directions bit-identical',
    () => {
      const state = skyStateAt(orrery, 123.5);
      expect({
        inner: state.moons[0].direction,
        outer: state.moons[1].direction,
        sun: state.sun.direction
      }).toEqual({
        inner: {
          x: 0.344_611_041_062_982_1,
          y: 0.717_230_494_411_036_3,
          z: -0.605_659_680_236_672_4
        },
        outer: {
          x: 0.603_566_271_513_557_2,
          y: 0.589_659_960_953_842_9,
          z: 0.536_664_593_893_742_2
        },
        sun: {
          x: 0.244_335_086_554_261,
          y: 0.805_178_704_789_182_9,
          z: -0.540_358_787_133_637_4
        }
      });
    }
  );

  test('is a deterministic value of settings and elapsed session time', () => {
    expect(skyStateAt(orrery, 123.5)).toEqual(
      skyStateAt(createTargOrrery(defaults), 123.5)
    );
  });

  test('uses the named seed and resolves only the Enhanced preset', () => {
    const alternate = createTargOrrery({
      ...defaults,
      starSeed: defaults.starSeed + 1
    });

    expect(alternate.stars).not.toEqual(orrery.stars);
    expect(
      targOrreryFor({
        glowDistance: { fadeEnd: 16_384, fadeStart: 4096 },
        preset: 'authentic',
        roads: { glow: 0, thickness: 1 },
        sky: defaults,
        structureReach: 'cell',
        wireframe: { glow: 0, thickness: 1 }
      })
    ).toBeUndefined();
    expect(
      targOrreryFor({
        glowDistance: { fadeEnd: 16_384, fadeStart: 4096 },
        preset: 'enhanced',
        roads: { glow: 0, thickness: 1 },
        sky: defaults,
        structureReach: 'cell',
        wireframe: { glow: 0, thickness: 1 }
      })?.stars
    ).toEqual(orrery.stars);
  });

  test('starts with the sun up and east and the outer moon in the opening view', () => {
    const state = skyStateAt(orrery, 0);
    const outer = state.moons[1];
    const altitude = degrees(Math.asin(outer.direction.y));
    const azimuth = degrees(Math.atan2(outer.direction.x, outer.direction.z));

    expect(state.sun.direction.x).toBeGreaterThan(0);
    expect(state.sun.direction.y).toBeGreaterThan(0);
    expect(state.sun.angularDiameterRadians).toBeCloseTo(radians(1.8), 12);
    expect(altitude).toBeCloseTo(20, 0);
    expect(azimuth).toBeCloseTo(42, 0);
    expect(outer.illuminatedFraction).toBeCloseTo(0.31, 1);
  });

  test('returns to the same solar direction after the authored year', () => {
    const first = skyStateAt(orrery, 0).sun.direction;
    const nextYear = skyStateAt(orrery, defaults.yearDays * daySeconds).sun
      .direction;
    expect(angleBetween(first, nextYear)).toBeLessThan(1e-7);
  });

  test('keeps one solar day within two degrees of the same hour angle', () => {
    const first = skyStateAt(orrery, 0).sun.direction;
    const tomorrow = skyStateAt(orrery, daySeconds).sun.direction;
    expect(degrees(angleBetween(first, tomorrow))).toBeLessThan(2);
  });

  test('turns the Star Sphere once in one sidereal day', () => {
    const first = skyStateAt(orrery, 0).stars[0]!.direction;
    const siderealSeconds =
      daySeconds * (defaults.yearDays / (defaults.yearDays + 1));
    const next = skyStateAt(orrery, siderealSeconds).stars[0]!.direction;
    expect(angleBetween(first, next)).toBeLessThan(1e-7);
  });

  test('returns each moon phase on its synodic cycle', () => {
    for (const [index, periodDays] of [
      [0, 2.6],
      [1, 14.3]
    ] as const) {
      const synodicDays = 1 / Math.abs(1 / periodDays - 1 / defaults.yearDays);
      const first = skyStateAt(orrery, 0).moons[index].illuminatedFraction;
      const repeated = skyStateAt(orrery, synodicDays * daySeconds).moons[index]
        .illuminatedFraction;
      expect(repeated).toBeCloseTo(first, 1);
    }
  });

  test('reaches both seasonal declination extremes', () => {
    const declinations: number[] = [];
    for (let step = 0; step < 720; step += 1) {
      declinations.push(
        skyStateAt(orrery, (step / 720) * defaults.yearDays * daySeconds)
          .solarDeclinationDegrees
      );
    }
    expect(Math.max(...declinations)).toBeCloseTo(defaults.obliquityDegrees, 2);
    expect(Math.min(...declinations)).toBeCloseTo(
      -defaults.obliquityDegrees,
      2
    );
  });

  test('keeps every seeded star finite, unit length and dimmer than Far Points', () => {
    const state = skyStateAt(orrery, 0);
    expect(state.stars).toHaveLength(defaults.starCount);
    for (const star of state.stars) {
      expect(Object.values(star.direction).every(Number.isFinite)).toBeTrue();
      expect(
        Math.hypot(star.direction.x, star.direction.y, star.direction.z)
      ).toBeCloseTo(1, 12);
      expect(star.alpha).toBeWithin(0.35, 0.9);
    }
    for (const axis of ['x', 'y', 'z'] as const) {
      const values = state.stars.map(star => star.direction[axis]);
      const mean =
        values.reduce((sum, value) => sum + value, 0) / values.length;
      const meanSquare =
        values.reduce((sum, value) => sum + value * value, 0) / values.length;
      const positiveFraction =
        values.filter(value => value >= 0).length / values.length;
      expect(Math.abs(mean)).toBeLessThan(0.1);
      expect(meanSquare).toBeWithin(0.27, 0.4);
      expect(positiveFraction).toBeWithin(0.4, 0.6);
    }
    expect(state.starColour.red).toBeLessThan(ScenePalette.whiteInk.red);
    expect(state.starColour.green).toBeLessThan(ScenePalette.whiteInk.green);
    expect(state.starColour.blue).toBeLessThan(ScenePalette.whiteInk.blue);
  });
});

describe('twilight', () => {
  test('pins every authored colour stop and the exact fidelity day colour', () => {
    expect(skyColourAt(-12)).toEqual({ blue: 0x18, green: 0x10, red: 0x08 });
    expect(skyColourAt(0)).toEqual({ blue: 0x38, green: 0x68, red: 0xc8 });
    expect(skyColourAt(12)).toEqual(ScenePalette.sky);
    expect(skyColourAt(90)).toBe(ScenePalette.sky);
  });

  test('keeps the zenith cool while moving between the existing night and day colours', () => {
    expect(skyZenithColourAt(-12)).toEqual({
      blue: 0x18,
      green: 0x10,
      red: 0x08
    });
    expect(skyZenithColourAt(0)).toEqual({
      blue: 0x7c,
      green: 0x58,
      red: 0x34
    });
    expect(skyZenithColourAt(12)).toBe(ScenePalette.sky);
  });

  test('fades stars through twilight and removes them at sunrise', () => {
    expect(starVisibilityAt(-12)).toBe(1);
    expect(starVisibilityAt(-6)).toBeWithin(0, 1);
    expect(starVisibilityAt(0)).toBe(0);
    expect(starVisibilityAt(12)).toBe(0);
  });
});
