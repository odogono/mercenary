import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import {
  dionDoorsBetween,
  type DionEnhancedScene
} from '../src/dion/enhancedScene.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import {
  continuousSkyView,
  type TourcraftSkyView
} from '../src/dion/tourcraftSky.ts';
import { ViewInterpolator } from '../src/enhanced/interpolation.ts';

/// Mercenary III's Enhanced view between frames (ADR 0078): its Bodies turn with the Body's
/// whole phase, and its doors open part way, where the frame holds them.

const tourcraft = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});

const TICK = 1 / 50;

const view = (turn: TourcraftSkyView['turn']): TourcraftSkyView => ({
  body: 60,
  clipRow: 136,
  day: false,
  latitude: 0,
  longitude: 0,
  pitch: 0,
  roll: 0,
  routine: 'onFoot',
  systemEye: [0, 64, 0],
  ...(turn === undefined ? {} : { turn }),
  yaw: 0
});

/// The angles for an eye that follows the player, at `phase`.
const followingAt = (phase: number, x: number, z: number) =>
  continuousSkyView(view({ held: null, phase }), { x, z });

describe('the continuous sky angles', () => {
  test('agree with the sampled angles on whole steps, and move between them', () => {
    // `(eye >>> 18) & 1023` and `+ (phase >>> 16)`, on whole steps.
    const whole = followingAt(5 * 0x1_00_00, 7 * 0x4_00_00, 3 * 0x4_00_00);
    expect(whole.longitude).toBe(12);
    expect(whole.latitude).toBe(259);
    const between = followingAt(
      5 * 0x1_00_00 + 0x80_00,
      7 * 0x4_00_00,
      3 * 0x4_00_00
    );
    expect(between.longitude).toBe(12.5);
    // Past a whole turn, the angles wrap as the 1024ths do.
    expect(followingAt(1023 * 0x1_00_00, 2 * 0x4_00_00, 0).longitude).toBe(1);
  });

  test("a taxi passenger's held angles turn with the phase alone", () => {
    const held = continuousSkyView(
      view({ held: { latitude: 300, longitude: 40 }, phase: 0x1_80_00 }),
      { x: 9 * 0x4_00_00, z: 9 * 0x4_00_00 }
    );
    expect(held.longitude).toBe(41.5);
    expect(held.latitude).toBe(300);
  });

  test('space and a view without a turn are left as sampled', () => {
    const sampled = view(undefined);
    expect(continuousSkyView(sampled, { x: 1, z: 1 })).toBe(sampled);
  });
});

describe('the Enhanced scene between frames', () => {
  test('the sky Bodies move on every tick, not on the sampled step', () => {
    const session = new TourcraftSession(tourcraft);
    const places = new Set<string>();
    const sampled = new Set<number>();
    let ticks = 0;
    for (; ticks < 100; ticks += 1) {
      session.advance(TICK);
      const scene = session.enhancedScene();
      const body = scene.sky?.bodies.find(item => item.kind === 'disc');
      expect(body).toBeDefined();
      places.add(JSON.stringify(body!.offset));
      sampled.add(session.expandedFrameState().skyView!.longitude);
    }
    expect(sampled.size).toBeLessThanOrEqual(2);
    expect(places.size).toBeGreaterThan(90);
  });

  test('the drawn eye places the Bodies for itself', () => {
    const session = new TourcraftSession(tourcraft);
    const scene = session.enhancedScene();
    expect(scene.skyBodiesAt).toBeDefined();
    expect(scene.skyBodiesAt!(scene.pose)).toEqual(scene.sky!.bodies);
    const views = new ViewInterpolator<DionEnhancedScene>(() => true);
    views.view(scene, { fraction: 0, pass: 1 });
    const moved = {
      ...scene,
      pose: {
        ...scene.pose,
        position: {
          ...scene.pose.position,
          x: scene.pose.position.x + 0x4_00_00
        }
      }
    };
    const drawn = views.view(moved, { fraction: 0.5, pass: 2 });
    // Half a step east, half a sampled angle step on.
    expect(drawn.sky!.bodies).toEqual(scene.skyBodiesAt!(drawn.pose));
    expect(drawn.sky!.bodies).not.toEqual(scene.sky!.bodies);
  });

  test('a door the frame moved opens part way', () => {
    const scene = new TourcraftSession(tourcraft).enhancedScene();
    const at = (openUnits: number): DionEnhancedScene => ({
      ...scene,
      doors: new Map([[4, { latch: 'moving', openUnits }]])
    });
    expect(dionDoorsBetween(at(8), at(16), 0.25)?.get(4)?.openUnits).toBe(10);
    expect(dionDoorsBetween(at(16), at(16), 0.25)).toBeNull();
  });

  test('the view draws a door between the frames that moved it', () => {
    const scene = new TourcraftSession(tourcraft).enhancedScene();
    const at = (openUnits: number): DionEnhancedScene => ({
      ...scene,
      doors: new Map([[4, { latch: 'moving', openUnits }]])
    });
    const settled: number[] = [];
    const views = new ViewInterpolator<DionEnhancedScene>(
      () => true,
      (from, to, t) => {
        settled.push(dionDoorsBetween(from, to, t)!.get(4)!.openUnits);
        return to;
      }
    );
    views.view(at(0), { fraction: 0, pass: 1 });
    views.view(at(8), { fraction: 0.5, pass: 2 });
    expect(settled).toEqual([4]);
  });
});
