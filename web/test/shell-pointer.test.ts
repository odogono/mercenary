import { describe, expect, test } from 'bun:test';

import { Camera, type Point } from '../src/projection/index.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent
} from '../src/session/index.ts';
import { takeTargetAt } from '../src/shell/pointer.ts';
import { World, objectSegments } from '../src/world/index.ts';
import { loadPayload } from './replay/artifacts.ts';

const bundle = await loadPayload();
const world = new World(bundle);
const size = { height: 800, width: 1280 } as const;
const supply = world.objects.find(object => object.slot === 42)!;

const nearby = (): GameplaySession => {
  const session = new GameplaySession(
    sessionContent(world, bundle, undefined),
    openingPlayer()
  );
  session.teleport({ id: supply.room, kind: 'room' });
  session.place(
    {
      x: supply.origin.x,
      y: supply.origin.y + 48,
      z: supply.origin.z + 400
    },
    0
  );
  return session;
};

const projectedCentre = (session: GameplaySession): Point => {
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

describe('pointer Take targeting', () => {
  test('selects a visible object under the pointer when it is within Take range', () => {
    const session = nearby();

    expect(
      takeTargetAt(
        world,
        session.snapshot,
        session.content.interaction!,
        size,
        projectedCentre(session)
      )
    ).toBe(42);
  });

  test('does not select empty screen space', () => {
    const session = nearby();

    expect(
      takeTargetAt(
        world,
        session.snapshot,
        session.content.interaction!,
        size,
        { x: 0, y: 0 }
      )
    ).toBeUndefined();
  });

  test('does not select an object outside Take range', () => {
    const session = nearby();
    const pointer = projectedCentre(session);
    session.place({
      ...session.snapshot.player.position,
      z: supply.origin.z + 512
    });

    expect(
      takeTargetAt(
        world,
        session.snapshot,
        session.content.interaction!,
        size,
        pointer
      )
    ).toBeUndefined();
  });

  test('does not select an object after it has been carried', () => {
    const session = nearby();
    const pointer = projectedCentre(session);
    session.carry(42);

    expect(
      takeTargetAt(
        world,
        session.snapshot,
        session.content.interaction!,
        size,
        pointer
      )
    ).toBeUndefined();
  });
});
