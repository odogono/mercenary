import { describe, expect, test } from 'bun:test';

import { GameplaySession } from '../src/session/index.ts';
import { CityRun } from './cityRun.ts';
import { loadPayload } from './replay/artifacts.ts';
import { withoutScript } from './saveCheckpoint.ts';

const bundle = await loadPayload();
const objective = bundle.endgame.combat.siteDestruction.factionObjective;
/// The engine flag both Benson gratitude scripts test, in the original program.
const GRATITUDE_FLAG = 0x02;
const PASS = 46;

/// Bombs one faction's Sites until the other side says thank you.
const bombUntilThanked = async (
  faction: 'mechanoid' | 'palyar',
  before?: (run: CityRun) => void
): Promise<CityRun> => {
  const run = await CityRun.open();
  before?.(run);
  for (const cell of run.sitesOf(faction)) {
    run.bomb(cell);
    // Stop on the lead itself: the script that answers it needs frames to run,
    // so waiting for its flag would fly one Site too far.
    if (run.thresholdReached()) {
      return run;
    }
  }
  throw new Error(`bombing every ${faction} Site was not thanked for`);
};

/// These fly the whole route rather than pinning the arithmetic, because the
/// arithmetic is pinned in `site-ledger.test.ts` and what is in doubt here is
/// whether a hundred-odd legal destructions can actually be flown: the shot
/// must land in the Site's own band while the craft is still over that Site,
/// and the reactions on the way fire back.
describe('the Gratitude Threshold one faction reaches', () => {
  test('thanks the Palyar for a Mechanoid lead, and hands over the Pass', async () => {
    const run = await bombUntilThanked('mechanoid');
    const before = run.observations()['credits'] as number;

    expect(run.lead()).toBe(objective.threshold);
    run.settle();
    const after = run.observations();

    // The Palyars say thank you, and the Pass has been moved somewhere the
    // player can reach rather than paid for in cash.
    expect(run.session.talk!.shown).toContain('MESSAGE FROM PALYARS');
    expect(after[`objectRoom.${PASS}`]).toBe(1);
    expect(after['credits']).toBe(before);
  }, 120_000);

  test('thanks the Mechanoids for a Palyar lead, one Site later', async () => {
    const run = await bombUntilThanked('palyar');

    // The negative arm complements its difference before comparing, so this
    // side needs one Site more than the other to say the same thing.
    expect(run.lead()).toBe(-(objective.threshold + 1));
    run.settle();
    expect(run.session.talk!.shown).toContain('MESSAGE FROM MECHANOIDS');
  }, 120_000);

  test('pays instead when the Pass has already left where it was kept', async () => {
    // Carrying it is enough: the script asks whether the Pass is still where it
    // started, not whether the player has been given it.
    const run = await bombUntilThanked('mechanoid', started => {
      started.session.carry(PASS);
    });
    const before = run.observations()['credits'] as number;

    run.settle();
    const after = run.observations();

    expect(run.session.talk!.shown).toContain('MESSAGE FROM PALYARS');
    expect(after['credits']).toBe(before + 500_000);
  }, 120_000);

  test('says it once, however far past the threshold the lead goes', async () => {
    const run = await bombUntilThanked('mechanoid');
    run.settle();
    const thanked = run.observations();
    const destroyed = new Set(
      String(thanked['destroyedCells'])
        .split(',')
        .filter(one => one !== '')
        .map(one => Number.parseInt(one, 16))
    );

    // Keep going, on Sites the route had not reached yet. The scripts test the
    // shared flag on the way in, so a lead that keeps growing is not thanked
    // for twice.
    const standing = run
      .sitesOf('mechanoid')
      .filter(cell => !destroyed.has(cell))
      .slice(0, 4);
    expect(standing).not.toBeEmpty();
    for (const cell of standing) {
      run.bomb(cell);
    }
    run.settle();
    const after = run.observations();

    expect(run.lead()).toBeGreaterThan(objective.threshold);
    expect(after[`objectRoom.${PASS}`]).toBe(thanked[`objectRoom.${PASS}`]);
    expect(after['credits']).toBe(thanked['credits']);
  }, 120_000);
});

describe('a Save taken on the way to a threshold', () => {
  test('carries the lead across and goes on counting from it', async () => {
    const run = await CityRun.open();
    for (const cell of run.sitesOf('mechanoid').slice(0, 8)) {
      run.bomb(cell);
    }
    const before = run.session.observations().observations;
    expect(before['mechanoidDestroyed']).toBeGreaterThan(0);

    const restored = GameplaySession.restore(
      run.session.content,
      run.session.scripts,
      run.session.captureSaveSnapshot()
    );

    expect(withoutScript(restored.observations().observations)).toEqual(
      withoutScript(before)
    );
    // And the two go on agreeing rather than merely starting equal.
    restored.advance(2);
    run.session.advance(2);
    expect(withoutScript(restored.observations().observations)).toEqual(
      withoutScript(run.session.observations().observations)
    );
  }, 120_000);
});

describe('the flag both gratitude scripts answer to', () => {
  test('is one flag, which is what makes the thanks a single event', () => {
    const program = bundle.benson!;
    const entries = new Map(
      program.scripts.map(script => [script.id, script.entry])
    );
    const setters = new Set<number>();

    for (const script of [objective.palyarScript, objective.mechanoidScript]) {
      const entry = entries.get(script)!;
      // Each opens by testing a flag before it gives anything away, and it is
      // the same mask on both sides.
      const test = program.instructions[entry + 1]!;
      expect(test.op).toBe('tstf');
      expect(test.mask).toBe(GRATITUDE_FLAG);
      // And each reaches the same body afterwards, which is what sets it.
      const body = program.instructions
        .slice(entry, entry + 8)
        .filter(one => one.op === 'call')
        .map(one => one.target!);
      for (const target of body) {
        setters.add(target);
      }
    }

    // One shared body, so whichever faction gets there first spends it for both.
    expect(setters.has(467)).toBeTrue();
  });
});
