import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { BensonProgram, BensonSession } from '../src/benson/index.ts';
import {
  GameplaySession,
  sessionContent,
  type WorldEvent
} from '../src/session/index.ts';
import {
  bensonTunables,
  flightModel,
  loadSettings
} from '../src/settings/index.ts';
import { TextTable } from '../src/text/index.ts';
import { SURFACE, World, room } from '../src/world/index.ts';
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
const program = BensonProgram.fromDocument(bundle.benson);
const scripts = (): BensonSession =>
  new BensonSession(
    program,
    new TextTable(bundle.text!),
    bensonTunables(settings, program.framesPerTick)
  );

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

  test('changes between frames are told once, with the next frame', () => {
    const session = standing();
    session.carry(NOVADRIVE);
    session.board(DART);
    expect(frame(session)).toEqual([
      { craft: DART, kind: 'boarded' },
      { kind: 'took', object: NOVADRIVE }
    ]);
    expect(frame(session)).toEqual([]);
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
    session.scripts!.host = session.scripts!.host.with({ attackingShip: true });
    const told: WorldEvent[] = [];
    for (
      let left = 300;
      left > 0 && session.scripts!.host.attackingShip;
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
