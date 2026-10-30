import { describe, expect, test } from 'bun:test';

import { room } from '../src/world/index.ts';
import { LegalRoute } from './legalCheckpoint.ts';

/// The sixteen rows as `notes/decode/endgame.md` records them. Expectations
/// only: the scripts remain the authority for what a delivery pays, and nothing
/// here is read by the app.
interface Row {
  readonly credits: number;
  readonly faction: 'mechanoid' | 'palyar';
  readonly room: number;
  readonly slot: number;
  readonly what: string;
}

const ROWS: readonly Row[] = [
  {
    credits: 200_000,
    faction: 'palyar',
    room: 136,
    slot: 29,
    what: 'Neutron Fuel'
  },
  {
    credits: 50_000,
    faction: 'palyar',
    room: 155,
    slot: 42,
    what: 'Essential 12939 Supply'
  },
  { credits: 100_000, faction: 'palyar', room: 162, slot: 38, what: 'Gold' },
  {
    credits: 60_000,
    faction: 'palyar',
    room: 163,
    slot: 44,
    what: 'Catering Provisions'
  },
  {
    credits: 40_000,
    faction: 'palyar',
    room: 165,
    slot: 41,
    what: 'Medical Supplies'
  },
  {
    credits: 100_000,
    faction: 'palyar',
    room: 173,
    slot: 31,
    what: 'Energy Crystal'
  },
  {
    credits: 35_000,
    faction: 'palyar',
    room: 147,
    slot: 34,
    what: 'Large Box'
  },
  {
    credits: 65_000,
    faction: 'palyar',
    room: 146,
    slot: 35,
    what: 'Useful Armament'
  },
  {
    credits: 100_000,
    faction: 'palyar',
    room: 144,
    slot: 43,
    what: 'Winchester'
  },
  {
    credits: 100_000,
    faction: 'palyar',
    room: 170,
    slot: 45,
    what: 'Databank'
  },
  {
    credits: 250_000,
    faction: 'palyar',
    room: 154,
    slot: 12,
    what: 'captured Mechanoid'
  },
  {
    credits: 250_000,
    faction: 'mechanoid',
    room: 70,
    slot: 29,
    what: 'Neutron Fuel'
  },
  {
    credits: 100_000,
    faction: 'mechanoid',
    room: 50,
    slot: 31,
    what: 'Energy Crystal'
  },
  {
    credits: 80_000,
    faction: 'mechanoid',
    room: 48,
    slot: 34,
    what: 'Large Box'
  },
  {
    credits: 120_000,
    faction: 'mechanoid',
    room: 34,
    slot: 35,
    what: 'Useful Armament'
  },
  {
    credits: 250_000,
    faction: 'mechanoid',
    room: 18,
    slot: 43,
    what: 'Winchester'
  }
];

/// Claimed and fixed, which is what a completed hand-in ORs into the object.
const CLAIMED_AND_FIXED = 0x11;

/// Carries the object into the buyer's Room and leaves it there.
///
/// A synthetic checkpoint, not a route: it proves the rule, and the legal
/// checkpoint further down proves a player can get to it.
const handIn = async (
  slot: number,
  buyer: number,
  options?: { readonly leaderTo?: number }
): Promise<LegalRoute> => {
  const route = await LegalRoute.open();
  if (options?.leaderTo !== undefined) {
    await moveLeaderTo(route, options.leaderTo);
  }
  route.session.carry(slot);
  route.session.teleport(room(buyer));
  route.advance(20);
  route.session.drop();
  route.advance(20);
  return route;
};

/// Carries slot 12 somewhere and leaves it, then waits out whatever that Room
/// had to say -- a script still running would refuse to let the next one start.
const moveLeaderTo = async (
  route: LegalRoute,
  where: number
): Promise<void> => {
  route.session.carry(12);
  route.session.teleport(room(where));
  route.advance(2);
  route.session.drop();
  route.advance(60);
};

/// Everything the message line said while the Room was being visited.
///
/// A refusal is a message and nothing else, and by the time the script has
/// finished the line has already cleared -- so it has to be watched, not
/// looked up afterwards.
const listenIn = (route: LegalRoute, seconds: number): string => {
  let heard = '';
  for (let left = seconds; left > 0; left -= 0.5) {
    route.advance(0.5);
    const text = route.session.observations().observations['messageText'];
    if (typeof text === 'string' && text.length > heard.length) {
      heard = text;
    } else if (
      typeof text === 'string' &&
      text !== '' &&
      !heard.includes(text)
    ) {
      heard += ` ${text}`;
    }
  }
  return heard;
};

describe('the sixteen delivery Objectives', () => {
  for (const row of ROWS) {
    test(`${row.faction} Room ${row.room} pays ${row.credits} for the ${row.what}`, async () => {
      const route = await handIn(row.slot, row.room);
      const after = route.session.observations().observations;

      expect(after['credits']).toBe(9000 + row.credits);
      expect(
        (after[`objectFlags.${row.slot}`] as number) & CLAIMED_AND_FIXED
      ).toBe(CLAIMED_AND_FIXED);
      expect(after[`objectRoom.${row.slot}`]).toBe(row.room);
    }, 30_000);

    test(`${row.faction} Room ${row.room} pays for the ${row.what} only once`, async () => {
      const route = await handIn(row.slot, row.room);
      const paid = route.session.observations().observations['credits'];

      // The object is fixed now, so it cannot be picked up again; re-entering
      // with it already lying there is the repeat a player could actually try.
      route.session.teleport(room(1));
      route.advance(2);
      route.session.teleport(room(row.room));
      route.advance(30);

      expect(route.session.observations().observations['credits']).toBe(paid);
    }, 30_000);
  }
});

describe('goods two buyers both want', () => {
  const shared = [29, 31, 34, 35, 43] as const;

  for (const slot of shared) {
    const buyers = ROWS.filter(row => row.slot === slot);

    test(`slot ${slot} has one buyer for each faction`, () => {
      expect(buyers).toHaveLength(2);
      expect(new Set(buyers.map(row => row.faction)).size).toBe(2);
    });

    test(`slot ${slot} cannot be sold twice`, async () => {
      const [first, second] = buyers as [Row, Row];
      const route = await handIn(slot, first.room);
      const paid = route.session.observations().observations['credits'];
      expect(paid).toBe(9000 + first.credits);

      // The alternative buyer sees the claimed bit and returns without paying.
      route.session.teleport(room(second.room));
      route.advance(30);
      expect(route.session.observations().observations['credits']).toBe(paid);
    }, 30_000);
  }
});

describe('the Mechanoid leader', () => {
  const mechanoid = ROWS.filter(row => row.faction === 'mechanoid');

  test('starts at home, so Mechanoid trade is open from the beginning', async () => {
    const route = await LegalRoute.open();
    expect(route.session.observations().observations['objectRoom.12']).toBe(
      102
    );
  });

  for (const row of mechanoid) {
    test(`Room ${row.room} refuses the ${row.what} while the leader is away`, async () => {
      const route = await LegalRoute.open();
      await moveLeaderTo(route, 1);
      route.session.carry(row.slot);
      route.session.teleport(room(row.room));
      const heard = listenIn(route, 40);
      route.session.drop();
      const afterDropping = listenIn(route, 40);
      const after = route.session.observations().observations;

      expect(after['credits']).toBe(9000);
      expect(
        (after[`objectFlags.${row.slot}`] as number) & CLAIMED_AND_FIXED
      ).toBe(0);
      expect(`${heard} ${afterDropping}`).toContain('LEADER');
    }, 60_000);
  }

  test('permits the sale again once the leader is put back', async () => {
    const row = mechanoid[0]!;
    const route = await handIn(row.slot, row.room, { leaderTo: 1 });
    expect(route.session.observations().observations['credits']).toBe(9000);

    // Fetch the leader from where it was left and take it home.
    await moveLeaderTo(route, 102);

    // The goods are still lying in the buyer's Room, so walking back in is enough.
    route.session.teleport(room(row.room));
    route.advance(30);
    expect(route.session.observations().observations['credits']).toBe(
      9000 + row.credits
    );
  }, 60_000);

  test('is worth 250,000 to the Palyar, which is what closes Mechanoid trade', async () => {
    const route = await handIn(12, 154);
    expect(route.session.observations().observations['credits']).toBe(259_000);
    expect(route.session.observations().observations['objectRoom.12']).toBe(
      154
    );
  }, 30_000);
});

describe('the faction briefings', () => {
  for (const [faction, briefing] of [
    ['Palyar', 41],
    ['Mechanoid', 102]
  ] as const) {
    test(`Room ${briefing} briefs for the ${faction} and commits the player to nothing`, async () => {
      const route = await LegalRoute.open();
      const before = route.session.observations().observations;
      route.session.teleport(room(briefing));
      route.advance(60);
      const after = route.session.observations().observations;

      expect(after['credits']).toBe(before['credits'] as number);
      expect(after['carriedStack']).toBe(before['carriedStack'] as string);
      expect(after['shipInbound']).toBe(0);
      // Only the script-running latch moves, and it is cleared on the way out.
      expect((after['engineFlags'] as number) & ~0x40).toBe(
        (before['engineFlags'] as number) & ~0x40
      );
      // Every object is where it was: hearing a briefing changes no world state.
      for (const [id, value] of Object.entries(before)) {
        if (id.startsWith('objectRoom.') || id.startsWith('objectFlags.')) {
          expect(after[id]).toBe(value);
        }
      }
    }, 30_000);
  }

  test('the two factions are not exclusive of each other', async () => {
    // One Palyar row and one Mechanoid row completed in the same session.
    const route = await handIn(42, 155);
    expect(route.session.observations().observations['credits']).toBe(59_000);

    route.session.carry(29);
    route.session.teleport(room(70));
    route.advance(20);
    route.session.drop();
    route.advance(20);

    expect(route.session.observations().observations['credits']).toBe(
      59_000 + 250_000
    );
  }, 30_000);
});
