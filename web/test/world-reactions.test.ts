import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { BensonChannel } from '../src/benson/channel.ts';
import {
  GameplaySession,
  openingPlayer,
  sessionContent
} from '../src/session/index.ts';
import { flightModel, loadSettings } from '../src/settings/index.ts';
import { createSessionResumePersistence } from '../src/shell/resume.ts';
import type { TalkScript } from '../src/talk/host.ts';
import {
  ReactionLimitError,
  type ReactionLimits
} from '../src/talk/reactionBudget.ts';
import { TextTable } from '../src/text/index.ts';
import { World, room } from '../src/world/index.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

const bundle = await loadPayload();
const world = new World(bundle);
const settings = loadSettings(
  await Bun.file(join(repositoryRoot, 'settings.json')).text()
);
const base = sessionContent(
  world,
  bundle,
  flightModel(settings.flight, bundle.flight!, world.groundExtent)
);
const CRYSTAL = 31;
const CENTRE = { x: 1500, y: 63, z: 1500 };
const content = {
  ...base,
  objects: [
    ...base.objects.filter(object => object.slot !== CRYSTAL),
    {
      ...base.objects.find(object => object.slot === CRYSTAL)!,
      origin: CENTRE,
      placement: 'surface' as const,
      room: 0,
      stateFlags: 0
    },
    {
      ...base.objects[0]!,
      id: 'test-shrine',
      origin: CENTRE,
      placement: 'surface' as const,
      region: { approach: 200, name: 'shrine', script: 'shrine' },
      room: 0,
      slot: 64,
      stateFlags: 0,
      vertices: [
        { x: 1000, y: 0, z: 1000 },
        { x: 2000, y: 500, z: 2000 }
      ]
    }
  ]
};
const script = (source: string): TalkScript => ({
  name: 'shrine',
  replaces: [],
  source
});
const create = (source: string, reactionLimits?: ReactionLimits) => {
  const session = new GameplaySession(
    content,
    { ...openingPlayer(), position: { x: 0, y: 63, z: 0 } },
    new BensonChannel(new TextTable(bundle.text!))
  );
  session.useTalkScripts(
    [script(source)],
    reactionLimits === undefined ? {} : { reactionLimits }
  );
  return session;
};
const balance = (session: GameplaySession) =>
  session.observations().observations['credits'];
const roundTrip = `
on begin
  ask world to move "energy crystal", "prison"
  ask world to move "energy crystal", "surface"
end begin
on lost item
  ask world to lies item
  if it = "surface" then ask world to pay 1
end lost
on received item
  ask world to pay 10
  tell sound to silence "voice1"
end received
`;

describe('completed world changes and their reactions', () => {
  test('refuses a Save while the sound of a reaction is still to be presented', () => {
    const session = create(`
on begin
  tell sound to silence "voice1"
end begin
`);
    session.begin();
    expect(() => session.captureSaveSnapshot()).toThrow('Settle World Events');
    session.settle();
    expect(() => session.captureSaveSnapshot()).not.toThrow();
  });

  test('preserves separate object moves, queries current state, and returns reaction effects once', () => {
    const session = create(roundTrip);
    const before = balance(session);
    session.begin();
    expect(() => session.captureSaveSnapshot()).toThrow('Settle World Events');
    const settled = session.settle();
    expect(settled.worldEvents).toEqual([
      { kind: 'lost', object: CRYSTAL, region: 'shrine' },
      { kind: 'received', object: CRYSTAL, region: 'shrine' }
    ]);
    expect(balance(session)).toBe(Number(before) + 11);
    expect(settled.events).toContainEqual({
      script: { sound: { symbol: 'voice1.control', value: 0 } }
    });
    expect(session.settle().events).toEqual([]);
    expect(session.settle().worldEvents).toEqual([]);
  });

  test('delivers a reaction-generated change during the same step', () => {
    const session = create(`
on begin
  ask world to move "energy crystal", "prison"
end begin
on lost item
  ask world to move item, "surface"
end lost
on received item
  ask world to pay 100
end received
`);
    const before = balance(session);
    session.begin();
    expect(
      session.advance(1 / 60).worldEvents.map(event => event.kind)
    ).toEqual(['lost', 'received']);
    expect(balance(session)).toBe(Number(before) + 100);
    expect(session.advance(1 / 60).worldEvents).toEqual([]);
  });

  test('settles a Save without moving time and restores without replaying events', () => {
    const session = create(roundTrip);
    session.begin();
    const elapsed = session.snapshot.elapsed;
    session.settle();
    const saved = session.captureSaveSnapshot();
    expect(session.snapshot.elapsed).toBe(elapsed);
    expect(saved.talk?.now).toBe(0);
    const restored = GameplaySession.restore(
      content,
      new BensonChannel(new TextTable(bundle.text!)),
      saved,
      { scripts: [script(roundTrip)] }
    );
    expect(restored.settle().worldEvents).toEqual([]);
    expect(balance(restored)).toBe(balance(session));
  });

  test('a compound relocation never visits its intermediate surface position', () => {
    const session = create('');
    session.place(CENTRE);
    session.teleport(room(5));
    session.settle();
    // Slot 0 is outside the region. Returning from the Room must not briefly
    // re-enter the Shrine at the previously retained surface position.
    session.placeAtObject(0);
    expect(session.settle().worldEvents).toEqual([
      { kind: 'entered', location: { kind: 'surface' } }
    ]);
  });

  test('fetching an object records its departure from a region', () => {
    const session = create('');
    expect(session.fetchObject(CRYSTAL).outcome.kind).toBe('fetched');
    expect(session.settle().worldEvents).toContainEqual({
      kind: 'lost',
      object: CRYSTAL,
      region: 'shrine'
    });
  });

  test('stops a chain of fresh Runs, refuses further changes and Saves, and permits restoring the last good Save', () => {
    const source = `
on begin
  ask world to move "energy crystal", "prison"
end begin
on lost item
  ask world to move item, "surface"
end lost
on received item
  ask world to move item, "prison"
end received
`;
    const session = create(source, { events: 8, fuel: 100_000 });
    const good = session.captureSaveSnapshot();
    session.begin();
    expect(() => session.settle()).toThrow('delivered events');
    expect(session.failure).toBeInstanceOf(ReactionLimitError);
    expect(session.failure?.message).toContain('shrine');
    expect(() => session.advance(1 / 60)).toThrow(ReactionLimitError);
    expect(() => session.place(CENTRE)).toThrow(ReactionLimitError);
    expect(() => session.captureSaveSnapshot()).toThrow(ReactionLimitError);
    const restored = GameplaySession.restore(
      content,
      new BensonChannel(new TextTable(bundle.text!)),
      good,
      { scripts: [script(source)] }
    );
    expect(restored.failure).toBeUndefined();
    expect(restored.settle().worldEvents).toEqual([]);
  });

  test('settles timer-caused changes before returning from the step', () => {
    const session = create(`
on begin
  wait 10 ms
  ask world to move "energy crystal", "prison"
end begin
on lost item
  ask world to pay 100
end lost
`);
    const before = balance(session);
    session.begin();
    session.settle();
    expect(session.advance(1 / 60).worldEvents).toEqual([
      { kind: 'lost', object: CRYSTAL, region: 'shrine' }
    ]);
    expect(balance(session)).toBe(Number(before) + 100);
  });

  test('preserves the durable checkpoint when capture cannot settle', () => {
    const session = create(
      `
on begin
  ask world to move "energy crystal", "prison"
end begin
on lost item
  ask world to move item, "surface"
end lost
on received item
  ask world to move item, "prison"
end received
`,
      { events: 8, fuel: 100_000 }
    );
    const records = new Map<string, string>();
    const persistence = createSessionResumePersistence({
      encode: () => {
        session.settle();
        return JSON.stringify(session.captureSaveSnapshot());
      },
      storage: {
        getItem: key => records.get(key) ?? null,
        removeItem: key => {
          records.delete(key);
        },
        setItem: (key, value) => {
          records.set(key, value);
        }
      }
    });
    persistence.dirty();
    expect(persistence.checkpoint(true).kind).toBe('written');
    const good = [...records];
    session.begin();
    persistence.dirty();
    expect(persistence.checkpoint(true).kind).toBe('failed');
    expect([...records]).toEqual(good);
    expect(persistence.checkpoint(true).kind).toBe('disabled');
  });

  test('shares fuel across a chain of short Runs', () => {
    const session = create(
      `
on begin
  ask world to move "energy crystal", "prison"
end begin
on lost item
  ask world to move item, "surface"
end lost
on received item
  ask world to move item, "prison"
end received
`,
      { events: 100_000, fuel: 1000 }
    );
    session.begin();
    expect(() => session.settle()).toThrow('execution fuel');
    expect(session.failure).toBeInstanceOf(ReactionLimitError);
  });

  test('bounds a single Run that never yields', () => {
    const session = create(
      `on begin\nrepeat forever\nask world to pay 1\nend repeat\nend begin`,
      { events: 100, fuel: 100 }
    );
    expect(() => session.begin()).toThrow('execution fuel');
    expect(session.failure).toBeInstanceOf(ReactionLimitError);
  });
});
