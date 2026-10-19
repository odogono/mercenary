import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { GameplaySession, sessionContent } from '../src/session/index.ts';
import {
  bensonTunables,
  flightModel,
  loadSettings
} from '../src/settings/index.ts';
import { TextTable } from '../src/text/index.ts';
import { World } from '../src/world/index.ts';
import { BensonProgram, BensonSession } from './oracle/index.ts';
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

const rules = bundle.endgame.combat.hostileCraft;
const FRAME = 1 / 20;

/// Where the attacker waits until it is sent for.
const attackerOrigin = world.objects.find(
  object => object.slot === rules.attackingSlot
)!.origin;

/// The player standing where the attacker will find them, with the Attack State
/// the scripts would have set. `nearness` scales how far off the attacker is.
const underAttack = (options?: {
  readonly farOff?: boolean;
  readonly onFoot?: boolean;
}): GameplaySession => {
  const gap =
    options?.farOff === true ? rules.firingRange * rules.rangeUnit * 4 : 2000;
  const at = {
    x: attackerOrigin.x + gap,
    y: attackerOrigin.y,
    z: attackerOrigin.z
  };
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
  if (options?.onFoot !== true) {
    session.board(1);
  }
  session.game = {
    ...session.game,
    player: { ...session.game.player, position: at }
  };
  session.scripts!.host = session.scripts!.host.with({ attackingShip: true });
  return session;
};

const observed = (session: GameplaySession) =>
  session.observations().observations;

describe('a hostile craft that has been sent after the player', () => {
  test('shoots once it is near enough, and only once', () => {
    const session = underAttack();

    const first = session.advance(FRAME).events;
    const inbound = observed(session)[`effectLifecycle${rules.inboundSlot}`];

    expect(first).toContainEqual({ impact: { sound: rules.inboundSound } });
    expect(inbound).toBe(rules.inboundLifecycleFrames);

    // A second shot does not appear while the first is still coming.
    session.advance(FRAME);
    expect(
      observed(session)[`effectLifecycle${rules.inboundSlot}`]
    ).toBeLessThan(rules.inboundLifecycleFrames);
  });

  test('takes the craft when its shot arrives, and play goes on', () => {
    const session = underAttack();

    // Long enough for the shot to be fired and to reach the player.
    for (let frame = 0; frame < 300; frame += 1) {
      session.advance(FRAME);
      if (!observed(session)['attackingShip']) {
        break;
      }
    }
    const after = observed(session);

    expect(after['attackingShip']).toBeFalse();
    expect(after['mover']).toBe(rules.captureMover);
    // Nothing about this is an Ending.
    expect(after['endingPhase']).toBe(0);
    for (const slot of rules.captureRemovesSlots) {
      expect(session.residenceOf(slot).kind).toBe('gone');
    }
  });

  test('knocks the player down on foot without taking a craft', () => {
    const session = underAttack({ onFoot: true });

    // On foot the player stands at their own eye height while the attacker
    // starts well below it, so the encounter takes a swoop to arrive.
    for (let frame = 0; frame < 300; frame += 1) {
      session.advance(FRAME);
      if (!observed(session)['attackingShip']) {
        break;
      }
    }
    const after = observed(session);

    expect(after['attackingShip']).toBeFalse();
    // There was no craft to lose, so no mover is installed and nothing is said.
    expect(after['mover']).toBe(-1);
    expect(after['endingPhase']).toBe(0);
  });

  test('is sent into the world and closes the distance', () => {
    const session = underAttack({ farOff: true });
    // It waits out of the world until it is sent for.
    expect(session.residenceOf(rules.attackingSlot).kind).toBe('gone');

    session.advance(FRAME * 4);
    const after = session.residenceOf(rules.attackingSlot);

    // Now it is somewhere, it has been aimed, and it has not shot.
    expect(after.kind).toBe('surface');
    if (after.kind !== 'surface' || after.at === undefined) {
      throw new Error('the attacker should be somewhere on the surface');
    }
    expect(after.at).not.toEqual(attackerOrigin);
    expect(observed(session)[`effectLifecycle${rules.inboundSlot}`]).toBe(0);
  });

  test('is not fought underground', () => {
    const session = underAttack();
    session.teleport({ id: 4, kind: 'room' });

    session.advance(FRAME * 4);

    // The encounter waits for the surface rather than following the player in.
    expect(observed(session)['attackingShip']).toBeTrue();
    expect(observed(session)[`effectLifecycle${rules.inboundSlot}`]).toBe(0);
  });

  test('is destroyed by the player, which calls the attack off', () => {
    // Far enough off that the encounter sends for it: a craft the player can
    // shoot is one the encounter has already put on the surface.
    const session = underAttack({ farOff: true });
    // Let the encounter place it and fly it clear of the city, because a shot
    // that reaches a Site is spent on the Site: the families are tried in the
    // Reference Build's order and the city comes first.
    const sites = bundle.endgame.combat.siteDestruction;
    const inBand = (value: number): boolean => {
      const offset = ((value % 0x1_00_00) + 0x1_00_00) % 0x1_00_00;
      return (
        offset >= sites.axisWindow[0]! * 0x1_00 &&
        offset < sites.axisWindow[1]! * 0x1_00
      );
    };
    for (let frame = 0; frame < 400; frame += 1) {
      session.advance(FRAME);
      const at = session.residenceOf(rules.attackingSlot);
      if (at.kind === 'surface' && at.at !== undefined && !inBand(at.at.x)) {
        break;
      }
    }
    const where = session.residenceOf(rules.attackingSlot);
    if (where.kind !== 'surface' || where.at === undefined) {
      throw new Error('the attacker should have been sent for by now');
    }

    // Line up on it from one frame of shot travel away.
    const shot = bundle.endgame.combat.fire.speedPerFrame;
    session.game = {
      ...session.game,
      player: {
        ...session.game.player,
        heading: Math.PI,
        pitch: 0,
        position: { x: where.at.x, y: where.at.y, z: where.at.z - shot }
      }
    };
    session.fire();
    const events = session.advance(FRAME).events;
    const after = observed(session);

    expect(events).toContainEqual({
      impact: { sound: bundle.endgame.combat.objectHits.sound }
    });
    expect(after['attackingShip']).toBeFalse();
    expect(session.residenceOf(rules.attackingSlot).kind).toBe('gone');
    // The player is told, and is still flying.
    session.advance(FRAME * 20);
    expect(session.observations().observations['messageText']).not.toBe('');
    expect(after['endingPhase']).toBe(0);
    expect(after['occupancy']).not.toBe(0x80);
  });

  test('survives a Save taken mid-encounter', () => {
    const session = underAttack();
    session.advance(FRAME * 2);
    const before = observed(session);

    const restored = GameplaySession.restore(
      content,
      session.scripts,
      session.captureSaveSnapshot()
    );

    expect(observed(restored)).toEqual(before);
    restored.advance(FRAME * 3);
    session.advance(FRAME * 3);
    expect(observed(restored)).toEqual(observed(session));
  });
});
