import { describe, expect, test } from 'bun:test';

import { REFERENCE_OPENING_POSITION } from '../src/gameCore/index.ts';
import {
  Camera,
  ORACLE_RULES,
  REFERENCE_RULES,
  projectFrame,
  visible
} from '../src/projection/index.ts';
import {
  Ink,
  World,
  type Residence,
  type Segment
} from '../src/world/index.ts';
import { loadPayload } from './replay/artifacts.ts';

const bundle = await loadPayload();
const world = new World(bundle);

const object = (slot: number) => {
  const found = world.objects.find(candidate => candidate.slot === slot);
  if (found === undefined) {
    throw new Error(`payload has no object in slot ${slot}`);
  }
  return found;
};

const surfacePosition = (column: number, row: number, y: number) => ({
  x: (column + 0.5) * world.cellSize,
  y,
  z: (row + 0.5) * world.cellSize
});

const samePoint = (
  a: { readonly x: number; readonly y: number; readonly z: number },
  b: { readonly x: number; readonly y: number; readonly z: number }
): boolean => a.x === b.x && a.y === b.y && a.z === b.z;

const hasSegment = (
  segments: readonly Segment[],
  a: { readonly x: number; readonly y: number; readonly z: number },
  b: { readonly x: number; readonly y: number; readonly z: number }
): boolean =>
  segments.some(
    segment =>
      (samePoint(segment.a, a) && samePoint(segment.b, b)) ||
      (samePoint(segment.a, b) && samePoint(segment.b, a))
  );

describe('Reference surface visibility', () => {
  test('the opening draws only its Surface Cell and the two nearby objects', () => {
    const seen = visible(world, REFERENCE_OPENING_POSITION);

    expect(world.cell(8, 8)?.edgeCount).toBe(14);
    expect(seen.detailedObjects).toBe(2);
    expect(seen.distant).toEqual([]);
    expect(seen.segments.length).toBe(51);
    expect(seen.points).toEqual([object(0).origin, object(63).origin]);

    const frame = projectFrame(
      new Camera({
        heading: 0,
        pitch: 0,
        position: REFERENCE_OPENING_POSITION
      }),
      seen,
      { height: 800, width: 1280 }
    );
    expect(frame.distant).toEqual([]);
  });

  test('the Trace Oracle rules retain the recorded ring and every far point', () => {
    const seen = visible(world, REFERENCE_OPENING_POSITION, {
      rules: ORACLE_RULES
    });

    expect(seen.segments.length).toBe(302);
    expect(seen.distant).toEqual([]);
    expect(seen.points.length).toBe(3);
  });

  test('all reach separates every other Surface Structure as distant', () => {
    const reference = visible(world, REFERENCE_OPENING_POSITION);
    const all = visible(world, REFERENCE_OPENING_POSITION, {
      rules: { ...REFERENCE_RULES, reach: 'all' }
    });

    expect(all.segments).toEqual(reference.segments);
    expect(all.points).toEqual(reference.points);
    const structuresWithoutRoadWorkspaces = world.cells
      .filter(cell =>
        cell.column === 8 && cell.row === 8 ? false : cell.index !== 0
      )
      .flatMap(cell => cell.segments(0));
    expect(all.distant).toHaveLength(8657);
    expect(
      all.distant.filter(segment => segment.ink === Ink.white)
    ).toHaveLength(6982);
    expect(
      all.distant.filter(segment => segment.ink === Ink.black)
    ).toHaveLength(1675);
    expect(all.distant).toHaveLength(structuresWithoutRoadWorkspaces.length);
    expect(
      all.distant.map(({ distance: _distance, ...segment }) => segment)
    ).toEqual(structuresWithoutRoadWorkspaces);
    expect(all.distant.every(segment => segment.distance > 0)).toBeTrue();

    // Road Workspace endpoints belong only to the occupied Surface Cell. Resolving them in
    // every distant structure produces long, repeated cross-surface lines that look like roads.
    const distantRoadLinks = world
      .cell(11, 8)!
      .segments(0, world.roadWorkspace(world.cell(11, 8)!))
      .filter(link => !hasSegment(all.distant, link.a, link.b));
    expect(distantRoadLinks).toHaveLength(4);
  });

  test('a below-eye Far Point follows the altitude-derived Horizon Distance', () => {
    const slot2 = object(2);

    for (const y of [128, 24_576]) {
      const seen = visible(world, { ...REFERENCE_OPENING_POSITION, y });
      expect(seen.points).not.toContainEqual(slot2.origin);
    }
    const high = visible(world, {
      ...REFERENCE_OPENING_POSITION,
      y: 507_904
    });
    expect(high.points).toContainEqual(slot2.origin);
  });

  test('Far Points at or above the eye are eligible at every range', () => {
    const camera = surfacePosition(8, 8, 4096);
    const atEye = {
      x: camera.x + world.cellSize * 5,
      y: camera.y,
      z: camera.z
    };
    const residence = new Map<number, Residence>([
      [0, { at: atEye, kind: 'surface' }]
    ]);

    expect(visible(world, camera, { residence }).points).toContainEqual(atEye);
  });

  test('a below-eye Far Point must be strictly inside the Horizon Distance cube', () => {
    const camera = surfacePosition(8, 8, 24_576);
    const boundary = {
      x: camera.x + world.cellSize * 4,
      y: camera.y - 1,
      z: camera.z
    };
    const inside = { ...boundary, x: boundary.x - 1 };

    expect(
      visible(world, camera, {
        residence: new Map([[0, { at: boundary, kind: 'surface' }]])
      }).points
    ).not.toContainEqual(boundary);
    expect(
      visible(world, camera, {
        residence: new Map([[0, { at: inside, kind: 'surface' }]])
      }).points
    ).toContainEqual(inside);
  });

  test('the occupied road run is hidden low and added back above the first 64 KiB', () => {
    const a = surfacePosition(10, 0, 0);
    const b = surfacePosition(10, 15, 0);

    expect(
      hasSegment(world.mapSegments(surfacePosition(10, 8, 4096)), a, b)
    ).toBe(false);
    expect(
      hasSegment(world.mapSegments(surfacePosition(10, 8, 65_536)), a, b)
    ).toBe(true);
  });

  test('Road Workspace links carry the cell 11:8 structure to both junctions', () => {
    const cell = world.cell(11, 8)!;
    const segments = cell.segments(0, world.roadWorkspace(cell));
    const east = surfacePosition(15, 8, 0);
    const north = surfacePosition(11, 0, 0);

    expect(segments.length).toBe(8);
    expect(
      segments.filter(
        segment => samePoint(segment.a, east) || samePoint(segment.b, east)
      )
    ).toHaveLength(2);
    expect(
      segments.filter(
        segment => samePoint(segment.a, north) || samePoint(segment.b, north)
      )
    ).toHaveLength(2);
  });

  test('the default Camera has no far plane hiding the Colony Craft', () => {
    const colonyCraft = object(63);
    const camera = new Camera({
      heading: 0,
      pitch: Math.PI / 2,
      position: {
        x: colonyCraft.origin.x,
        y: 0,
        z: colonyCraft.origin.z
      }
    });

    expect(camera.farPlane).toBe(Infinity);
    expect(
      camera.projectPoint(colonyCraft.origin, { height: 800, width: 1280 })
    ).toBeDefined();
  });
});
