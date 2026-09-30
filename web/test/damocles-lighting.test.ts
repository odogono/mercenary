import { describe, expect, test } from 'bun:test';

import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  erisLighting,
  lightMatrix,
  type ViewOrientation
} from '../src/damocles/lighting.ts';
import { ERIS_SHADOW_WINDOWS } from '../src/damocles/renderer.ts';
import type { Vector3 } from '../src/orientation/index.ts';
import { Camera } from '../src/projection/index.ts';

/// The sun and the Cast Shadow maps are world-fixed: however the view is turned, a world point
/// falls on the same shadow texel and a face is lit the same. The frame's vertices are in the
/// view space of the Pose's heading, pitch and roll (`planErisFrame`), so the light must be
/// turned by all three, or tilting the view with Free Look (ADR 0059), or pitching and banking
/// a craft, slides the shadows across the scene.

const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());

const eye: Vector3 = { x: 4_683_000, y: 63, z: 8_940_000 };

/// A world point as the frame plan emits it: in the view space of the Pose's camera.
const inView = (world: Vector3, view: ViewOrientation): Vector3 =>
  new Camera({
    heading: -view.heading,
    pitch: view.pitch,
    position: { x: eye.x, y: eye.y, z: -eye.z },
    roll: view.roll ?? 0
  }).viewSpace({ x: world.x, y: world.y, z: -world.z });

/// Where the column-major light matrix puts a view-space point.
const lightSpace = (matrix: Float32Array, p: Vector3): readonly number[] =>
  [0, 1, 2].map(
    row =>
      matrix[row]! * p.x +
      matrix[4 + row]! * p.y +
      matrix[8 + row]! * p.z +
      matrix[12 + row]!
  );

const views: readonly ViewOrientation[] = [
  { heading: 1.1, pitch: 0 },
  { heading: 1.1, pitch: Math.PI / 3 },
  { heading: 1.1, pitch: -Math.PI / 3 },
  { heading: 4, pitch: 0.4, roll: 0.3 }
];

describe('the Cast Shadow light through a turned view', () => {
  test('a world point falls on the same shadow texel whatever the pitch and roll', () => {
    const points: readonly Vector3[] = [
      { x: eye.x + 300, y: 0, z: eye.z - 200 },
      { x: eye.x - 900, y: 150, z: eye.z + 1200 },
      { x: eye.x + 20_000, y: 40, z: eye.z + 5000 }
    ];
    const lighting = erisLighting(doc, views[0]!);
    for (const window of ERIS_SHADOW_WINDOWS) {
      for (const point of points) {
        const [level, ...turned] = views.map(view =>
          lightSpace(
            lightMatrix(erisLighting(doc, view), view, eye, window),
            inView(point, view)
          )
        );
        for (const other of turned) {
          other.forEach((value, axis) =>
            // Float32 matrices: a texel is 2/2048 of the unit range.
            expect(value).toBeCloseTo(level![axis]!, 4)
          );
        }
      }
    }
    expect(lighting.sunWorld).toEqual(erisLighting(doc, views[3]!).sunWorld);
  });

  test('the sun lights a face the same whatever the pitch and roll', () => {
    const normal = { x: 0.6, y: 0.8, z: 0 };
    const lambert = (view: ViewOrientation): number => {
      const sun = erisLighting(doc, view).sunView;
      const n = inView(
        { x: eye.x + normal.x, y: eye.y + normal.y, z: eye.z + normal.z },
        view
      );
      return sun.x * n.x + sun.y * n.y + sun.z * n.z;
    };
    for (const view of views.slice(1)) {
      expect(lambert(view)).toBeCloseTo(lambert(views[0]!), 9);
    }
  });
});
