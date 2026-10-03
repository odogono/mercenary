import { describe, expect, test } from 'bun:test';

import {
  flightModel,
  gameState,
  intent,
  playerState,
  step
} from '../src/gameCore/index.ts';
import { apply } from '../src/orientation/index.ts';
import { Camera } from '../src/projection/index.ts';
import { panelAttitude } from '../src/shell/attitude.ts';
import { World, craftHeading } from '../src/world/index.ts';
import { loadPayload } from './replay/artifacts.ts';

const bundle = await loadPayload();
const world = new World(bundle);
if (bundle.flight === undefined) {
  throw new Error('coordinate tests require the flight Data Payload');
}
const flight = flightModel(bundle.flight);

// Cardinal observations from the Reference Build's full point transform, with
// level pitch 512 and roll 0, independently exercised against captured RAM.
// Its screen X increases rightward. These assertions deliberately do not derive
// their expected rays from the app's movement or camera formula.
const cardinalViews = [
  { heading: 0, right: { x: 1000, z: -10_000 } },
  { heading: 90, right: { x: -10_000, z: -1000 } },
  { heading: 180, right: { x: -1000, z: 10_000 } },
  { heading: 270, right: { x: 10_000, z: 1000 } }
];

describe('Reference Build coordinate handedness', () => {
  for (const { heading, right } of cardinalViews) {
    test(`heading ${heading} places the original forward-right ray on screen`, () => {
      const position = { x: 250_000, y: 100, z: 350_000 };
      const camera = new Camera({
        heading: (heading * Math.PI) / 180,
        pitch: 0,
        position
      });
      const size = { height: 136, width: 320 };
      const point = camera.projectPoint(
        {
          x: position.x + right.x,
          y: position.y + 1000,
          z: position.z + right.z
        },
        size
      );

      expect(point).toBeDefined();
      expect(point!.x).toBeCloseTo(172.8);
      expect(point!.y).toBeCloseTo(55.2);
      expect(
        camera.projectPoint(
          {
            x: position.x - right.x,
            y: position.y,
            z: position.z - right.z
          },
          size
        )
      ).toBeUndefined();
    });
  }

  test('Flipped World mirrors the same visible ray without changing its depth', () => {
    const point = { x: 1000, y: 0, z: -10_000 };
    const fields = { heading: 0, pitch: 0, position: { x: 0, y: 0, z: 0 } };
    const normal = new Camera(fields).viewSpace(point);
    const mirrored = new Camera({ ...fields, mirrored: true }).viewSpace(point);

    expect(normal.z).toBeGreaterThan(0);
    expect(mirrored).toEqual({ x: -normal.x, y: normal.y, z: normal.z });
  });

  test('the AIRPORT ground lettering reads left to right with upright glyphs', () => {
    const sign = world.cell(12, 12)!;
    expect(sign.structure).toBe('surface-structure:e23f');
    const edges = sign.segments(0);
    // The A's first stroke goes from its left foot to its apex. The last
    // letter's stem is the T. Both are real decoded geometry, not drawn text.
    const a = edges[6]!;
    const t = edges[25]!;
    const camera = new Camera({
      heading: (3 * Math.PI) / 2,
      pitch: -Math.PI / 4,
      position: { x: 810_000, y: 8000, z: 819_200 }
    });
    const size = { height: 800, width: 1280 };
    const foot = camera.projectPoint(a.a, size)!;
    const apex = camera.projectPoint(a.b, size)!;
    const lastLetter = camera.projectPoint(t.a, size)!;

    expect(foot).toBeDefined();
    expect(apex).toBeDefined();
    expect(lastLetter).toBeDefined();
    expect(foot.x).toBeLessThan(lastLetter.x);
    expect(apex.y).toBeLessThan(foot.y);
  });

  test('the 04-01 view at heading 270 sees the original positive-X Map Lines', () => {
    const position = { x: 294_912, y: 58_000, z: 98_304 };
    const road = world
      .mapSegments(position)
      .find(
        line =>
          line.a.x === 622_592 &&
          line.a.z === 32_768 &&
          line.b.x === 622_592 &&
          line.b.z === 163_840
      )!;
    expect(road).toBeDefined();
    const camera = new Camera({
      heading: (3 * Math.PI) / 2,
      pitch: 0,
      position
    });
    const line = camera.projectSegment(road, { height: 136, width: 320 });

    expect(line).toBeDefined();
    expect(line!.x1).toBeCloseTo(134.4, 4);
    expect(line!.x2).toBeCloseTo(185.6, 4);
  });

  test('a right bank raises the right-hand horizon as the original negative raw roll does', () => {
    // Executing the full reference transform at raw roll -64, level pitch512,
    // yaw0 puts this ray at logical (86,63), above the centre (80,68).
    const camera = new Camera({
      heading: 0,
      pitch: 0,
      position: { x: 0, y: 0, z: 0 },
      roll: Math.PI / 8
    });
    const point = camera.projectPoint(
      { x: 1000, y: 0, z: -10_000 },
      { height: 136, width: 320 }
    )!;

    expect(point).toBeDefined();
    expect(point.x).toBeGreaterThan(160);
    expect(point.y).toBeLessThan(68);
  });

  for (const craft of [undefined, 1]) {
    const mover = craft === undefined ? 'walking' : 'flying';
    test(`${mover} advances toward the original heading-zero view`, () => {
      const state = gameState({
        ...(craft === undefined ? {} : { craft, mode: 'flying' as const }),
        player: playerState({
          position: {
            x: 500_000,
            y: craft === undefined ? 128 : 20_000,
            z: 500_000
          },
          speed: craft === undefined ? 0 : 500
        }),
        throttle: craft === undefined ? 0 : 1000
      });
      const next = step(state, intent({ walk: 1 }), 1 / 50, flight);

      expect(next.player.position.z).toBeLessThan(state.player.position.z);
      expect(next.player.position.x).toBeCloseTo(state.player.position.x);
    });

    test(`${mover} turns right by moving the previously centred scene left`, () => {
      const state = gameState({
        ...(craft === undefined ? {} : { craft, mode: 'flying' as const }),
        player: playerState({ position: { x: 500_000, y: 20_000, z: 500_000 } })
      });
      const next = step(state, intent({ turn: 1 }), 1 / 50, flight);
      const camera = new Camera({ ...next.player, roll: 0 });
      const point = camera.projectPoint(
        { x: 500_000, y: 20_000, z: 490_000 },
        { height: 136, width: 320 }
      );

      expect(point).toBeDefined();
      expect(point!.x).toBeLessThan(160);
      if (craft !== undefined) {
        expect(next.player.roll).toBeGreaterThan(0);
      }
    });
  }

  test('boarding headings follow the actual six-bit model nose orientation', () => {
    const craft = world.objects.find(object => object.slot === 1)!;
    for (const yaw of [0, 16, 32, 48]) {
      const oriented = { ...craft, orientation: { x: 0, y: yaw, z: 0 } };
      const nose = apply(oriented.orientation, { x: 0, y: 0, z: -1000 });
      const camera = new Camera({
        heading: craftHeading(oriented),
        pitch: 0,
        position: { x: 0, y: 0, z: 0 }
      });

      expect(camera.viewSpace(nose).x).toBeCloseTo(0);
      expect(camera.viewSpace(nose).z).toBeCloseTo(1000);
    }
  });
});

const compassDegrees = (heading: number): number =>
  panelAttitude({ heading, pitch: 0 }, 'targ').compassDegrees;

describe('displayed bearings across the heading correction', () => {
  test('retains the opening bearing and a migrated Save bearing', () => {
    expect(compassDegrees(Math.PI)).toBe(0);
    expect(compassDegrees(Math.PI / 2)).toBe(270);
  });

  test('places the low-Z city edge on the right at displayed 270 degrees', () => {
    const camera = new Camera({
      heading: Math.PI / 2,
      pitch: 0,
      position: { x: 294_912, y: 58_368, z: 98_304 }
    });
    expect(compassDegrees(camera.heading)).toBe(270);
    const boundary = world
      .mapSegments(camera.position)
      .find(
        line =>
          line.a.x === 98_304 && line.a.z === 32_768 && line.b.z === 32_768
      );
    expect(boundary).toBeDefined();
    const point = camera.projectPoint(boundary!.a, { height: 136, width: 320 });
    expect(point).toBeDefined();
    expect(point!.x).toBeGreaterThan(160);
  });
});
