import { beforeAll, describe, expect, test } from 'bun:test';

import type { AssembledCatalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { stMakeCode } from '../src/damocles/keys.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  decodeDamoclesSave,
  encodeDamoclesSave,
  type DamoclesSaveSnapshot
} from '../src/damocles/save.ts';
import {
  fireTrigger,
  initialScriptState,
  latchKey,
  runFrame,
  type Effect,
  type ScriptRules,
  type ScriptState
} from '../src/damocles/script.ts';
import {
  ANSWER_FRAMES,
  ANSWER_KEYS,
  ENDING_TRIGGERS,
  FOURTH_OFFER_BELOW,
  NO_KEY,
  OFFER_ACCEPTED_FLAG,
  OFFER_KEY_SLOT,
  SCRIPTS
} from '../src/damocles/scripts.ts';
import { structureRegionAt } from '../src/damocles/selection.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { cellOf, erisSurfaceFrom } from '../src/damocles/world.ts';
import { intent } from '../src/gameCore/index.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// Location trigger 4, script slot `$04` at `$070650` (#612): the first work offer on Floor 2 of
/// the Eris STATE OFFICE, and its bargaining ladder (docs/research/damocles-first-offer.md,
/// docs/research/damocles-location-triggers.md).

const FIRST_OFFER = 'damocles.script.slot-4';
const PROMPTS = [
  'script4-inline-9',
  'script4-inline-10',
  'script4-inline-12',
  'script4-inline-13'
] as const;
const REWARDS = [0x10, 0x15, 0x20, 0x25] as const;
const ACCEPTED_LINES = [
  'script4-inline-15',
  'script4-inline-16',
  'system-string-50',
  'script4-inline-17',
  'script4-inline-18',
  'script4-inline-19',
  'system-string-50',
  'script4-inline-20'
];

/// Rules whose noise table holds `word` everywhere, so the draw after the third rung goes one
/// way.
const rules = (word = 0xff_ff): ScriptRules => ({
  messageFrames: 200,
  messageText: id =>
    id === 'system-string-50' ? ' '.repeat(48) : id.padEnd(48).slice(0, 48),
  noise: new Uint16Array(0x8_00).fill(word),
  waitFrames: 200
});

interface Run {
  readonly cues: readonly Effect[];
  readonly seen: readonly { readonly frame: number; readonly id: string }[];
  readonly state: ScriptState;
}

/// Run `frames` VBLs, recording each message as it begins and every sound request.
const run = (
  initial: ScriptState,
  frames: number,
  withRules = rules(),
  stop: (state: ScriptState) => boolean = () => false
): Run => {
  const seen: { frame: number; id: string }[] = [];
  const cues: Effect[] = [];
  let state = initial;
  let previous = initial.message?.id ?? null;
  for (let frame = 1; frame <= frames; frame += 1) {
    const transition = runFrame(state, withRules);
    state = transition.state;
    cues.push(
      ...transition.effects.filter(effect => effect.type === 'sound-request')
    );
    const id = state.message?.id ?? null;
    if (id !== null && id !== previous) {
      seen.push({ frame, id });
    }
    previous = id;
    if (stop(state)) {
      break;
    }
  }
  return { cues, seen, state };
};

const offered = (withRules = rules()): ScriptState =>
  fireTrigger(initialScriptState(), 4, withRules).state;

/// Whether the script is polling a prompt: its question has presented, and it waits on the keys.
const polling = (state: ScriptState): boolean =>
  state.message === null &&
  state.execution?.script === FIRST_OFFER &&
  SCRIPTS[FIRST_OFFER].ops[state.execution.step]?.kind === 'if-key';

/// Run to the `rung`th prompt's poll (0 is the first offer's), declining each rung before it.
const atPrompt = (rung: number, withRules = rules()): ScriptState => {
  let state = run(offered(withRules), 4000, withRules, polling).state;
  for (let step = 0; step < rung; step += 1) {
    state = latchKey(state, ANSWER_KEYS.n);
    state = run(state, 1000, withRules, polling).state;
  }
  expect(polling(state)).toBeTrue();
  expect(state.reward).toBe(REWARDS[rung]!);
  return state;
};

describe('the briefing', () => {
  test('eight lines in three runs, then the first offer asked with the latch cleared', () => {
    // A key latched before the trigger fires is cleared before the question.
    const start = latchKey(initialScriptState(), ANSWER_KEYS.y);
    const fired = fireTrigger(start, 4, rules()).state;
    expect(fired.execution?.script).toBe(FIRST_OFFER);
    expect(fired.message?.id).toBe('script4-inline-1');
    expect(fired.triggers.find(item => item.index === 4)).toMatchObject({
      armed: false,
      queueable: true
    });
    const { seen, state } = run(fired, 4000, rules(), polling);
    expect(seen.map(({ frame, id }) => [frame, id])).toEqual([
      [200, 'script4-inline-2'],
      [400, 'script4-inline-3'],
      [600, 'script4-inline-4'],
      [800, 'system-string-50'],
      [850, 'script4-inline-5'],
      [1050, 'script4-inline-6'],
      [1250, 'system-string-50'],
      [1300, 'script4-inline-7'],
      [1500, 'script4-inline-8'],
      [1700, 'script4-inline-9']
    ]);
    expect(state).toMatchObject({ counter: 0, key: NO_KEY, reward: 0x10 });
    // The question held its 200 frames before the poll began.
    expect(state.display.kind).toBe('held');
  });

  test('the reward is written and the latch cleared before the question presents', () => {
    const state = run(
      latchKey(offered(), ANSWER_KEYS.y),
      4000,
      rules(),
      next => next.message?.id === 'script4-inline-9'
    ).state;
    expect(state).toMatchObject({ key: NO_KEY, reward: 0x10 });
  });
});

describe('each prompt', () => {
  for (const rung of PROMPTS.keys()) {
    describe(`the ${REWARDS[rung]!.toString(16)} million offer`, () => {
      test('Y or O accepts, asking for the key effect, and leaves the latch', () => {
        for (const key of [ANSWER_KEYS.y, ANSWER_KEYS.o]) {
          const { cues, seen, state } = run(latchKey(atPrompt(rung), key), 1);
          expect(cues).toEqual([{ cue: 'answer', type: 'sound-request' }]);
          expect(seen).toEqual([{ frame: 1, id: 'script4-inline-15' }]);
          expect(state).toMatchObject({
            carried: [OFFER_KEY_SLOT],
            flags: OFFER_ACCEPTED_FLAG,
            key,
            reward: REWARDS[rung]
          });
        }
      });

      test('N declines, asking for the key effect, and climbs a rung', () => {
        const { cues, seen, state } = run(
          latchKey(atPrompt(rung), ANSWER_KEYS.n),
          1
        );
        expect(cues).toEqual([{ cue: 'answer', type: 'sound-request' }]);
        expect(state.flags).toBe(0);
        expect(seen[0]?.id).toBe(
          rung === PROMPTS.length - 1
            ? 'script4-inline-14'
            : rung === 1
              ? 'script4-inline-11'
              : PROMPTS[rung + 1]
        );
      });

      test('with no key it times out at 500 ticks, with no key effect', () => {
        const start = atPrompt(rung);
        const other = latchKey(start, stMakeCode('KeyX')!);
        const waited = run(other, ANSWER_FRAMES - 1);
        expect(polling(waited.state)).toBeTrue();
        expect(waited.state.counter).toBe(ANSWER_FRAMES - 1);
        const timedOut = run(waited.state, 1);
        expect(polling(timedOut.state)).toBeFalse();
        expect([...waited.cues, ...timedOut.cues]).toEqual([]);
        expect(timedOut.seen[0]?.id).toBe(
          rung === PROMPTS.length - 1
            ? 'script4-inline-14'
            : rung === 1
              ? 'script4-inline-11'
              : PROMPTS[rung + 1]
        );
      });
    });
  }

  test('a key latched while the question presents answers it once the poll begins', () => {
    const asking = run(
      offered(),
      4000,
      rules(),
      state => state.message?.id === 'script4-inline-9'
    ).state;
    const latched = latchKey(asking, ANSWER_KEYS.o);
    const { seen, state } = run(latched, 200);
    // The question holds its 200 frames, then the first poll accepts.
    expect(seen).toEqual([{ frame: 200, id: 'script4-inline-15' }]);
    expect(state.flags).toBe(OFFER_ACCEPTED_FLAG);
  });

  test('after the third rung a word below $4000 skips the fourth offer', () => {
    const below = rules(FOURTH_OFFER_BELOW - 1);
    const declined = latchKey(atPrompt(2, below), ANSWER_KEYS.n);
    const { seen, state } = run(declined, 1, below);
    expect(seen).toEqual([{ frame: 1, id: 'script4-inline-14' }]);
    expect(state.reward).toBe(0);

    const at = rules(FOURTH_OFFER_BELOW);
    expect(run(latchKey(atPrompt(2, at), ANSWER_KEYS.n), 1, at).seen).toEqual([
      { frame: 1, id: 'script4-inline-13' }
    ]);
  });
});

describe('the endings', () => {
  test('the refusal zeroes the reward and ends on the shared epilogue', () => {
    const refused = run(latchKey(atPrompt(3), ANSWER_KEYS.n), 1000);
    expect(refused.seen.map(({ id }) => id)).toEqual([
      'script4-inline-14',
      'system-string-50'
    ]);
    expect(refused.state).toMatchObject({
      busy: false,
      carried: [],
      execution: null,
      flags: 0,
      reward: 0
    });
  });

  test('acceptance sets bit 0 and DOOR KEY A’s flag, presents six lines and holds the last', () => {
    const accepted = run(latchKey(atPrompt(0), ANSWER_KEYS.y), 2000);
    expect(accepted.seen.map(({ id }) => id)).toEqual(ACCEPTED_LINES);
    // 200 + 200 + 50 + 200 + 200 + 100 + 200 + 50: the delay comes after the fourth line.
    expect(accepted.seen.map(({ frame }) => frame)).toEqual([
      1, 201, 401, 451, 651, 951, 1151, 1201
    ]);
    expect(accepted.state).toMatchObject({
      busy: false,
      carried: [OFFER_KEY_SLOT],
      execution: null,
      flags: OFFER_ACCEPTED_FLAG,
      reward: 0x10
    });
    expect(accepted.state.display.kind).toBe('held');
  });

  test('queues behind the State President and launches once he clears busy', () => {
    const welcoming = fireTrigger(initialScriptState(), 3, rules()).state;
    const queued = fireTrigger(welcoming, 4, rules()).state;
    expect(queued.pending).toBe(4);
    expect(queued.triggers.find(item => item.index === 4)?.armed).toBeTrue();
    const { seen } = run(queued, 1300);
    expect(seen.at(-1)).toEqual({ frame: 1250, id: 'script4-inline-1' });
  });
});

let catalogue: AssembledCatalogue;
let content: DamoclesContent;

beforeAll(async () => {
  catalogue = await loadCatalogue();
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

const STATE_OFFICE = 'eris-surface-89';
const VBL = 1 / 50;
/// Facing local +X, east, towards door 6.
const EAST = Math.PI / 2;

/// A session on Floor 2 of the State Office in region 1 at local (200, −335), facing door 6 and
/// walking, as the `offer` case placed the eye. The welcome is spent, as it is by then.
const beforeTheOffer = (): DamoclesSession => {
  const ground = new DamoclesSession(content);
  const placement = content.surface.placements.find(
    item => item.id === STATE_OFFICE
  )!;
  const cell = cellOf(placement.position, content.surface.grid);
  ground.teleportToCell(cell.x, cell.z);
  expect(ground.changeFloor(2)).toEqual({ kind: 'moved' });
  const resume = ground.captureResume();
  const bound = ground.snapshot.surface.placements.find(
    item => item.id === STATE_OFFICE
  )!;
  const pose = {
    ...resume.pose,
    heading: EAST,
    position: {
      ...resume.pose.position,
      x: bound.position.x + 200,
      z: bound.position.z - 335
    }
  };
  const session = new DamoclesSession(content, {
    ...resume,
    pose,
    script: {
      ...resume.script,
      triggers: resume.script.triggers.map(item =>
        item.index === 3 ? { ...item, armed: false } : item
      )
    },
    structure: {
      ...resume.structure!,
      regionIndex: structureRegionAt(bound, pose, false)
    }
  });
  expect(session.snapshot.structure?.regionIndex).toBe(0);
  session.intent = intent({ walk: 1 });
  return session;
};

/// Advance until `until` holds, one VBL at a time.
const advanceUntil = (
  session: DamoclesSession,
  until: () => boolean,
  limit = 4000
): number => {
  for (let vbl = 1; vbl <= limit; vbl += 1) {
    session.advance(VBL);
    if (until()) {
      return vbl;
    }
  }
  throw new Error('the session never got there');
};

const scriptOf = (session: DamoclesSession) => session.captureResume().script;

/// Walk into region 7 and stand, then wait for the first offer's poll.
const offeredInPlay = (): DamoclesSession => {
  const session = beforeTheOffer();
  advanceUntil(session, () => session.snapshot.message !== null, 400);
  session.intent = intent({});
  advanceUntil(session, () => {
    const script = scriptOf(session);
    return (
      script.message === null &&
      script.execution?.script === FIRST_OFFER &&
      SCRIPTS[FIRST_OFFER].ops[script.execution.step]?.kind === 'if-key'
    );
  });
  return session;
};

const identity = () => damoclesSaveIdentity(catalogue, 'test');

const encoded = (snapshot: DamoclesSaveSnapshot, schemaVersion?: number) => {
  const text = encodeDamoclesSave({
    identity: identity(),
    savedAt: '2026-09-29T00:00:00.000Z',
    schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
    snapshot,
    where: 'ERIS 09-08'
  });
  return schemaVersion === undefined
    ? text
    : JSON.stringify({ ...JSON.parse(text), schemaVersion });
};

const decode = (text: string): DamoclesSaveSnapshot =>
  decodeDamoclesSave(text, identity(), {
    catalogue,
    poses: content.poses,
    strings: content.strings
  }).snapshot;

const roundTrip = (session: DamoclesSession): DamoclesSaveSnapshot =>
  decode(encoded(session.captureResume()));

describe('reaching region 7 on Floor 2 (#612)', () => {
  test('presents the offer on the pass the eye enters the room, once', () => {
    const session = beforeTheOffer();
    advanceUntil(
      session,
      () => session.snapshot.structure?.regionIndex === 6,
      400
    );
    expect(session.snapshot.message?.id).toBe('script4-inline-1');
    expect(scriptOf(session).triggers.find(item => item.index === 4)).toEqual({
      armed: false,
      index: 4
    });
  });

  test('Y from play accepts, flags DOOR KEY A carried, and the Save keeps it', () => {
    const session = offeredInPlay();
    expect(session.carriesSlot(OFFER_KEY_SLOT)).toBeFalse();
    session.keyMake(stMakeCode('KeyY')!);
    session.advance(VBL);
    expect(session.snapshot.message?.id).toBe('script4-inline-15');
    expect(session.drainEffects()).toContainEqual({
      cue: 'answer',
      type: 'sound-request'
    });
    expect(session.carriesSlot(OFFER_KEY_SLOT)).toBeTrue();
    // Nothing is put on the Carried Stack.
    expect(session.snapshot.carried).not.toContain(
      `object-slot-${OFFER_KEY_SLOT}`
    );
    const restored = new DamoclesSession(content, roundTrip(session));
    expect(restored.captureResume().script).toMatchObject({
      carried: [OFFER_KEY_SLOT],
      flags: OFFER_ACCEPTED_FLAG,
      reward: 0x10
    });
    expect(restored.carriesSlot(OFFER_KEY_SLOT)).toBeTrue();
  });

  test('N from play climbs to fifteen million', () => {
    const session = offeredInPlay();
    session.keyMake(stMakeCode('KeyN')!);
    session.advance(VBL);
    expect(session.snapshot.message?.id).toBe('script4-inline-10');
    expect(scriptOf(session).reward).toBe(0x15);
  });

  test('a Save at the prompt resumes polling it without asking again', () => {
    const session = offeredInPlay();
    for (let vbl = 0; vbl < 123; vbl += 1) {
      session.advance(VBL);
    }
    const saved = roundTrip(session);
    expect(saved.script.execution?.script).toBe(FIRST_OFFER);
    expect(saved.script.counter).toBe(scriptOf(session).counter);
    const resumed = new DamoclesSession(content, saved);
    // The same future from here: no message, then the timeout's next offer on the same VBL.
    const next = (item: DamoclesSession) =>
      advanceUntil(item, () => item.snapshot.message !== null, 600);
    const uninterrupted = next(session);
    expect(next(resumed)).toBe(uninterrupted);
    expect(resumed.snapshot.message?.id).toBe('script4-inline-10');
    expect(resumed.captureResume()).toEqual(session.captureResume());
  });

  test('a Save while the question presents resumes it, and a key latched then still answers', () => {
    const session = beforeTheOffer();
    advanceUntil(
      session,
      () => session.snapshot.message?.id === 'script4-inline-9',
      4000
    );
    session.keyMake(ANSWER_KEYS.y);
    const resumed = new DamoclesSession(content, roundTrip(session));
    expect(resumed.captureResume().script.key).toBe(ANSWER_KEYS.y);
    const vbl = advanceUntil(
      resumed,
      () => resumed.snapshot.message?.id === 'script4-inline-15',
      400
    );
    // The question holds its 200 frames and is not asked again.
    expect(vbl).toBe(200);
  });
});

describe('the Save', () => {
  test('a schema-19 record migrates with trigger 4 armed, and a current one must carry it', () => {
    const snapshot = beforeTheOffer().captureResume();
    const {
      carried: _carried,
      key: _key,
      reward: _reward,
      ...older
    } = snapshot.script;
    const withoutOffer = snapshot.script.triggers.filter(
      item =>
        item.index !== 4 &&
        item.index !== 15 &&
        !ENDING_TRIGGERS.includes(item.index)
    );
    const record = (schemaVersion: number, triggers: unknown) =>
      encoded(
        {
          ...snapshot,
          script: { ...older, triggers } as never
        },
        schemaVersion
      );
    expect(decode(record(19, withoutOffer)).script).toEqual(snapshot.script);
    expect(() =>
      decode(record(DAMOCLES_SAVE_SCHEMA_VERSION, withoutOffer))
    ).toThrow('script trigger table is incomplete or duplicated');
  });

  test('refuses offer state no play reaches', () => {
    const snapshot = beforeTheOffer().captureResume();
    const refused = (script: object, message: string) =>
      expect(() =>
        decode(
          encoded({
            ...snapshot,
            script: { ...snapshot.script, ...script }
          } as DamoclesSaveSnapshot)
        )
      ).toThrow(message);
    refused(
      { flags: OFFER_ACCEPTED_FLAG },
      'the first offer is armed but has already been made'
    );
    refused(
      { reward: 0x10 },
      'the first offer is armed but has already been made'
    );
    refused(
      { reward: 0x30 },
      'snapshot.script.reward is no offer the first offer makes'
    );
    refused(
      { carried: [39] },
      'snapshot.script.carried names a flag no ported script sets'
    );
    const spent = snapshot.script.triggers.map(item =>
      item.index === 4 ? { ...item, armed: false } : item
    );
    refused(
      { carried: [OFFER_KEY_SLOT], triggers: spent },
      'DOOR KEY A is flagged carried but the offer was never accepted'
    );
    refused({ key: 0x1_00 }, 'snapshot.script.key');
  });
});

describe('the ST make codes', () => {
  test('Y, O and N are the codes the prompts compare', () => {
    expect(stMakeCode('KeyY')).toBe(ANSWER_KEYS.y);
    expect(stMakeCode('KeyO')).toBe(ANSWER_KEYS.o);
    expect(stMakeCode('KeyN')).toBe(ANSWER_KEYS.n);
    expect(stMakeCode('Digit1')).toBe(0x02);
    expect(stMakeCode('Space')).toBe(0x39);
    expect(stMakeCode('KeyM')).toBe(0x32);
    expect(stMakeCode('Escape')).toBeUndefined();
  });
});
