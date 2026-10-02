import { describe, expect, test } from 'bun:test';

import { openingFrameState, planDionFrame } from '../src/dion/frame.ts';
import {
  integerArea,
  levelCamera,
  project,
  screenPolygon,
  toCamera
} from '../src/dion/raster.ts';
import { DionSession, dionFrameState } from '../src/dion/session.ts';
import { dionContent } from './dion-documents.ts';

/// The recovered projection, clip and cull (#644) and the frame planner over the slice.

describe('the Mercenary III projection', () => {
  test('projects with focal 256 at (160, 68) on the half-step level camera', () => {
    // Heading 0 faces −Z; a point straight ahead lands at 159.2 for the half step.
    const camera = levelCamera([0, 0, 0], 0);
    const [sx, sy] = project(toCamera(camera, 0, 0, -1000));
    expect(sx).toBeCloseTo(160 - 256 * Math.tan((2 * Math.PI * 0.5) / 1024), 6);
    expect(sx).toBeLessThan(160);
    expect(sx).toBeGreaterThan(159);
    expect(sy).toBe(68);
    // +X is screen left at heading 0, and up is screen up.
    expect(project(toCamera(camera, 100, 0, -1000))[0]).toBeLessThan(sx);
    expect(project(toCamera(camera, 0, 100, -1000))[1]).toBeCloseTo(
      68 - 25.6,
      3
    );
    // A quarter turn faces −X.
    const quarter = levelCamera([0, 0, 0], 0x1_00);
    expect(toCamera(quarter, -1000, 0, 0).d).toBeGreaterThan(0);
  });

  test('culls all but clockwise outlines and clips at depth zero', () => {
    const camera = levelCamera([0, 0, 0], 0);
    // +X is screen left, so this order runs clockwise on screen with y down.
    const clockwise = [
      [10, 10],
      [-10, 10],
      [-10, -10],
      [10, -10]
    ].map(([x, y]) => toCamera(camera, x!, y!, -100));
    const outline = screenPolygon(clockwise, true);
    expect(outline).not.toBeNull();
    expect(integerArea(outline!)).toBeGreaterThan(0);
    expect(screenPolygon([...clockwise].reverse(), true)).toBeNull();
    expect(screenPolygon([...clockwise].reverse(), false)).not.toBeNull();
    // Wholly behind the eye draws nothing; crossing it is clipped to the screen.
    const behind = clockwise.map(point => ({ ...point, d: -point.d }));
    expect(screenPolygon(behind, false)).toBeNull();
    const crossing = [
      toCamera(camera, -50, -10, -100),
      toCamera(camera, 50, -10, -100),
      toCamera(camera, 50, -10, 100),
      toCamera(camera, -50, -10, 100)
    ];
    const clipped = screenPolygon(crossing, false)!;
    for (const [x, y] of clipped) {
      expect(x).toBeGreaterThanOrEqual(-0.5);
      expect(x).toBeLessThanOrEqual(319.5);
      expect(y).toBeGreaterThanOrEqual(-0.5);
      expect(y).toBeLessThanOrEqual(135.5);
    }
  });
});

describe('the Mercenary III frame', () => {
  test('draws the shared road window outdoors and suppresses it at walking height', async () => {
    const { world } = await dionContent();
    const corners = Array<number>(256).fill(0);
    corners[0x61] = 0x00_00_62_61;
    const [gx, gz] = world.opening.groupOrigin;
    const state = {
      ...openingFrameState(world),
      cell: 0x60,
      eye: [(gx + 0.5) * 65_536, 2048, (gz + 6.5) * 65_536] as const,
      heading: 0x3_00
    };
    const roadWorld = { ...world, roads: { ...world.roads!, corners } };
    const frame = planDionFrame(roadWorld, state);
    const lines = frame.description.primitives.filter(
      p => p.source === 'roads'
    );
    expect(lines.length).toBeGreaterThan(0);
    expect(
      lines.every(
        p =>
          p.kind === 'line' &&
          p.displayPixelWidth === 1 &&
          'index' in p.colour &&
          p.colour.index === 14
      )
    ).toBe(true);
    expect(
      planDionFrame(roadWorld, {
        ...state,
        eye: [state.eye[0], 63, state.eye[2]]
      }).description.primitives.some(p => p.source === 'roads')
    ).toBe(false);
    const prison = {
      ...openingFrameState(world),
      eye: [world.opening.eye[0], 2048, world.opening.eye[2]] as const,
      heading: 0x1_00
    };
    const cell = world.cells.find(c => c.cell === prison.cell)!;
    const variants = new Map(world.structures.get(cell.structure)!);
    const key = cell.scale.join(',');
    const structure = variants.get(key)!;
    variants.set(key, {
      ...structure,
      regions: structure.regions.map(region => ({ ...region, flags: 0 }))
    });
    const structures = new Map(world.structures);
    structures.set(cell.structure, variants);
    expect(
      planDionFrame(
        { ...roadWorld, cells: [] },
        prison
      ).description.primitives.some(p => p.source === 'roads')
    ).toBe(true);
    expect(
      planDionFrame(
        { ...roadWorld, structures },
        prison
      ).description.primitives.some(p => p.source === 'roads')
    ).toBe(false);
  });

  test('draws the prison room with its occupants hooked into region 1', async () => {
    const content = await dionContent();
    const planned = planDionFrame(
      content.world,
      openingFrameState(content.world)
    );
    // COBWEB 124 is drawn through the region's occupant hook, the mailbox and letter
    // from the fixed drawn list (#644).
    expect(planned.stats.models).toContain(124);
    expect(planned.stats.models).toContain(219);
    expect(planned.stats.models).toContain(220);
    expect(planned.stats.polygons).toBeGreaterThan(20);
    expect(planned.stats.gaps).toEqual([
      'complete sky Body inventory waived by D1'
    ]);
    // Day sky in colour 8; colours 13..15 fixed by the frame colour setup.
    expect(planned.palette[8]).toBe(0x3_55);
    expect(planned.palette.slice(13, 16)).toEqual([0x4_45, 0x2_22, 0x6_55]);
    expect(planned.horizonRow).toBe(68);
  });

  test('is deterministic for a given snapshot', async () => {
    const content = await dionContent();
    const session = new DionSession(content);
    session.advance(3);
    const a = planDionFrame(content.world, dionFrameState(session.snapshot));
    const b = planDionFrame(content.world, dionFrameState(session.snapshot));
    expect(a.frame.pixels).toEqual(b.frame.pixels);
  });

  test('draws every cell of the slice without an unexported record', async () => {
    const content = await dionContent();
    const { world } = content;
    const [gx, gz] = world.opening.groupOrigin;
    for (const cell of world.cells) {
      const structure = world.structures
        .get(cell.structure)!
        .get(cell.scale.join(','))!;
      const region =
        structure.regions.findIndex(item => (item.flags & 0x40_00) !== 0) + 1;
      const planned = planDionFrame(world, {
        ...openingFrameState(world),
        cell: cell.cell,
        eye: [
          (gx + cell.x) * 0x1_00_00 + 0x80_00,
          63,
          (gz + cell.z) * 0x1_00_00 + 0x20_00
        ],
        heading: 0x2_00,
        region
      });
      expect(planned.stats.gaps).toEqual([
        'complete sky Body inventory waived by D1'
      ]);
    }
  });

  test('draws the animated sign at (3,0) and never elsewhere', async () => {
    const content = await dionContent();
    const { world } = content;
    const signs = world.cells.filter(cell =>
      world.details
        .get(cell.detail)!
        .primitives.some(item => item.kind === 'text')
    );
    expect(signs.length).toBeGreaterThan(1);
    const bound = signs.filter(cell => cell.tokenSet !== null);
    expect(bound.map(cell => `${cell.x},${cell.z}`)).toEqual(['3,0']);
    expect(world.lettering.signScript).toEqual([
      0x40, 0x40, 0x40, 0x40, 0x20, 0x41, 0x42, 0x43, 0x44, 0x45, 0x20, 0x46,
      0x46, 0x46, 0x46, 0x46, 0x20, 0x20, 0x20
    ]);
  });
});
