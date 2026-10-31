import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { BensonChannel } from '../src/benson/channel.ts';
import {
  GameplaySession,
  sessionContent,
  type WorldEvent
} from '../src/session/index.ts';
import { WorldEventLog, type WorldSeen } from '../src/session/worldEvents.ts';
import { flightModel, loadSettings } from '../src/settings/index.ts';
import { TextTable } from '../src/text/index.ts';
import { SURFACE, World, room, type Location } from '../src/world/index.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

const bundle = await loadPayload();
const world = new World(bundle);
const settings = loadSettings(
  await Bun.file(join(repositoryRoot, 'settings.json')).text()
);
if (
  bundle.flight === undefined ||
  bundle.benson === undefined ||
  bundle.text === undefined
) {
  throw new Error('the Data Payload is incomplete');
}
const content = sessionContent(
  world,
  bundle,
  flightModel(settings.flight, bundle.flight, world.groundExtent)
);
const scripts = (): BensonChannel =>
  new BensonChannel(new TextTable(bundle.text!));

const sites = bundle.endgame.combat.siteDestruction;
const hostile = bundle.endgame.combat.hostileCraft;
const FRAME = 1 / 20;
const CELL = 0x1_00_00;
const DART = 1;
const BRIEFING = 102;
const NOVADRIVE = 25;

/// A craft over one cell, set up as `site-destruction.test.ts` does, and a
/// first frame so the boarding is already told.
const overCell = (cell: number): GameplaySession => {
  const position = {
    x: (cell & 0x0f) * CELL + 0x70_00,
    y: 0,
    z: (cell >> 4) * CELL + 0x70_00
  };
  const session = new GameplaySession(
    content,
    { heading: Math.PI, pitch: 0, position, roll: 0, speed: 0, yawVelocity: 0 },
    scripts()
  );
  session.board(DART);
  session.advance(FRAME);
  return session;
};

const standing = (): GameplaySession => {
  const session = new GameplaySession(
    content,
    {
      heading: 0,
      pitch: 0,
      position: { x: 0, y: 0, z: 0 },
      roll: 0,
      speed: 0,
      yawVelocity: 0
    },
    scripts()
  );
  return session;
};

const frame = (session: GameplaySession): readonly WorldEvent[] =>
  session.advance(FRAME).worldEvents;

const bomb = (session: GameplaySession): readonly WorldEvent[] => {
  session.fire();
  return frame(session);
};

const siteCell = (faction: 'mechanoid' | 'palyar'): number =>
  sites.initialTable.findIndex(
    byte =>
      (byte & sites.neutralMask) === 0 &&
      ((byte & sites.mechanoidMask) !== 0) === (faction === 'mechanoid') &&
      (byte & sites.lowIdMask) !== 0
  );
const neutralCell = sites.initialTable.findIndex(
  byte => (byte & sites.neutralMask) !== 0
);

describe('World Events', () => {
  test('a frame in which nothing changes tells nothing', () => {
    const session = standing();
    expect(frame(session)).toEqual([]);
    expect(frame(session)).toEqual([]);
  });

  test('entering a Room, and coming back out to the surface', () => {
    const session = standing();
    session.teleport(room(BRIEFING));
    expect(frame(session)).toEqual([
      { kind: 'entered', location: room(BRIEFING) }
    ]);
    session.teleport(SURFACE);
    expect(frame(session)).toEqual([{ kind: 'entered', location: SURFACE }]);
  });

  test('boarding a craft and leaving it', () => {
    const session = standing();
    session.board(DART);
    expect(frame(session)).toEqual([{ craft: DART, kind: 'boarded' }]);
    session.leaveCraft();
    expect(frame(session)).toEqual([{ craft: DART, kind: 'left' }]);
  });

  test('taking an object and dropping it', () => {
    const session = standing();
    session.carry(NOVADRIVE);
    expect(frame(session)).toEqual([{ kind: 'took', object: NOVADRIVE }]);
    session.drop(NOVADRIVE);
    expect(frame(session)).toEqual([{ kind: 'dropped', object: NOVADRIVE }]);
  });

  test('changes between frames are told once, with the next frame, in order', () => {
    const session = standing();
    session.carry(NOVADRIVE);
    session.board(DART);
    expect(frame(session)).toEqual([
      { kind: 'took', object: NOVADRIVE },
      { craft: DART, kind: 'boarded' }
    ]);
    expect(frame(session)).toEqual([]);
  });

  test('a change undone within one frame is still told (#931)', () => {
    const session = standing();
    session.board(DART);
    frame(session);
    session.leaveCraft();
    session.board(DART);
    expect(frame(session)).toEqual([
      { craft: DART, kind: 'left' },
      { craft: DART, kind: 'boarded' }
    ]);
  });

  test('passing through a Room within one frame enters it (#931)', () => {
    const session = standing();
    session.teleport(room(16));
    session.teleport(SURFACE);
    expect(frame(session)).toEqual([
      { kind: 'entered', location: room(16) },
      { kind: 'entered', location: SURFACE }
    ]);
  });

  test('destroying a faction Site names the Site, its cell and its faction', () => {
    const cell = siteCell('mechanoid');
    const session = overCell(cell);
    expect(bomb(session)).toEqual([
      {
        cell,
        faction: 'mechanoid',
        kind: 'destroyed',
        reacting: true,
        site: sites.initialTable[cell]! & sites.lowIdMask
      }
    ]);
  });

  test('a neutral Site, or one already destroyed, tells nothing', () => {
    const neutral = overCell(neutralCell);
    expect(bomb(neutral)).toEqual([]);

    const cell = siteCell('palyar');
    const again = overCell(cell);
    bomb(again);
    for (let wait = 0; wait < 40; wait += 1) {
      frame(again);
    }
    expect(bomb(again)).toEqual([]);
  });

  test('reaching the Gratitude Threshold tells the destruction, then the gratitude', () => {
    const cell = siteCell('palyar');
    const session = overCell(cell);
    const saved = session.captureSaveSnapshot();
    const near = GameplaySession.restore(content, scripts(), {
      ...saved,
      combat: {
        ...saved.combat!,
        // The Palyar side's lead is complemented before it is compared, so it
        // needs one more Site than the threshold.
        palyarDestroyed: sites.factionObjective.threshold
      }
    });
    expect(bomb(near)).toEqual([
      {
        cell,
        faction: 'palyar',
        kind: 'destroyed',
        reacting: false,
        site: sites.initialTable[cell]! & sites.lowIdMask
      },
      // Destroying Palyar Sites puts the Mechanoids in the player's debt.
      { faction: 'mechanoid', kind: 'gratitude' }
    ]);
  });

  test('the hostile craft’s shot reaching the player', () => {
    const attacker = world.objects.find(
      object => object.slot === hostile.attackingSlot
    )!.origin;
    const at = { x: attacker.x + 2000, y: attacker.y, z: attacker.z };
    const session = new GameplaySession(
      content,
      {
        heading: Math.PI,
        pitch: 0,
        position: at,
        roll: 0,
        speed: 0,
        yawVelocity: 0
      },
      scripts()
    );
    session.board(DART);
    session.game = {
      ...session.game,
      player: { ...session.game.player, position: at }
    };
    session.adjust({ attackingShip: true });
    const told: WorldEvent[] = [];
    for (
      let left = 300;
      left > 0 && session.observations().observations['attackingShip'] === true;
      left--
    ) {
      told.push(...frame(session));
    }
    expect(told).toContainEqual({ aboard: true, kind: 'hit' });
  });

  test('a restored session tells nothing of what the Save already holds', () => {
    const session = standing();
    session.board(DART);
    session.carry(NOVADRIVE);
    const restored = GameplaySession.restore(
      content,
      scripts(),
      session.captureSaveSnapshot()
    );
    expect(frame(restored)).toEqual([]);
  });
});

const at = (
  location: Location,
  craft?: number,
  carried: readonly number[] = []
): WorldSeen => ({
  carried,
  craft,
  inside: [],
  location,
  lying: [],
  near: []
});

describe('the World Event log', () => {
  test('tells coming near and into a Surface Region, and going out and away', () => {
    const log = new WorldEventLog(at(SURFACE));
    const seen = (near: string[], inside: string[]): WorldSeen => ({
      ...at(SURFACE),
      inside,
      near
    });
    log.note(seen(['shrine'], []));
    log.note(seen(['shrine'], ['shrine']));
    log.note(seen(['shrine'], ['shrine']));
    log.note(seen([], []));
    expect(log.take(seen(['shrine'], []))).toEqual([
      { kind: 'approached', region: 'shrine' },
      { kind: 'arrived', region: 'shrine' },
      { kind: 'departed', region: 'shrine' },
      { kind: 'withdrew', region: 'shrine' },
      { kind: 'approached', region: 'shrine' }
    ]);
  });

  test('tells an object coming to lie in a Surface Region, and leaving it', () => {
    const log = new WorldEventLog(at(SURFACE));
    const lying = (...slots: number[]): WorldSeen => ({
      ...at(SURFACE),
      lying: slots.map(slot => [slot, 'shrine'] as const)
    });
    log.note(lying(31));
    log.note(lying(31, 34));
    expect(log.take(lying(34))).toEqual([
      { kind: 'received', object: 31, region: 'shrine' },
      { kind: 'received', object: 34, region: 'shrine' },
      { kind: 'lost', object: 31, region: 'shrine' }
    ]);
  });

  test('tells raised and noted events in the order they happened', () => {
    const log = new WorldEventLog(at(SURFACE));
    log.raise({ faction: 'palyar', kind: 'gratitude' });
    log.note(at(room(3)));
    log.raise({ kind: 'struck', object: 0 });
    expect(log.take(at(room(3), 1))).toEqual([
      { faction: 'palyar', kind: 'gratitude' },
      { kind: 'entered', location: room(3) },
      { kind: 'struck', object: 0 },
      { craft: 1, kind: 'boarded' }
    ]);
    expect(log.take(at(room(3), 1))).toEqual([]);
  });

  test('resumes from a restored world without telling it', () => {
    const log = new WorldEventLog(at(SURFACE));
    log.raise({ kind: 'struck', object: 0 });
    log.resume(at(room(5), 7, [25]));
    expect(log.take(at(room(5), 7, [25]))).toEqual([]);
  });
});
