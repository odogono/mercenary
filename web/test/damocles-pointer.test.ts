import { describe, expect, test } from 'bun:test';

import type { Mesh } from '../src/catalogue/data.ts';
import { damoclesTakeTargetAt } from '../src/damocles/pointer.ts';
import type { Selection } from '../src/damocles/session.ts';
import type { ErisPlacement, Pose } from '../src/damocles/world.ts';
import { FREE_LOOK_LIMIT } from '../src/gameCore/index.ts';
import { Camera } from '../src/projection/index.ts';

const keyMesh: Mesh = {
  faces: [
    {
      colour: '#eeeeee',
      sourceColour: 0,
      vertices: [0, 1, 2, 3]
    }
  ],
  lines: [],
  vertices: [
    [-10, 0, 0],
    [10, 0, 0],
    [10, 20, 0],
    [-10, 20, 0]
  ]
};

const key: ErisPlacement = {
  faceCount: 1,
  heading: 0,
  id: 'object-slot-183',
  keyBase: null,
  kind: 'object',
  mesh: keyMesh,
  modelId: 'object-03e494',
  name: 'KEY- V.I.P. LIMO',
  position: { x: 0, y: 0, z: 100 },
  status: 'decoded'
};

const pose: Pose = {
  body: 'body-11',
  heading: 0,
  pitch: 0,
  position: { x: 0, y: 10, z: 0 }
};

const target = (
  selection: Selection,
  pointer = { x: 512, y: 384 },
  at: Pose = pose,
  size = { height: 768, width: 1024 }
) =>
  damoclesTakeTargetAt(
    {
      pose: at,
      residents: [key],
      selection
    },
    {
      farPlane: 1000,
      nearPlane: 1,
      verticalFieldOfViewDegrees: 45
    },
    size,
    pointer
  );

/// Where the renderer's vertex shader puts a world point: the canvas filled by the vertical
/// field of view, one focal length on both axes.
const drawnAt = (
  at: Pose,
  world: { readonly x: number; readonly y: number; readonly z: number },
  size: { readonly height: number; readonly width: number }
) => {
  const view = new Camera({
    heading: -at.heading,
    pitch: at.pitch,
    position: { ...at.position, z: -at.position.z },
    roll: at.roll ?? 0
  }).viewSpace({ ...world, z: -world.z });
  const focal = size.height / 2 / Math.tan(Math.PI / 8);
  return {
    x: size.width / 2 + (view.x * focal) / view.z,
    y: size.height / 2 - (view.y * focal) / view.z
  };
};

const reachable: Selection = {
  inRange: true,
  instance: 'object-slot-183',
  kind: 'object'
};

describe('the Damocles pointer take target', () => {
  test('selects a reachable object under the pointer', () => {
    expect(
      target({
        inRange: true,
        instance: 'object-slot-183',
        kind: 'object'
      })
    ).toBe('object-slot-183');
  });

  test('does not select outside the projection or ordinary take range', () => {
    expect(
      target(
        {
          inRange: true,
          instance: 'object-slot-183',
          kind: 'object'
        },
        { x: 50, y: 50 }
      )
    ).toBeUndefined();
    expect(
      target({
        inRange: false,
        instance: 'object-slot-183',
        kind: 'object'
      })
    ).toBeUndefined();
  });

  test('hits an object below the view where the frame draws it', () => {
    // The State Office table: the DAMOCLES FILE sits below eye height on a canvas narrower
    // than the Reference Viewport's 320:136, where Targ's projection put the hit area above it.
    const size = { height: 728, width: 1233 };
    const high: Pose = { ...pose, position: { x: 0, y: 60, z: 0 } };
    const drawn = drawnAt(high, { x: 0, y: 10, z: 100 }, size);
    expect(drawn.y).toBeGreaterThan(size.height / 2 + 100);
    expect(target(reachable, drawn, high, size)).toBe('object-slot-183');
    expect(
      target(reachable, { x: drawn.x, y: drawn.y - 120 }, high, size)
    ).toBeUndefined();
  });

  test('follows the pitch and roll of the Pose, as the frame is drawn', () => {
    // Looking down at an object on a table: the renderer's camera takes the Pose's pitch and
    // roll, so the object is drawn away from the middle of the view.
    const tilted: Pose = { ...pose, pitch: 0.2, roll: 0.1 };
    const size = { height: 768, width: 1024 };
    const drawn = drawnAt(tilted, { x: 0, y: 10, z: 100 }, size);
    expect(target(reachable, drawn, tilted)).toBe('object-slot-183');
    expect(target(reachable, { x: 512, y: 384 }, tilted)).toBeUndefined();
  });
});

describe('the pointer through Free Look (ADR 0059)', () => {
  test('hits an object on the floor where a view tilted down to the limit draws it', () => {
    // Free Look writes the Pose's pitch, so the pointer projects through the same tilt the
    // frame is drawn with. Level, the object is far below the view.
    const size = { height: 768, width: 1024 };
    // The key stands 100 units ahead; from 180 up it is 60° below the horizon.
    const high: Pose = { ...pose, position: { x: 0, y: 180, z: 0 } };
    const down: Pose = { ...high, pitch: -FREE_LOOK_LIMIT };
    const middle = { x: 0, y: 10, z: 100 };
    const drawn = drawnAt(down, middle, size);
    expect(drawn.y).toBeGreaterThan(0);
    expect(drawn.y).toBeLessThan(size.height);
    expect(drawnAt(high, middle, size).y).toBeGreaterThan(size.height);
    expect(target(reachable, drawn, down, size)).toBe('object-slot-183');
    expect(target(reachable, drawn, high, size)).toBeUndefined();
  });
});
