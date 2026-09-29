import { beforeAll, describe, expect, test } from 'bun:test';

import { readErisPresentation } from '../src/damocles/documents.ts';
import { cashReadout } from '../src/damocles/panel.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  decodeDamoclesSave,
  encodeDamoclesSave,
  type DamoclesSaveSnapshot
} from '../src/damocles/save.ts';
import {
  BOOK_SLOT,
  COLOURFUL_MASK,
  DESTRUCTION_TRIGGERS,
  ENDING_TRIGGERS,
  MAGIC_CRYSTAL_SLOT,
  NEW_GAME_BALANCE,
  WISH_DRIFT
} from '../src/damocles/scripts.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// The endings a record older than schema 22 does not carry.
const OLDER_ENDINGS = [...ENDING_TRIGGERS, ...DESTRUCTION_TRIGGERS];

/// The BOOK's wishes with the MAGIC CRYSTAL carried (#625), against the note's two live runs
/// (docs/research/damocles-endgame.md): `wish --page 5 --then-impact` and `--page 3`, both from
/// `gaea-ur-city-4-2` with the first offer accepted at 10 million.

let content: DamoclesContent;

beforeAll(async () => {
  const catalogue = await loadCatalogue();
  const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
  content = {
    catalogue,
    doc,
    documents: await damoclesDocuments(),
    models: modelsOf(catalogue),
    poses: await arrivalPoses(),
    presentationSha256: 'test',
    strings: parseDamoclesStrings(
      await Bun.file('../payload/damocles/strings.json').json()
    ),
    surface: erisSurfaceFrom(catalogue, modelsOf(catalogue), doc)
  };
});

const BOOK = `object-slot-${BOOK_SLOT}`;
const CRYSTAL = `object-slot-${MAGIC_CRYSTAL_SLOT}`;
const SANDWICH = 'object-slot-219';
const CRYSTAL_PICKUP = 20;
const FIRST_OFFER = 4;
const IMPACT = 15;

/// A player on GAEA carrying the BOOK open at `page`, and the crystal unless `crystal` is false.
const reading = (
  page: number,
  options: {
    readonly accepted?: boolean;
    readonly crystal?: boolean;
    readonly with?: (saved: DamoclesSaveSnapshot) => DamoclesSaveSnapshot;
  } = {}
): DamoclesSession => {
  const accepted = options.accepted ?? true;
  const crystal = options.crystal ?? true;
  const first = new DamoclesSession(content);
  expect(first.switchToPose('gaea-ur-city-4-2').kind).toBe('switched');
  const saved = first.captureResume();
  const carried = crystal ? [BOOK, CRYSTAL] : [BOOK];
  const snapshot: DamoclesSaveSnapshot = {
    ...saved,
    carried,
    headCommands: {
      ...saved.headCommands,
      box: {
        ...saved.headCommands.box,
        from: BOOK_SLOT,
        fromItem: null,
        steps: 0,
        to: BOOK_SLOT
      },
      open: { index: page, item: page, slot: BOOK_SLOT }
    },
    residence: [
      ...saved.residence,
      ...carried.map(instance => ({
        instance,
        residence: { kind: 'carried' as const, placementClass: 4 }
      }))
    ],
    script: {
      ...saved.script,
      carried: accepted ? [38] : [],
      flags: accepted ? 1 : 0,
      reward: accepted ? 0x10 : 0,
      triggers: saved.script.triggers.map(trigger =>
        trigger.index === CRYSTAL_PICKUP ||
        (accepted && trigger.index === FIRST_OFFER)
          ? { ...trigger, armed: false }
          : trigger
      )
    }
  };
  return new DamoclesSession(content, options.with?.(snapshot) ?? snapshot);
};

const armed = (session: DamoclesSession, index: number): boolean =>
  session.captureResume().script.triggers.find(item => item.index === index)
    ?.armed ?? false;

/// Advance in single frames, collecting each message as it begins, until `done` or `seconds`.
const play = (
  session: DamoclesSession,
  seconds: number,
  done: (session: DamoclesSession) => boolean = () => false
): string[] => {
  const shown: string[] = [];
  let last: string | null = session.snapshot.message?.id ?? null;
  for (let frame = 0; frame < seconds * 50; frame += 1) {
    session.advance(1 / 50);
    const id = session.snapshot.message?.id ?? null;
    if (id !== null && id !== last) {
      shown.push(id);
    }
    last = id;
    if (done(session)) {
      break;
    }
  }
  return shown;
};

/// Read the open page, and play until the page's body has presented and the action has run.
const readPage = (session: DamoclesSession): string[] => {
  expect(session.headCommand('read').kind).toBe('read');
  return play(
    session,
    6,
    s => s.snapshot.message?.id.startsWith('document') === false
  );
};

/// How far a rotation accumulator has moved, across its wrap.
const turned = (from: number, to: number) => (to - from) >>> 0;

/// The session carried on at `deadline - 2`, as the probe pokes the clock.
const nearZero = (session: DamoclesSession): DamoclesSession =>
  new DamoclesSession(content, {
    ...session.captureResume(),
    elapsed: content.doc.time.impactDeadlineSeconds - 2
  });

describe('BOOK page 5, SAVE BOTH ERIS AND DAMOCLES', () => {
  test('arms the drift at once, then Lloyds and the State President pay', () => {
    const session = reading(5);
    readPage(session);
    expect(session.snapshot.drift).toBe(WISH_DRIFT);
    expect(session.snapshot.drift).toBe(-4660);
    expect(session.snapshot.carried).toEqual([BOOK]);
    expect(session.snapshot.removedResidents).toContain(CRYSTAL);
    expect(armed(session, 60)).toBe(false);
    expect(session.snapshot.message?.id).toBe('script21-inline-1');
    expect(session.drainEffects()).toContainEqual({
      cue: 'spell',
      type: 'sound-request'
    });
    const shown = play(
      session,
      60,
      s =>
        s.snapshot.message === null &&
        s.captureResume().script.execution === null
    );
    expect(shown).toEqual([
      'system-string-50',
      'script60-inline-1',
      'script60-inline-2',
      'script60-inline-3',
      'script60-inline-4',
      'script60-inline-5',
      'system-string-50',
      'script16-inline-5',
      'script16-inline-6',
      'script16-inline-7',
      'system-string-50'
    ]);
    // 9,000, then Lloyds' 25 million, then the promised 10 million: `$7C42` = `0035 0090 0000`.
    expect(session.snapshot.balance).toBe(3_500_900_000);
    expect(cashReadout(session.snapshot.balance)).toBe('035,009,000.00');
    expect(session.drainEffects()).toContainEqual({
      cue: 'credit',
      type: 'sound-request'
    });
  });

  test('then at zero nothing is destroyed, the latch rises and no trigger fires', () => {
    const session = reading(5);
    readPage(session);
    play(session, 60, s => s.captureResume().script.execution === null);
    const later = nearZero(session);
    const shown = play(later, 8);
    const saved = later.captureResume();
    expect(saved.destroyedBodies).toEqual([]);
    expect(saved.impactPassed).toBe(true);
    expect(armed(later, IMPACT)).toBe(true);
    expect(shown).toEqual([]);
    expect(later.snapshot.screen.dead).toBe(false);
  });
});

describe('BOOK page 3, SAVE ERIS FROM DAMOCLES', () => {
  test('destroys DAMOCLES at once, then the State President pays the reward', () => {
    const session = reading(3);
    readPage(session);
    const saved = session.captureResume();
    expect(saved.destroyedBodies).toEqual(['body-29']);
    expect(saved.destroyedBodies).toHaveLength(1);
    expect(saved.drift).toBeNull();
    expect(armed(session, 23)).toBe(false);
    // The marker, not the dispatcher: `$12` stays armed.
    expect(armed(session, 18)).toBe(true);
    expect(session.snapshot.message?.id).toBe('script21-inline-1');
    const shown = play(
      session,
      40,
      s => s.captureResume().script.execution === null
    );
    expect(shown).toEqual([
      'system-string-50',
      'script23-inline-1',
      'script23-inline-2',
      'script23-inline-3',
      'script16-inline-7',
      'system-string-50'
    ]);
    expect(cashReadout(session.snapshot.balance)).toBe('010,009,000.00');
  });

  test('without the offer accepted, the President cannot understand', () => {
    const session = reading(3, { accepted: false });
    readPage(session);
    const shown = play(
      session,
      40,
      s => s.captureResume().script.execution === null
    );
    expect(shown.slice(-3)).toEqual([
      'script16-inline-10',
      'script16-inline-11',
      'system-string-50'
    ]);
    expect(session.snapshot.balance).toBe(NEW_GAME_BALANCE);
  });

  test('then at zero ERIS survives, the latch stays clear and nothing fires', () => {
    const session = reading(3);
    readPage(session);
    play(session, 40, s => s.captureResume().script.execution === null);
    const later = nearZero(session);
    const shown = play(later, 8);
    const saved = later.captureResume();
    expect(saved.destroyedBodies).toEqual(['body-29']);
    expect(saved.impactPassed).toBe(false);
    expect(armed(later, IMPACT)).toBe(true);
    expect(shown).toEqual([]);
  });
});

describe('the deferred Read and its guards', () => {
  test('a Read without the crystal only reads the page', () => {
    const session = reading(5, { crystal: false });
    readPage(session);
    play(session, 2);
    expect(session.snapshot.drift).toBeNull();
    expect(session.captureResume().script.wish).toBe(false);
    expect(armed(session, 60)).toBe(true);
  });

  test('the page action waits for the body, and a second Read is refused meanwhile', () => {
    const session = reading(5);
    expect(session.headCommand('read').kind).toBe('read');
    session.advance(1 / 50);
    expect(session.snapshot.message?.id).toBe(`document-${BOOK_SLOT}-5`);
    expect(session.captureResume().script.wish).toBe(true);
    expect(session.snapshot.drift).toBeNull();
    expect(session.headCommand('read').kind).toBe('ignored');
    // Two blocks: 200 frames, then 50 for the one character left.
    play(session, 4.9);
    expect(session.snapshot.drift).toBeNull();
    play(session, 0.2);
    expect(session.snapshot.drift).toBe(WISH_DRIFT);
  });

  test('a crystal dropped before the body ends buys nothing', () => {
    const session = reading(5);
    expect(session.headCommand('read').kind).toBe('read');
    session.advance(1 / 50);
    // Rotate the crystal to the head and put it down while the body presents.
    expect(session.rotateForward().kind).toBe('rotated');
    play(session, 0.5);
    expect(session.drop().kind).toBe('dropped');
    play(session, 6);
    expect(session.snapshot.drift).toBeNull();
    expect(session.captureResume().script.wish).toBe(false);
    expect(armed(session, 60)).toBe(true);
  });

  test('pages 3 and 5 keep the crystal once a Body is gone or the drift is armed', () => {
    const drifted = reading(3, {
      with: saved => ({ ...saved, drift: WISH_DRIFT })
    });
    readPage(drifted);
    expect(drifted.captureResume().destroyedBodies).toEqual([]);
    expect(drifted.snapshot.carried).toContain(CRYSTAL);
    expect(armed(drifted, 23)).toBe(true);
    const gone = reading(5, {
      with: saved => ({ ...saved, destroyedBodies: ['body-11'] })
    });
    readPage(gone);
    expect(gone.snapshot.drift).toBeNull();
    expect(gone.snapshot.carried).toContain(CRYSTAL);
    expect(armed(gone, 60)).toBe(true);
  });

  test('the TITLE has no action and keeps the crystal', () => {
    const session = reading(0);
    readPage(session);
    play(session, 1);
    expect(session.snapshot.carried).toEqual([BOOK, CRYSTAL]);
    expect(session.captureResume().script.wish).toBe(false);
    expect(ENDING_TRIGGERS.every(index => armed(session, index))).toBe(true);
  });
});

describe('the other pages', () => {
  test('page 1 gives the CHEESE SANDWICH at the head and takes the crystal first', () => {
    const session = reading(1);
    readPage(session);
    expect(session.snapshot.carried).toEqual([SANDWICH, BOOK]);
    expect(session.snapshot.removedResidents).toContain(CRYSTAL);
    expect(armed(session, 21)).toBe(false);
    expect(session.snapshot.message?.id).toBe('script21-inline-1');
    const cues = session
      .drainEffects()
      .filter(effect => effect.type === 'sound-request')
      .map(effect => effect.cue);
    expect(cues.slice(-2)).toEqual(['take', 'spell']);
  });

  test('page 2 pays a million credits after the grant line', () => {
    const session = reading(2);
    readPage(session);
    expect(armed(session, 22)).toBe(false);
    play(session, 6, s => s.captureResume().script.execution === null);
    expect(cashReadout(session.snapshot.balance)).toBe('001,009,000.00');
  });

  test('page 4 runs the clock four times slower, and a Save keeps the rate', () => {
    const session = reading(4);
    readPage(session);
    expect(session.captureResume().clockLevel).toBe(8);
    const before = session.snapshot.impact.seconds;
    // The second in progress keeps half its share of a second four times as long, so in eight
    // Session seconds exactly two clock seconds pass whatever the phase.
    session.advance(8);
    expect(session.snapshot.impact.seconds - before).toBe(2);
    const identity = damoclesSaveIdentity(
      content.catalogue,
      content.presentationSha256
    );
    const decoded = decodeDamoclesSave(
      encodeDamoclesSave({
        identity,
        savedAt: '2026-09-29T00:00:00.000Z',
        schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
        snapshot: session.captureResume(),
        where: 'GAEA'
      }),
      identity,
      { catalogue: content.catalogue, strings: content.strings }
    );
    expect(decoded.snapshot.clockLevel).toBe(8);
    const restored = new DamoclesSession(content, decoded.snapshot);
    const resumed = restored.snapshot.impact.seconds;
    restored.advance(4);
    expect(restored.snapshot.impact.seconds - resumed).toBe(1);
  });

  test('page 4 moves the Body a quarter as fast', () => {
    const quick = reading(0);
    const slow = reading(4);
    readPage(quick);
    readPage(slow);
    const quickStart = quick.snapshot.bodyTurn;
    const slowStart = slow.snapshot.bodyTurn;
    quick.advance(4);
    slow.advance(4);
    expect(turned(slowStart, slow.snapshot.bodyTurn)).toBeGreaterThan(0);
    expect(
      Math.abs(
        turned(quickStart, quick.snapshot.bodyTurn) / 4 -
          turned(slowStart, slow.snapshot.bodyTurn)
      )
    ).toBeLessThanOrEqual(200);
  });

  test('page 6 makes the universe more colourful', () => {
    const session = reading(6);
    readPage(session);
    expect(session.snapshot.screen.mask).toBe(COLOURFUL_MASK);
    expect(armed(session, 21)).toBe(false);
  });

  test("page 7 tells how to use the author's computer", () => {
    const session = reading(7);
    readPage(session);
    const shown = play(session, 10);
    expect(shown.slice(0, 2)).toEqual([
      'system-string-50',
      'script24-inline-1'
    ]);
  });

  test('page 8 refuses a miracle with the bump and still takes the crystal', () => {
    const session = reading(8);
    readPage(session);
    expect(session.snapshot.message?.id).toBe('script25-inline-1');
    expect(session.snapshot.carried).toEqual([BOOK]);
    const cues = session
      .drainEffects()
      .filter(effect => effect.type === 'sound-request')
      .map(effect => effect.cue);
    expect(cues).toContain('bump');
    expect(cues).not.toContain('spell');
  });
});

describe('the wish Save', () => {
  test('a schema-21 record migrates with 9,000 credits, level 6 and the endings armed', () => {
    const identity = damoclesSaveIdentity(
      content.catalogue,
      content.presentationSha256
    );
    const snapshot = new DamoclesSession(content).captureResume();
    const old = {
      identity,
      savedAt: '2026-09-29T00:00:00.000Z',
      schemaVersion: 21,
      snapshot: {
        ...snapshot,
        clockAnchor: undefined,
        clockLevel: undefined,
        paletteMask: undefined,
        script: {
          ...snapshot.script,
          balance: undefined,
          triggers: snapshot.script.triggers.filter(
            item => !OLDER_ENDINGS.includes(item.index)
          ),
          wish: undefined
        }
      },
      where: 'ERIS'
    };
    const migrated = decodeDamoclesSave(JSON.stringify(old), identity, {
      catalogue: content.catalogue
    });
    expect(migrated.snapshot.clockLevel).toBe(6);
    expect(migrated.snapshot.clockAnchor).toBeNull();
    expect(migrated.snapshot.paletteMask).toBe(0);
    expect(migrated.snapshot.script.balance).toBe(NEW_GAME_BALANCE);
    expect(migrated.snapshot.script.wish).toBe(false);
    expect(
      ENDING_TRIGGERS.every(
        index =>
          migrated.snapshot.script.triggers.find(item => item.index === index)
            ?.armed
      )
    ).toBe(true);
  });

  test('a schema-21 record waiting in `$0F` resumes past the wait it lacked', () => {
    const identity = damoclesSaveIdentity(
      content.catalogue,
      content.presentationSha256
    );
    const session = reading(0, {
      with: saved => ({
        ...saved,
        elapsed: content.doc.time.impactDeadlineSeconds - 1
      })
    });
    // Past zero and the 150-frame wait, into the first line.
    session.advance(5);
    const saved = session.captureResume();
    expect(saved.script.execution?.script).toBe('damocles.script.slot-15');
    const current = saved.script.execution!;
    const old = {
      identity,
      savedAt: '2026-09-29T00:00:00.000Z',
      schemaVersion: 21,
      snapshot: {
        ...saved,
        clockAnchor: undefined,
        clockLevel: undefined,
        paletteMask: undefined,
        script: {
          ...saved.script,
          balance: undefined,
          execution: { ...current, revision: 1, step: current.step - 2 },
          triggers: saved.script.triggers.filter(
            item => !OLDER_ENDINGS.includes(item.index)
          ),
          wish: undefined
        }
      },
      where: 'GAEA'
    };
    const migrated = decodeDamoclesSave(JSON.stringify(old), identity, {
      catalogue: content.catalogue,
      strings: content.strings
    });
    expect(migrated.snapshot.script.execution).toEqual(current);
  });
});
