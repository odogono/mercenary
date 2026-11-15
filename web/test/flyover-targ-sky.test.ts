import { describe, expect, test } from 'bun:test';

import { readFlyoverPresentation } from '../src/flyover/documents.ts';
import {
  bodyDirectionOf,
  tangentFrameOf
} from '../src/flyover/surfaceFrame.ts';
import { composeTargSystem } from '../src/flyover/system.ts';
import { defaultSettings } from '../src/settings/index.ts';
import { createTargOrrery, skyStateAt } from '../src/sky/index.ts';
import { TARG_SYSTEM } from './fixtures/targSystem.ts';

/// ADR 0094: City Island stands where the game's Targ sky is drawn from, so the Flyover over
/// the city and the game agree on the sky at the same clock.

const sky = defaultSettings().presentation.sky;
const system = composeTargSystem(
  TARG_SYSTEM,
  readFlyoverPresentation(await Bun.file('flyover/targ.json').json(), 'targ', [
    'targ',
    'sun',
    'inner-moon',
    'outer-moon'
  ]),
  sky
);
/// The game's own Orrery, built as the Game Surface builds it.
const game = createTargOrrery(TARG_SYSTEM, sky);
const radians = (degrees: number) => (degrees * Math.PI) / 180;

type V = { readonly x: number; readonly y: number; readonly z: number };
const unit = (value: V): V => {
  const length = Math.hypot(value.x, value.y, value.z);
  return { x: value.x / length, y: value.y / length, z: value.z / length };
};
const expectSameDirection = (actual: V, expected: V) => {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.z).toBeCloseTo(expected.z, 9);
};

describe('City Island’s sky in the Targ Flyover', () => {
  test('stands under the Flyover frame’s zenith, facing its east and north', () => {
    const { frameLatitude, island } = system.surfaceFrame;
    const longitude = radians(island.centreDegrees.longitude);
    const latitude = radians(island.centreDegrees.latitude);
    expectSameDirection(bodyDirectionOf(longitude, latitude, frameLatitude), {
      x: 0,
      y: 1,
      z: 0
    });
    const frame = tangentFrameOf(longitude, latitude, frameLatitude);
    expectSameDirection(frame.east, { x: 1, y: 0, z: 0 });
    expectSameDirection(frame.up, { x: 0, y: 1, z: 0 });
    expectSameDirection(frame.north, { x: 0, y: 0, z: 1 });
  });

  test('puts the Sun and both moons where the game’s sky does at the same clock', () => {
    const day = sky.dayLengthMinutes * 60;
    for (const elapsed of [0, 0.13 * day, 0.5 * day, 0.77 * day, 3.4 * day]) {
      const bodies = new Map(
        system.bodiesAt(elapsed).map(body => [body.id, body])
      );
      const targ = bodies.get('targ')!.position;
      expect(targ).toEqual({ x: 0, y: 0, z: 0 });
      const state = skyStateAt(game, elapsed);
      expectSameDirection(
        unit(bodies.get('sun')!.position),
        state.sun.direction
      );
      expectSameDirection(
        unit(bodies.get('inner-moon')!.position),
        state.moons[0].direction
      );
      expectSameDirection(
        unit(bodies.get('outer-moon')!.position),
        state.moons[1].direction
      );
    }
  });
});
