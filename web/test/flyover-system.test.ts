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
    const system = composeTargSystem(presentation, sky);
    const orrery = createTargOrrery(sky);

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
      presentation,
      defaultSettings().presentation.sky
    );
    const bodies = system.bodiesAt(0);
    const targ = bodies[0]!;
    const sun = bodies[1]!;

    expect(targ).toMatchObject({
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
    expect(sun.provenance.radius).toBe('mechanically-derived');
    expect(sun.displayRadiusUnits).toBeCloseTo(
      683_565_275.576_431_6 * Math.sin((1.8 * Math.PI) / 360),
      10
    );
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

  test('scales the Orrery positions without normalising away orbital distance', async () => {
    const presentation = readFlyoverPresentation(
      await json('flyover/targ.json'),
      'targ',
      ['targ', 'sun', 'inner-moon', 'outer-moon']
    );
    const sky = defaultSettings().presentation.sky;
    const system = composeTargSystem(presentation, sky);
    const distance = (elapsed: number): number => {
      const sun = system.bodiesAt(elapsed).find(body => body.id === 'sun')!;
      return Math.hypot(sun.position.x, sun.position.y, sun.position.z);
    };
    const authored = 683_565_275.576_431_6;

    expect(distance(0)).toBeCloseTo(authored * (1 - 0.06), 6);
    expect(
      distance((sky.yearDays * sky.dayLengthMinutes * 60) / 2)
    ).toBeCloseTo(authored * (1 + 0.06), 6);
  });
});

describe('the composed Gamma System', () => {
  test('uses the stable recovered centres and colours with derived radii', async () => {
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
      const nearest = Math.min(
        ...stable
          .filter(candidate => candidate.id !== body.id)
          .map(candidate =>
            Math.hypot(
              candidate.position.x - recovered.position.x,
              candidate.position.y - recovered.position.y,
              candidate.position.z - recovered.position.z
            )
          )
      );
      expect(body.position).toEqual(recovered.position);
      expect(body.displayRadiusUnits).toBe(nearest * 0.2);
      expect(body.colour).toBe(recovered.baseColour);
      expect(body.ranges).toEqual(['orbital']);
      expect(body.provenance).toEqual({
        colour: 'recovered',
        identity: 'recovered',
        position: 'recovered',
        radius: 'mechanically-derived',
        ranges: 'authored'
      });
      expect('primaryId' in body).toBeFalse();
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
