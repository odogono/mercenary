import { describe, expect, test } from 'bun:test';

import { BensonHostState } from '../src/benson/index.ts';
import { room } from '../src/world/index.ts';
import { LegalRoute } from './legalCheckpoint.ts';

const CREDITS = BensonHostState.firstNumberDecimal;

/// The scripts do the arithmetic, so what is worth pinning here is the shape of
/// the register they do it in: which writes wrap at the modulus and which do not.
/// Two of them do not, and a port that "helpfully" clamped them would be wrong.
describe('the packed decimal register credits live in', () => {
  test('wraps an add at a hundred million', () => {
    const host = new BensonHostState().withDecimal(CREDITS, 99_999_000);
    expect(host.addDecimal(CREDITS, 2000).decimal(CREDITS)).toBe(1000);
  });

  test('subtracts by ten’s complement, which is the same wrap', () => {
    const host = new BensonHostState().withDecimal(CREDITS, 9000);
    // What script 0 adds to take 5,000 off.
    expect(host.addDecimal(CREDITS, 99_995_000).decimal(CREDITS)).toBe(4000);
  });

  test('does not wrap a direct write', () => {
    const host = new BensonHostState().withDecimal(CREDITS, 100_000_001);
    expect(host.decimal(CREDITS)).toBe(100_000_001);
  });

  test('a byte write replaces its pair and normalises nothing else', () => {
    // Only ever swaps one pair, so it cannot lift a sound balance over the
    // limit -- and it will not quietly bring an over-limit one back under it.
    const over = new BensonHostState()
      .withDecimal(CREDITS, 100_000_001)
      .setDecimalByte(CREDITS, 0, 5);
    // The hundred-millions digit the limit should have prevented survives
    // above the pair that was swapped.
    expect(over.decimal(CREDITS)).toBe(105_000_001);
  });

  test('a reward load does not wrap either, which is register 9’s business', () => {
    // Delivery scripts stage their reward with ldr before adding it, and the
    // add is where the modulus lives. Normalising the load would be a change.
    const host = new BensonHostState().withDecimal(9, 250_000);
    expect(host.decimal(9)).toBe(250_000);
    expect(host.withDecimal(9, 100_000_000).decimal(9)).toBe(100_000_000);
  });

  test('reads the millions pair the hire compares', () => {
    const host = new BensonHostState().withDecimal(CREDITS, 1_000_000);
    expect(host.decimalByte(CREDITS, 0)).toBe(1);
    expect(
      new BensonHostState()
        .withDecimal(CREDITS, 999_999)
        .decimalByte(CREDITS, 0)
    ).toBe(0);
  });
});

const opening = async (): Promise<LegalRoute> => {
  const route = await LegalRoute.open({ script: 0 });
  route.advance(76);
  return route;
};

describe('the opening Dart purchase', () => {
  test('debits exactly five thousand when the player says yes', async () => {
    const route = await opening();
    expect(route.session.snapshot.credits).toBe(9000);
    route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
    route.advance(4);
    expect(route.session.snapshot.credits).toBe(4000);
  }, 30_000);

  test('leaves the balance alone when the player answers with another key', async () => {
    const route = await opening();
    route.run({ command: { key: null, kind: 'press' }, kind: 'command' });
    route.advance(20);
    expect(route.session.snapshot.credits).toBe(9000);
  }, 30_000);

  test('leaves the balance alone when the player says nothing at all', async () => {
    const route = await opening();
    route.advance(120);
    expect(route.session.snapshot.credits).toBe(9000);
  }, 60_000);

  test('never accepts twice', async () => {
    const route = await opening();
    route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
    route.advance(4);
    route.run({ command: { key: 'y', kind: 'press' }, kind: 'command' });
    route.advance(20);
    expect(route.session.snapshot.credits).toBe(4000);
  }, 30_000);
});

describe('the Rooms that only talk about money', () => {
  for (const bank of [42, 79, 159]) {
    test(`Room ${bank} reports the balance and changes nothing`, async () => {
      const route = await LegalRoute.open();
      route.session.teleport(room(bank));
      const before = route.session.observations().observations;
      route.advance(30);
      const after = route.session.observations().observations;
      expect(after['credits']).toBe(before['credits'] as number);
      expect(after['engineFlags']).toBe(0);
      expect(after['shipInbound']).toBe(0);
      // Re-entering says the same thing again, and still changes nothing.
      route.session.teleport(room(1));
      route.advance(2);
      route.session.teleport(room(bank));
      route.advance(30);
      expect(route.session.observations().observations['credits']).toBe(
        before['credits'] as number
      );
    }, 30_000);
  }
});

describe('the prison', () => {
  test('Room 81 says its piece and leaves the world alone', async () => {
    const route = await LegalRoute.open();
    const before = route.session.observations().observations;
    route.session.teleport(room(81));
    route.advance(30);
    const after = route.session.observations().observations;

    expect(route.session.snapshot.bensonMessage?.completedText).toContain(
      'PRISON'
    );
    expect(after['credits']).toBe(before['credits'] as number);
    expect(after['carriedStack']).toBe(before['carriedStack'] as string);
    // The script-running latch is the only engine flag it touches, and it
    // clears it on the way out.
    expect((after['engineFlags'] as number) & 0x40).toBe(0);
    expect(after['shipInbound']).toBe(0);
    expect(after['attackingShip']).toBeFalse();
  }, 30_000);
});
