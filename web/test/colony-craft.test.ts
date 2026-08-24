import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

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

/// The Colony Craft transition, from both of its decoded directions: the one
/// Doorway out of the underground, and the `$A13D` box the eligible craft can
/// climb into. Neither is an Ending, and neither may touch `gameComplete`.

const FRAME = 1 / 20;

const bundle = await loadPayload();
const world = new World(bundle);
const settings = loadSettings(
  await Bun.file(join(repositoryRoot, 'settings.json')).text()
);

const session = (): GameplaySession => {
  if (
    bundle.flight === undefined ||
    bundle.benson === undefined ||
    bundle.text === undefined
  ) {
    throw new Error('the Data Payload is incomplete');
  }
  const program = BensonProgram.fromDocument(bundle.benson);
  const scripts = new BensonSession(
    program,
    new TextTable(bundle.text),
    bensonTunables(settings, program.framesPerTick)
  );
  return new GameplaySession(
    sessionContent(
      world,
      bundle,
      flightModel(settings.flight, bundle.flight, world.groundExtent)
    ),
    {
      heading: 0,
      pitch: 0,
      position: { x: 559_104, y: 128, z: 559_104 },
      roll: 0,
      speed: 0,
      yawVelocity: 0
    },
    scripts
  );
};

describe('the room-171 Doorway out of the underground', () => {
  test('ejects the player at the Colony Craft hull and tumbles them home', () => {
    const gameplay = session();
    gameplay.teleport({ id: 171, kind: 'room' });
    // Room 171's fourth Doorway sits on the near-X wall at z 1536; stand in
    // its window and walk into the wall.
    gameplay.game = {
      ...gameplay.game,
      player: {
        ...gameplay.game.player,
        heading: (3 * Math.PI) / 2,
        position: { x: 96, y: 128, z: 1_640 }
      }
    };
    gameplay.intent = intent({ walk: 1 });

    let taken = false;
    for (let frame = 0; frame < 400 && !taken; frame++) {
      gameplay.advance(FRAME);
      taken = gameplay.snapshot.location.kind === 'surface';
    }
    expect(taken).toBeTrue();

    // The decoded arrival: all three coordinates copied over the player,
    // mover 9 — the crash tumble — installed, and no Ending anywhere.
    const rules = world.doorwayRules!;
    const snapshot = gameplay.snapshot;
    expect(snapshot.player.position.x).toBe(rules.colonyCraftArrival.x);
    expect(snapshot.player.position.z).toBe(rules.colonyCraftArrival.z);
    expect(snapshot.player.position.y).toBeLessThanOrEqual(
      rules.colonyCraftArrival.y
    );
    expect(gameplay.game.mover).toBe(9);
    expect(gameplay.observations().observations['gameComplete']).toBe(0);

    // The fall ends in the ordinary crash resolution, back in active play on
    // the surface — never an Ending, never Damocles.
    let landed = false;
    for (let frame = 0; frame < 600 && !landed; frame++) {
      const { events } = gameplay.advance(FRAME);
      landed = events.some(
        event => typeof event === 'object' && 'touchdown' in event
      );
    }
    expect(landed).toBeTrue();
    expect(gameplay.game.mover).toBeUndefined();
    expect(gameplay.snapshot.occupancy).toEqual({ kind: 'onFoot' });
    const observations = gameplay.observations().observations;
    expect(observations['gameComplete']).toBe(0);
    expect(observations['room']).toBe(0);
  });
});
