import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { BensonProgram, BensonSession } from '../src/benson/index.ts';
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
    { heading: 0, pitch: 0, position: at, roll: 0, speed: 0, yawVelocity: 0 },
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
    expect(after['gameComplete']).toBeFalse();
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
    expect(after['gameComplete']).toBeFalse();
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
