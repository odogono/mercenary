import { describe, expect, test } from 'bun:test';

import { nearestFlyoverBody } from '../src/flyover/camera.ts';
import { readFlyoverPresentation } from '../src/flyover/documents.ts';
import {
  bodyDirectionOf,
  tangentFrameOf
} from '../src/flyover/surfaceFrame.ts';
import {
  flyoverSurfaceIslands,
  targSurfaceView
} from '../src/flyover/surfacePass.ts';
import { composeTargSystem } from '../src/flyover/system.ts';
import { Camera } from '../src/projection/index.ts';
import { defaultSettings } from '../src/settings/index.ts';
import { TARG_SYSTEM } from './fixtures/targSystem.ts';

const system = composeTargSystem(
  TARG_SYSTEM,
  readFlyoverPresentation(await Bun.file('flyover/targ.json').json(), 'targ', [
    'targ',
    'sun',
    'inner-moon',
    'outer-moon'
  ]),
  defaultSettings().presentation.sky
);
const bodies = system.bodiesAt(0);
const RADIUS = TARG_SYSTEM.bodies[0]!.radius;
const LATITUDE = system.surfaceFrame.frameLatitude;
const radians = (degrees: number) => (degrees * Math.PI) / 180;
type V = { x: number; y: number; z: number };
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;

/// The Flyover renderer's own turn of a direction into view space.
const flyoverView = (heading: number, pitch: number, d: V): V => {
  const yawed = d.x * Math.cos(heading) - d.z * Math.sin(heading);
  const forward = -(d.x * Math.sin(heading) + d.z * Math.cos(heading));
  return {
    x: yawed,
    y: d.y * Math.cos(pitch) - forward * Math.sin(pitch),
    z: d.y * Math.sin(pitch) + forward * Math.cos(pitch)
  };
};

const at = (longitude: number, latitude: number, altitude: number): V => {
  const up = bodyDirectionOf(radians(longitude), radians(latitude), LATITUDE);
  const distance = RADIUS * (1 + altitude);
  return { x: up.x * distance, y: up.y * distance, z: up.z * distance };
};

const viewAt = (position: V, heading: number, pitch: number) =>
  targSurfaceView(
    system,
    { heading, pitch, position, roll: 0 },
    nearestFlyoverBody(position, bodies)
  );

describe('the Flyover Camera on Targ’s surface', () => {
  test('is Targ’s own Pose over the city centre', () => {
    const view = viewAt({ x: 0, y: RADIUS * 1.07, z: 0 }, 0.8, -0.3);
    expect(view.pose.heading).toBeCloseTo(0.8, 12);
    expect(view.pose.pitch).toBeCloseTo(-0.3, 12);
    expect(view.pose.roll).toBeCloseTo(0, 12);
    expect(view.pose.position.x).toBeCloseTo(524_288, 3);
    expect(view.pose.position.z).toBeCloseTo(524_288, 3);
    expect(view.pose.position.y).toBeCloseTo(0.07 * RADIUS, 3);
    expect(view).toMatchObject({
      elapsed: 0,
      indoor: undefined,
      residence: undefined,
      roomId: undefined,
      worldFlipped: false
    });
  });

  test('turns every direction as the Flyover Camera does, anywhere on Targ', () => {
    const directions: V[] = [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0.3, y: -0.8, z: 0.52 },
      { x: -0.6, y: 0.1, z: -0.79 }
    ];
    for (const [longitude, latitude] of [
      [0, 34],
      [12, 41],
      [-9, 22],
      [120, 20],
      [-150, -45]
    ] as const) {
      for (const [heading, pitch] of [
        [0, 0],
        [0.8, -0.3],
        [2.5, 0.6],
        [5.9, 5.5]
      ] as const) {
        const position = at(longitude, latitude, 0.08);
        const view = viewAt(position, heading, pitch);
        const frame = tangentFrameOf(
          radians(longitude),
          radians(latitude),
          LATITUDE
        );
        const targ = new Camera({
          heading: view.pose.heading,
          pitch: view.pose.pitch,
          position: { x: 0, y: 0, z: 0 },
          roll: view.pose.roll
        });
        for (const direction of directions) {
          const expected = flyoverView(heading, pitch, direction);
          const actual = targ.viewDirection({
            x: dot(direction, frame.east),
            y: dot(direction, frame.up),
            z: dot(direction, frame.north)
          });
          expect(actual.x).toBeCloseTo(expected.x, 9);
          expect(actual.y).toBeCloseTo(expected.y, 9);
          expect(actual.z).toBeCloseTo(expected.z, 9);
        }
      }
    }
  });

  test('stands below the ground at negative altitude', () => {
    const view = viewAt(at(0, 34, -0.02), 0, 0);
    expect(view.pose.position.y).toBeCloseTo(-0.02 * RADIUS, 3);
  });
});

describe('the Flyover’s authored geography on Targ’s surface', () => {
  test('lays each Island polygon onto the surface patch in cells', () => {
    const islands = flyoverSurfaceIslands(system, 0x1_00_00);
    expect(islands).toHaveLength(2);
    const [city, second] = islands;
    expect(city!.origin).toEqual({ x: 0, z: 0 });
    expect(city!.landColour).toBe('#008000');
    expect(city!.coastColour).toBe('#d0b878');
    // City Island's north-east corner, 16°E 50°N.
    const east = radians(16) * Math.cos(radians(34)) * RADIUS;
    const north = radians(16) * RADIUS;
    expect(city!.coastline.vertices[2]![0]).toBeCloseTo(
      (524_288 + east) / 0x1_00_00,
      9
    );
    expect(city!.coastline.vertices[2]![1]).toBeCloseTo(
      (524_288 + north) / 0x1_00_00,
      9
    );
    expect(city!.coastline.edges).toHaveLength(4);
    expect(second!.coastline.vertices).toHaveLength(5);
    expect(second!.roads).toBeUndefined();
  });
});

describe('the Flyover’s surface frame of Targ', async () => {
  const { World } = await import('../src/world/index.ts');
  const { loadPayload } = await import('./replay/artifacts.ts');
  const { createTargOrrery } = await import('../src/sky/index.ts');
  const { planFlyoverSurfaceFrame } =
    await import('../src/flyover/surfacePass.ts');
  const world = new World(await loadPayload());
  const orrery = createTargOrrery(
    TARG_SYSTEM,
    defaultSettings().presentation.sky
  );
  const frameAt = (position: V, heading = 0.6, pitch = -0.35) =>
    planFlyoverSurfaceFrame({
      atmosphere: { hazeHalfDistance: 262_144 },
      elapsed: 0,
      orrery,
      outputHeight: 800,
      size: { height: 800, width: 1280 },
      system,
      view: viewAt(position, heading, pitch),
      world
    });

  test('draws the city, its roads and the coast under the Targ sky', () => {
    const frame = frameAt(at(0, 34, 0.03));
    expect(frame.vertices.length).toBeGreaterThan(0);
    expect(frame.roadVertices.length).toBeGreaterThan(0);
    expect(frame.skyVertices.length).toBeGreaterThan(0);
    expect(frame.clear).toHaveLength(3);
    expect(frame.drawnPlacements.some(id => id.startsWith('targ-cell-'))).toBe(
      true
    );
  });

  test('draws nothing of the city over Second City Island', () => {
    const frame = frameAt(at(120, 20, 0.02), 0, -1.2);
    expect(
      frame.drawnPlacements.filter(
        id => id.startsWith('targ-cell-') || id.startsWith('targ-object-')
      )
    ).toEqual([]);
  });

  test('leaves out every object placed outside the city', () => {
    const outside = world.objects.filter(
      object =>
        object.origin.x < 0 ||
        object.origin.z < 0 ||
        object.origin.x >= world.cellsPerAxis * world.cellSize ||
        object.origin.z >= world.cellsPerAxis * world.cellSize
    );
    const frame = frameAt(at(0, 34, 0.03));
    for (const object of outside) {
      expect(frame.drawnPlacements).not.toContain(`targ-object-${object.slot}`);
    }
  });
});
