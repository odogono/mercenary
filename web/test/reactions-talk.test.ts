import { describe, expect, test } from 'bun:test';

import { GameplaySession, type WorldEvent } from '../src/session/index.ts';
import type { Faction } from '../src/session/sites.ts';
import { ESCAPE, REACTIONS } from '../src/talk/scripts.ts';
import { LegalRoute } from './legalCheckpoint.ts';
import { BensonState, nextRandom } from './oracle/index.ts';
import { loadPayload } from './replay/artifacts.ts';
import { Lines, presetting, talkScript } from './talkParity.ts';

/// Real shots dispatch each ported reaction, which must show the lines and
/// make the world writes Benson did, as the snapshot keeps them. Hostile craft movement is omitted here so a later combat hit
/// cannot interrupt the dialogue being compared; site-destruction.test.ts
/// separately follows that encounter through to its end.
const bundle = await loadPayload();
const rules = bundle.endgame.combat.siteDestruction;
const PASS = 46;
const CELL = 0x1_00_00;
const FRAME = 1 / 20;

const fresh = async (
  scripts = talkScript(REACTIONS, ESCAPE)
): Promise<LegalRoute> => {
  const base = await LegalRoute.open({ talk: [] });
  const content = { ...base.session.content };
  delete content.hostile;
  const session = new GameplaySession(
    content,
    base.session.game.player,
    base.session.benson
  );
  session.useTalkScripts(scripts);
  return LegalRoute.resume(session);
};

const over = (route: LegalRoute, cell: number): void => {
  route.session.board(1);
  route.session.game = {
    ...route.session.game,
    player: {
      ...route.session.game.player,
      heading: Math.PI,
      position: {
        x: (cell & 15) * CELL + 0x70_00,
        y: 0,
        z: (cell >> 4) * CELL + 0x70_00
      },
      speed: 0
    }
  };
  route.session.advance(FRAME);
};

const cellFor = (id: number): number =>
  rules.reactions.find(row => row.lowId === id)!.cells[0]!;

const bomb = (route: LegalRoute): readonly WorldEvent[] => {
  expect(route.session.fire().outcome.kind).toBe('fired');
  return route.session.advance(FRAME).worldEvents;
};

const outcome = (lines: Lines) => {
  const session = lines.route.session;
  if (session.talk !== undefined) {
    expect(
      session.talk.reports.filter(
        report => report.kind !== 'run end' || report.outcome !== 'completed'
      )
    ).toEqual([]);
  }
  return {
    attacking: session.observations().observations['attackingShip'],
    credits: session.observations().observations['credits'],
    lines: lines.lines,
    pass: session.residenceOf(PASS),
    passFlags: session.snapshot.objectFlags.get(PASS)
  };
};

/// Plays a scenario on Talk, checking what it left against Benson's.
const onTalk = async (play: () => Promise<Lines>) => {
  const result = outcome(await play());
  expect(result).toMatchSnapshot();
  return result;
};

describe('Faction Reactions as a Talk Script', () => {
  for (const [id, name] of [
    [4, 'Novabill'],
    [5, 'the author’s advert'],
    [6, 'Sabins Cube'],
    [7, 'the Walton Monument'],
    [8, 'St. Stallards'],
    [9, 'the Moorby Arch'],
    [10, 'Tyler Point'],
    [11, 'Bosher Stadium'],
    [12, 'Jordan Airport'],
    [13, 'Vector Henge'],
    [14, 'the brother-in-law’s house'],
    [15, 'the Mechanoid Fort'],
    [16, 'the Coach and Horses'],
    [17, 'TRAITOR,'],
    [18, 'GOOD SHOW,']
  ] as const) {
    test(`matches Benson for ${name}`, async () => {
      const result = await onTalk(async () => {
        const route = await fresh();
        over(route, cellFor(id));
        bomb(route);
        return new Lines(route).advance(60);
      });
      expect(result.lines.length).toBeGreaterThan(1);
      expect(result.lines.at(-1)).toBe('');
      expect(result.attacking).toBe(id >= 5 && id <= 16);
    });
  }

  for (const id of [2, 3]) {
    for (const byte of [0, 80, 81, 255]) {
      test(`generic Site ${id} rolls byte ${byte}`, async () => {
        const result = await onTalk(async () => {
          const route = await fresh();
          over(route, cellFor(id));
          // The session's stream draws this byte next.
          let seed = 0n;
          while (nextRandom(new BensonState(seed)).byte !== byte) {
            seed++;
          }
          route.session.seedRandom(seed);
          bomb(route);
          return new Lines(route).advance(20);
        });
        expect(result.attacking).toBe(byte <= 80);
        expect(result.lines).toEqual(
          byte <= 80
            ? [id === 2 ? 'PALYAR SHIP ATTACKING' : 'MECHANOID SHIP ATTACK', '']
            : []
        );
      });
    }
  }

  test('hitting the brother-in-law’s ship announces it and sends an attacker', async () => {
    const result = await onTalk(async () => {
      const route = await fresh();
      const session = route.session;
      const at = session.content.objects.find(
        object => object.slot === 0
      )!.origin;
      session.board(1);
      session.game = {
        ...session.game,
        player: {
          ...session.game.player,
          heading: Math.PI,
          position: { ...at, z: at.z - 4096 }
        }
      };
      session.advance(FRAME);
      expect(bomb(route)).toEqual([{ kind: 'struck', object: 0 }]);
      expect(session.residenceOf(0).kind).toBe('gone');
      return new Lines(route).advance(60);
    });
    expect(result.lines).toEqual([
      'YOU HAVE JUST DESTROYED',
      "THE PALYAR COMMANDER'S",
      'BROTHER-IN-LAWS',
      'NEW SHIP',
      'PALYAR SHIP ATTACKING',
      ''
    ]);
    expect(result.attacking).toBe(true);
  });

  test('hitting the hostile craft keeps its engine message and starts no reaction', async () => {
    const base = await fresh();
    const target = bundle.endgame.combat.objectHits.targetSlots[0]!;
    // Place the attacker clear of the city, whose Sites claim a shot first.
    const at = { x: 2_000_000, y: 0, z: 2_000_000 };
    const saved = base.session.captureSaveSnapshot();
    const session = GameplaySession.restore(
      base.session.content,
      base.session.benson,
      {
        ...saved,
        residence: saved.residence.map(([slot, where]) => [
          slot,
          slot === target ? { at, kind: 'surface' } : where
        ])
      },
      { scripts: talkScript(REACTIONS, ESCAPE) }
    );
    const route = LegalRoute.resume(session);
    session.board(1);
    session.game = {
      ...session.game,
      player: {
        ...session.game.player,
        heading: Math.PI,
        position: { ...at, z: at.z - 4096 }
      }
    };
    session.advance(FRAME);
    session.adjust({ attackingShip: true });
    expect(bomb(route)).toEqual([{ kind: 'struck', object: target }]);
    const result = outcome(new Lines(route).advance(20));
    expect(result.attacking).toBe(false);
    expect(session.talk!.shown).toEqual([]);
    expect(result.lines).toEqual(['ENEMY SHIP DESTROYED']);
  });

  test('a Save keeps two reactions queued while the display is busy', async () => {
    const route = await fresh();
    over(route, cellFor(4));
    bomb(route);
    over(route, cellFor(7));
    route.advance(rules.impactFrames / 20);
    bomb(route);
    const restored = GameplaySession.restore(
      route.session.content,
      route.session.benson,
      route.session.captureSaveSnapshot(),
      { scripts: talkScript(REACTIONS, ESCAPE) }
    );
    const lines = new Lines(LegalRoute.resume(restored)).advance(90);
    const result = outcome(lines);
    expect(result.lines).toContain('NOVABILL - WELL DONE,');
    expect(result.lines).toContain('THE WALTON MONUMENT');
    expect(result.attacking).toBe(true);
  });

  test('restoring and destroying a spent Site does not repeat its reaction', async () => {
    const route = await fresh();
    const cell = cellFor(4);
    over(route, cell);
    bomb(route);
    const lines = new Lines(route).advance(30);
    route.session.carry(rules.restorationSlot);
    bomb(route);
    lines.advance(5);
    route.session.drop(rules.restorationSlot);
    const told = bomb(route);
    expect(told).toContainEqual({
      cell,
      faction: 'mechanoid',
      kind: 'destroyed',
      reacting: false,
      site: 0
    });
    lines.advance(30);
    expect(
      lines.lines.filter(line => line === 'NOVABILL - WELL DONE,')
    ).toHaveLength(1);
  });
});

/// One shot short of the faction's thanks, using the real threshold logic.
const grateful = async (
  faction: Faction,
  passCarried = false,
  already = false
): Promise<LegalRoute> => {
  // Thanked already, as either faction's gratitude leaves it.
  const scripts = already
    ? presetting(talkScript(REACTIONS, ESCAPE), REACTIONS, 'thanked', 'true')
    : talkScript(REACTIONS, ESCAPE);
  const route = await fresh(scripts);
  const cell = cellFor(faction === 'palyar' ? 6 : 7);
  over(route, cell);
  if (passCarried) {
    route.session.carry(PASS);
  }
  route.session.takeSettled();
  const saved = route.session.captureSaveSnapshot();
  return LegalRoute.resume(
    GameplaySession.restore(
      route.session.content,
      route.session.benson,
      {
        ...saved,
        combat: {
          ...saved.combat!,
          mechanoidDestroyed:
            faction === 'palyar' ? rules.factionObjective.threshold - 1 : 0,
          palyarDestroyed:
            faction === 'mechanoid' ? rules.factionObjective.threshold : 0
        }
      },
      { scripts }
    )
  );
};

describe('gratitude as a Talk Script', () => {
  test('the Palyars move the Pass and give the red hangar hint', async () => {
    const result = await onTalk(async () => {
      const route = await grateful('palyar');
      bomb(route);
      return new Lines(route).advance(90);
    });
    expect(result.lines).toEqual([
      'MESSAGE FROM PALYARS',
      'WE ARE MOST PLEASED',
      'YOU HAVE DESTROYED ALL',
      'KEY OPPOSITION SITES',
      'YOU WILL FIND A REWARD',
      'INSIDE THE RED HANGER',
      'MESSAGE ENDS'
    ]);
    expect(result.pass).toEqual({ id: 1, kind: 'room' });
    expect(result.credits).toBe(9000);
    expect(result.attacking).toBe(false);
  });

  test('the Palyars pay immediately when the Pass is already carried', async () => {
    const result = await onTalk(async () => {
      const route = await grateful('palyar', true);
      bomb(route);
      return new Lines(route).advance(90);
    });
    expect(result.lines.slice(-3)).toEqual([
      '500000 CREDITS PAID',
      'YOU HAVE 509000 CREDITS',
      ''
    ]);
    expect(result.credits).toBe(509_000);
    expect(result.pass.kind).toBe('carried');
  });

  test('the Mechanoids thank the player without a reward', async () => {
    const result = await onTalk(async () => {
      const route = await grateful('mechanoid');
      bomb(route);
      return new Lines(route).advance(90);
    });
    expect(result.lines).toEqual([
      'MESSAGE FROM MECHANOIDS',
      'WE ARE MOST PLEASED',
      'YOU HAVE DESTROYED ALL',
      'KEY OPPOSITION SITES',
      'MESSAGE ENDS',
      ''
    ]);
    expect(result.credits).toBe(9000);
    expect(result.pass).toEqual({ id: 80, kind: 'room' });
  });

  for (const faction of ['palyar', 'mechanoid'] as const) {
    test(`${faction} gratitude is silent when either faction has already thanked the player`, async () => {
      const result = await onTalk(async () => {
        const route = await grateful(faction, false, true);
        bomb(route);
        return new Lines(route).advance(30);
      });
      expect(result.lines).toEqual([]);
      expect(result.attacking).toBe(false);
    });
  }

  test('concurrent gratitude pays once, and a mid-report Save keeps that promise', async () => {
    const route = await grateful('palyar', true);
    bomb(route);
    new Lines(route).until('WE ARE MOST PLEASED');
    route.session.talk!.deliver([
      { faction: 'palyar', kind: 'gratitude' },
      { faction: 'mechanoid', kind: 'gratitude' }
    ]);
    const restored = GameplaySession.restore(
      route.session.content,
      route.session.benson,
      route.session.captureSaveSnapshot(),
      { scripts: talkScript(REACTIONS, ESCAPE) }
    );
    const lines = new Lines(LegalRoute.resume(restored)).advance(90);
    expect(outcome(lines).credits).toBe(509_000);
    expect(
      lines.lines.filter(line => line === '500000 CREDITS PAID')
    ).toHaveLength(1);
    expect(lines.lines).not.toContain('MESSAGE FROM MECHANOIDS');
  });

  test('taking the Pass while the hint plays keeps it carried', async () => {
    const route = await grateful('palyar');
    bomb(route);
    new Lines(route).until('YOU WILL FIND A REWARD');
    route.session.carry(PASS);
    const result = outcome(new Lines(route).advance(40));
    expect(result.pass.kind).toBe('carried');
    expect(result.credits).toBe(9000);
  });
});
