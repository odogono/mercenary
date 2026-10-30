import { describe, expect, test } from 'bun:test';

import { BensonChannel } from '../src/benson/channel.ts';
import { TalkHost, type TalkScript } from '../src/talk/host.ts';
import { TextTable } from '../src/text/index.ts';
import { SURFACE, room } from '../src/world/index.ts';
import { FakeWorld } from './fixtures/fakeWorld.ts';
import { loadPayload } from './replay/artifacts.ts';

const bundle = await loadPayload();
const text = new TextTable(bundle.text!);

const DART = 1;
const PASS = 46;
const HANGAR = 5;
const PRISON = 81;

/// A Talk Script that does `body` when the game begins.
const onBegin = (body: string): TalkScript => ({
  name: 'test',
  replaces: [],
  source: `on begin\n${body}\nend begin\n`
});

const run = (world: FakeWorld, body: string): TalkHost => {
  const host = new TalkHost([onBegin(body)], new BensonChannel(text), world, {
    random: () => 0
  });
  host.begin();
  return host;
};

const failures = (host: TalkHost) =>
  host.reports.filter(
    report => report.kind !== 'run end' || report.outcome !== 'completed'
  );

describe('the World Port', () => {
  test('names its subjects for Talk Scripts', () => {
    const world = new FakeWorld();
    world.location = room(PRISON);
    world.craft = DART;
    world.places.set(PASS, room(HANGAR));
    const host = run(
      world,
      `ask world to here
if it = "prison" then ask world to pay 1
ask world to boarded
if it = "dart" then ask world to pay 10
ask world to lies "pass"
if it = "hangar" then ask world to pay 100`
    );
    expect(failures(host)).toEqual([]);
    expect(world.balance).toBe(111);
  });

  test('moves objects to named Rooms and the surface', () => {
    const world = new FakeWorld();
    const host = run(
      world,
      `ask world to move "pass", "prison"
ask world to move "dart", "surface"`
    );
    expect(failures(host)).toEqual([]);
    expect(world.places.get(PASS)).toEqual(room(PRISON));
    expect(world.places.get(DART)).toEqual(SURFACE);
  });

  test('arms, disarms and fixes objects, and keeps the accounts', () => {
    const world = new FakeWorld();
    world.balance = 500;
    const host = run(
      world,
      `ask world to arm "pass"
ask world to arm "dart"
ask world to disarm "dart"
ask world to fix "dart"
ask world to spend 200
ask world to sendShip
ask world to sendAttacker
ask world to escape`
    );
    expect(failures(host)).toEqual([]);
    expect([...world.armedSlots]).toEqual([PASS]);
    expect([...world.fixed]).toEqual([DART]);
    expect(world.balance).toBe(300);
    expect(world.shipSent && world.attackerSent && world.escaped).toBe(true);
  });

  test('fails the Run when the world refuses an operation', () => {
    const world = new FakeWorld();
    world.carried.add(PASS);
    const host = run(world, `ask world to move "pass", "prison"`);
    expect(failures(host)).not.toEqual([]);
    expect(world.places.has(PASS)).toBe(false);
  });

  test('sees the advert standing until its Site is destroyed', () => {
    const world = new FakeWorld();
    const standing = run(
      world,
      `ask world to advertIntact
if it then ask world to pay 1`
    );
    expect(failures(standing)).toEqual([]);
    world.destroyedCells.add(50);
    run(
      world,
      `ask world to advertIntact
if it then ask world to pay 1`
    );
    expect(world.balance).toBe(1);
  });
});
