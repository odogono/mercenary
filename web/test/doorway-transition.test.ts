import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { BensonChannel } from '../src/benson/channel.ts';
import { intent } from '../src/gameCore/index.ts';
import {
  ReferenceViewport,
  viewportCentre,
  viewportScale
} from '../src/projection/index.ts';
import { c64Colour } from '../src/scene/index.ts';
import {
  DOORWAY_VBLS_PER_SECOND,
  advanceDoorwayTransition,
  doorwayTransitionSeconds,
  doorwayTransitionVbls,
  doorwayWipeAt,
  doorwayWipeDirection,
  type DoorwayWipeDirection
} from '../src/session/doorwayTransition.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent
} from '../src/session/index.ts';
import { flightModel, loadSettings } from '../src/settings/index.ts';
import { planFrame } from '../src/shell/frame.ts';
import { TextTable } from '../src/text/index.ts';
import { World } from '../src/world/index.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

const bundle = await loadPayload();
const world = new World(bundle);
const settings = loadSettings(
  await Bun.file(join(repositoryRoot, 'settings.json')).text()
);
const content = sessionContent(
  world,
  bundle,
  flightModel(settings.flight, bundle.flight!, world.groundExtent)
);

const coverOf = (direction: DoorwayWipeDirection): number[] =>
  Array.from(
    { length: doorwayTransitionVbls(direction) },
    (_, vbl) => doorwayWipeAt(direction, vbl)!.coverRows
  );

describe('the Doorway Transition timeline', () => {
  test('wipes upward from row 132 to row 4, then holds for 21 VBLs', () => {
    const cover = coverOf('up');
    expect(cover).toHaveLength(54);
    expect(cover.slice(0, 33)).toEqual(
      Array.from({ length: 33 }, (_, step) => 132 - 4 * step)
    );
    expect(cover.slice(33)).toEqual(Array(21).fill(0));
    expect(doorwayWipeAt('up', 10)).toMatchObject({
      cover: 'departed',
      shows: 'arrived'
    });
    expect(doorwayWipeAt('up', 54)).toBeUndefined();
  });

  test('holds the new fill for 25 VBLs, then wipes downward from row 2 to row 130', () => {
    const cover = coverOf('down');
    expect(cover).toHaveLength(58);
    expect(cover.slice(0, 25)).toEqual(Array(25).fill(136));
    expect(cover.slice(25)).toEqual(
      Array.from({ length: 33 }, (_, step) => 2 + 4 * step)
    );
    expect(doorwayWipeAt('down', 30)).toMatchObject({
      cover: 'arrived',
      shows: 'departed'
    });
    expect(doorwayWipeAt('down', 58)).toBeUndefined();
  });

  test('ends once its VBLs have passed, whatever the steps', () => {
    let state = advanceDoorwayTransition(
      { direction: 'up', elapsedSeconds: 0 },
      0
    );
    let seconds = 0;
    while (state !== undefined) {
      state = advanceDoorwayTransition(state, 1 / 50);
      seconds += 1 / 50;
    }
    expect(seconds).toBeGreaterThanOrEqual(doorwayTransitionSeconds('up'));
    expect(seconds).toBeLessThan(doorwayTransitionSeconds('up') + 1 / 50);
    expect(doorwayTransitionSeconds('down')).toBe(58 / DOORWAY_VBLS_PER_SECOND);
  });
});

describe('the Doorway Transition direction', () => {
  // Up walking forward through the Doorway's wall, down backing through it, on
  // every wall: the rule ten real ST crossings confirmed. On foot, heading 0
  // faces −z (north), π/2 −x (west), π +z (south) and 3π/2 +x (east).
  const walls = {
    east: {
      at: { x: 0xf_df, y: 0, z: 0xc_80 },
      faces: (3 * Math.PI) / 2,
      plane: 'zy',
      position: { x: 0x10_00, z: 0xc_00 }
    },
    north: {
      at: { x: 0x5_80, y: 0, z: 0x20 },
      faces: 0,
      plane: 'xy',
      position: { x: 0x5_00, z: 0 }
    },
    south: {
      at: { x: 0xb_80, y: 0, z: 0xf_df },
      faces: Math.PI,
      plane: 'xy',
      position: { x: 0xb_00, z: 0x10_00 }
    },
    west: {
      at: { x: 0x20, y: 0, z: 0x6_80 },
      faces: Math.PI / 2,
      plane: 'zy',
      position: { x: 0, z: 0x6_00 }
    }
  } as const;
  for (const [wall, { at, faces, plane, position }] of Object.entries(walls)) {
    test(`walking forward through the ${wall} wall wipes up`, () => {
      expect(doorwayWipeDirection({ plane, position }, at, faces)).toBe('up');
      expect(
        doorwayWipeDirection({ plane, position }, at, faces + Math.PI * 2)
      ).toBe('up');
      expect(doorwayWipeDirection({ plane, position }, at, faces + 0.7)).toBe(
        'up'
      );
    });
    test(`backing through the ${wall} wall wipes down`, () => {
      expect(
        doorwayWipeDirection({ plane, position }, at, faces + Math.PI)
      ).toBe('down');
      expect(
        doorwayWipeDirection({ plane, position }, at, faces + Math.PI - 0.7)
      ).toBe('down');
    });
  }
});

/// A session standing at Room 1's Doorway to Room 88, walking into it.
const atTheDoorway = (transitions: boolean): GameplaySession => {
  const session = new GameplaySession(
    content,
    openingPlayer(),
    new BensonChannel(new TextTable(bundle.text!))
  );
  session.doorwayTransitions = transitions;
  session.teleport({ id: 1, kind: 'room' });
  session.game = {
    ...session.game,
    player: {
      ...session.game.player,
      heading: (3 * Math.PI) / 2,
      position: { ...session.game.player.position, x: 4056, z: 3200 }
    }
  };
  session.intent = intent({ walk: 1 });
  return session;
};

const FRAME = 1 / 50;

const maxY = (vertices: Float32Array): number =>
  Math.max(...vertices.filter((_, index) => index % 2 === 1));

describe('taking a Doorway in the Gameplay Session', () => {
  test('freezes play for the whole wipe, then lets the player walk on', () => {
    const session = atTheDoorway(true);
    const { events, snapshot } = session.advance(FRAME);
    expect(events).toContainEqual({ arrived: { id: 88, kind: 'room' } });
    const transition = snapshot.doorwayTransition!;
    expect(transition.direction).toBe('up');
    expect(transition.departed.location).toEqual({ id: 1, kind: 'room' });
    expect(transition.departed.player.position.x).toBeGreaterThan(4000);
    const arrivedAt = snapshot.player.position;
    const frozenFrames = Math.ceil(
      (doorwayTransitionSeconds('up') - FRAME) / FRAME
    );
    for (let frame = 0; frame < frozenFrames - 1; frame += 1) {
      const step = session.advance(FRAME).snapshot;
      expect(step.doorwayTransition).toBeDefined();
      expect(step.player.position).toEqual(arrivedAt);
    }
    session.advance(FRAME);
    const after = session.advance(FRAME).snapshot;
    expect(after.doorwayTransition).toBeUndefined();
    expect(after.player.position).not.toEqual(arrivedAt);
  });

  test('is off unless asked for, so Golden Traces keep the Reference Build’s timing', () => {
    const session = atTheDoorway(false);
    const first = session.advance(FRAME).snapshot;
    expect(first.location).toEqual({ id: 88, kind: 'room' });
    expect(first.doorwayTransition).toBeUndefined();
    const arrivedAt = first.player.position;
    expect(session.advance(FRAME).snapshot.player.position).not.toEqual(
      arrivedAt
    );
  });
});

describe('the Faithful view during a Doorway Transition', () => {
  const size = { height: 480, width: 640 };
  const boundary = (rows: number): number => {
    const scale = viewportScale(size);
    return (
      viewportCentre(size).y -
      (ReferenceViewport.height * scale) / 2 +
      rows * scale
    );
  };

  test('splits the view: the old Room’s fill above the edge, the new Room’s lines below', () => {
    const session = atTheDoorway(true);
    session.advance(FRAME);
    // Into the sweep.
    session.advance(10 / DOORWAY_VBLS_PER_SECOND);
    const snapshot = session.snapshot;
    const wipe = snapshot.doorwayTransition!.wipe;
    expect(wipe.coverRows).toBeGreaterThan(4);
    expect(wipe.coverRows).toBeLessThan(132);
    const plan = planFrame(world, snapshot, size);
    expect(plan.doorwayWipe).toEqual(wipe);
    const { doorwayTransition: _, ...plain } = snapshot;
    const whole = planFrame(world, plain, size);
    // The arrived Room's whole frame, then the departed Room's backdrop over the cover rows.
    expect(plan.batches.slice(0, whole.batches.length)).toEqual([
      ...whole.batches
    ]);
    const cover = plan.batches.slice(whole.batches.length);
    expect(cover).toHaveLength(2);
    const departed = snapshot.doorwayTransition!.departed.indoor!;
    expect(cover.map(batch => batch.colour)).toEqual([
      c64Colour(departed.foreground)!,
      c64Colour(departed.background)!
    ]);
    for (const batch of cover) {
      expect(batch.mode).toBe('triangles');
      expect(maxY(batch.vertices)).toBeCloseTo(boundary(wipe.coverRows), 3);
    }
  });

  test('a downward wipe keeps the old Room’s frame below the new Room’s fill', () => {
    const session = atTheDoorway(true);
    session.advance(FRAME);
    const base = session.snapshot;
    const transition = base.doorwayTransition!;
    const snapshot = {
      ...base,
      doorwayTransition: {
        ...transition,
        direction: 'down' as const,
        wipe: doorwayWipeAt('down', 40)!
      }
    };
    const plan = planFrame(world, snapshot, size);
    const { doorwayTransition: _, ...arrived } = base;
    const old = planFrame(
      world,
      {
        ...arrived,
        indoor: transition.departed.indoor,
        location: transition.departed.location,
        player: transition.departed.player
      },
      size
    );
    expect(plan.batches.slice(0, old.batches.length)).toEqual([...old.batches]);
    const cover = plan.batches.slice(old.batches.length);
    expect(cover.map(batch => batch.colour)).toEqual([
      c64Colour(base.indoor!.foreground)!,
      c64Colour(base.indoor!.background)!
    ]);
    expect(maxY(cover[0]!.vertices)).toBeCloseTo(boundary(2 + 4 * 15), 3);
  });

  test('a dark Room’s wipe is black on black', () => {
    const session = atTheDoorway(true);
    session.advance(FRAME);
    const base = session.snapshot;
    const dark = { background: 0, dark: true, foreground: 0, lineColour: 0 };
    const black = c64Colour(0)!;
    for (const direction of ['up', 'down'] as const) {
      for (const vbl of [0, 20, 40]) {
        const plan = planFrame(
          world,
          {
            ...base,
            doorwayTransition: {
              departed: { ...base.doorwayTransition!.departed, indoor: dark },
              direction,
              wipe: doorwayWipeAt(direction, vbl)!
            },
            indoor: dark
          },
          size
        );
        expect(plan.clear).toEqual(black);
        for (const batch of plan.batches) {
          expect(batch.colour).toEqual(black);
        }
      }
    }
  });
});
