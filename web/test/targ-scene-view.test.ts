import { describe, expect, test } from 'bun:test';

import { ScenePalette } from '../src/scene/index.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent
} from '../src/session/index.ts';
import {
  planTargEnhancedFrame,
  targEnhancedScene,
  targSceneViewOf,
  type TargSceneView
} from '../src/shell/enhancedScene.ts';
import { World } from '../src/world/index.ts';
import { loadPayload } from './replay/artifacts.ts';

/// Targ's Enhanced scene drawn from a view with no Gameplay Session behind it (ADR 0094), as
/// the Flyover draws the city.

const bundle = await loadPayload();
const world = new World(bundle);
const options = {
  atmosphere: { hazeHalfDistance: 262_144 },
  horizon: ScenePalette.sky,
  structureReach: 'all'
} as const;

const sessionless = (position: {
  x: number;
  y: number;
  z: number;
}): TargSceneView => ({
  elapsed: 0,
  indoor: undefined,
  pose: { heading: 0.7, pitch: -0.5, position, roll: 0 },
  residence: undefined,
  roomId: undefined,
  worldFlipped: false
});

const above = (cellX: number, cellZ: number) => ({
  x: (cellX + 0.5) * world.cellSize,
  y: 20_000,
  z: (cellZ + 0.5) * world.cellSize
});

describe('a sessionless Targ scene', () => {
  test('draws the city as a fresh Gameplay Session would at the same Pose', () => {
    const view = sessionless(above(8, 8));
    const snapshot = new GameplaySession(
      sessionContent(world, bundle, undefined),
      openingPlayer()
    ).snapshot;
    const fromSession = targEnhancedScene(
      world,
      { ...targSceneViewOf(snapshot), elapsed: 0, pose: view.pose },
      options
    );
    expect(targEnhancedScene(world, view, options)).toEqual(fromSession);
  });

  test('places every object where the Data Payload does', () => {
    const scene = targEnhancedScene(world, sessionless(above(8, 8)), options);
    const objects = scene.placements.filter(item => item.kind === 'object');
    expect(objects.length).toBeGreaterThan(0);
    const payload = new Map(
      world.objects.map(object => [`targ-object-${object.slot}`, object])
    );
    for (const placement of objects) {
      expect(payload.has(placement.id)).toBe(true);
    }
  });

  test('draws one untiled city: no structure outside its sixteen cells', () => {
    const inside = targEnhancedScene(world, sessionless(above(8, 8)), options);
    const cells = inside.placements.filter(item => item.kind === 'structure');
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThanOrEqual(world.cellsPerAxis ** 2);
    for (const placement of cells) {
      const { x, z } = placement.position;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(world.cellsPerAxis * world.cellSize);
      expect(z).toBeLessThan(world.cellsPerAxis * world.cellSize);
    }
    const far = targEnhancedScene(world, sessionless(above(40, 40)), {
      ...options,
      structureReach: 'cell'
    });
    expect(far.placements.filter(item => item.kind === 'structure')).toEqual(
      []
    );
  });

  test('plans a frame from the view alone', () => {
    const view = sessionless(above(8, 8));
    const plan = planTargEnhancedFrame(
      targEnhancedScene(world, view, options),
      view,
      { height: 800, width: 1280 },
      800
    );
    expect(plan.vertices.length).toBeGreaterThan(0);
    expect(plan.roadVertices.length).toBeGreaterThan(0);
  });
});
