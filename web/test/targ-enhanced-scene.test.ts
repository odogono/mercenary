import { describe, expect, test } from 'bun:test';

import { FLOATS_PER_VERTEX } from '../src/enhanced/frame.ts';
import { Camera } from '../src/projection/index.ts';
import { ScenePalette, c64Colour } from '../src/scene/index.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent,
  type SessionSnapshot
} from '../src/session/index.ts';
import { planTargFrame } from '../src/shell/enhancedFrame.ts';
import {
  planTargEnhancedFrame,
  targEnhancedScene,
  targMesh,
  type TargEnhancedScene
} from '../src/shell/enhancedScene.ts';
import { Ink, World } from '../src/world/index.ts';
import { loadPayload } from './replay/artifacts.ts';

/// Enhanced Targ through the shared planner (ADR 0087): Targ's adapter selects, resolves Ink
/// and Line Colour, and hands the planner geometry the GPU projects as Targ's camera does.

const bundle = await loadPayload();
const world = new World(bundle);
const size = { height: 800, width: 1280 } as const;
const session = (): GameplaySession =>
  new GameplaySession(
    sessionContent(world, bundle, undefined),
    openingPlayer()
  );
const ATMOSPHERE = { hazeHalfDistance: 262_144 };
const BLACK = '#000000';

const hex = (colour: { blue: number; green: number; red: number }): string =>
  `#${[colour.red, colour.green, colour.blue]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')}`;

const sceneOf = (snapshot: SessionSnapshot): TargEnhancedScene =>
  targEnhancedScene(world, snapshot, {
    atmosphere: ATMOSPHERE,
    horizon: ScenePalette.sky,
    structureReach: 'cell'
  });

const viewPoints = (vertices: Float32Array) => {
  const points: [number, number, number][] = [];
  for (let offset = 0; offset < vertices.length; offset += FLOATS_PER_VERTEX) {
    points.push([
      vertices[offset]!,
      vertices[offset + 1]!,
      vertices[offset + 2]!
    ]);
  }
  return points;
};

describe('Targ through the shared planner', () => {
  for (const worldFlipped of [false, true]) {
    test(`views the world as Targ's camera does${worldFlipped ? ', mirrored' : ''}`, () => {
      const player = {
        ...session().snapshot.player,
        heading: 0.7,
        pitch: -0.2,
        position: { x: 300_000, y: 1400, z: 400_000 },
        roll: 0.1
      };
      const snapshot = { ...session().snapshot, player, worldFlipped };
      const corners = [
        { x: 290_000, y: 0, z: 395_000 },
        { x: 291_000, y: 500, z: 395_000 },
        { x: 291_000, y: 0, z: 396_000 }
      ];
      const origin = corners[0]!;
      const scene: TargEnhancedScene = {
        ...sceneOf(snapshot),
        placements: [],
        surface: {
          ...sceneOf(snapshot).surface,
          baseColour: null,
          islands: [],
          placements: []
        }
      };
      const face = {
        doubleSided: true,
        triangles: [0, 1, 2],
        vertices: corners
      };
      const plan = planTargEnhancedFrame(
        {
          ...scene,
          placements: [
            {
              faceCount: 1,
              heading: 0,
              id: 'face',
              keyBase: null,
              kind: 'structure',
              mesh: targMesh(origin, [], [face], ScenePalette.whiteInk),
              modelId: 'face',
              name: 'face',
              position: origin,
              status: 'decoded'
            }
          ]
        },
        snapshot,
        size,
        800
      );
      const camera = new Camera({ ...player, mirrored: worldFlipped });
      const expected = corners.map(corner => camera.viewSpace(corner));
      const drawn = viewPoints(plan.vertices);
      expect(drawn).toHaveLength(6);
      for (const point of drawn) {
        const match = expected.find(
          view =>
            Math.abs(view.x - point[0]) < 0.5 &&
            Math.abs(view.y - point[1]) < 0.5 &&
            Math.abs(view.z - point[2]) < 0.5
        );
        expect(match).toBeDefined();
      }
    });
  }

  test('draws wireframes as depth-tested strokes in the world stream', () => {
    const snapshot = session().snapshot;
    const scene = sceneOf(snapshot);
    const plan = planTargEnhancedFrame(scene, snapshot, size, 800);
    const lines = scene.placements.reduce(
      (sum, placement) => sum + (placement.mesh?.lines.length ?? 0),
      0
    );
    expect(lines).toBeGreaterThan(0);
    // Every stroke is four triangles of the world's own vertices, each with a depth.
    expect(plan.triangleCount).toBeGreaterThan(plan.fillTriangleCount);
    expect(plan.vertices.length / FLOATS_PER_VERTEX / 3).toBe(
      plan.triangleCount
    );
  });

  test('lists black Ink before white, and gives uncoloured lines and faces Line Colour', () => {
    const a = { x: 0, y: 10, z: 0 };
    const b = { x: 10, y: 10, z: 0 };
    const mesh = targMesh(
      a,
      [
        { a, b, ink: Ink.white },
        { a, b, ink: Ink.black },
        { a, b, colour: { blue: 0, green: 0, red: 255 }, ink: Ink.white }
      ],
      [
        { doubleSided: false, triangles: [0, 1, 2], vertices: [a, b, a] },
        {
          colour: { blue: 255, green: 0, red: 0 },
          doubleSided: false,
          triangles: [0, 1, 2],
          vertices: [a, b, a]
        }
      ],
      { blue: 0, green: 255, red: 0 }
    );
    expect(mesh.lines.map(line => line.colour)).toEqual([
      BLACK,
      '#00ff00',
      '#ff0000'
    ]);
    expect(mesh.faces.map(face => face.colour)).toEqual(['#00ff00', '#0000ff']);
  });

  test('draws a Room in its Indoor Scene’s Line Colour', () => {
    const inRoom = session();
    inRoom.teleport({ id: 3, kind: 'room' });
    const snapshot = {
      ...inRoom.snapshot,
      indoor: { ...inRoom.snapshot.indoor!, lineColour: 2 }
    };
    const room = sceneOf(snapshot).placements.find(
      placement => placement.id === 'targ-room-3'
    )!;
    expect(room.mesh!.lines.length).toBeGreaterThan(0);
    for (const line of room.mesh!.lines) {
      expect(line.colour).toBe(hex(c64Colour(2)!));
    }
  });

  test('sends ground-level black Ink to the road layer, not its structure', () => {
    const snapshot = {
      ...session().snapshot,
      player: {
        ...session().snapshot.player,
        position: { x: 0, y: 5000, z: 0 }
      }
    };
    const scene = targEnhancedScene(world, snapshot, {
      atmosphere: ATMOSPHERE,
      horizon: ScenePalette.sky,
      structureReach: 'all'
    });
    const ground = scene.surface.islands[0]!.roads!.lines!;
    expect(ground.length).toBeGreaterThan(0);
    for (const placement of scene.placements) {
      const mesh = placement.mesh!;
      for (const line of mesh.lines) {
        const [start, end] = line.vertices.map(index => mesh.vertices[index]!);
        const groundLevel =
          start![1] + placement.position.y === 0 &&
          end![1] + placement.position.y === 0;
        expect(groundLevel && line.colour === BLACK).toBe(false);
      }
    }
  });

  test('Hazes the surface and never a Room', () => {
    const outside = planTargFrame(
      world,
      session().snapshot,
      size,
      undefined,
      { preset: 'enhanced', structureReach: 'cell' },
      {
        atmosphere: ATMOSPHERE,
        outputHeight: 800,
        strokes: {
          lines: { glow: 0.7, weight: 3 },
          roads: { glow: 0, weight: 1 }
        }
      }
    );
    expect(outside.kind).toBe('shared');
    if (outside.kind === 'shared') {
      expect(outside.plan.haze).toEqual({
        colour: [0x60 / 255, 0xa0 / 255, 0xe0 / 255],
        halfDistance: 262_144
      });
      // The glow halos are drawn, and the renderer fades them toward black in that Haze.
      expect(outside.plan.glowVertices?.length).toBeGreaterThan(0);
    }
    const inRoom = session();
    inRoom.teleport({ id: 3, kind: 'room' });
    const inside = planTargFrame(
      world,
      inRoom.snapshot,
      size,
      undefined,
      { preset: 'enhanced', structureReach: 'cell' },
      {
        atmosphere: ATMOSPHERE,
        outputHeight: 800,
        strokes: {
          lines: { glow: 0, weight: 1 },
          roads: { glow: 0, weight: 1 }
        }
      }
    );
    expect(inside.kind).toBe('shared');
    if (inside.kind === 'shared') {
      expect(inside.plan.haze).toBeNull();
      expect(inside.plan.roadVertices).toHaveLength(0);
      expect(inside.plan.horizonVertices).toHaveLength(0);
    }
  });

  test('keeps a dark Room and Authentic Targ on Targ’s own plan', () => {
    const inRoom = session();
    inRoom.teleport({ id: 3, kind: 'room' });
    const dark = {
      ...inRoom.snapshot,
      indoor: { ...inRoom.snapshot.indoor!, dark: true }
    };
    const options = {
      atmosphere: ATMOSPHERE,
      outputHeight: 800,
      strokes: {
        lines: { glow: 0, weight: 1 },
        roads: { glow: 0, weight: 1 }
      }
    };
    const darkFrame = planTargFrame(
      world,
      dark,
      size,
      undefined,
      { preset: 'enhanced', structureReach: 'cell' },
      options
    );
    expect(darkFrame.kind).toBe('targ');
    if (darkFrame.kind === 'targ') {
      expect(darkFrame.plan.batches).toEqual([]);
    }
    expect(
      planTargFrame(
        world,
        session().snapshot,
        size,
        undefined,
        { preset: 'authentic', structureReach: 'cell' },
        options
      ).kind
    ).toBe('targ');
  });
});

const cellOf = (point: { x: number; z: number }) =>
  (Math.floor(point.z / world.cellSize) << 4) |
  Math.floor(point.x / world.cellSize);
const at = (position: { x: number; y: number; z: number }) => ({
  ...session().snapshot,
  player: { ...session().snapshot.player, pitch: -0.5, position }
});
const runs = (edges: readonly number[]) =>
  new Set(
    edges.map(edge => {
      const [from, to] = [edge >> 8, edge & 0xff].sort((a, b) => a - b);
      return `${from}-${to}`;
    })
  );
const mapLines = (position: { x: number; y: number; z: number }) =>
  new Set(
    world.mapSegments(position).map(segment => {
      const [from, to] = [cellOf(segment.a), cellOf(segment.b)].sort(
        (a, b) => a - b
      );
      return `${from}-${to}`;
    })
  );

describe('Targ’s roads through the shared planner', () => {
  for (const y of [5000, 12_000, 70_000, 0x20_00_00]) {
    test(`selects Targ’s Map Lines by its Horizon Distance at raw Y ${y}`, () => {
      const position = { ...world.cell(6, 9)!.centre, y };
      const scene = sceneOf(at(position));
      const plan = planTargEnhancedFrame(scene, at(position), size, 800);
      const selected = mapLines(position);
      expect(selected.size).toBeGreaterThan(0);
      // The runs Targ resolves into the occupied cell's own structure stay with it.
      for (const run of selected) {
        expect(runs(plan.roadEdges).has(run)).toBe(true);
      }
    });
  }

  test('draws cell 06-09’s ground-level black Ink as roads at both Structure Reaches', () => {
    const cell = world.cell(6, 9)!;
    const position = { ...cell.centre, y: 12_000 };
    const ground = cell
      .segments(0, world.roadWorkspace(cell))
      .filter(
        segment =>
          segment.ink === Ink.black && segment.a.y === 0 && segment.b.y === 0
      );
    expect(ground.length).toBeGreaterThan(0);
    for (const structureReach of ['cell', 'all'] as const) {
      const scene = targEnhancedScene(world, at(position), {
        atmosphere: ATMOSPHERE,
        horizon: ScenePalette.sky,
        structureReach
      });
      const lines = scene.surface.islands[0]!.roads!.lines!;
      for (const segment of ground) {
        expect(lines).toContainEqual([segment.a, segment.b]);
      }
      const plan = planTargEnhancedFrame(scene, at(position), size, 800);
      expect(plan.roadVertices.length).toBeGreaterThan(0);
    }
  });
});
