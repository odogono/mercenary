import { describe, expect, test } from 'bun:test';

import { SiteLedger } from '../src/session/sites.ts';
import { loadPayload } from './replay/artifacts.ts';

const rules = (await loadPayload()).endgame.combat.siteDestruction;

const ledger = (): SiteLedger => new SiteLedger(rules);

/// A Site of each kind, found in the decoded table rather than named here, so
/// these tests keep meaning what they say if the census is ever re-decoded.
const cellWhere = (predicate: (byte: number) => boolean): number => {
  const cell = rules.initialTable.findIndex(predicate);
  expect(cell).toBeGreaterThanOrEqual(0);
  return cell;
};
const neutralCell = cellWhere(byte => (byte & rules.neutralMask) !== 0);
const mechanoidCell = cellWhere(
  byte => (byte & rules.mechanoidMask) !== 0 && (byte & rules.neutralMask) === 0
);
const palyarCell = cellWhere(
  byte =>
    (byte & rules.mechanoidMask) === 0 &&
    (byte & rules.neutralMask) === 0 &&
    (byte & rules.lowIdMask) !== 0
);

/// Destroy Sites of one faction until the other thanks the player. Counted out
/// one strike at a time because the threshold is a lead, not a total.
const destroyUntilThanked = (
  sites: SiteLedger,
  mask: number
): { at: number; reaction: number } => {
  let count = 0;
  for (const [cell, byte] of rules.initialTable.entries()) {
    const owned =
      (byte & rules.neutralMask) === 0 && (byte & rules.mechanoidMask) === mask;
    if (!owned) {
      continue;
    }
    count += 1;
    const struck = sites.strike(cell, false);
    if (struck.kind === 'gratitude') {
      return { at: count, reaction: struck.reaction };
    }
  }
  throw new Error('no Gratitude Threshold was reached');
};

describe('the Site Ledger a shot commits to', () => {
  test('starts as the decoded partition, with nothing destroyed', () => {
    const sites = ledger();

    expect(sites.destroyedCells()).toEqual([]);
    expect(sites.palyarDestroyed).toBe(0);
    expect(sites.mechanoidDestroyed).toBe(0);
    expect(sites.bytes).toHaveLength(256);
  });

  test('destroys a faction Site, counts it, and dispatches its reaction', () => {
    const sites = ledger();
    const expected =
      rules.reactionDispatchBase |
      (rules.initialTable[mechanoidCell]! & rules.lowIdMask);

    const struck = sites.strike(mechanoidCell, false);

    expect(struck).toEqual({ kind: 'destroyed', reaction: expected });
    expect(sites.destroyedCells()).toEqual([mechanoidCell]);
    expect(sites.mechanoidDestroyed).toBe(1);
    expect(sites.palyarDestroyed).toBe(0);
  });

  test('counts a Palyar Site against the other counter', () => {
    const sites = ledger();

    sites.strike(palyarCell, false);

    expect(sites.palyarDestroyed).toBe(1);
    expect(sites.mechanoidDestroyed).toBe(0);
  });

  test('destroys a neutral Site without counting or reacting', () => {
    const sites = ledger();

    expect(sites.strike(neutralCell, false)).toEqual({ kind: 'neutral' });
    // Destroyed all the same: the bit is set, it simply means nothing to anyone.
    expect(sites.destroyedCells()).toEqual([neutralCell]);
    expect(sites.palyarDestroyed).toBe(0);
    expect(sites.mechanoidDestroyed).toBe(0);
  });

  test('does not count or react to a Site twice', () => {
    const sites = ledger();
    sites.strike(mechanoidCell, false);

    expect(sites.strike(mechanoidCell, false)).toEqual({ kind: 'inert' });
    expect(sites.mechanoidDestroyed).toBe(1);
    expect(sites.destroyedCells()).toEqual([mechanoidCell]);
  });

  test('spends a reaction, so a restored Site reacts only once', () => {
    const sites = ledger();
    const first = sites.strike(palyarCell, false);
    expect(first.kind).toBe('destroyed');

    // The Anti Time Bomb puts it back, and the next shot destroys it again.
    expect(sites.strike(palyarCell, true)).toEqual({ kind: 'restored' });
    expect(sites.destroyedCells()).toEqual([]);
    const again = sites.strike(palyarCell, false);

    expect(again).toEqual({ kind: 'destroyed', reaction: undefined });
  });

  test('restores an intact Site without counting it', () => {
    const sites = ledger();

    expect(sites.strike(mechanoidCell, true)).toEqual({ kind: 'restored' });
    expect(sites.destroyedCells()).toEqual([]);
    expect(sites.mechanoidDestroyed).toBe(0);
    expect(sites.bytes[mechanoidCell]).toBe(rules.initialTable[mechanoidCell]!);
  });

  test('leaves a counter alone when it restores a destroyed Site', () => {
    const sites = ledger();
    sites.strike(mechanoidCell, false);

    sites.strike(mechanoidCell, true);

    // Restoration never moves a counter in either direction.
    expect(sites.mechanoidDestroyed).toBe(1);
    expect(sites.destroyedCells()).toEqual([]);
  });

  test('dispatches every reaction the census carries', () => {
    for (const row of rules.reactions) {
      const sites = ledger();
      const cell = row.cells[0]!;

      expect(sites.strike(cell, false)).toEqual({
        kind: 'destroyed',
        reaction: row.script
      });
    }
  });
});

describe('the Gratitude Threshold a lead reaches', () => {
  test('thanks the Palyar side once the Mechanoid lead reaches the threshold', () => {
    const { at, reaction } = destroyUntilThanked(ledger(), rules.mechanoidMask);

    expect(reaction).toBe(rules.factionObjective.palyarScript);
    expect(at).toBe(rules.factionObjective.threshold);
  });

  test('thanks the Mechanoid side one Site later, as the complement makes it', () => {
    const { at, reaction } = destroyUntilThanked(ledger(), 0);

    expect(reaction).toBe(rules.factionObjective.mechanoidScript);
    // The negative arm complements before comparing, so this side needs one
    // more Site than the other to say the same thing.
    expect(at).toBe(rules.factionObjective.threshold + 1);
  });

  test('leaves the reaction of the Site that reached it unspent', () => {
    const sites = ledger();
    destroyUntilThanked(sites, rules.mechanoidMask);
    const lastStruck = sites
      .destroyedCells()
      .filter(cell => (rules.initialTable[cell]! & rules.lowIdMask) !== 0)
      .at(-1)!;

    // The threshold branch jumps past the wipe, so the low id survives.
    expect(sites.bytes[lastStruck]! & rules.lowIdMask).toBe(
      rules.initialTable[lastStruck]! & rules.lowIdMask
    );
  });
});
