import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
  FREE_LOOK_LIMIT,
  FREE_LOOK_RATE,
  IDLE,
  intent
} from '../src/gameCore/index.ts';
import { Camera, type Point } from '../src/projection/index.ts';
import type { GameplaySession } from '../src/session/index.ts';
import { takeTargetAt } from '../src/shell/pointer.ts';
import { createWalkabout, requiredSettings } from '../src/shell/session.ts';
import { objectSegments, type World } from '../src/world/index.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

/// Strafe and Free Look in Targ's Gameplay Session (ADR 0059, #655): the Extensions reach the
/// Pose, drawing and picking through it, and never a Save.

const bundle = await loadPayload();
const settings = requiredSettings(
  await Bun.file(join(repositoryRoot, 'settings.json')).text()
);
const size = { height: 800, width: 1280 } as const;
const STEP = 1 / 50;

const walkabout = (): { session: GameplaySession; world: World } => {
  const { session, world } = createWalkabout(bundle, settings);
  return { session, world };
};

/// `session` under `held` for `seconds`, in the browser's fixed steps.
const hold = (
  session: GameplaySession,
  held: ReturnType<typeof intent>,
  seconds: number
): void => {
  session.intent = held;
  for (let steps = Math.round(seconds / STEP); steps > 0; steps -= 1) {
    session.advance(STEP);
  }
  session.intent = IDLE;
};

const pitchOf = (session: GameplaySession): number =>
  session.snapshot.player.pitch;

describe('Free Look in Targ', () => {
  test('tilts the Pose at the fixed rate, stops at the limit and stays where it is left', () => {
    const { session } = walkabout();
    expect(pitchOf(session)).toBe(0);
    hold(session, intent({ look: 1 }), 0.5);
    expect(pitchOf(session)).toBeCloseTo(FREE_LOOK_RATE / 2, 6);
    hold(session, IDLE, 1);
    expect(pitchOf(session)).toBeCloseTo(FREE_LOOK_RATE / 2, 6);
    hold(session, intent({ look: 1 }), 3);
    expect(pitchOf(session)).toBe(FREE_LOOK_LIMIT);
    hold(session, intent({ look: -1 }), 5);
    expect(pitchOf(session)).toBe(-FREE_LOOK_LIMIT);
    // Walking and turning leave the tilt where it is.
    hold(session, intent({ turn: 1, walk: 1 }), 0.5);
    expect(pitchOf(session)).toBe(-FREE_LOOK_LIMIT);
  });

  test('recentring levels it', () => {
    const { session } = walkabout();
    hold(session, intent({ look: 1 }), 0.5);
    session.recentreLook();
    expect(pitchOf(session)).toBe(0);
    hold(session, IDLE, 0.2);
    expect(pitchOf(session)).toBe(0);
  });

  test('a Save carries no pitch, and a loaded one starts level', () => {
    const { session } = walkabout();
    const level = session.captureSaveSnapshot();
    hold(session, intent({ look: 1 }), 0.5);
    const tilted = session.captureSaveSnapshot();
    expect(tilted.game.player.pitch).toBe(0);
    // The tilt is the only difference Free Look makes, so apart from time the Saves agree.
    expect(tilted.game.player.heading).toBe(level.game.player.heading);
    expect(tilted.game.player.position).toEqual(level.game.player.position);
    const restored = createWalkabout(bundle, settings, tilted).session;
    expect(pitchOf(restored)).toBe(0);
  });

  test('boarding levels it, and aboard Free Look does not apply', () => {
    const { session } = walkabout();
    const twin = walkabout().session;
    hold(session, intent({ look: 1 }), 0.5);
    hold(twin, IDLE, 0.5);
    session.board(1);
    twin.board(1);
    expect(session.snapshot.player).toEqual(twin.snapshot.player);
    hold(session, intent({ look: 1 }), 0.5);
    hold(twin, IDLE, 0.5);
    expect(session.snapshot.player).toEqual(twin.snapshot.player);
  });

  test('leaving is level', () => {
    const { session } = walkabout();
    session.board(1);
    hold(session, intent({ look: 1 }), 0.2);
    expect(session.leaveCraft()).toBeDefined();
    hold(session, IDLE, 0.1);
    expect(pitchOf(session)).toBe(0);
    hold(session, intent({ look: 1 }), 0.2);
    expect(pitchOf(session)).toBeCloseTo(FREE_LOOK_RATE / 5, 6);
  });

  test('a Location change levels it', () => {
    const { session } = walkabout();
    hold(session, intent({ look: 1 }), 0.5);
    session.teleport({ id: 3, kind: 'room' });
    expect(pitchOf(session)).toBe(0);
    hold(session, intent({ look: -1 }), 0.5);
    expect(pitchOf(session)).toBeLessThan(0);
    session.teleport({ kind: 'surface' });
    expect(pitchOf(session)).toBe(0);
  });

  test('a step that reaches another Location levels it', () => {
    const { session } = walkabout();
    hold(session, intent({ look: 1 }), 0.5);
    // As a Doorway's traversal does inside a step: the Room changes under the tilted view.
    session.game = { ...session.game, room: 3 };
    hold(session, IDLE, STEP);
    expect(pitchOf(session)).toBe(0);
  });

  test('the Arrival plays over a New Game, which starts level', () => {
    expect(pitchOf(walkabout().session)).toBe(0);
  });
});

describe('Strafe in Targ', () => {
  test('sidesteps without turning, and a mirrored world mirrors it as it does a turn', () => {
    const { session } = walkabout();
    const before = session.snapshot.player;
    hold(session, intent({ strafe: 1 }), 0.2);
    const after = session.snapshot.player;
    expect(after.heading).toBe(before.heading);
    const moved = {
      x: after.position.x - before.position.x,
      z: after.position.z - before.position.z
    };
    expect(Math.hypot(moved.x, moved.z)).toBeGreaterThan(0);

    const mirrored = walkabout().session;
    mirrored.game = { ...mirrored.game, worldFlipped: true };
    const start = mirrored.snapshot.player;
    hold(mirrored, intent({ strafe: 1 }), 0.2);
    const end = mirrored.snapshot.player;
    expect(end.position.x - start.position.x).toBeCloseTo(-moved.x, 6);
    expect(end.position.z - start.position.z).toBeCloseTo(-moved.z, 6);
  });
});

/// Standing in the supply's Room before it, as the pointer tests stand.
const nearby = (): { session: GameplaySession; world: World } => {
  const made = walkabout();
  const supply = made.world.objects.find(object => object.slot === 42)!;
  made.session.teleport({ id: supply.room, kind: 'room' });
  made.session.place(
    {
      x: supply.origin.x,
      y: supply.origin.y + 48,
      z: supply.origin.z + 400
    },
    0
  );
  return made;
};

const centreOf = (world: World, session: GameplaySession): Point => {
  const supply = world.objects.find(object => object.slot === 42)!;
  const camera = new Camera(session.snapshot.player);
  const lines = objectSegments(supply)
    .map(segment => camera.projectSegment(segment, size))
    .filter(line => line !== undefined);
  const xs = lines.flatMap(line => [line.x1, line.x2]);
  const ys = lines.flatMap(line => [line.y1, line.y2]);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2
  };
};

describe('picking through a tilted view', () => {
  test('hits the object where the tilted view draws it, and not where a level one would', () => {
    const { session, world } = nearby();
    const level = centreOf(world, session);
    hold(session, intent({ look: 1 }), 0.4);
    expect(pitchOf(session)).toBeGreaterThan(0);
    const tilted = centreOf(world, session);
    // Looking up moves the object down the screen.
    expect(tilted.y - level.y).toBeGreaterThan(100);
    const interaction = session.content.interaction!;
    expect(
      takeTargetAt(world, session.snapshot, interaction, size, tilted)
    ).toBe(42);
    expect(
      takeTargetAt(world, session.snapshot, interaction, size, level)
    ).toBeUndefined();
  });
});
