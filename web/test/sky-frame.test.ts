import { describe, expect, test } from 'bun:test';

import { defaultSettings } from '../src/settings/index.ts';
import { buildSkyFrame, type SkyPose } from '../src/sky/frame.ts';
import {
  createTargOrrery,
  skyStateAt,
  type SkyState
} from '../src/sky/index.ts';

const size = { height: 800, width: 1280 } as const;
const pose: SkyPose = {
  heading: 0,
  mirrored: false,
  pitch: 0,
  roll: 0
};
const state = skyStateAt(
  createTargOrrery(defaultSettings().presentation.sky),
  0
);

const moonOnly = (direction: {
  x: number;
  y: number;
  z: number;
}): SkyState => ({
  ...state,
  moons: [
    { ...state.moons[0], direction },
    { ...state.moons[1], direction: { x: 0, y: 0, z: -1 } }
  ],
  starVisibility: 0,
  sun: { ...state.sun, direction: { x: 1, y: 0, z: 1 } }
});

describe('one Sky State built into view pixels', () => {
  test('describes a world-aligned gradient only between the night and day stops', () => {
    const twilight = {
      ...state,
      clear: { blue: 0x38, green: 0x68, red: 0xc8 },
      solarAltitudeDegrees: 0
    };
    const frame = buildSkyFrame(twilight, pose, size);

    expect(frame.gradient).toEqual({
      centre: { x: 640, y: 400 },
      focal: { x: 512, y: 512 },
      horizon: twilight.clear,
      upInView: { x: 0, y: 1, z: 0 },
      zenith: { blue: 0x7c, green: 0x58, red: 0x34 }
    });
    expect(
      buildSkyFrame({ ...twilight, solarAltitudeDegrees: -12 }, pose, size)
        .gradient
    ).toBeUndefined();
    expect(
      buildSkyFrame({ ...twilight, solarAltitudeDegrees: 12 }, pose, size)
        .gradient
    ).toBeUndefined();
  });

  test('turns world up with bank, inversion and wrapped pitch but not mirroring', () => {
    const twilight = { ...state, solarAltitudeDegrees: 0 };
    const up = (changed: Partial<typeof pose>) =>
      buildSkyFrame(twilight, { ...pose, ...changed }, size).gradient!.upInView;

    expect(up({ roll: Math.PI / 2 }).x).toBeCloseTo(-1, 12);
    expect(up({ roll: Math.PI / 2 }).y).toBeCloseTo(0, 12);
    expect(up({ pitch: Math.PI }).y).toBeCloseTo(-1, 12);
    expect(up({ pitch: 2 * Math.PI }).y).toBeCloseTo(up({}).y, 12);
    expect(up({ pitch: 2 * Math.PI }).z).toBeCloseTo(up({}).z, 12);
    expect(up({ mirrored: true }).x).toBeCloseTo(up({}).x, 12);
    expect(up({ mirrored: true }).y).toBeCloseTo(up({}).y, 12);
    expect(up({ mirrored: true }).z).toBeCloseTo(up({}).z, 12);
  });

  test('scales gradient projection parameters with the viewport', () => {
    const twilight = { ...state, solarAltitudeDegrees: 0 };

    expect(
      buildSkyFrame(twilight, pose, { height: 400, width: 640 }).gradient
    ).toMatchObject({
      centre: { x: 320, y: 200 },
      focal: { x: 256, y: 256 }
    });
  });

  test('the opening view contains the outer moon and culls the eastern sun', () => {
    const frame = buildSkyFrame(state, pose, size);

    expect(frame.clear).toEqual(state.clear);
    expect(frame.batches.map(batch => batch.kind)).toEqual(['outerMoon']);
    expect(frame.batches[0]?.vertices.length).toBe(34 * 5);
  });

  test('puts a moon local +x rim toward the sun on screen', () => {
    const frame = buildSkyFrame(moonOnly({ x: 0, y: 0, z: 1 }), pose, size);
    const batch = frame.batches.find(value => value.kind === 'innerMoon')!;
    const centreX = batch.vertices[0]!;
    const positiveRimX = batch.vertices[5]!;

    expect(positiveRimX).toBeGreaterThan(centreX);
    expect(batch.phaseCosine).toBe(state.moons[0].phaseCosine);
  });

  test('mirrors celestial geometry through the unchanged Camera', () => {
    const normal = buildSkyFrame(moonOnly({ x: 0.25, y: 0, z: 1 }), pose, size)
      .batches[0]!;
    const mirrored = buildSkyFrame(
      moonOnly({ x: 0.25, y: 0, z: 1 }),
      { ...pose, mirrored: true },
      size
    ).batches[0]!;

    expect(mirrored.vertices[0]).toBeCloseTo(
      size.width - normal.vertices[0]!,
      9
    );
  });

  test('rolls celestial geometry about the viewport centre', () => {
    const normal = buildSkyFrame(
      moonOnly({ x: 0.25, y: 0.2, z: 1 }),
      pose,
      size
    ).batches[0]!;
    const rolled = buildSkyFrame(
      moonOnly({ x: 0.25, y: 0.2, z: 1 }),
      { ...pose, roll: Math.PI / 2 },
      size
    ).batches[0]!;
    const x = normal.vertices[0]! - size.width / 2;
    const y = normal.vertices[1]! - size.height / 2;

    expect(rolled.vertices[0]! - size.width / 2).toBeCloseTo(-y, 4);
    expect(rolled.vertices[1]! - size.height / 2).toBeCloseTo(-x, 4);
  });

  test('inherits wrapped pitch from the unchanged Camera', () => {
    const normal = buildSkyFrame(
      moonOnly({ x: 0.25, y: 0.2, z: 1 }),
      pose,
      size
    );
    const wrapped = buildSkyFrame(
      moonOnly({ x: 0.25, y: 0.2, z: 1 }),
      { ...pose, pitch: 2 * Math.PI },
      size
    );

    expect(wrapped).toEqual(normal);
  });

  test('inherits over-the-top pitch inversion from the unchanged Camera', () => {
    const behind = moonOnly({ x: 0.25, y: 0.2, z: -1 });
    const frame = buildSkyFrame(
      { ...behind, sun: { ...behind.sun, direction: { x: 0, y: 0, z: -1 } } },
      { ...pose, pitch: Math.PI },
      size
    );

    expect(frame.batches.map(batch => batch.kind)).toEqual([
      'sun',
      'outerMoon',
      'innerMoon'
    ]);
  });

  test('culls a disc wholly behind the camera', () => {
    const behind = moonOnly({ x: 0, y: 0, z: -1 });
    const frame = buildSkyFrame(
      { ...behind, sun: { ...behind.sun, direction: { x: 0, y: 0, z: -1 } } },
      pose,
      size
    );
    expect(frame.batches).toEqual([]);
  });

  test('projects visible stars as one point batch with per-star alpha', () => {
    const night = skyStateAt(
      createTargOrrery({
        ...defaultSettings().presentation.sky,
        starCount: 12
      }),
      12 * 60
    );
    const frame = buildSkyFrame(night, pose, size);
    const stars = frame.batches.find(batch => batch.kind === 'stars');

    expect(stars?.mode).toBe('points');
    expect(stars?.vertices.length).toBeGreaterThan(0);
    expect(stars!.vertices.length % 5).toBe(0);
    for (let index = 4; index < stars!.vertices.length; index += 5) {
      expect(stars!.vertices[index]!).toBeWithin(0, 0.9);
    }
  });

  test('orders every visible sky batch from stars through the inner moon', () => {
    const forward = { x: 0, y: 0, z: 1 };
    const frame = buildSkyFrame(
      {
        ...state,
        moons: [
          { ...state.moons[0], direction: forward },
          { ...state.moons[1], direction: forward }
        ],
        stars: [{ alpha: 0.5, direction: forward }],
        starVisibility: 1,
        sun: { ...state.sun, direction: forward }
      },
      pose,
      size
    );

    expect(frame.batches.map(batch => batch.kind)).toEqual([
      'stars',
      'sun',
      'outerMoon',
      'innerMoon'
    ]);
  });
});
