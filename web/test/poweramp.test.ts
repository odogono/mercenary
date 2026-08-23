import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { blockFor } from '../src/flight/index.ts';
import { ceilingFor, effectiveThrottle } from '../src/gameCore/index.ts';
import { GameplaySession, sessionContent } from '../src/session/index.ts';
import { flightModel, loadSettings } from '../src/settings/index.ts';
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
const flight = flightModel(settings.flight, bundle.flight, world.groundExtent);
const content = sessionContent(world, bundle, flight);
const SLOT = bundle.endgame.controls.powerampSlot;
const DART = bundle.flight.rules.poweramp.craft;

const aboard = (craft: number): GameplaySession => {
  const session = new GameplaySession(content, {
    heading: 0,
    pitch: 0,
    position: { x: 600_000, y: 63, z: 600_000 },
    roll: 0,
    speed: 0,
    yawVelocity: 0
  });
  session.board(craft);
  return session;
};

describe('the one craft-conditioned flight override', () => {
  test('is off while nobody is carrying it', () => {
    const session = aboard(DART);

    session.advance(1 / 20);

    expect(session.snapshot.core.poweramp).toBeFalse();
  });

  test('comes on by being carried, not by being fitted', () => {
    const session = aboard(DART);
    session.carry(SLOT);

    session.advance(1 / 20);

    expect(session.snapshot.core.poweramp).toBeTrue();
  });

  test('goes off again when it is put down', () => {
    const session = aboard(DART);
    session.carry(SLOT);
    session.advance(1 / 20);
    expect(session.snapshot.core.poweramp).toBeTrue();

    // The Reference Build reads the carried flag every frame, so letting go of
    // it takes the rates back rather than leaving them fitted.
    session.drop();
    session.advance(1 / 20);

    expect(session.snapshot.core.poweramp).toBeFalse();
  });

  test('doubles the Dart’s throttle and lifts its ceiling', () => {
    const session = aboard(DART);
    session.carry(SLOT);
    session.advance(1 / 20);
    session.throttleNotchValue(6);
    const state = session.game;
    const block = blockFor(flight.document, DART);

    expect(effectiveThrottle(flight, state)).toBe(
      state.throttle * bundle.flight!.rules.poweramp.throttleScale
    );
    // The Dart alone cannot reach the ceiling the good craft have.
    expect(block.ceiling).toBeLessThan(bundle.flight!.rules.poweramp.ceiling);
    expect(ceilingFor(flight, state, block)).toBe(
      bundle.flight!.rules.poweramp.ceiling
    );
  });

  test('does nothing for any other craft', () => {
    const other = bundle.flight!.blocks.find(
      block => block.index !== DART && block.index < 8
    )!.index;
    const session = aboard(other);
    session.carry(SLOT);
    session.advance(1 / 20);
    const state = session.game;

    // Carried all the same — it simply is not this craft's bonus.
    expect(state.poweramp).toBeTrue();
    expect(effectiveThrottle(flight, state)).toBe(state.throttle);
    expect(ceilingFor(flight, state, blockFor(flight.document, other))).toBe(
      blockFor(flight.document, other).ceiling
    );
  });
});
