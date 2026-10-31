import { describe, expect, test } from 'bun:test';

import {
  readFlyoverPresentation,
  readGammaSystem
} from '../src/flyover/documents.ts';
import {
  TargFlyoverClock,
  composeGammaSystem,
  composeTargSystem
} from '../src/flyover/system.ts';
import { defaultSettings } from '../src/settings/index.ts';
import { createTargOrrery, skyStateAt } from '../src/sky/index.ts';
import { TARG_SYSTEM } from './fixtures/targSystem.ts';

const json = async (path: string): Promise<unknown> =>
  JSON.parse(await Bun.file(path).text());

const unit = (value: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}) => {
  const length = Math.hypot(value.x, value.y, value.z);
  return { x: value.x / length, y: value.y / length, z: value.z / length };
};

describe('the composed Targ System', () => {
  test('keeps every moving Body direction aligned with the existing Orrery', async () => {
    const presentation = readFlyoverPresentation(
      await json('flyover/targ.json'),
      'targ',
      ['targ', 'sun', 'inner-moon', 'outer-moon']
    );
    const sky = defaultSettings().presentation.sky;
    const system = composeTargSystem(TARG_SYSTEM, presentation, sky);
    const orrery = createTargOrrery(TARG_SYSTEM, sky);

    for (const elapsed of [0, 123.5, 100_000]) {
      const bodies = new Map(
        system.bodiesAt(elapsed).map(body => [body.id, body])
      );
      const state = skyStateAt(orrery, elapsed);
      for (const [id, direction] of [
        ['sun', state.sun.direction],
        ['inner-moon', state.moons[0].direction],
        ['outer-moon', state.moons[1].direction]
      ] as const) {
        const actual = unit(bodies.get(id)!.position);
        expect(actual.x).toBeCloseTo(direction.x, 14);
        expect(actual.y).toBeCloseTo(direction.y, 14);
        expect(actual.z).toBeCloseTo(direction.z, 14);
      }
    }
  });

  test('composes authored, derived and surface presentation values without Primaries', async () => {
    const presentation = readFlyoverPresentation(
      await json('flyover/targ.json'),
      'targ',
      ['targ', 'sun', 'inner-moon', 'outer-moon']
    );
    const system = composeTargSystem(
      TARG_SYSTEM,
      presentation,
      defaultSettings().presentation.sky
    );
    const bodies = system.bodiesAt(0);
    const targ = bodies[0]!;
    const sun = bodies[1]!;

    expect(targ).toMatchObject({
      colour: '#008000',
      displayRadiusUnits: 2_670_176.857_720_436,
      id: 'targ',
      position: { x: 0, y: 0, z: 0 },
      provenance: {
        colour: 'authored',
        identity: 'authored',
        position: 'authored',
        radius: 'authored',
        ranges: 'authored'
      },
      ranges: ['orbital', 'coastal', 'surface']
    });
    expect(sun.provenance.position).toBe('mechanically-derived');
    expect(sun.provenance.radius).toBe('authored');
    expect(sun.colour).toBe('#ffd070');
    expect(sun.displayRadiusUnits).toBe(10_736_977);
    expect(system.clock.secondsOfDay()).toBeCloseTo(9 * 3600, 0);
    expect(bodies.every(body => !('primaryId' in body))).toBeTrue();
    expect(system.provenance).toEqual({
      backdrop: 'authored',
      bodyMesh: 'authored',
      camera: 'authored',
      cameraSpeed: 'authored',
      islands: 'authored',
      lighting: 'authored',
      surfaceColours: 'authored'
    });
    expect(system.islands).toHaveLength(2);
    expect(system.islands[0]!.surfacePatch).toMatchObject({
      eastAxis: 'x',
      northAxis: 'z',
      sourceCentre: { x: 524_288, z: 524_288 }
    });
    expect(system.islands[1]!.surfacePatch).toBeUndefined();
  });

  test('keeps each Body at its System distance while TARG turns under it', async () => {
    const presentation = readFlyoverPresentation(
      await json('flyover/targ.json'),
      'targ',
      ['targ', 'sun', 'inner-moon', 'outer-moon']
    );
    const sky = defaultSettings().presentation.sky;
    const system = composeTargSystem(TARG_SYSTEM, presentation, sky);
    const daySeconds = sky.dayLengthMinutes * 60;
    for (const source of TARG_SYSTEM.bodies) {
      const { x, y, z } = source.position;
      const authored = Math.hypot(x, y, z);
      for (const elapsed of [0, daySeconds / 3, daySeconds * 7.5]) {
        const body = system
          .bodiesAt(elapsed)
          .find(candidate => candidate.id === source.id)!;
        expect(
          Math.hypot(body.position.x, body.position.y, body.position.z)
        ).toBeCloseTo(authored, 0);
      }
    }
  });
});

describe('the composed Gamma System', () => {
  test('uses the stable recovered centres, colours and decoded sizes', async () => {
    const authority = readGammaSystem(
      await json('../payload/damocles/system.json')
    );
    const stable = authority.bodies.filter(
      body => body.positionKind === undefined
    );
    const presentation = readFlyoverPresentation(
      await json('flyover/gamma.json'),
      'gamma',
      stable.map(body => body.id)
    );
    const system = composeGammaSystem(authority, presentation);
    const first = system.bodiesAt(0);
    const later = system.bodiesAt(123_456);

    expect(first).toEqual(later);
    expect(first).toHaveLength(29);
    expect(first.map(body => body.id)).not.toContain('damocles');
    for (const body of first) {
      const recovered = stable.find(candidate => candidate.id === body.id)!;
      expect(body.position).toEqual(recovered.position);
      // The Body's own recovered radius, not a fraction of how far away its neighbours happen
      // to be.
      expect(body.displayRadiusUnits).toBe(recovered.radius);
      expect(body.colour).toBe(recovered.baseColour);
      expect(body.ranges).toEqual(['orbital']);
      expect(body.provenance).toEqual({
        colour: 'recovered',
        identity: 'recovered',
        position: 'recovered',
        radius: 'recovered',
        ranges: 'authored'
      });
      expect('primaryId' in body).toBeFalse();
    }
  });

  test('draws the System at its recovered relative sizes', async () => {
    const authority = readGammaSystem(
      await json('../payload/damocles/system.json')
    );
    const stable = authority.bodies.filter(
      body => body.positionKind === undefined
    );
    const presentation = readFlyoverPresentation(
      await json('flyover/gamma.json'),
      'gamma',
      stable.map(body => body.id)
    );
    const bodies = composeGammaSystem(authority, presentation).bodiesAt(0);
    const radius = new Map(
      bodies.map(body => [body.id, body.displayRadiusUnits])
    );
    const at = (id: string) => radius.get(id)!;
    // DIALIS is the star and the largest object; the smallest moons are a five-hundredth of it.
    expect(at('dialis')).toBe(20_000);
    expect(at('theon')).toBe(40);
    expect(at('eris')).toBe(1200);

    // The assertion the old rule failed: every pair's drawn order matches its decoded order.
    // `nearest * 0.2` got 196 of these 406 comparisons backwards, because it measured how
    // isolated a Body was rather than how large.
    let pairs = 0;
    for (const [index, a] of stable.entries()) {
      for (const b of stable.slice(index + 1)) {
        pairs += 1;
        expect(at(a.id) > at(b.id)).toBe(a.size > b.size);
      }
    }
    expect(pairs).toBe(406);

    // Nothing intersects: no two recovered Bodies overlap.
    for (const [index, a] of stable.entries()) {
      for (const b of stable.slice(index + 1)) {
        expect(at(a.id) + at(b.id)).toBeLessThan(
          Math.hypot(
            a.position.x - b.position.x,
            a.position.y - b.position.y,
            a.position.z - b.position.z
          )
        );
      }
    }
  });
});

describe('the sessionless Targ Flyover clock', () => {
  test('starts at the epoch, advances at the authored rate and resets locally', () => {
    let now = 100;
    const clock = new TargFlyoverClock(24, () => now);

    expect(clock.elapsedSeconds()).toBe(0);
    expect(clock.secondsOfDay()).toBe(9 * 3600);
    now += 60;
    expect(clock.elapsedSeconds()).toBe(60);
    expect(clock.secondsOfDay()).toBe(10 * 3600);

    clock.setTime(12 * 3600);
    expect(clock.secondsOfDay()).toBe(12 * 3600);
    clock.reset();
    expect(clock.elapsedSeconds()).toBe(0);
    expect(clock.secondsOfDay()).toBe(9 * 3600);
  });
});
