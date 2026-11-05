import { describe, expect, test } from 'bun:test';

import type { SkyDisc, SkyState } from '../src/sky/index.ts';
import { targSkyView } from '../src/sky/view.ts';

const pose = { heading: 0, mirrored: false, pitch: 0, roll: 0 };
const clear = { blue: 0, green: 0, red: 0 };
const moon: SkyDisc = {
  angularDiameterRadians: 0.1,
  darkColour: { blue: 0, green: 0, red: 255 },
  direction: { x: 0, y: 0.3, z: 1 },
  illuminatedFraction: 0.5,
  litColour: { blue: 255, green: 255, red: 255 },
  phaseCosine: 0
};
// One half-lit moon at night, the sun and the other moon stacked on it.
const state: SkyState = {
  clear,
  moons: [moon, moon],
  solarAltitudeDegrees: -90,
  solarDeclinationDegrees: 0,
  starColour: clear,
  stars: [],
  starVisibility: 0,
  sun: (({ darkColour: _dark, ...lit }) => ({
    ...lit,
    direction: { x: 1, y: 0.3, z: 1 }
  }))(moon)
};

const colours = (): (readonly [number, number, number])[] => {
  const { vertices } = targSkyView(state, pose, 10, 0.002);
  const out: (readonly [number, number, number])[] = [];
  for (let index = 0; index < vertices.length; index += 10) {
    out.push([
      vertices[index + 3]!,
      vertices[index + 4]!,
      vertices[index + 5]!
    ]);
  }
  return out;
};

describe('Targ sky view discs (#968)', () => {
  test('feathers the rim into the sky behind', () => {
    const found = colours();
    expect(found.some(([r, g, b]) => r === 0 && g === 0 && b === 0)).toBe(true);
    // Part covered on the lit side: grey between the sky and the lit colour.
    expect(
      found.some(([r, g, b]) => r > 0.05 && r < 0.95 && r === g && g === b)
    ).toBe(true);
  });

  test('blends the dark side into the lit across the terminator', () => {
    // Fully covered, part lit: red, with green between none and full.
    expect(colours().some(([r, g]) => r > 0.999 && g > 0.05 && g < 0.95)).toBe(
      true
    );
  });
});

describe('Targ sky view layers (#969)', () => {
  test("blends a moon's rim into the sun behind it, not the sky", () => {
    const sun: SkyDisc = {
      angularDiameterRadians: 0.3,
      direction: { x: 0, y: 0.3, z: 1 },
      illuminatedFraction: 1,
      litColour: { blue: 0, green: 255, red: 255 },
      phaseCosine: 1
    };
    const white = { blue: 255, green: 255, red: 255 };
    const inFront: SkyDisc = {
      ...sun,
      angularDiameterRadians: 0.1,
      litColour: white
    };
    const { vertices } = targSkyView(
      {
        ...state,
        moons: [inFront, { ...inFront, direction: { x: -1, y: 0.3, z: 0 } }],
        sun
      },
      pose,
      10,
      0.002
    );
    // The inner moon, drawn last and lit whole, is 32 rows of four quads.
    const moon = vertices.slice(vertices.length - 32 * 4 * 6 * 10);
    for (let index = 0; index < moon.length; index += 10) {
      // Between white and the sun's yellow: full red and green, never toward the black sky.
      expect(moon[index + 3]).toBeCloseTo(1, 6);
      expect(moon[index + 4]).toBeCloseTo(1, 6);
    }
    expect(
      moon.some((_, index) => index % 10 === 5 && moon[index]! < 0.5)
    ).toBe(true);
  });
});
