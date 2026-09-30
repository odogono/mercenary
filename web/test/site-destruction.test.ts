import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { BensonProgram, BensonSession } from '../src/benson/index.ts';
import { intent } from '../src/gameCore/index.ts';
import { GameplaySession, sessionContent } from '../src/session/index.ts';
import {
  bensonTunables,
  flightModel,
  loadSettings
} from '../src/settings/index.ts';
import { TextTable } from '../src/text/index.ts';
import { World } from '../src/world/index.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

const bundle = await loadPayload();
const world = new World(bundle);
const settings = loadSettings(
  await Bun.file(join(repositoryRoot, 'settings.json')).text()
);
if (bundle.flight === undefined) {
  throw new Error('the Data Payload is incomplete');
}
const content = sessionContent(
  world,
  bundle,
  flightModel(settings.flight, bundle.flight, world.groundExtent)
);
const rules = bundle.endgame.combat.siteDestruction;
const CELL = 0x1_00_00;

if (bundle.benson === undefined || bundle.text === undefined) {
  throw new Error('the Data Payload is incomplete');
}
const program = BensonProgram.fromDocument(bundle.benson);
const scripts = (): BensonSession =>
  new BensonSession(
    program,
    new TextTable(bundle.text!),
    bensonTunables(settings, program.framesPerTick)
  );

/// A craft sitting over one cell, low enough and near enough the middle of it
/// that a shot fired north crosses the band that carries the cell's Site.
///
/// Built rather than flown to: what is under test is the commit path, and the
/// geometry has to be exact for the test to mean what it says. `fire.test.ts`
/// is what proves a craft can be reached by playing.
const overCell = (cell: number, altitude?: number): GameplaySession => {
  const across = cell & 0x0f;
  const depth = cell >> 4;
  const position = {
    x: across * CELL + 0x70_00,
    y: 0,
    z: depth * CELL + 0x70_00
  };
  const session = new GameplaySession(
    content,
    { heading: Math.PI, pitch: 0, position, roll: 0, speed: 0, yawVelocity: 0 },
    scripts()
  );
  session.board(1);
  // The constructor puts a craft on the ground, so an altitude under test has
  // to be set after it rather than asked for.
  if (altitude !== undefined) {
    session.game = {
      ...session.game,
      player: {
        ...session.game.player,
        position: { ...session.game.player.position, y: altitude }
      }
    };
  }
  return session;
};

/// Fires and gives the shot the one frame it needs to reach the Site.
const bomb = (session: GameplaySession): readonly unknown[] => {
  session.fire();
  return session.advance(1 / 20).events;
};

const cellWhere = (predicate: (byte: number) => boolean): number =>
  rules.initialTable.findIndex(predicate);

const mechanoidCell = cellWhere(
  byte =>
    (byte & rules.mechanoidMask) !== 0 &&
    (byte & rules.neutralMask) === 0 &&
    (byte & rules.lowIdMask) !== 0
);
const neutralCell = cellWhere(byte => (byte & rules.neutralMask) !== 0);

describe('a shot that reaches the city', () => {
  test('destroys the Site it lands on and asks for the impact', () => {
    const session = overCell(mechanoidCell);

    const events = bomb(session);
    const observed = session.observations().observations;

    expect(events).toContainEqual({ impact: { sound: rules.impactSound } });
    expect(observed['destroyedCells']).toBe(
      mechanoidCell.toString(16).padStart(2, '0')
    );
    expect(observed['mechanoidDestroyed']).toBe(1);
    // The shot is spent on the Site rather than flying through it.
    expect(session.residenceOf(rules.projectileSlot).kind).toBe('gone');
  });

  test('starts the Faction Reaction the Site carries', () => {
    const session = overCell(mechanoidCell);
    const expected =
      rules.reactionDispatchBase |
      (rules.initialTable[mechanoidCell]! & rules.lowIdMask);

    bomb(session);

    expect(session.observations().observations['scriptPc']).not.toBe(-1);
    expect(
      bundle.benson!.scripts.find(script => script.id === expected)
    ).toBeDefined();
  });

  test('will not fire again while the impact is still playing', () => {
    const session = overCell(mechanoidCell);
    bomb(session);

    expect(session.fire().outcome).toEqual({ kind: 'impactActiveRefused' });
  });

  test('counts a neutral Site for nobody', () => {
    const session = overCell(neutralCell);

    bomb(session);
    const observed = session.observations().observations;

    expect(observed['destroyedCells']).toBe(
      neutralCell.toString(16).padStart(2, '0')
    );
    expect(observed['palyarDestroyed']).toBe(0);
    expect(observed['mechanoidDestroyed']).toBe(0);
  });

  test('does not count the same Site twice', () => {
    const session = overCell(mechanoidCell);
    bomb(session);
    // Wait out the impact so firing is allowed again.
    session.advance(rules.impactFrames / 20);

    bomb(session);

    expect(session.observations().observations['mechanoidDestroyed']).toBe(1);
  });

  test('destroys a Site it reaches from over the next cell, and tells nobody', () => {
    // The Reference Build draws only the cell the player is in, so a player
    // there could not see the building this shot reaches, let alone aim at it.
    // The branch is pinned because it is what the engine does, and because this
    // implementation draws a wider neighbourhood and can therefore reach it.
    //
    // Standing past this cell's band, pointing along the across axis, so the
    // shot leaves the cell entirely before it reaches a band it can strike.
    const across = mechanoidCell & 0x0f;
    const depth = mechanoidCell >> 4;
    const session = overCell(mechanoidCell);
    session.game = {
      ...session.game,
      player: {
        ...session.game.player,
        heading: (3 * Math.PI) / 2,
        position: {
          ...session.game.player.position,
          x: across * CELL + 40_000,
          z: depth * CELL + 0x70_00
        }
      }
    };
    const struck = (depth << 4) | (across + 1);

    session.fire();
    session.advance(rules.impactFrames / 20);
    const observed = session.observations().observations;

    // The Site in the next cell is gone, and neither faction was told.
    expect(observed['destroyedCells']).toBe(
      struck.toString(16).padStart(2, '0')
    );
    expect(observed['mechanoidDestroyed']).toBe(0);
    expect(observed['palyarDestroyed']).toBe(0);
  });

  test('passes over the city when it is flying too high', () => {
    // Above the altitude the hit test allows, and still inside the band.
    const session = overCell(
      mechanoidCell,
      rules.altitudeMidByteLimit * 0x1_00
    );

    bomb(session);

    expect(session.observations().observations['destroyedCells']).toBe('');
  });
});

/// Runs a session on, skipping messages the way a player would, until
/// `until` holds or the patience runs out.
const runOn = (
  session: GameplaySession,
  until: () => boolean,
  seconds = 60
): boolean => {
  for (let tick = 0; tick < seconds; tick += 1) {
    session.advance(1);
    session.skipMessage();
    if (until()) {
      return true;
    }
  }
  return false;
};

describe('the Attack State a Faction Reaction sets', () => {
  /// The one Site whose reaction sends a craft after the player every time
  /// rather than sometimes: the generic reactions roll for it.
  const advertCell = rules.reactions.find(row => row.lowId === 5)!.cells[0]!;

  test('sends a craft after the player, and says so in its own flag', () => {
    const session = overCell(advertCell);
    expect(session.observations().observations['attackingShip']).toBeFalse();

    bomb(session);
    const attacked = runOn(
      session,
      () => session.observations().observations['attackingShip'] === true
    );

    expect(attacked).toBeTrue();
    // The decoded flag this particular Site's reaction sets on its way past.
    expect(
      (session.observations().observations['engineFlags'] as number) & 0x08
    ).toBe(0x08);
  });

  test('ends with the craft lost and the session still being played', () => {
    const session = overCell(advertCell);
    bomb(session);
    runOn(
      session,
      () => session.observations().observations['attackingShip'] === true
    );

    // Sit still and let it find them. It does.
    const settled = runOn(
      session,
      () => session.observations().observations['attackingShip'] === false
    );
    const after = session.observations().observations;

    expect(settled).toBeTrue();
    expect(session.snapshot.bensonMessage?.completedText).toContain(
      'SHIP DESTROYED'
    );
    // Which is a craft lost, and nothing more than that.
    expect(after['endingPhase']).toBe(0);
  });
});

describe('a shot fired with the Anti Time Bomb aboard', () => {
  test('shows the impact and leaves the Site standing', () => {
    const session = overCell(mechanoidCell);
    session.carry(rules.restorationSlot);

    const events = bomb(session);
    const observed = session.observations().observations;

    // The impact happens either way; what does not happen is the destruction.
    expect(events).toContainEqual({ impact: { sound: rules.impactSound } });
    expect(observed['destroyedCells']).toBe('');
    expect(observed['mechanoidDestroyed']).toBe(0);
    expect(observed['palyarDestroyed']).toBe(0);
  });

  test('leaves the Site able to react when it is next destroyed', () => {
    const session = overCell(mechanoidCell);
    session.carry(rules.restorationSlot);
    bomb(session);
    session.advance(rules.impactFrames / 20);

    // Put it down and try again: nothing was spent the first time.
    session.drop();
    bomb(session);
    const observed = session.observations().observations;

    expect(observed['destroyedCells']).toBe(
      mechanoidCell.toString(16).padStart(2, '0')
    );
    expect(observed['mechanoidDestroyed']).toBe(1);
  });
});

describe('a Save taken while a Site is still coming apart', () => {
  test('carries the impact, the ledger and the counters through', () => {
    const session = overCell(mechanoidCell);
    bomb(session);
    const before = session.observations().observations;

    const restored = GameplaySession.restore(
      content,
      session.scripts,
      session.captureSaveSnapshot()
    );

    expect(restored.observations().observations).toEqual(before);
    // Including the refusal the impact is still causing.
    expect(restored.fire().outcome).toEqual({ kind: 'impactActiveRefused' });

    // And it comes apart on the same frame it would have.
    restored.advance(rules.impactFrames / 20);
    session.advance(rules.impactFrames / 20);
    expect(restored.observations().observations).toEqual(
      session.observations().observations
    );
    expect(restored.fire().outcome).toEqual({ kind: 'fired' });
  });
});

describe('a shot that reaches the object it can start a script on', () => {
  const hits = bundle.endgame.combat.objectHits;
  const target = hits.targetSlots.at(-1)!;

  /// Stands the craft just short of the object, pointing at it, outside the
  /// city so the Site families cannot claim the shot first.
  const facingTheObject = (): GameplaySession => {
    const at = world.objects.find(object => object.slot === target)!.origin;
    const session = new GameplaySession(
      content,
      {
        heading: Math.PI,
        pitch: 0,
        position: { x: at.x, y: at.y, z: at.z - 4096 },
        roll: 0,
        speed: 0,
        yawVelocity: 0
      },
      scripts()
    );
    session.board(1);
    session.game = {
      ...session.game,
      player: {
        ...session.game.player,
        position: { x: at.x, y: at.y, z: at.z - 4096 }
      }
    };
    return session;
  };

  test('starts the decoded script and puts the object out of the world', () => {
    const session = facingTheObject();
    session.scripts!.host = session.scripts!.host.with({ attackingShip: true });

    session.fire();
    const events = session.advance(1 / 20).events;
    const observed = session.observations().observations;

    expect(events).toContainEqual({ impact: { sound: hits.sound } });
    expect(observed[`objectRoom.${target}`]).toBe(0xff);
    // Any object hit calls off the attack, whichever object it was.
    expect(observed['attackingShip']).toBeFalse();
    expect(observed['scriptPc']).not.toBe(-1);
    // And the shot is spent.
    expect(session.residenceOf(rules.projectileSlot).kind).toBe('gone');
  });
});

/// The claim the whole milestone is built around, in one place.
///
/// The Reference Build has a Defeat, and none of these reach it: a shot that
/// finds nothing, a Site destroyed, a craft lost to a hostile, the player shot
/// down on foot, and a craft flown into the ground. the Ending phase is the latch
/// an Ending sets, and every one of these leaves it alone.
/// One way combat can go wrong, and the latch it must not set.
const surviving = (name: string, play: (session: GameplaySession) => void) => {
  test(name, () => {
    const session = overCell(mechanoidCell);
    expect(session.observations().observations['endingPhase']).toBe(0);

    play(session);

    expect(session.observations().observations['endingPhase']).toBe(0);
  });
};

describe('no combat failure this milestone can reach is an Ending', () => {
  surviving('a shot that expires having reached nothing', session => {
    // Pointed away from the city, so it runs its lifecycle out.
    session.game = {
      ...session.game,
      player: {
        ...session.game.player,
        position: { x: 2_000_000, y: 0, z: 2_000_000 }
      }
    };
    session.fire();
    session.advance(bundle.endgame.combat.fire.lifecycleFrames / 20);
  });

  surviving('a Site destroyed and reacted to', session => {
    bomb(session);
    for (let tick = 0; tick < 40; tick += 1) {
      session.advance(1);
      session.skipMessage();
    }
  });

  surviving('a craft flown into the ground', session => {
    session.throttleNotchValue(10);
    // Up first, because a craft already on the ground cannot be flown into it.
    for (let frame = 0; frame < 200; frame += 1) {
      session.intent = intent({ pitch: 1 });
      session.advance(1 / 20);
      if (session.snapshot.player.position.y > 200_000) {
        break;
      }
    }
    for (let frame = 0; frame < 400; frame += 1) {
      session.intent = intent({ pitch: -1 });
      session.advance(1 / 20);
      if (session.occupancy.kind === 'onFoot') {
        break;
      }
    }

    // It ends on foot, which is a crash rather than an Ending.
    expect(session.observations().observations['occupancy']).toBe(0x80);
  });
});
