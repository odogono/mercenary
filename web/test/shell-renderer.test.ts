import { describe, expect, test } from 'bun:test';

import { ScenePalette } from '../src/scene/index.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent
} from '../src/session/index.ts';
import { planFrame } from '../src/shell/frame.ts';
import { World } from '../src/world/index.ts';
import { loadPayload } from './replay/artifacts.ts';

const bundle = await loadPayload();
const world = new World(bundle);
const size = { height: 800, width: 1280 } as const;
const session = (): GameplaySession =>
  new GameplaySession(
    sessionContent(world, bundle, undefined),
    openingPlayer()
  );

describe('a Session Snapshot planned for WebGL2', () => {
  test('the opening surface is ground, dim Ink, bright Ink, then Far Points', () => {
    const frame = planFrame(world, session().snapshot, size);

    expect(frame.clear).toEqual(ScenePalette.sky);
    expect(frame.batches.map(batch => batch.mode)).toEqual([
      'triangles',
      'lines',
      'lines',
      'points'
    ]);
    expect(frame.batches.map(batch => batch.colour)).toEqual([
      ScenePalette.ground,
      ScenePalette.blackInk,
      ScenePalette.whiteInk,
      ScenePalette.whiteInk
    ]);
    expect(frame.batches[0]?.vertices.length).toBe(12);
    expect(frame.lines).toBe(117);
    expect(frame.points).toBe(1);
  });

  test('a lit Room starts with 320 alternating Indoor Backdrop strips', () => {
    const inside = session();
    inside.teleport({ id: 3, kind: 'room' });

    const frame = planFrame(world, inside.snapshot, size);

    expect(frame.clear).toEqual(ScenePalette.blackInk);
    expect(frame.batches.slice(0, 2).map(batch => batch.mode)).toEqual([
      'triangles',
      'triangles'
    ]);
    expect(
      frame.batches[0]!.vertices.length + frame.batches[1]!.vertices.length
    ).toBe(320 * 6 * 2);
    expect(frame.batches[0]?.colour).not.toEqual(frame.batches[1]?.colour);
    expect(frame.batches.slice(2).map(batch => batch.mode)).toEqual(['lines']);
    expect(frame.batches[2]?.colour).toEqual(ScenePalette.whiteInk);
    expect(frame.lines).toBeGreaterThan(0);
    expect(frame.points).toBe(0);
  });

  test('a dark Room clears black and submits no geometry at all', () => {
    const inside = session();
    inside.teleport({ id: 5, kind: 'room' });

    const frame = planFrame(world, inside.snapshot, size);

    expect(frame.clear).toEqual(ScenePalette.blackInk);
    expect(frame.batches).toEqual([]);
    expect(frame.lines).toBe(0);
    expect(frame.points).toBe(0);
  });
});
