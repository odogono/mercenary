import { beforeAll, describe, expect, test } from 'bun:test';

import {
  OPTION_MAXIMA,
  initialAuthorsComputer,
  optionEffect,
  selectOption,
  spread,
  stepOption
} from '../src/damocles/authorsComputer.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { zoomedFieldOfView } from '../src/damocles/frame.ts';
import {
  AUTHORS_COMPUTER_SLOT,
  TRANSITION_VBLS
} from '../src/damocles/headCommands.ts';
import { centreBoxView } from '../src/damocles/panel.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  decodeDamoclesSave,
  encodeDamoclesSave,
  type DamoclesSaveSnapshot
} from '../src/damocles/save.ts';
import { COMPUTER_TRIGGERS } from '../src/damocles/scripts.ts';
import {
  DamoclesSession,
  NOVABOMB,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { maskedColour } from '../src/shell/panelView.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { launchedIntoSpace } from './damocles-space-harness.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// The AUTHORS COMPUTER and the unravelling (#628), against the #626 live runs
/// (docs/research/damocles-endgame.md): `computer` from `dion-transporter` with the computer
/// carried and the player seated on the AUTHOR'S CHAIR, and `unravel` on foot and in space.

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

const COMPUTER = `object-slot-${AUTHORS_COMPUTER_SLOT}`;
const CHAIR = 'object-slot-14';
const ICARUS = 'body-1';
const DION = 'body-4';
const ERIS = 'body-11';
const DAMOCLES = 'body-29';
const FIRST_OFFER = 4;

const carried = (instance: string) => ({
  instance,
  residence: { kind: 'carried' as const, placementClass: 4 }
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

/// A player at DION's transporter carrying the computer, seated on the chair unless `seated`
/// is false, with the first offer accepted.
const atTheComputer = (
  options: {
    readonly seated?: boolean;
    readonly with?: (saved: DamoclesSaveSnapshot) => DamoclesSaveSnapshot;
  } = {}
): DamoclesSession => {
  const first = new DamoclesSession(content);
  expect(first.switchToPose('dion-transporter').kind).toBe('switched');
  const saved = first.captureResume();
  const seated = options.seated ?? true;
  const chair = content.catalogue.instances.find(item => item.id === CHAIR)!;
  const snapshot: DamoclesSaveSnapshot = {
    ...saved,
    carried: [COMPUTER],
    occupancy: seated ? { instance: CHAIR, kind: 'aboard' } : saved.occupancy,
    residence: [
      ...saved.residence,
      carried(COMPUTER),
      ...(seated
        ? [
            {
              instance: CHAIR,
              residence: {
                kind: 'occupied' as const,
                placementClass: chair.placementClass ?? 0
              }
            }
          ]
        : [])
    ],
    script: {
      ...saved.script,
      carried: [38],
      flags: 1,
      reward: 0x10,
      triggers: saved.script.triggers.map(trigger =>
        // Carrying the computer means its pickup trigger 11 has fired.
        trigger.index === FIRST_OFFER || trigger.index === 11
          ? { ...trigger, armed: false }
          : trigger
      )
    }
  };
  return new DamoclesSession(content, options.with?.(snapshot) ?? snapshot);
};

/// Open the computer and wait for its panel to scroll in.
const opened = (s: DamoclesSession): DamoclesSession => {
  expect(s.headCommand('open').kind).toBe('opened');
  vbls(s, TRANSITION_VBLS);
  return s;
};

const press = (s: DamoclesSession, key: '+' | '-' | '*', times = 1) => {
  for (let index = 0; index < times; index += 1) {
    s.headCommand(key === '+' ? 'next' : key === '-' ? 'previous' : 'read');
  }
};

/// The tangent of half a field of view in degrees.
const half = (degrees: number) => Math.tan((degrees * Math.PI) / 360);

describe('the AUTHORS COMPUTER options', () => {
  test('spread moves three 3-bit fields into ST nibbles, as the run sampled', () => {
    expect(optionEffect(0, 328)).toEqual({ kind: 'palette-mask', mask: 0x17 });
    expect(optionEffect(0, 326)).toEqual({ kind: 'palette-mask', mask: 0x01 });
    expect(optionEffect(0, 327)).toEqual({ kind: 'palette-mask', mask: 0 });
    expect(optionEffect(1, 144)).toEqual({ kind: 'panel-mask', mask: 0x33 });
    expect(optionEffect(1, 139)).toEqual({ kind: 'panel-mask', mask: 0 });
    expect(spread(0x1_ff)).toBe(0x7_77);
    expect(optionEffect(2, 9)).toEqual({ exponent: 9, kind: 'view-exponent' });
    expect(optionEffect(3, 7)).toEqual({ kind: 'clock-level', level: 7 });
    expect(optionEffect(4, 29)).toEqual({ kind: 'none' });
  });

  test('values clamp at 0 and each maximum, and only digits 0 to 4 select', () => {
    let computer = initialAuthorsComputer();
    expect(stepOption({ ...computer, option: 4 }, -1).values[4]).toBe(0);
    computer = { ...computer, option: 4, values: [327, 139, 8, 6, 29] };
    expect(stepOption(computer, 1).values[4]).toBe(29);
    expect(OPTION_MAXIMA).toEqual([511, 511, 10, 10, 29]);
    expect(selectOption(computer, 5)).toBeNull();
    expect(selectOption(computer, 2)).toEqual({ ...computer, option: 2 });
  });

  test('the panel mask XORs every colour but black, as the option 1 captures show', () => {
    // The computer's ground `$666` under `$033` reads `$655`.
    expect(maskedColour('#cccccc', 0x33)).toBe('#ccaaaa');
    expect(maskedColour('#000000', 0x33)).toBe('#000000');
    expect(maskedColour('#cccccc', 0)).toBe('#cccccc');
  });

  test('scale exponent 9 halves the tangent of the half field of view', () => {
    const at8 = zoomedFieldOfView(45, 8);
    expect(at8).toBeCloseTo(45, 12);
    expect(half(zoomedFieldOfView(45, 9))).toBeCloseTo(half(45) / 2, 12);
    expect(half(zoomedFieldOfView(45, 7))).toBeCloseTo(half(45) * 2, 12);
  });
});

describe('the computer in play', () => {
  test('opens only from the chair, firing the warning $2A', () => {
    const off = atTheComputer({ seated: false });
    expect(off.headCommand('open').kind).toBe('ignored');
    expect(armed(off, 0x2a)).toBe(true);
    expect(off.headOpens).toBe(false);
    const on = atTheComputer();
    expect(on.headOpens).toBe(true);
    opened(on);
    expect(armed(on, 0x2a)).toBe(false);
    expect(centreBoxView(on.snapshot.centreBox).panel).toMatchObject({
      field: '#888888',
      ground: '#cccccc',
      item: '327',
      kind: 'computer',
      parameter: 0,
      title: 'AUTHORS COMPUTER'
    });
    expect(play(on, 10)).toEqual([
      'script42-inline-1',
      'script42-inline-2',
      'system-string-50'
    ]);
  });

  test('walks the #626 key sequence: every option applies its value', () => {
    const s = opened(atTheComputer());
    // `+,-x2`: 328 then 326, the world mask `$0017` then `$0001`.
    press(s, '+');
    expect(s.snapshot.screen.mask).toBe(0x17);
    press(s, '-', 2);
    expect(s.snapshot.screen.mask).toBe(0x01);
    // `k1,+x8`: option 1 at 139, then 147; the run's `+4` sample, 144, reads `$0033`.
    expect(s.keypadDigit(1).kind).toBe('computed');
    expect(s.snapshot.computer).toEqual({
      option: 1,
      values: [326, 139, 8, 6, 0]
    });
    press(s, '+', 5);
    expect(s.snapshot.panelMask).toBe(0x33);
    press(s, '+', 3);
    // `k2,+,-x2`: the view exponent 9, then 7.
    s.keypadDigit(2);
    press(s, '+');
    expect(s.snapshot.viewExponent).toBe(9);
    press(s, '-', 2);
    expect(s.snapshot.viewExponent).toBe(7);
    // `k3,+,-`: the clock level 7, then 6 again.
    s.keypadDigit(3);
    press(s, '+');
    expect(s.captureResume().clockLevel).toBe(7);
    press(s, '-');
    expect(s.captureResume().clockLevel).toBe(6);
    // `k0,+x4`: option 0 kept 326 and climbs to 330.
    s.keypadDigit(0);
    press(s, '+', 4);
    expect(s.snapshot.computer.values).toEqual([330, 147, 7, 6, 0]);
    // A digit above 4 selects nothing.
    expect(s.keypadDigit(5).kind).toBe('ignored');
    expect(s.snapshot.computer.option).toBe(0);
  });

  test('option 4 value 1 destroys ICARUS in time: the drift, $10 and the reward', () => {
    const s = opened(atTheComputer());
    // The warning runs first; an ending fired behind it would wait in `$7A88`.
    play(s, 10);
    s.keypadDigit(4);
    press(s, '*');
    // Value 0 is DIALIS: `*` destroys it at once.
    expect(s.snapshot.destroyedBodies).toEqual(['body-0']);
    press(s, '+');
    expect(s.headCommand('read').kind).toBe('computed');
    expect(s.snapshot.destroyedBodies).toContain(ICARUS);
    expect(s.snapshot.drift).toBe(s.snapshot.impact.seconds);
    expect(armed(s, 0x10)).toBe(false);
  });

  test('option 4 value 29 destroys DAMOCLES and fires $12', () => {
    const s = opened(
      atTheComputer({
        with: saved => ({
          ...saved,
          computer: { option: 4, values: [327, 139, 8, 6, 29] }
        })
      })
    );
    // A clamp still applies and clicks.
    s.drainEffects();
    press(s, '+');
    expect(s.snapshot.computer.values[4]).toBe(29);
    expect(
      s
        .drainEffects()
        .some(
          effect => effect.type === 'sound-request' && effect.cue === 'throttle'
        )
    ).toBe(true);
    // Behind the warning, `$12` waits in `$7A88`, armed, until it launches.
    press(s, '*');
    expect(s.snapshot.destroyedBodies).toEqual([DAMOCLES]);
    expect(s.captureResume().script.pending).toBe(0x12);
    play(s, 10);
    expect(armed(s, 0x12)).toBe(false);
  });

  test('`*` does nothing outside option 4, and an open computer works off the chair', () => {
    const s = opened(atTheComputer());
    press(s, '*');
    expect(s.snapshot.destroyedBodies).toEqual([]);
    // Opened from the chair and restored on foot: `$04D268` gates Open alone.
    const saved = s.captureResume();
    const off = atTheComputer({
      seated: false,
      with: snapshot => ({ ...snapshot, headCommands: saved.headCommands })
    });
    expect(off.snapshot.occupancy.kind).toBe('onFoot');
    off.keypadDigit(2);
    press(off, '+');
    expect(off.snapshot.viewExponent).toBe(9);
  });
});

/// A player on ERIS's spaceport on foot with the AUTHORS COMPUTER gone, as the probe pokes
/// `$753C` to 0.
const unravelling = (
  change: (saved: DamoclesSaveSnapshot) => DamoclesSaveSnapshot = saved => saved
): DamoclesSession => {
  const saved = new DamoclesSession(content).captureResume();
  return new DamoclesSession(
    content,
    change({ ...saved, removedResidents: [COMPUTER] })
  );
};

/// The ticks from now to each new destruction, while `until` holds.
const destructions = (
  s: DamoclesSession,
  until: (s: DamoclesSession) => boolean,
  limit: number
): { readonly body: string; readonly tick: number }[] => {
  const seen: { body: string; tick: number }[] = [];
  let count = s.snapshot.destroyedBodies.length;
  for (let tick = 0; tick < limit && until(s); tick += 1) {
    s.advance(1 / 50);
    const bodies = s.snapshot.destroyedBodies;
    if (bodies.length !== count) {
      seen.push({ body: bodies.at(-1)!, tick });
      count = bodies.length;
    }
  }
  return seen;
};

describe('the unravelling', () => {
  test('fires $01, then destroys DAMOCLES and each Body down to the player, 64 passes apart', () => {
    const s = unravelling();
    expect(s.snapshot.unravelling).toBe(true);
    // The first main-loop pass, eight ticks on foot.
    s.advance(8 / 50);
    expect(armed(s, 0x01)).toBe(false);
    expect(s.snapshot.destroyedBodies).toEqual([DAMOCLES]);
    const seen = destructions(s, it => !it.snapshot.screen.dead, 20_000);
    expect(seen.map(item => item.body)).toEqual(
      Array.from({ length: 18 }, (_, index) => `body-${28 - index}`)
    );
    expect(seen.at(-1)!.body).toBe(ERIS);
    // On foot a pass is eight ticks, and each destruction starts 64 passes of debris.
    const gaps = seen
      .slice(1)
      .map((item, index) => item.tick - seen[index]!.tick);
    expect(new Set(gaps)).toEqual(new Set([64 * 8]));
    expect(s.snapshot.message?.id).toBe('system-string-35');
    expect(s.snapshot.unravelCursor).toBe(10);
  }, 30_000);

  test('the first lines present, and a Body already gone costs one pass', () => {
    const s = unravelling(saved => ({
      ...saved,
      destroyedBodies: ['body-28']
    }));
    const shown: string[] = [];
    let last: string | null = null;
    const seen = destructions(
      s,
      it => {
        const id = it.snapshot.message?.id ?? null;
        if (id !== null && id !== last) {
          shown.push(id);
        }
        last = id;
        return it.snapshot.destroyedBodies.length < 3;
      },
      5000
    );
    expect(seen.map(item => item.body)).toEqual([DAMOCLES, 'body-27']);
    expect(seen[1]!.tick - seen[0]!.tick).toBe(65 * 8);
    expect(shown.slice(0, 3)).toEqual([
      'script1-inline-1',
      'script1-inline-2',
      'script1-inline-3'
    ]);
  }, 30_000);

  test('a Save mid-unravelling resumes with the cursor where it was', () => {
    const s = unravelling();
    destructions(s, it => it.snapshot.destroyedBodies.length < 3, 5000);
    const identity = damoclesSaveIdentity(content.catalogue, 'test');
    const text = encodeDamoclesSave({
      identity,
      savedAt: '2026-09-29T20:00:00Z',
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot: s.captureResume(),
      where: 'ERIS'
    });
    const restored = decodeDamoclesSave(text, identity, {
      catalogue: content.catalogue,
      documents: content.documents,
      poses: content.poses,
      strings: content.strings
    }).snapshot;
    expect(restored.unravelCursor).toBe(26);
    expect(restored.removedResidents).toContain(COMPUTER);
    const resumed = new DamoclesSession(content, restored);
    const next = destructions(
      resumed,
      it => it.snapshot.destroyedBodies.length < 4,
      5000
    );
    expect(next.map(item => item.body)).toEqual(['body-26']);
  }, 30_000);

  test('destroying DION with the computer on it starts it, and fires no $1B', () => {
    const s = new DamoclesSession(content);
    s.dispatchDestruction(DION);
    expect(s.snapshot.removedResidents).toContain(COMPUTER);
    expect(s.snapshot.unravelling).toBe(true);
    expect(armed(s, 0x1b)).toBe(true);
    // Taking it is not enough.
    const taken = atTheComputer({ seated: false });
    expect(taken.snapshot.unravelling).toBe(false);
  });

  test('in space it destroys all thirty and fires $1A, whose second part waits 4,500 frames', () => {
    const s = launchedIntoSpace(content, saved => ({
      ...saved,
      removedResidents: [COMPUTER]
    }));
    const seen = destructions(
      s,
      it => it.snapshot.destroyedBodies.length < 30,
      40_000
    );
    expect(seen).toHaveLength(30);
    expect(seen.at(-1)!.body).toBe('body-0');
    // A pass is four ticks aboard.
    expect(seen[1]!.tick - seen[0]!.tick).toBe(64 * 4);
    expect(s.snapshot.screen.dead).toBe(false);
    // The 30th destruction launched `$1A` at once.
    expect(s.snapshot.message?.id).toBe('script26-inline-1');
    expect(play(s, 200)).toEqual([
      'script26-inline-2',
      'script26-inline-3',
      'system-string-50',
      'script26-inline-4',
      'script26-inline-5',
      'script26-inline-6',
      'script26-inline-7'
    ]);
  }, 60_000);
});

describe('system messages while a script waits (#628)', () => {
  test('the death message presents though an ending is waiting between its lines', () => {
    // `$0E` waits 250 frames before its first line; the carried bomb then goes off on ERIS.
    const s = new DamoclesSession(content);
    s.dispatchDestruction('body-8');
    expect(s.snapshot.message).toBeNull();
    expect(s.captureResume().script.execution).not.toBeNull();
    s.dispatchDestruction(ERIS);
    expect(s.snapshot.message?.id).toBe('system-string-35');
  });
});

const identity = () => damoclesSaveIdentity(content.catalogue, 'test');
const encoded = (snapshot: DamoclesSaveSnapshot, schemaVersion?: number) => {
  const record = JSON.parse(
    encodeDamoclesSave({
      identity: identity(),
      savedAt: '2026-09-29T20:00:00Z',
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot,
      where: 'DION'
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

describe('the computer Save', () => {
  test('carries the open computer, its records, both masks, the exponent and the level', () => {
    const s = opened(atTheComputer());
    s.keypadDigit(1);
    press(s, '+', 5);
    s.keypadDigit(2);
    press(s, '+');
    s.keypadDigit(3);
    press(s, '+', 2);
    s.keypadDigit(0);
    press(s, '+');
    const saved = decoded(encoded(s.captureResume()));
    expect(saved.computer).toEqual({ option: 0, values: [328, 144, 9, 8, 0] });
    expect(saved.headCommands.open?.slot).toBe(AUTHORS_COMPUTER_SLOT);
    expect(saved.paletteMask).toBe(0x17);
    expect(saved.panelMask).toBe(0x33);
    expect(saved.viewExponent).toBe(9);
    expect(saved.clockLevel).toBe(8);
    const resumed = new DamoclesSession(content, saved);
    expect(centreBoxView(resumed.snapshot.centreBox).panel?.item).toBe('328');
  });

  test('refuses a value past its maximum', () => {
    const saved = atTheComputer().captureResume();
    expect(() =>
      decoded(
        encoded({
          ...saved,
          computer: { option: 2, values: [327, 139, 11, 6, 0] }
        })
      )
    ).toThrow('snapshot.computer.values[2]');
  });

  test('a schema-23 record migrates with the reset records and both triggers armed', () => {
    const saved = new DamoclesSession(content).captureResume();
    const older = {
      ...saved,
      script: {
        ...saved.script,
        triggers: saved.script.triggers.filter(
          item => !COMPUTER_TRIGGERS.includes(item.index)
        )
      }
    };
    const migrated = decoded(encoded(older, 23));
    expect(migrated.computer).toEqual(initialAuthorsComputer());
    expect(migrated.unravelCursor).toBe(29);
    expect(migrated.viewExponent).toBe(8);
    expect(
      COMPUTER_TRIGGERS.every(
        index =>
          migrated.script.triggers.find(item => item.index === index)?.armed
      )
    ).toBe(true);
    expect(migrated.removedResidents).not.toContain(NOVABOMB);
  });
});
