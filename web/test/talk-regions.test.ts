import { describe, expect, test } from 'bun:test';

import { BensonChannel } from '../src/benson/channel.ts';
import { TalkHost, type RegionScript } from '../src/talk/host.ts';
import { TextTable } from '../src/text/index.ts';
import { FakeWorld } from './fixtures/fakeWorld.ts';
import { loadPayload } from './replay/artifacts.ts';

/// Surface Regions in the Talk host (ADR 0084): what happens at a region goes
/// to the Talk Script its placement names, and to no other.

const bundle = await loadPayload();
const text = new TextTable(bundle.text!);

const ENERGY_CRYSTAL = 31;

/// Pays for each message it hears, so the balance says what was told.
const PAYING = `
on approached
  ask world to pay 1
end approached
on arrived
  ask world to pay 10
end arrived
on departed
  ask world to pay 100
end departed
on withdrew
  ask world to pay 1000
end withdrew
on received item
  if item = "energy crystal" then ask world to pay 10000
end received
on lost item
  if item = "energy crystal" then ask world to pay 100000
end lost
`;

const scripts = [
  { name: 'keeper', replaces: [], source: PAYING },
  { name: 'bystander', replaces: [], source: PAYING }
];

const host = (
  world: FakeWorld,
  regions: readonly RegionScript[],
  saved?: ReturnType<TalkHost['captureSaveSnapshot']>
) =>
  new TalkHost(
    scripts,
    new BensonChannel(text),
    world,
    { random: () => 0, regions },
    saved
  );

const KEEPS_SHRINE = [{ name: 'shrine', script: 'keeper' }];

describe('Surface Regions in the Talk host', () => {
  test("tell only the region's own Talk Script what happens there", () => {
    const world = new FakeWorld();
    const talk = host(world, KEEPS_SHRINE);
    talk.deliver([
      { kind: 'approached', region: 'shrine' },
      { kind: 'arrived', region: 'shrine' },
      { kind: 'received', object: ENERGY_CRYSTAL, region: 'shrine' },
      { kind: 'lost', object: ENERGY_CRYSTAL, region: 'shrine' },
      { kind: 'departed', region: 'shrine' },
      { kind: 'withdrew', region: 'shrine' }
    ]);
    // Each message once: the bystander, which answers for no region, hears
    // none of them.
    expect(world.balance).toBe(111_111);
  });

  test('tell nobody about a region no Talk Script answers for', () => {
    const world = new FakeWorld();
    host(world, KEEPS_SHRINE).deliver([
      { kind: 'approached', region: 'elsewhere' }
    ]);
    expect(world.balance).toBe(0);
  });

  test('still reach their Talk Script after a Save, with the region renamed', () => {
    const world = new FakeWorld();
    const saved = host(world, KEEPS_SHRINE).captureSaveSnapshot();
    host(world, [{ name: 'temple', script: 'keeper' }], saved).deliver([
      { kind: 'approached', region: 'temple' }
    ]);
    expect(world.balance).toBe(1);
  });
});
