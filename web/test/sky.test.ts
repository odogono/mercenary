import { describe, expect, test } from 'bun:test';

import { ScenePalette } from '../src/scene/index.ts';
import { defaultSettings } from '../src/settings/index.ts';
import {
  createTargOrrery,
  skyColourAt,
  skyStateAt,
  skyZenithColourAt,
  starVisibilityAt,
  targOrreryFor
} from '../src/sky/index.ts';
import { TARG_SYSTEM } from './fixtures/targSystem.ts';
import { onRecordingLibm } from './replay/platform.ts';

const degrees = (radians: number): number => (radians * 180) / Math.PI;
const radians = (degrees: number): number => (degrees * Math.PI) / 180;
const angleBetween = (
  a: { readonly x: number; readonly y: number; readonly z: number },
  b: { readonly x: number; readonly y: number; readonly z: number }
): number =>
  Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)));

const defaults = defaultSettings().presentation.sky;
const orrery = createTargOrrery(TARG_SYSTEM, defaults);
const daySeconds = defaults.dayLengthMinutes * 60;

describe('the authored Targ Orrery', () => {
  test.skipIf(!onRecordingLibm)(
    'pins the celestial directions read from the Targ System',
    () => {
      const state = skyStateAt(orrery, 123.5);
      expect({
        inner: state.moons[0].direction,
        outer: state.moons[1].direction,
        sun: state.sun.direction
      }).toEqual({
        inner: {
          x: -0.865_058_504_950_010_9,
          y: 0.321_754_854_650_322_6,
          z: -0.384_899_462_876_478_64
        },
        outer: {
          x: 0.596_639_234_988_991_4,
          y: 0.622_728_280_848_721_3,
          z: 0.506_192_761_211_524_2
        },
        sun: {
          x: 0.244_038_175_081_906_42,
          y: 0.803_972_140_411_601_1,
          z: -0.542_286_056_011_660_2
        }
      });
    }
  );

  test('is a deterministic value of settings and elapsed session time', () => {
    expect(skyStateAt(orrery, 123.5)).toEqual(
      skyStateAt(createTargOrrery(TARG_SYSTEM, defaults), 123.5)
    );
  });

  test('uses the named seed and resolves only the Enhanced preset', () => {
    const alternate = createTargOrrery(TARG_SYSTEM, {
      ...defaults,
      starSeed: defaults.starSeed + 1
    });

    expect(alternate.stars).not.toEqual(orrery.stars);
    expect(
      targOrreryFor(TARG_SYSTEM, {
        glowDistance: { fadeEnd: 16_384, fadeStart: 4096 },
        preset: 'authentic',
        roads: { glow: 0, thickness: 1 },
        sky: defaults,
        structureReach: 'cell',
        wireframe: { glow: 0, thickness: 1 }
      })
    ).toBeUndefined();
    expect(
      targOrreryFor(TARG_SYSTEM, {
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
    expect(state.sun.angularDiameterRadians).toBeCloseTo(radians(1.8), 6);
    expect(altitude).toBeCloseTo(20, 0);
    expect(azimuth).toBeCloseTo(42, 0);
    expect(outer.illuminatedFraction).toBeCloseTo(0.31, 1);
  });

  test('returns the sun, the moons and the stars to the same place after one Body Day', () => {
    for (const elapsed of [0, 123.5, 4321]) {
      const today = skyStateAt(orrery, elapsed);
      const tomorrow = skyStateAt(orrery, elapsed + daySeconds);
      expect(
        angleBetween(today.sun.direction, tomorrow.sun.direction)
      ).toBeLessThan(1e-6);
      for (const index of [0, 1] as const) {
        expect(
          angleBetween(
            today.moons[index].direction,
            tomorrow.moons[index].direction
          )
        ).toBeLessThan(1e-6);
      }
      expect(
        angleBetween(today.stars[0]!.direction, tomorrow.stars[0]!.direction)
      ).toBeLessThan(1e-6);
    }
  });

  test('keeps each moon at one phase, because the System does not move', () => {
    const phases = Array.from({ length: 24 }, (_, step) =>
      skyStateAt(orrery, (step / 24) * 7 * daySeconds).moons.map(
        moon => moon.illuminatedFraction
      )
    );
    for (const phase of phases) {
      expect(phase).toEqual(phases[0]!);
    }
    // Neither moon is new, so both are there to be seen.
    expect(phases[0]![0]).toBeWithin(0.3, 0.7);
    expect(phases[0]![1]).toBeWithin(0.2, 0.5);
  });

  test('keeps the sun at one declination, with no seasons', () => {
    for (let step = 0; step < 48; step += 1) {
      expect(
        skyStateAt(orrery, step * 1000 * daySeconds).solarDeclinationDegrees
      ).toBeCloseTo(0, 9);
    }
  });

  test("reads each disc's size and colour from the Targ System", () => {
    const state = skyStateAt(orrery, 0);
    expect(state.sun.angularDiameterRadians).toBeCloseTo(radians(1.8), 6);
    expect(state.moons[0].angularDiameterRadians).toBeCloseTo(radians(1.6), 4);
    expect(state.moons[1].angularDiameterRadians).toBeCloseTo(radians(0.9), 4);
    expect(state.sun.litColour).toEqual({ blue: 0x70, green: 0xd0, red: 0xff });
    expect(state.moons[1].litColour).toEqual({
      blue: 0xd8,
      green: 0xc8,
      red: 0xb8
    });
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
