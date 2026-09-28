import { describe, expect, test } from 'bun:test';

import type { Mesh } from '../src/catalogue/data.ts';
import { damoclesTakeTargetAt } from '../src/damocles/pointer.ts';
import type { Selection } from '../src/damocles/session.ts';
import type { ErisPlacement, Pose } from '../src/damocles/world.ts';
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
  at: Pose = pose
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
    { height: 768, width: 1024 },
    pointer
  );

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

  test('follows the pitch and roll of the Pose, as the frame is drawn', () => {
    // Looking down at an object on a table: the renderer's camera takes the Pose's pitch and
    // roll, so the object is drawn away from the middle of the view.
    const tilted: Pose = { ...pose, pitch: 0.2, roll: 0.1 };
    const drawn = new Camera({
      farPlane: 1000,
      heading: -tilted.heading,
      nearPlane: 1,
      pitch: tilted.pitch,
      position: { x: 0, y: 10, z: 0 },
      roll: tilted.roll ?? 0,
      verticalFieldOfView: Math.PI / 4
    }).projectPoint({ x: 0, y: 10, z: -100 }, { height: 768, width: 1024 })!;
    const selection: Selection = {
      inRange: true,
      instance: 'object-slot-183',
      kind: 'object'
    };
    expect(target(selection, drawn, tilted)).toBe('object-slot-183');
    expect(target(selection, { x: 512, y: 384 }, tilted)).toBeUndefined();
  });
});
