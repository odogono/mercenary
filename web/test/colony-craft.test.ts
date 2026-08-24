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

const CELL = 0x1_00_00;
const DECK_REST = 0x40_ff_3f;

/// Aboard a craft, climbing near-vertically inside the box's cell just under
/// the entry band. The box is a sixteen-middle-byte square, so a shallow
/// approach drifts out of it horizontally before the altitude arrives — the
/// way in is a steep climb, in the Reference Build as here.
const climbing = (gameplay: GameplaySession, slot: number): void => {
  gameplay.board(slot);
  gameplay.game = {
    ...gameplay.game,
    mode: 'flying',
    player: {
      ...gameplay.game.player,
      heading: 0,
      pitch: 1.45,
      position: { x: 8 * CELL + 0x70_00, y: 0x40_f0_00, z: 8 * CELL + 0x70_00 }
    }
  };
  gameplay.throttleNotchValue(4);
};

const advanceUntil = (
  gameplay: GameplaySession,
  frames: number,
  done: () => boolean
): boolean => {
  for (let frame = 0; frame < frames && !done(); frame++) {
    gameplay.advance(FRAME);
  }
  return done();
};

describe('the $A13D box, entered from flight', () => {
  // Slots 0, 3 and 6 share the standard handler and the same ceiling, so one
  // member's entry stands for the Handler-Equivalence Class; slot 0 is the
  // legally acquirable member. The Dart is the Object-Conditioned case: only
  // the Poweramp gives it the ceiling.
  const entries: readonly [string, (gameplay: GameplaySession) => void][] = [
    ['craft slot 0', gameplay => climbing(gameplay, 0)],
    [
      'the Dart with the Poweramp',
      gameplay => {
        gameplay.carry(28);
        climbing(gameplay, 1);
      }
    ]
  ];

  for (const [name, prepare] of entries) {
    test(`${name} grounds on the deck with the decoded altitude and flag`, () => {
      const gameplay = session();
      prepare(gameplay);
      gameplay.intent = intent({});

      const landed = advanceUntil(
        gameplay,
        600,
        () => gameplay.game.mode === 'grounded'
      );
      expect(landed).toBeTrue();

      // The wrapped middle byte and the rested low byte: $40FF3F exactly.
      expect(gameplay.game.player.position.y).toBe(DECK_REST);
      const observations = gameplay.observations().observations;
      expect(observations['orbitalFlag']).toBe(0xff);
      expect(observations['gameComplete']).toBe(0);
      expect(observations['mover']).toBe(-1);
    });
  }

  test('the deck pin holds inside the box, whatever the pitch input', () => {
    const gameplay = session();
    climbing(gameplay, 0);
    advanceUntil(gameplay, 600, () => gameplay.game.mode === 'grounded');
    expect(gameplay.game.player.position.y).toBe(DECK_REST);

    // Without a take-off run there is nothing to taxi with: pitch is pinned
    // level while the box predicate holds, and the ship stays on the deck.
    gameplay.shutThrottle();
    gameplay.intent = intent({ pitch: 1 });
    for (let frame = 0; frame < 300; frame++) {
      gameplay.advance(FRAME);
    }
    expect(gameplay.game.mode).toBe('grounded');
    expect(gameplay.game.player.position.y).toBe(DECK_REST);
    expect(gameplay.game.player.pitch).toBe(0);
  });

  test('taxiing past the box edge releases the pin and clears the flag', () => {
    const gameplay = session();
    climbing(gameplay, 0);
    advanceUntil(gameplay, 600, () => gameplay.game.mode === 'grounded');

    // The decoded escape from the deck: build a take-off run out of the box,
    // where the pin no longer applies, and climb away. Ordinary flight then
    // clears $FA.
    gameplay.throttleNotchValue(10);
    gameplay.intent = intent({ pitch: 1 });
    const flying = advanceUntil(
      gameplay,
      300,
      () => gameplay.game.mode === 'flying'
    );
    expect(flying).toBeTrue();
    const cleared = advanceUntil(
      gameplay,
      300,
      () => gameplay.game.orbitalFlag === 0
    );
    expect(cleared).toBeTrue();
    expect(gameplay.observations().observations['gameComplete']).toBe(0);
  });

  test('ordinary flight clears the flag, so it cannot survive leaving', () => {
    const gameplay = session();
    climbing(gameplay, 0);
    // Same cell, same band, but outside the middle-byte square: no entry.
    gameplay.game = {
      ...gameplay.game,
      orbitalFlag: 0xff,
      player: {
        ...gameplay.game.player,
        pitch: 0,
        position: {
          x: 8 * CELL + 0x20_00,
          y: 0x40_f0_00,
          z: 8 * CELL + 0x20_00
        }
      }
    };
    gameplay.advance(FRAME);
    expect(gameplay.game.mode).toBe('flying');
    expect(gameplay.game.orbitalFlag).toBe(0);
  });

  test('walking off the deck edge is a tumble home, once', () => {
    const gameplay = session();
    climbing(gameplay, 0);
    advanceUntil(gameplay, 600, () => gameplay.game.mode === 'grounded');
    expect(gameplay.game.player.position.y).toBe(DECK_REST);

    // Step out on the deck: the altitude survives leaving the craft.
    const left = gameplay.leaveCraft();
    expect(left?.slot).toBe(0);
    expect(gameplay.game.player.position.y).toBe(DECK_REST);
    expect(gameplay.snapshot.occupancy).toEqual({ kind: 'onFoot' });

    // Walk inside the box: still on the deck.
    gameplay.intent = intent({ walk: 1 });
    gameplay.advance(FRAME);
    expect(gameplay.game.mover).toBeUndefined();
    expect(gameplay.game.player.position.y).toBe(DECK_REST);

    // Keep walking until the box edge passes: mover 9 installs and the fall
    // ends in the ordinary crash resolution with the flag cleared.
    const falling = advanceUntil(
      gameplay,
      600,
      () => gameplay.game.mover !== undefined
    );
    expect(falling).toBeTrue();
    expect(gameplay.game.mover).toBe(9);

    const grounded = advanceUntil(
      gameplay,
      600,
      () => gameplay.game.mover === undefined
    );
    expect(grounded).toBeTrue();
    expect(gameplay.game.orbitalFlag).toBe(0);

    // The flag is gone, so walking on the ground does not fall again.
    for (let frame = 0; frame < 60; frame++) {
      gameplay.advance(FRAME);
    }
    expect(gameplay.game.mover).toBeUndefined();
    expect(gameplay.observations().observations['gameComplete']).toBe(0);
  });

  test('a Save taken on the deck restores onto the deck', () => {
    const gameplay = session();
    climbing(gameplay, 0);
    advanceUntil(gameplay, 600, () => gameplay.game.mode === 'grounded');
    const snapshot = gameplay.captureSaveSnapshot();
    expect(snapshot.game.orbitalFlag).toBe(0xff);
    expect(snapshot.game.player.position.y).toBe(DECK_REST);
  });
});

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
        position: { x: 96, y: 128, z: 1640 }
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
