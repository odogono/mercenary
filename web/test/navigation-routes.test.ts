import { describe, expect, test } from 'bun:test';

import { room } from '../src/world/index.ts';
import { LegalRoute } from './legalCheckpoint.ts';

/// Routes walked on the live wiring, through real Doorways, in place of the
/// retired navigation Golden Traces (#927, #929).

/// A fresh route standing in a Room.
const inRoom = async (id: number): Promise<LegalRoute> => {
  const route = await LegalRoute.open();
  route.session.teleport(room(id));
  route.advance(0.1);
  return route;
};

const where = (route: LegalRoute) => route.session.location;

describe('the world flip at Room 127 (PQ-0003)', () => {
  test('walking in from Room 144 mirrors the world', async () => {
    const route = await inRoom(144);
    expect(route.session.snapshot.worldFlipped).toBeFalse();
    route.walkThroughTo(127);
    expect(where(route)).toEqual(room(127));
    expect(route.session.snapshot.worldFlipped).toBeTrue();
  }, 60_000);

  test('walking in from Room 86 does not', async () => {
    const route = await inRoom(86);
    route.walkThroughTo(127);
    expect(where(route)).toEqual(room(127));
    expect(route.session.snapshot.worldFlipped).toBeFalse();
  }, 60_000);
});

describe('dark Room 5 (PQ-0004)', () => {
  test('is dark, Room 111 beyond it is lit, and it is dark again on return', async () => {
    const route = await inRoom(5);
    expect(route.session.snapshot.indoor?.dark).toBeTrue();
    route.walkThroughTo(111);
    expect(route.session.snapshot.indoor?.dark).toBeFalse();
    route.walkThroughTo(5);
    expect(where(route)).toEqual(room(5));
    expect(route.session.snapshot.indoor?.dark).toBeTrue();
  }, 60_000);
});

describe('the locked Doorway out of Room 2', () => {
  test('stays shut to a player without object 17', async () => {
    const route = await inRoom(2);
    expect(() => route.walkThroughTo(74, 10)).toThrow('never opened');
    expect(where(route)).toEqual(room(2));
  }, 60_000);

  test('opens for a player carrying it', async () => {
    const route = await inRoom(2);
    route.session.carry(17);
    route.walkThroughTo(74);
    expect(where(route)).toEqual(room(74));
  }, 60_000);
});

describe('Room 114’s random exit', () => {
  test('leads where its rewired Doorway says, and back', async () => {
    const route = await inRoom(114);
    const inside = route.session.content.rooms.get(114)!;
    const [exit] = route.session.doorwaysOf(inside);
    expect(exit !== undefined && 'room' in exit.destination).toBeTrue();
    const destination = (exit!.destination as { readonly room: number }).room;
    route.walkThroughTo(destination);
    expect(where(route)).toEqual(room(destination));
    route.walkThroughTo(114);
    expect(where(route)).toEqual(room(114));
  }, 60_000);
});
