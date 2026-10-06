import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import {
  dionEnhancedScene,
  dionPose,
  planDionEnhancedFrame
} from '../src/dion/enhancedScene.ts';
import { generalCamera, levelCamera, toCamera } from '../src/dion/raster.ts';
import { dionFrameState } from '../src/dion/session.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import { FLOATS_PER_VERTEX } from '../src/enhanced/frame.ts';
import { Camera } from '../src/projection/index.ts';
import { dionRenderCheckpoints } from './dion-render-checkpoints.ts';

/// Mercenary III through the shared Enhanced planner (#806).

const tourcraft = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});

/// Where the shared planner's camera puts a point relative to the eye, as a unit direction in
/// its view space: x right, y up, z forward.
const planned = (
  pose: ReturnType<typeof dionPose>,
  rel: readonly [number, number, number]
) => {
  const view = new Camera({
    farPlane: 1e9,
    heading: -pose.heading,
    nearPlane: 1,
    pitch: pose.pitch,
    position: { x: 0, y: 0, z: 0 },
    roll: pose.roll ?? 0
  }).viewDirection({ x: rel[0], y: rel[1], z: -rel[2] });
  const length = Math.hypot(view.x, view.y, view.z);
  return [view.x / length, view.y / length, view.z / length];
};

/// The same point through Dion's own camera: u is left and v down.
const dion = (
  camera: ReturnType<typeof levelCamera>,
  rel: readonly [number, number, number]
) => {
  const { d, u, v } = toCamera(camera, ...rel);
  const length = Math.hypot(d, u, v);
  return [-u / length, -v / length, d / length];
};

const points: readonly (readonly [number, number, number])[] = [
  [100, 20, 300],
  [-250, -40, 90],
  [30, 400, -200],
  [-10, -5, -600]
];

describe("the shared planner's Pose of a Dion camera", () => {
  test('turns a level camera onto the same view', () => {
    for (const heading of [0, 1, 255, 256, 511, 700, 1023]) {
      const { cameraAngles, ...level } = dionFrameState(
        new TourcraftSession(tourcraft).snapshot
      );
      void cameraAngles;
      const state = { ...level, heading };
      const pose = dionPose(state);
      const camera = levelCamera(state.eye, heading);
      for (const rel of points) {
        const [a, b] = [planned(pose, rel), dion(camera, rel)];
        a.forEach((value, axis) => expect(value).toBeCloseTo(b[axis]!, 9));
      }
    }
  });

  test('turns a pitched and banked camera onto the same view', () => {
    const base = dionFrameState(new TourcraftSession(tourcraft).snapshot);
    for (const [roll, pitch, yaw] of [
      [0, 40, 300],
      [60, 0, 10],
      [1000, 980, 512],
      [200, 120, 900]
    ] as const) {
      const state = { ...base, cameraAngles: { pitch, roll, yaw } };
      const pose = dionPose(state);
      const camera = generalCamera(state.eye, roll, pitch, yaw);
      for (const rel of points) {
        const [a, b] = [planned(pose, rel), dion(camera, rel)];
        a.forEach((value, axis) => expect(value).toBeCloseTo(b[axis]!, 9));
      }
    }
  });
});

const finite = (plan: ReturnType<typeof planDionEnhancedFrame>) =>
  [
    plan.vertices,
    plan.skyVertices,
    plan.horizonVertices,
    plan.horizonIslandVertices,
    plan.roadVertices
  ].every(values => values.every(Number.isFinite));

describe('the Dion Enhanced scene', () => {
  test('places the structure and every resident Authentic draws, at all eighteen checkpoints', async () => {
    let count = 0;
    for await (const {
      planned: authentic,
      state,
      world
    } of dionRenderCheckpoints()) {
      count += 1;
      const scene = dionEnhancedScene(world, state);
      const plan = planDionEnhancedFrame(scene, 720);
      expect(finite(plan)).toBe(true);
      expect(plan.triangleCount).toBeGreaterThan(0);
      const ids = new Set(scene.residents.map(r => r.id));
      for (const slot of authentic.stats.models) {
        expect(ids.has(`object-slot-${slot}`)).toBe(true);
      }
      // A structure is placed wherever the occupied cell is in the exported slice.
      expect(scene.surface.placements.some(p => p.kind === 'structure')).toBe(
        !authentic.stats.gaps.some(gap =>
          gap.endsWith('outside the exported slice')
        )
      );
    }
    expect(count).toBe(18);
  });

  test('draws the opening TOURCRAFT frame with its structure, residents and sky', () => {
    const session = new TourcraftSession(tourcraft);
    const scene = session.enhancedScene();
    expect(scene.structure).not.toBeNull();
    expect(scene.surface.placements.some(p => p.kind === 'structure')).toBe(
      true
    );
    const plan = planDionEnhancedFrame(scene, 720);
    expect(finite(plan)).toBe(true);
    expect(plan.triangleCount).toBeGreaterThan(0);
    expect(plan.vertices.length).toBe(
      plan.triangleCount * 3 * FLOATS_PER_VERTEX
    );
    const authentic = session.planFrame();
    const drawnSlots = new Set(scene.residents.map(r => r.id));
    for (const slot of authentic.stats.models) {
      expect(drawnSlots.has(`object-slot-${slot}`)).toBe(true);
    }
  });
});

describe('view-fixed models', () => {
  test('a passenger sees the cab and the driver’s head about the eye', async () => {
    let riding = 0;
    for await (const { name, state, world } of dionRenderCheckpoints()) {
      if (state.passenger === null) {
        continue;
      }
      riding += 1;
      const scene = dionEnhancedScene(world, state);
      const cab = scene.residents.find(
        r => r.id === `object-slot-${state.passenger}`
      )!;
      // `$54444`: the passenger form, ×16, at (0, −63, 0) from the eye, with the driver's head.
      const near = cab.mesh!.vertices.filter(([x, y, z]) => {
        const dx = cab.position.x + x - state.eye[0];
        const dy = cab.position.y + y - state.eye[1];
        const dz = cab.position.z + z - state.eye[2];
        return Math.hypot(dx, dy, dz) < 0x1_00_00;
      });
      expect(near.length, name).toBe(cab.mesh!.vertices.length);
      const head = world.models.get(263)!;
      expect(cab.mesh!.faces.length).toBeGreaterThan(
        head.faces.filter(face => face.kind === 'polygon').length
      );
    }
    expect(riding).toBeGreaterThan(0);
  });
});
