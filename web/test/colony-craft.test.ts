import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { intent } from '../src/gameCore/index.ts';
import { GameplaySession, sessionContent } from '../src/session/index.ts';
import { flightModel, loadSettings } from '../src/settings/index.ts';
import { TextTable } from '../src/text/index.ts';
import {
  World,
  atUnsignedSurfacePosition,
  movedTo,
  placedAtResidence
} from '../src/world/index.ts';
import {
  BensonProgram,
  BensonSession,
  bensonTunables
} from './oracle/index.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

/// The Colony Craft transition, from both of its decoded directions: the one
/// Doorway out of the underground, and the `$A13D` box the eligible craft can
/// climb into. Neither is an Ending, and neither may touch the Ending phase.

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
const DECK_SURFACE = 0x40_ff_00;

test('reboarding the Dart after an object teleport keeps its new residence', () => {
  const gameplay = session();
  const lift = world.objects.find(object => object.slot === 62)!;
  const remote = atUnsignedSurfacePosition(lift).origin;

  gameplay.board(1);
  expect(gameplay.placeAtObject(62)).toEqual({
    kind: 'placed',
    location: { kind: 'surface' }
  });
  expect(gameplay.game.player.position).toEqual(remote);

  expect(gameplay.leaveCraft()?.slot).toBe(1);
  expect(gameplay.residenceOf(1)).toEqual({
    at: remote,
    heading: 0,
    kind: 'surface'
  });
  expect(gameplay.reach('board', 1).outcome).toEqual({
    kind: 'boarded',
    slot: 1
  });
  expect(gameplay.game.player.position.x).toBe(remote.x);
  expect(gameplay.game.player.position.z).toBe(remote.z);
});

test('leaving the grounded Dart parks its model on the planet surface', () => {
  const gameplay = session();
  gameplay.board(1);
  gameplay.game = {
    ...gameplay.game,
    mode: 'grounded',
    player: {
      ...gameplay.game.player,
      position: {
        ...gameplay.game.player.position,
        y: gameplay.content.flight!.groundAltitude
      }
    }
  };

  expect(gameplay.leaveCraft()?.slot).toBe(1);
  const residence = gameplay.residenceOf(1);
  if (residence.kind !== 'surface' || residence.at === undefined) {
    throw new Error('the parked Dart has no surface residence');
  }
  const dart = world.objects.find(object => object.slot === 1)!;
  const parkedDart = placedAtResidence(
    world,
    dart,
    residence,
    gameplay.snapshot.location
  );
  expect(Math.min(...parkedDart.vertices.map(vertex => vertex.y))).toBe(0);
});

test('leaving the Dart preserves its flown heading in the parked craft', () => {
  const gameplay = session();
  gameplay.board(1);
  const flownHeading = Math.PI / 2;
  gameplay.game = {
    ...gameplay.game,
    mode: 'grounded',
    player: {
      ...gameplay.game.player,
      heading: flownHeading,
      position: {
        ...gameplay.game.player.position,
        y: bundle.flight!.rules.groundAltitude
      }
    }
  };

  expect(gameplay.leaveCraft()?.slot).toBe(1);
  const residence = gameplay.residenceOf(1);
  expect(residence).toMatchObject({ heading: flownHeading });
  if (residence.kind !== 'surface') {
    throw new Error('the parked Dart has no surface residence');
  }
  const dart = world.objects.find(object => object.slot === 1)!;
  const parkedDart = placedAtResidence(
    world,
    dart,
    residence,
    gameplay.snapshot.location
  );
  const { heading: _, ...unturnedResidence } = residence;
  const unturnedDart = placedAtResidence(
    world,
    dart,
    unturnedResidence,
    gameplay.snapshot.location
  );
  expect(parkedDart.vertices).not.toEqual(unturnedDart.vertices);

  const restored = GameplaySession.restore(
    gameplay.content,
    gameplay.scripts,
    gameplay.captureSaveSnapshot()
  );
  expect(restored.reach('board', 1).outcome).toEqual({
    kind: 'boarded',
    slot: 1
  });
  expect(restored.game.player.heading).toBe(flownHeading);
});

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
      const colonyCraft = world.objects.find(object => object.slot === 63)!;
      const topDeck = Math.max(...colonyCraft.vertices.map(vertex => vertex.y));
      expect(topDeck).toBe(DECK_SURFACE);
      expect(gameplay.snapshot.player.position.y - topDeck).toBe(
        bundle.flight!.rules.groundAltitude
      );
      const observations = gameplay.observations().observations;
      expect(observations['colonyCraftFlag']).toBe(0xff);
      expect(observations['endingPhase']).toBe(0);
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
      () => gameplay.game.colonyCraftFlag === 0
    );
    expect(cleared).toBeTrue();
    expect(gameplay.observations().observations['endingPhase']).toBe(0);
  });

  test('a low-speed craft beyond the deck bounds can pitch in open air', () => {
    const gameplay = session();
    gameplay.board(1);
    gameplay.game = {
      ...gameplay.game,
      colonyCraftFlag: 0xff,
      mode: 'grounded',
      player: {
        ...gameplay.game.player,
        pitch: 0,
        position: {
          x: 8 * CELL + 0x20_00,
          y: DECK_REST,
          z: 8 * CELL + 0x20_00
        },
        speed: 99
      }
    };
    gameplay.intent = intent({ pitch: 1 });

    gameplay.advance(FRAME);

    expect(gameplay.game.mode).toBe('flying');
    expect(gameplay.game.colonyCraftFlag).toBe(0);
    expect(gameplay.game.player.pitch).toBeGreaterThan(0);
  });

  test('ordinary flight clears the flag, so it cannot survive leaving', () => {
    const gameplay = session();
    climbing(gameplay, 0);
    // Same cell, same band, but outside the middle-byte square: no entry.
    gameplay.game = {
      ...gameplay.game,
      colonyCraftFlag: 0xff,
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
    expect(gameplay.game.colonyCraftFlag).toBe(0);
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
    expect(gameplay.game.colonyCraftFlag).toBe(0);

    // The flag is gone, so walking on the ground does not fall again.
    for (let frame = 0; frame < 60; frame++) {
      gameplay.advance(FRAME);
    }
    expect(gameplay.game.mover).toBeUndefined();
    expect(gameplay.observations().observations['endingPhase']).toBe(0);
  });

  test('reboarding a craft on the deck keeps the Colony Craft altitude', () => {
    const gameplay = session();
    gameplay.carry(28);
    climbing(gameplay, 1);
    advanceUntil(gameplay, 600, () => gameplay.game.mode === 'grounded');
    expect(gameplay.game.player.position.y).toBe(DECK_REST);

    const left = gameplay.leaveCraft();
    expect(left?.slot).toBe(1);
    expect(gameplay.residenceOf(1)).toEqual({
      at: { ...gameplay.game.player.position, y: DECK_SURFACE },
      heading: 0,
      kind: 'surface'
    });
    const residence = gameplay.residenceOf(1);
    if (residence.kind !== 'surface' || residence.at === undefined) {
      throw new Error('the parked Dart has no surface residence');
    }
    const dart = world.objects.find(object => object.slot === 1)!;
    const parkedDart = movedTo(dart, residence.at);
    const dartBase = Math.min(...parkedDart.vertices.map(vertex => vertex.y));
    const colonyCraft = world.objects.find(object => object.slot === 63)!;
    const topDeck = Math.max(...colonyCraft.vertices.map(vertex => vertex.y));
    expect(dartBase).toBe(topDeck);

    expect(gameplay.reach('board', 1).outcome).toEqual({
      kind: 'boarded',
      slot: 1
    });
    expect(gameplay.game.player.position.y).toBe(DECK_REST);
    expect(gameplay.game.colonyCraftFlag).toBe(0xff);

    gameplay.advance(FRAME);
    expect(gameplay.game.player.position.y).toBe(DECK_REST);
    expect(gameplay.game.colonyCraftFlag).toBe(0xff);
  });

  test('the deck lift descends into room 8', () => {
    const gameplay = session();
    gameplay.carry(28);
    climbing(gameplay, 1);
    advanceUntil(gameplay, 600, () => gameplay.game.mode === 'grounded');
    gameplay.leaveCraft();
    gameplay.game = {
      ...gameplay.game,
      player: {
        ...gameplay.game.player,
        position: {
          x: 8 * CELL + 0x71_00,
          y: DECK_REST,
          z: 8 * CELL + 0x71_00
        }
      }
    };

    expect(gameplay.rideLift()).toBeDefined();
    gameplay.advance(7);
    expect(gameplay.snapshot.location).toEqual({ id: 8, kind: 'room' });
    expect(gameplay.game.colonyCraftFlag).toBe(0);
  });

  test('the deck lift descends into room 8 with the Dart still occupied', () => {
    const gameplay = session();
    gameplay.carry(28);
    climbing(gameplay, 1);
    advanceUntil(gameplay, 600, () => gameplay.game.mode === 'grounded');
    gameplay.game = {
      ...gameplay.game,
      player: {
        ...gameplay.game.player,
        position: {
          x: 8 * CELL + 0x71_00,
          y: DECK_REST,
          z: 8 * CELL + 0x71_00
        }
      }
    };

    expect(gameplay.snapshot.occupancy).toEqual({ kind: 'aboard', slot: 1 });
    expect(gameplay.rideLift()).toBeDefined();
    gameplay.advance(7);
    expect(gameplay.snapshot.location).toEqual({ id: 8, kind: 'room' });
    expect(gameplay.snapshot.occupancy).toEqual({ kind: 'aboard', slot: 1 });
    expect(gameplay.game.colonyCraftFlag).toBe(0);
  });

  test('leaving the Dart after the deck lift parks it on the hangar floor', () => {
    const gameplay = session();
    gameplay.carry(28);
    climbing(gameplay, 1);
    advanceUntil(gameplay, 600, () => gameplay.game.mode === 'grounded');
    gameplay.game = {
      ...gameplay.game,
      player: {
        ...gameplay.game.player,
        position: {
          x: 8 * CELL + 0x71_00,
          y: DECK_REST,
          z: 8 * CELL + 0x71_00
        }
      }
    };

    expect(gameplay.rideLift()).toBeDefined();
    gameplay.advance(7);
    expect(gameplay.leaveCraft()?.slot).toBe(1);
    const residence = gameplay.residenceOf(1);
    if (residence.kind !== 'room' || residence.at === undefined) {
      throw new Error('the parked Dart has no hangar residence');
    }
    const dart = world.objects.find(object => object.slot === 1)!;
    const parkedDart = placedAtResidence(
      world,
      dart,
      residence,
      gameplay.snapshot.location
    );

    expect(Math.min(...parkedDart.vertices.map(vertex => vertex.y))).toBe(0);
  });

  test('the room 8 lift returns from the hangar to the deck', () => {
    const gameplay = session();
    gameplay.game = {
      ...gameplay.game,
      player: {
        ...gameplay.game.player,
        position: { x: 0x8_00, y: 0x80, z: 0x8_00 }
      },
      room: 8
    };

    expect(gameplay.rideLift()).toBeDefined();
    gameplay.advance(5.5);
    expect(gameplay.snapshot.location).toEqual({ kind: 'surface' });
    expect(
      Math.abs(gameplay.game.player.position.y - DECK_SURFACE)
    ).toBeLessThan(256);
    gameplay.advance(1.5);
    expect(gameplay.snapshot.location).toEqual({ kind: 'surface' });
    expect(gameplay.game.player.position.x).toBe(8 * CELL + 0x71_00);
    expect(gameplay.game.player.position.y).toBe(DECK_REST);
    expect(gameplay.game.player.position.z).toBe(8 * CELL + 0x71_00);
    expect(gameplay.game.colonyCraftFlag).toBe(0xff);
  });

  test('a Save taken on the deck restores onto it and continues identically', () => {
    const gameplay = session();
    climbing(gameplay, 0);
    advanceUntil(gameplay, 600, () => gameplay.game.mode === 'grounded');

    const snapshot = gameplay.captureSaveSnapshot();
    expect(snapshot.game.colonyCraftFlag).toBe(0xff);
    expect(snapshot.game.player.position.y).toBe(DECK_REST);

    const revived = GameplaySession.restore(
      gameplay.content,
      gameplay.scripts,
      snapshot
    );
    expect(revived.game.colonyCraftFlag).toBe(0xff);
    expect(revived.snapshot.player).toEqual(gameplay.snapshot.player);
    expect(revived.observations().observations).toEqual(
      gameplay.observations().observations
    );

    // Deterministic continuation is the point of the Save, so both sessions
    // are flown the same way afterwards and have to agree: step out, walk off
    // the deck edge, and fall home.
    for (const session of [gameplay, revived]) {
      session.leaveCraft();
      session.intent = intent({ walk: 1 });
    }
    for (let frame = 0; frame < 900; frame++) {
      gameplay.advance(FRAME);
      revived.advance(FRAME);
      expect(revived.snapshot.player).toEqual(gameplay.snapshot.player);
      expect(revived.game.colonyCraftFlag).toBe(gameplay.game.colonyCraftFlag);
      expect(revived.game.mover).toBe(gameplay.game.mover);
    }
    // And the continuation actually went somewhere: the fall happened and
    // ended, rather than both sessions sitting still in agreement.
    expect(gameplay.game.colonyCraftFlag).toBe(0);
    expect(gameplay.game.mover).toBeUndefined();
    expect(gameplay.game.player.position.y).toBeLessThan(DECK_REST);
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
        heading: Math.PI / 2,
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
    expect(gameplay.observations().observations['endingPhase']).toBe(0);

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
    expect(observations['endingPhase']).toBe(0);
    expect(observations['room']).toBe(0);
  });
});
