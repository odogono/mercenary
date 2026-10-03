import { describe, expect, test } from 'bun:test';

import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  SUNLIGHT_FADE_DEGREES,
  erisLighting,
  sunlight,
  type Sunlight,
  type ViewOrientation
} from '../src/damocles/lighting.ts';
import type { SkyItem } from '../src/damocles/sky.ts';
import type { Vector3 } from '../src/orientation/index.ts';
import { Camera } from '../src/projection/index.ts';

/// The sun and the Cast Shadow are world-fixed: however the view is turned, a world point keeps
/// its depth toward the sun and its place among the casters, and a face is lit the same. The frame's vertices are in the
/// view space of the Pose's heading, pitch and roll (`planErisFrame`), so the light must be
/// turned by all three, or tilting the view with Free Look (ADR 0059), or pitching and banking
/// a craft, slides the shadows across the scene.

const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());

const eye: Vector3 = { x: 4_683_000, y: 63, z: 8_940_000 };

const sun: Sunlight = {
  direction: { x: -0.63, y: 0.31, z: -0.71 },
  strength: 1
};

/// A world point as the frame plan emits it: in the view space of the Pose's camera.
const inView = (world: Vector3, view: ViewOrientation): Vector3 =>
  new Camera({
    heading: -view.heading,
    pitch: view.pitch,
    position: { x: eye.x, y: eye.y, z: -eye.z },
    roll: view.roll ?? 0
  }).viewSpace({ x: world.x, y: world.y, z: -world.z });

const views: readonly ViewOrientation[] = [
  { heading: 1.1, pitch: 0 },
  { heading: 1.1, pitch: Math.PI / 3 },
  { heading: 1.1, pitch: -Math.PI / 3 },
  { heading: 4, pitch: 0.4, roll: 0.3 }
];

describe('the Cast Shadow light through a turned view', () => {
  test('a world point keeps its place in the light whatever the pitch and roll', () => {
    const points: readonly Vector3[] = [
      { x: eye.x + 300, y: 0, z: eye.z - 200 },
      { x: eye.x - 900, y: 150, z: eye.z + 1200 },
      { x: eye.x + 20_000, y: 40, z: eye.z + 5000 }
    ];
    // Depth toward the sun, and distance across the light's plane between two points: the
    // two things the Cast Shadow's ray test compares.
    const placed = (view: ViewOrientation): number[] => {
      const toward = erisLighting(doc, view, sun).sunView;
      const local = points.map(point => inView(point, view));
      const depth = local.map(
        p => p.x * toward.x + p.y * toward.y + p.z * toward.z
      );
      const across = local.slice(1).map((p, index) => {
        const q = local[index]!;
        const d = { x: p.x - q.x, y: p.y - q.y, z: p.z - q.z };
        const along = d.x * toward.x + d.y * toward.y + d.z * toward.z;
        return Math.sqrt(d.x ** 2 + d.y ** 2 + d.z ** 2 - along ** 2);
      });
      return [...depth, ...across];
    };
    const [level, ...turned] = views.map(placed);
    for (const other of turned) {
      other.forEach((value, index) =>
        expect(value).toBeCloseTo(level![index]!, 3)
      );
    }
    expect(erisLighting(doc, views[0]!, sun).sunWorld).toEqual(
      erisLighting(doc, views[3]!, sun).sunWorld
    );
  });

  test('the sun lights a face the same whatever the pitch and roll', () => {
    const normal = { x: 0.6, y: 0.8, z: 0 };
    const lambert = (view: ViewOrientation): number => {
      const toward = erisLighting(doc, view, sun).sunView;
      const n = inView(
        { x: eye.x + normal.x, y: eye.y + normal.y, z: eye.z + normal.z },
        view
      );
      return toward.x * n.x + toward.y * n.y + toward.z * n.z;
    };
    for (const view of views.slice(1)) {
      expect(lambert(view)).toBeCloseTo(lambert(views[0]!), 9);
    }
  });
});

/// DIALIS at `degrees` of elevation, due east of the eye, as the sky pass lists it.
const dialisAt = (degrees: number): SkyItem => {
  const radians = (degrees * Math.PI) / 180;
  return {
    colour: '#ffffff',
    first: 'lit',
    id: 'dialis',
    kind: 'disc',
    offset: {
      x: 1_000_000 * Math.cos(radians),
      y: 1_000_000 * Math.sin(radians),
      z: 0
    },
    shadow: '#000000',
    size: 1,
    split: 1
  };
};

const moonAt = (degrees: number): SkyItem => ({
  ...(dialisAt(degrees) as SkyItem & { kind: 'disc' }),
  id: 'body-3'
});

describe('Sunlight', () => {
  const day = { daylight: true, enclosed: false };

  test('comes from DIALIS where the sky pass draws it', () => {
    const light = sunlight({ ...day, sky: [moonAt(60), dialisAt(30)] });
    expect(light?.strength).toBe(1);
    expect(light?.direction.x).toBeCloseTo(Math.cos(Math.PI / 6), 9);
    expect(light?.direction.y).toBeCloseTo(0.5, 9);
  });

  test('is absent by night, inside an Enclosed Region and with DIALIS destroyed', () => {
    expect(
      sunlight({ ...day, daylight: false, sky: [dialisAt(30)] })
    ).toBeNull();
    expect(
      sunlight({ ...day, enclosed: true, sky: [dialisAt(30)] })
    ).toBeNull();
    // No other Body gives light.
    expect(sunlight({ ...day, sky: [moonAt(30)] })).toBeNull();
  });

  test('fades in over the first degrees of elevation and never lights from below', () => {
    // The terminator switches a few seconds after DIALIS crosses the horizon.
    expect(sunlight({ ...day, sky: [dialisAt(-0.5)] })).toBeNull();
    expect(sunlight({ ...day, sky: [dialisAt(0)] })).toBeNull();
    const half = sunlight({
      ...day,
      sky: [dialisAt(SUNLIGHT_FADE_DEGREES / 2)]
    });
    expect(half?.strength).toBeCloseTo(0.5, 6);
    expect(
      sunlight({ ...day, sky: [dialisAt(SUNLIGHT_FADE_DEGREES)] })?.strength
    ).toBe(1);
  });

  test('scales the sun colour by its strength and leaves the ambient neutral', () => {
    const view = views[0]!;
    const full = erisLighting(doc, view, sun);
    const faint = erisLighting(doc, view, { ...sun, strength: 0.25 });
    full.sunColour.forEach((channel, index) =>
      expect(faint.sunColour[index]).toBeCloseTo(channel * 0.25, 9)
    );
    // A face Sunlight does not reach shows its recovered colour.
    expect(full.ambientSky).toEqual([1, 1, 1]);
    expect(full.ambientGround).toEqual([1, 1, 1]);
    expect(full.shadowDepth).toBe(1);
  });

  test("scales the ambient pair and passes the shadow depth by the player's levels", () => {
    const dim = erisLighting(doc, views[0]!, sun, {
      ambient: 0.5,
      shadowDepth: 0.75
    });
    expect(dim.ambientSky).toEqual([0.5, 0.5, 0.5]);
    expect(dim.ambientGround).toEqual([0.5, 0.5, 0.5]);
    expect(dim.shadowDepth).toBe(0.75);
    expect(dim.sunColour).toEqual(erisLighting(doc, views[0]!, sun).sunColour);
  });
});
