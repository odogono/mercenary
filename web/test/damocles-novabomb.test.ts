import { beforeAll, describe, expect, test } from 'bun:test';

import { readErisPresentation } from '../src/damocles/documents.ts';
import { TRANSITION_VBLS } from '../src/damocles/headCommands.ts';
import { centreBoxView } from '../src/damocles/panel.ts';
import type { Residence } from '../src/damocles/residence.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  decodeDamoclesSave,
  encodeDamoclesSave,
  type DamoclesSaveSnapshot
} from '../src/damocles/save.ts';
import { DESTRUCTION_TRIGGERS } from '../src/damocles/scripts.ts';
import {
  DamoclesSession,
  ICARUS_SECONDS_LEFT,
  NOVABOMB,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// The NOVABOMB and the body-destruction dispatcher `$04C8D2` (#627), against the #626 live
/// runs (docs/research/damocles-endgame.md): the four disguised detonators, a placed and a
/// carried bomb, and every dispatcher branch with its guards.

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

const SIDEBOARD = 84;
const DETONATORS = [84, 85, 86, 87].map(slot => `object-slot-${slot}`);
const AUTHORS_COMPUTER = 'object-slot-101';
const FIRST_OFFER = 4;
const ICARUS = 'body-1';
const DION = 'body-4';
const GAEA = 'body-8';
const ERIS = 'body-11';
const DAMOCLES = 'body-29';

const carried = (instance: string) => ({
  instance,
  residence: { kind: 'carried' as const, placementClass: 4 }
});

/// The NOVABOMB placed on `body`, as a drop would leave it on the surface.
const bombOn = (body: string): { instance: string; residence: Residence } => ({
  instance: NOVABOMB,
  residence: {
    body,
    kind: 'surface',
    placementClass: 1,
    position: { x: 0, y: 0, z: 0 }
  }
});

interface Setup {
  readonly accepted?: boolean;
  /// Seconds before zero on the impact clock; the handover's by default.
  readonly before?: number;
  readonly carried?: readonly string[];
  readonly destroyed?: readonly string[];
  readonly drift?: number | null;
  /// The SIDEBOARD's panel open and at rest.
  readonly open?: boolean;
  readonly pose?: string;
  readonly residence?: readonly { instance: string; residence: Residence }[];
  readonly switches?: number;
}

/// A player at `pose` (ERIS's spaceport by default) with a Save's worth of endgame state.
const session = (setup: Setup = {}): DamoclesSession => {
  const first = new DamoclesSession(content);
  if (setup.pose !== undefined) {
    expect(first.switchToPose(setup.pose).kind).toBe('switched');
  }
  const saved = first.captureResume();
  const held = setup.carried ?? [];
  const accepted = setup.accepted ?? false;
  const snapshot: DamoclesSaveSnapshot = {
    ...saved,
    carried: held,
    destroyedBodies: setup.destroyed ?? [],
    drift: setup.drift ?? null,
    elapsed:
      setup.before === undefined
        ? saved.elapsed
        : content.doc.time.impactDeadlineSeconds - setup.before + 0.5,
    headCommands:
      setup.open === true
        ? {
            ...saved.headCommands,
            box: { from: SIDEBOARD, fromItem: null, steps: 0, to: SIDEBOARD },
            open: { index: 0, item: 0, slot: SIDEBOARD }
          }
        : saved.headCommands,
    residence: [
      ...saved.residence,
      ...held.map(carried),
      ...(setup.residence ?? [])
    ],
    script: {
      ...saved.script,
      carried: accepted ? [38] : [],
      flags: accepted ? 1 : 0,
      reward: accepted ? 0x10 : 0,
      triggers: saved.script.triggers.map(trigger =>
        accepted && trigger.index === FIRST_OFFER
          ? { ...trigger, armed: false }
          : trigger
      )
    },
    switches: setup.switches ?? 0
  };
  return new DamoclesSession(content, snapshot);
};

/// Three detonators on and the SIDEBOARD open, so one `+` sets the fourth.
const primed = (setup: Setup = {}): DamoclesSession =>
  session({
    open: true,
    switches: 0x70,
    ...setup,
    carried: [`object-slot-${SIDEBOARD}`, ...(setup.carried ?? [])]
  });

const armed = (s: DamoclesSession, index: number): boolean =>
  s.captureResume().script.triggers.find(item => item.index === index)?.armed ??
  false;

const vbls = (s: DamoclesSession, count: number) => {
  for (let vbl = 0; vbl < count; vbl += 1) {
    s.advance(1 / 50);
  }
};

/// Advance in single frames, collecting each message as it begins.
const play = (s: DamoclesSession, seconds: number): string[] => {
  const shown: string[] = [];
  let last: string | null = s.snapshot.message?.id ?? null;
  for (let frame = 0; frame < seconds * 50; frame += 1) {
    s.advance(1 / 50);
    const id = s.snapshot.message?.id ?? null;
    if (id !== null && id !== last) {
      shown.push(id);
    }
    last = id;
  }
  return shown;
};

const cues = (s: DamoclesSession): string[] =>
  s
    .drainEffects()
    .flatMap(effect => (effect.type === 'sound-request' ? [effect.cue] : []));

describe('the NOVA TRIGGER switches', () => {
  test('each detonator opens its panel, and + and - set and clear its bit of $7872', () => {
    const s = session({ carried: DETONATORS });
    const opened = (): void => {
      expect(s.headCommand('open').kind).toBe('opened');
      vbls(s, TRANSITION_VBLS);
    };
    opened();
    expect(centreBoxView(s.snapshot.centreBox).panel).toMatchObject({
      field: '#eeaaaa',
      ground: '#cc0000',
      item: 'OFF',
      kind: 'switch',
      title: 'NOVA TRIGGER 1'
    });
    cues(s);
    expect(s.headCommand('next').kind).toBe('switched');
    expect(s.snapshot.switches).toBe(0x08);
    expect(centreBoxView(s.snapshot.centreBox).panel?.item).toBe('ON');
    expect(cues(s)).toEqual(['throttle']);
    // `bset` finds the bit set: nothing happens, not even the click.
    expect(s.headCommand('next').kind).toBe('ignored');
    expect(cues(s)).toEqual([]);
    // `*` means nothing to a switch.
    expect(s.headCommand('read').kind).toBe('ignored');
    // The panel, not the head, takes the keys.
    s.rotateForward();
    expect(s.headCommand('previous').kind).toBe('switched');
    expect(s.snapshot.switches).toBe(0);
    expect(s.headCommand('next').kind).toBe('switched');
    for (const [title, bits] of [
      ['NOVA TRIGGER 2', 0x18],
      ['NOVA TRIGGER 3', 0x38]
    ] as const) {
      opened();
      expect(centreBoxView(s.snapshot.centreBox).panel?.title).toBe(title);
      s.headCommand('next');
      expect(s.snapshot.switches).toBe(bits);
      s.rotateForward();
    }
  });

  test('keys wait for the panel to scroll in', () => {
    const s = session({ carried: DETONATORS });
    s.headCommand('open');
    vbls(s, TRANSITION_VBLS - 1);
    expect(s.headCommand('next').kind).toBe('ignored');
    vbls(s, 1);
    expect(s.headCommand('next').kind).toBe('switched');
  });

  test('a bit outlives its switch: dropping it closes the panel and leaves the bit set', () => {
    const s = session({ carried: [DETONATORS[1]!], pose: 'dion-2-3' });
    s.headCommand('open');
    vbls(s, TRANSITION_VBLS);
    s.headCommand('next');
    expect(s.drop().kind).toBe('dropped');
    expect(s.snapshot.headCommands.open).toBeNull();
    expect(s.snapshot.switches).toBe(0x10);
  });

  test('the fourth switch with the bomb where it starts destroys GAEA and fires $0E', () => {
    const s = session({ carried: DETONATORS });
    for (let index = 0; index < 4; index += 1) {
      s.headCommand('open');
      vbls(s, TRANSITION_VBLS);
      s.headCommand('next');
      s.rotateForward();
    }
    const saved = s.captureResume();
    expect(saved.switches).toBe(0x78);
    expect(saved.destroyedBodies).toEqual([GAEA]);
    expect(saved.removedResidents).toContain(NOVABOMB);
    expect(saved.debrisPasses).toBe(64);
    expect(armed(s, 0x0e)).toBe(false);
    // `$0E`'s 250-frame wait, then the report and the shared epilogue.
    expect(play(s, 25)).toEqual([
      'script14-inline-1',
      'script14-inline-2',
      'script14-inline-3',
      'script14-inline-4',
      'system-string-50'
    ]);
    expect(s.snapshot.screen.dead).toBe(false);
  });
});

describe('detonating the NOVABOMB', () => {
  test('placed on DAMOCLES, it saves ERIS: $12 and the promised reward', () => {
    const s = primed({ accepted: true, residence: [bombOn(DAMOCLES)] });
    s.headCommand('next');
    expect(s.snapshot.destroyedBodies).toEqual([DAMOCLES]);
    expect(s.snapshot.removedResidents).toContain(NOVABOMB);
    expect(armed(s, 0x12)).toBe(false);
    expect(play(s, 30)).toEqual([
      'script16-inline-5',
      'script16-inline-6',
      'script16-inline-7',
      'system-string-50'
    ]);
    // 9,000 and the promised 10 million.
    expect(s.snapshot.balance).toBe(1_000_900_000);
    // DAMOCLES is gone, so zero on the clock destroys nothing and ERIS stands.
    const after = new DamoclesSession(content, {
      ...s.captureResume(),
      elapsed: content.doc.time.impactDeadlineSeconds + 5
    });
    after.advance(1);
    expect(after.snapshot.destroyedBodies).toEqual([DAMOCLES]);
    expect(after.snapshot.impactPassed).toBe(false);
  });

  test('on DIALIS it reads as no bomb and never goes off', () => {
    const s = primed({ residence: [bombOn('body-0')] });
    expect(s.headCommand('next').kind).toBe('switched');
    expect(s.snapshot.switches).toBe(0x78);
    expect(s.snapshot.destroyedBodies).toEqual([]);
    expect(s.snapshot.removedResidents).not.toContain(NOVABOMB);
  });

  test('carried on ERIS, it destroys ERIS and kills the player with $23', () => {
    const s = primed({ carried: [NOVABOMB] });
    cues(s);
    s.headCommand('next');
    const saved = s.captureResume();
    expect(saved.destroyedBodies).toEqual([ERIS]);
    expect(saved.carried).toEqual([`object-slot-${SIDEBOARD}`]);
    expect(saved.removedResidents).toContain(NOVABOMB);
    expect(saved.encounter?.dead).toBe(true);
    // The marker asks for `$23` first, so `$22` finds the request taken.
    expect(s.snapshot.message?.id).toBe('system-string-35');
    expect(cues(s)).toContain('blown-up');
    // The death loop holds `$13` before it presents anything.
    expect(armed(s, 0x13)).toBe(true);
    expect(saved.debrisPasses).toBe(0);
  });

  test('the bomb explodes from anywhere: placed on GAEA while the player stands on ERIS', () => {
    const s = primed({ residence: [bombOn(GAEA)] });
    s.headCommand('next');
    expect(s.snapshot.destroyedBodies).toEqual([GAEA]);
    expect(s.snapshot.screen.dead).toBe(false);
  });

  test('a second detonation finds no bomb', () => {
    const s = primed({ residence: [bombOn(GAEA)] });
    s.headCommand('next');
    s.headCommand('previous');
    s.headCommand('next');
    expect(s.snapshot.destroyedBodies).toEqual([GAEA]);
  });
});

describe('the body-destruction dispatcher $04C8D2', () => {
  test('ICARUS with at least 5,990 s left arms the drift from the clock and fires $10', () => {
    const s = session({ accepted: true, before: ICARUS_SECONDS_LEFT });
    expect(s.snapshot.impact.seconds).toBe(-ICARUS_SECONDS_LEFT);
    s.dispatchDestruction(ICARUS);
    expect(s.snapshot.destroyedBodies).toEqual([ICARUS]);
    expect(s.snapshot.drift).toBe(-ICARUS_SECONDS_LEFT);
    expect(armed(s, 0x10)).toBe(false);
    expect(armed(s, 0x11)).toBe(true);
    expect(play(s, 40)).toEqual([
      'script16-inline-1',
      'script16-inline-2',
      'script16-inline-3',
      'script16-inline-4',
      'system-string-50',
      'script16-inline-5',
      'script16-inline-6',
      'script16-inline-7',
      'system-string-50'
    ]);
    // Lloyds' 25 million and the promised 10.
    expect(s.snapshot.balance).toBe(3_500_900_000);
  });

  test('ICARUS a second later is too late: $11, and no drift', () => {
    const s = session({ accepted: true, before: ICARUS_SECONDS_LEFT - 1 });
    s.dispatchDestruction(ICARUS);
    expect(s.snapshot.drift).toBeNull();
    expect(armed(s, 0x10)).toBe(true);
    expect(armed(s, 0x11)).toBe(false);
    expect(play(s, 15)).toEqual([
      'script17-inline-1',
      'script17-inline-2',
      'system-string-50'
    ]);
  });

  test('$11 says nothing to a player who never accepted the offer', () => {
    const s = session({ before: 100 });
    s.dispatchDestruction(ICARUS);
    expect(armed(s, 0x11)).toBe(false);
    expect(play(s, 10)).toEqual([]);
  });

  test('ICARUS in time with ERIS gone arms the drift and fires nothing', () => {
    const s = session({
      before: 7000,
      destroyed: [ERIS],
      pose: 'gaea-ur-city-4-2'
    });
    s.dispatchDestruction(ICARUS);
    expect(s.snapshot.drift).toBe(-7000);
    expect(armed(s, 0x10)).toBe(true);
  });

  test('ICARUS with DAMOCLES gone or the drift armed is only marked', () => {
    for (const setup of [
      { destroyed: [DAMOCLES] },
      { drift: -4660 }
    ] satisfies Setup[]) {
      const s = session({ before: 7000, ...setup });
      s.dispatchDestruction(ICARUS);
      expect(s.snapshot.destroyedBodies).toContain(ICARUS);
      expect(s.snapshot.drift).toBe(setup.drift ?? null);
      expect(armed(s, 0x10) && armed(s, 0x11)).toBe(true);
    }
  });

  test('DAMOCLES fires $12 only with ERIS alive, no drift and the clock negative', () => {
    const fired = (setup: Setup) => {
      const s = session({ pose: 'gaea-ur-city-4-2', ...setup });
      s.dispatchDestruction(DAMOCLES);
      expect(s.snapshot.destroyedBodies).toContain(DAMOCLES);
      return !armed(s, 0x12);
    };
    expect(fired({ before: 1 })).toBe(true);
    expect(fired({ before: 1, destroyed: [ERIS] })).toBe(false);
    expect(fired({ before: 1, drift: -4660 })).toBe(false);
    expect(fired({ before: 0 })).toBe(false);
  });

  test('ERIS fires $13 with DAMOCLES alive and no drift', () => {
    const fired = (setup: Setup) => {
      const s = session({ pose: 'gaea-ur-city-4-2', ...setup });
      s.dispatchDestruction(ERIS);
      return !armed(s, 0x13);
    };
    expect(fired({})).toBe(true);
    expect(fired({ destroyed: [DAMOCLES] })).toBe(false);
    expect(fired({ drift: -4660 })).toBe(false);
    const s = session({ pose: 'gaea-ur-city-4-2' });
    s.dispatchDestruction(ERIS);
    expect(play(s, 25)).toEqual([
      'script19-inline-1',
      'script19-inline-2',
      'script19-inline-3',
      'script19-inline-4',
      'system-string-50'
    ]);
  });

  test('GAEA always fires $0E, and DION $1B unless the AUTHORS COMPUTER rests there', () => {
    const gaea = session();
    gaea.dispatchDestruction(GAEA);
    expect(armed(gaea, 0x0e)).toBe(false);
    // The computer starts on DION (`$753C` = `$102000DE`).
    const dion = session();
    dion.dispatchDestruction(DION);
    expect(dion.snapshot.destroyedBodies).toEqual([DION]);
    expect(armed(dion, 0x1b)).toBe(true);
    expect(dion.snapshot.removedResidents).toContain(AUTHORS_COMPUTER);
    const taken = session({ carried: [AUTHORS_COMPUTER] });
    taken.dispatchDestruction(DION);
    expect(armed(taken, 0x1b)).toBe(false);
    expect(play(taken, 25)).toEqual([
      'script27-inline-1',
      'script27-inline-2',
      'script27-inline-3',
      'script27-inline-4',
      'system-string-50'
    ]);
  });

  test('a Body already destroyed is left alone', () => {
    const s = session({ destroyed: [GAEA] });
    s.dispatchDestruction(GAEA);
    expect(s.snapshot.destroyedBodies).toEqual([GAEA]);
    expect(armed(s, 0x0e)).toBe(true);
  });

  test('the 30th destruction kills a player on its Body before $1A can present', () => {
    const others = Array.from(
      { length: 30 },
      (_, index) => `body-${index}`
    ).filter(id => id !== ERIS);
    // MIDAS last but one, since it fires nothing that would hold the message row.
    const s = session({ destroyed: others.filter(id => id !== 'body-2') });
    s.dispatchDestruction('body-2');
    expect(s.snapshot.destroyedBodies).toHaveLength(29);
    expect(armed(s, 0x1a)).toBe(true);
    s.dispatchDestruction(ERIS);
    expect(s.snapshot.destroyedBodies).toHaveLength(30);
    expect(s.snapshot.message?.id).toBe('system-string-35');
    expect(armed(s, 0x1a)).toBe(true);
  });

  test('stacked EXPLOSIVEs destroy the blast Body only when seven others go with the armed one', () => {
    const s = session({ pose: 'gaea-ur-city-4-2' });
    s.explosiveBlast(ERIS, 6);
    expect(s.snapshot.destroyedBodies).toEqual([]);
    s.explosiveBlast(ERIS, 7);
    expect(s.snapshot.destroyedBodies).toEqual([ERIS]);
    expect(armed(s, 0x13)).toBe(false);
  });
});

/// EAGLE NINE S E boarded on ERIS, flown up and launched until the craft reaches space, then
/// restored from its own Save with `change` applied.
const inSpace = (
  change: (saved: DamoclesSaveSnapshot) => DamoclesSaveSnapshot
): DamoclesSession => {
  const EAGLE = 'object-slot-3';
  const first = new DamoclesSession(content);
  const at = first.snapshot.surface.placements.find(
    item => item.id === EAGLE
  )!.position;
  const key = content.catalogue.instances.find(item => item.id === EAGLE)!
    .boarding!.pairedInstance!;
  const saved = first.captureResume();
  // With no saved structure the restore binds whatever the new cell holds.
  const { structure: _, ...rest } = saved;
  const s = new DamoclesSession(content, {
    ...rest,
    carried: [key],
    pose: {
      ...saved.pose,
      position: {
        x: at.x + 150,
        y: at.y + content.doc.eye.heightUnits,
        z: at.z
      }
    },
    residence: [...saved.residence, carried(key)]
  } as unknown as DamoclesSaveSnapshot);
  expect(s.board()).toEqual({ kind: 'boarded' });
  const pass = content.doc.time.ticksPerPass / content.doc.time.vblHertz;
  s.throttleKey(0x05);
  for (let index = 0; index < 50; index += 1) {
    s.intent = { ...s.intent, pitch: index < 30 ? 0 : 1 };
    s.advance(pass);
  }
  s.intent = { ...s.intent, pitch: 0 };
  s.launchCraft();
  for (
    let index = 0;
    index < 400 && s.snapshot.craft?.space == null;
    index += 1
  ) {
    s.advance(pass);
  }
  expect(s.snapshot.craft?.space).not.toBeNull();
  return new DamoclesSession(content, change(s.captureResume()));
};

const armedInSpace = (
  held: readonly string[],
  destroyed: readonly string[] = []
): DamoclesSession =>
  inSpace(saved => ({
    ...saved,
    carried: [...held, ...saved.carried],
    destroyedBodies: destroyed,
    headCommands: {
      ...saved.headCommands,
      box: { from: SIDEBOARD, fromItem: null, steps: 0, to: SIDEBOARD },
      open: { index: 0, item: 0, slot: SIDEBOARD }
    },
    residence: [...saved.residence, ...held.map(carried)],
    switches: 0x70
  }));

describe('in space', () => {
  test('a carried bomb destroys no Body and kills the player with $22', () => {
    const s = armedInSpace([`object-slot-${SIDEBOARD}`, NOVABOMB]);
    expect(s.headCommand('next').kind).toBe('switched');
    expect(s.snapshot.destroyedBodies).toEqual([]);
    expect(s.snapshot.removedResidents).toContain(NOVABOMB);
    expect(s.snapshot.message?.id).toBe('system-string-34');
    expect(s.captureResume().encounter?.dead).toBe(true);
  });

  test('a placed bomb still goes off, and the 30th Body fires $1A to a player who survives', () => {
    const others = Array.from(
      { length: 30 },
      (_, index) => `body-${index}`
    ).filter(id => id !== GAEA);
    const s = armedInSpace([`object-slot-${SIDEBOARD}`], others);
    s.headCommand('next');
    expect(s.snapshot.destroyedBodies).toHaveLength(30);
    expect(s.snapshot.screen.dead).toBe(false);
    expect(armed(s, 0x0e)).toBe(false);
    // `$0E` launched first, so `$1A` waits in `$7A88`, still armed, until it has run.
    expect(armed(s, 0x1a)).toBe(true);
    expect(play(s, 200)).toEqual([
      'script14-inline-1',
      'script14-inline-2',
      'script14-inline-3',
      'script14-inline-4',
      'system-string-50',
      'script26-inline-1',
      'script26-inline-2',
      'script26-inline-3',
      'system-string-50',
      'script26-inline-4',
      'script26-inline-5',
      'script26-inline-6',
      'script26-inline-7'
    ]);
    expect(armed(s, 0x1a)).toBe(false);
  }, 30_000);
});

describe('zero on the clock after the dispatcher', () => {
  test('with ERIS gone, the comet passes: nothing more is destroyed, $0F stays armed, $7A82 latches', () => {
    const s = session({
      before: 2,
      destroyed: [ERIS],
      pose: 'gaea-ur-city-4-2'
    });
    s.advance(3);
    expect(s.snapshot.destroyedBodies).toEqual([ERIS]);
    expect(s.snapshot.impactPassed).toBe(true);
    expect(armed(s, 0x0f)).toBe(true);
  });
});

const identity = () => damoclesSaveIdentity(content.catalogue, 'test');

const encoded = (snapshot: DamoclesSaveSnapshot, schemaVersion?: number) => {
  const record = JSON.parse(
    encodeDamoclesSave({
      identity: identity(),
      savedAt: '2026-09-29T19:00:00Z',
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot,
      where: 'ERIS'
    })
  ) as Record<string, unknown>;
  if (schemaVersion !== undefined) {
    record['schemaVersion'] = schemaVersion;
  }
  return JSON.stringify(record);
};
const decoded = (text: string) =>
  decodeDamoclesSave(text, identity(), {
    catalogue: content.catalogue,
    documents: content.documents,
    poses: content.poses,
    strings: content.strings
  }).snapshot;

describe('the NOVABOMB Save', () => {
  test('carries the switch bits, an open switch and the detonated bomb', () => {
    const s = primed({ residence: [bombOn(GAEA)] });
    const before = decoded(encoded(s.captureResume()));
    expect(before.switches).toBe(0x70);
    expect(before.headCommands.open).toEqual({
      index: 0,
      item: 0,
      slot: SIDEBOARD
    });
    const restored = new DamoclesSession(content, before);
    restored.headCommand('next');
    const after = decoded(encoded(restored.captureResume()));
    expect(after.switches).toBe(0x78);
    expect(after.destroyedBodies).toEqual([GAEA]);
    expect(after.removedResidents).toContain(NOVABOMB);
    expect(after.script.triggers.find(item => item.index === 0x0e)?.armed).toBe(
      false
    );
  });

  test('refuses switch bits no ported switch sets', () => {
    const saved = session().captureResume();
    expect(() => decoded(encoded({ ...saved, switches: 0x02 }))).toThrow(
      'switch bits name a switch the port does not open'
    );
  });

  test('a schema-22 record migrates with every switch off and the dispatcher endings armed', () => {
    const saved = session().captureResume();
    const older = {
      ...saved,
      script: {
        ...saved.script,
        triggers: saved.script.triggers.filter(
          item => !DESTRUCTION_TRIGGERS.includes(item.index)
        )
      }
    };
    delete (older as { switches?: number }).switches;
    const migrated = decoded(encoded(older, 22));
    expect(migrated.switches).toBe(0);
    expect(
      DESTRUCTION_TRIGGERS.every(
        index =>
          migrated.script.triggers.find(item => item.index === index)?.armed
      )
    ).toBe(true);
    // A current record must carry them.
    expect(() => decoded(encoded(older))).toThrow();
  });
});
