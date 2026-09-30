import { beforeAll, describe, expect, test } from 'bun:test';

import { readErisPresentation } from '../src/damocles/documents.ts';
import type { Residence } from '../src/damocles/residence.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  decodeDamoclesSave,
  encodeDamoclesSave,
  type DamoclesSaveSnapshot
} from '../src/damocles/save.ts';
import {
  BLAST_PENDING,
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import {
  initialTimedDetonator,
  regionBlastFor,
  withinReach,
  type TimedDetonator
} from '../src/damocles/timedDetonator.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// The TIMED DETONATOR and the EXPLOSIVE's blast (#635), against the decode in
/// docs/research/damocles-endgame.md ("The TIMED DETONATOR decoded") and the #626 runs.

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

const ERIS = 'body-11';
const object = (slot: number) => `object-slot-${slot}`;
const DETONATOR = object(145);

type Placement = { instance: string; residence: Residence };

const carried = (instance: string): Placement => ({
  instance,
  residence: { kind: 'carried', placementClass: 4 }
});

const placed = (slot: number, x: number, z: number, y = 0): Placement => ({
  instance: object(slot),
  residence: {
    body: ERIS,
    kind: 'surface',
    placementClass: 0,
    position: { x, y, z }
  }
});

interface Setup {
  readonly carried?: readonly string[];
  readonly changes?: Partial<DamoclesSaveSnapshot>;
  readonly detonator?: Partial<TimedDetonator>;
  /// The TIMED DETONATOR's panel open and at rest.
  readonly open?: boolean;
  readonly residence?: readonly Placement[];
}

const fresh = (): DamoclesSession => new DamoclesSession(content);

/// A player on ERIS's spaceport with the TIMED DETONATOR carried behind `carried`.
const session = (setup: Setup = {}): DamoclesSession => {
  const saved = fresh().captureResume();
  const held = [...(setup.carried ?? [object(75)]), DETONATOR];
  const residence = setup.residence ?? [];
  const moved = new Set([...held, ...residence.map(item => item.instance)]);
  return new DamoclesSession(content, {
    ...saved,
    carried: held,
    headCommands:
      setup.open === false
        ? saved.headCommands
        : {
            ...saved.headCommands,
            box: { from: 145, fromItem: null, steps: 0, to: 145 },
            open: { index: 0, item: 0, slot: 145 }
          },
    residence: [
      ...saved.residence.filter(item => !moved.has(item.instance)),
      ...held.map(carried),
      ...residence
    ],
    timedDetonator: { ...initialTimedDetonator(), ...setup.detonator },
    ...setup.changes
  });
};

/// An EXPLOSIVE in `slot` already armed where `residence` puts it, going off in `fuse` seconds.
const armed = (
  slot: number,
  residence: readonly Placement[],
  detonator: Partial<TimedDetonator> = {},
  fuse = 2
): DamoclesSession =>
  session({
    carried: [],
    detonator: {
      armed: true,
      deadline: Math.floor(fresh().captureResume().elapsed) + fuse,
      fuse,
      slot,
      ...detonator
    },
    open: false,
    residence
  });

const player = () => fresh().snapshot.pose.position;
/// Far enough from the player that no charge below 9 reaches it.
const away = () => ({ x: player().x + 0x4_00_00, z: player().z });

const vbls = (s: DamoclesSession, count: number) => {
  for (let vbl = 0; vbl < count; vbl += 1) {
    s.advance(1 / 50);
  }
};

describe('the TIMED DETONATOR panel', () => {
  test('a digit sets the charge and + and - step the fuse by 5 s from 0 to 595 s', () => {
    const s = session();
    expect(s.keypadDigit(7).kind).toBe('computed');
    expect(s.headCommand('previous').kind).toBe('computed');
    expect(s.snapshot.timedDetonator).toMatchObject({ charge: 7, fuse: 0 });
    for (let step = 0; step < 121; step += 1) {
      s.headCommand('next');
    }
    expect(s.snapshot.timedDetonator.fuse).toBe(595);
    s.headCommand('previous');
    expect(s.snapshot.timedDetonator.fuse).toBe(590);
    expect(s.snapshot.centreBox.from).toMatchObject({
      item: '7 9.50',
      kind: 'timedDetonator'
    });
  });

  test('* arms the head EXPLOSIVE with the deadline on the clock second', () => {
    const s = session();
    s.headCommand('next');
    s.headCommand('next');
    expect(s.headCommand('read').kind).toBe('computed');
    expect(s.snapshot.timedDetonator).toMatchObject({
      armed: true,
      deadline: Math.floor(s.captureResume().elapsed) + 10,
      fuse: 10,
      slot: 75
    });
  });

  test('once armed only * acts, and on the armed EXPLOSIVE it disarms it', () => {
    const s = session();
    s.keypadDigit(2);
    s.headCommand('next');
    s.headCommand('read');
    expect(s.keypadDigit(5).kind).toBe('ignored');
    expect(s.headCommand('next').kind).toBe('ignored');
    expect(s.headCommand('previous').kind).toBe('ignored');
    expect(s.snapshot.timedDetonator).toMatchObject({ charge: 2, fuse: 5 });
    expect(s.headCommand('read').kind).toBe('computed');
    expect(s.snapshot.timedDetonator.armed).toBe(false);
    s.advance(8);
    expect(s.snapshot.removedResidents).not.toContain(object(75));
  });

  test('* raises string 13 on a head that is not an EXPLOSIVE, or is not the armed one', () => {
    const wrongHead = session({ carried: [] });
    expect(wrongHead.headCommand('read').kind).toBe('ignored');
    expect(wrongHead.snapshot.message?.id).toBe('system-string-13');
    const other = session({
      carried: [object(76)],
      detonator: { armed: true, deadline: 100, fuse: 50, slot: 75 },
      residence: [placed(75, away().x, away().z)]
    });
    expect(other.headCommand('read').kind).toBe('ignored');
    expect(other.snapshot.message?.id).toBe('system-string-13');
    expect(other.snapshot.timedDetonator).toMatchObject({
      armed: true,
      slot: 75
    });
  });

  test('* raises string 13 while the inventory label scrolls', () => {
    const s = session({ changes: { scrollCounter: 16 } });
    expect(s.headCommand('read').kind).toBe('ignored');
    expect(s.snapshot.message?.id).toBe('system-string-13');
    expect(s.snapshot.timedDetonator.armed).toBe(false);
  });
});

describe('the countdown and the blast', () => {
  test('$786A counts the seconds left, and the blast waits for the next main-loop pass', () => {
    const { x, z } = away();
    const s = armed(76, [placed(76, x, z)], { charge: 1 }, 3);
    const seen = new Set<number>();
    let pending = false;
    for (let vbl = 0; vbl < 250 && !pending; vbl += 1) {
      s.advance(1 / 50);
      seen.add(s.snapshot.timedDetonator.fuse);
      pending = s.snapshot.debrisPasses === BLAST_PENDING;
    }
    expect([...seen]).toEqual([3, 2, 1, 0]);
    expect(pending).toBe(true);
    expect(s.snapshot.timedDetonator.armed).toBe(false);
    expect(s.snapshot.removedResidents).not.toContain(object(76));
    vbls(s, 20);
    expect(s.snapshot.removedResidents).toContain(object(76));
    expect(s.snapshot.debrisPasses).toBeGreaterThan(50);
    expect(s.snapshot.blastCentre).toMatchObject({ body: ERIS, x, z });
    expect(s.snapshot.screen.dead).toBe(false);
  });

  test('the reach is a box on every axis, not a sphere', () => {
    const { x, z } = away();
    const s = armed(
      76,
      [
        placed(76, x, z),
        placed(77, x + 256, z + 256, 256),
        placed(78, x + 257, z)
      ],
      { charge: 2 }
    );
    s.advance(4);
    expect(s.snapshot.removedResidents).toContain(object(77));
    expect(s.snapshot.removedResidents).not.toContain(object(78));
  });

  test('a placed blast that reaches the player kills with string 35', () => {
    const { x, y, z } = player();
    const s = armed(76, [placed(76, x, z, y)], { charge: 1 });
    s.advance(4);
    expect(s.snapshot.screen.dead).toBe(true);
    expect(s.snapshot.message?.id).toBe('system-string-35');
  });

  test('a carried EXPLOSIVE blows the player up with string 34', () => {
    const s = session({
      detonator: {
        armed: true,
        deadline: Math.floor(fresh().captureResume().elapsed) + 2,
        fuse: 2,
        slot: 75
      },
      open: false
    });
    s.advance(4);
    expect(s.snapshot.carried).not.toContain(object(75));
    expect(s.snapshot.removedResidents).toContain(object(75));
    expect(s.snapshot.screen.dead).toBe(true);
    expect(s.snapshot.message?.id).toBe('system-string-34');
  });

  test('eight stacked EXPLOSIVEs destroy the Body and seven do not (#626)', () => {
    for (const count of [7, 8]) {
      const { x, z } = away();
      const s = armed(
        75,
        Array.from({ length: count }, (_, index) => placed(75 + index, x, z)),
        { charge: 9 }
      );
      s.advance(4);
      expect(s.snapshot.destroyedBodies.includes(ERIS)).toBe(count === 8);
    }
  });

  test('the #626 seven and eight stack runs leave the player on GAEA alive', () => {
    for (const count of [7, 8]) {
      const s = armed(
        75,
        Array.from({ length: count }, (_, index) => placed(75 + index, 0, 0)),
        { charge: 9 }
      );
      expect(s.switchToPose('gaea-ur-city-4-2').kind).toBe('switched');
      s.advance(4);
      expect(s.snapshot.destroyedBodies.includes(ERIS)).toBe(count === 8);
      expect(s.snapshot.screen.dead).toBe(false);
    }
  });

  test('a small blast opens the NOVAGEN SAFE rather than clearing it', () => {
    const { x, z } = away();
    const s = armed(76, [placed(76, x, z), placed(102, x, z)], { charge: 3 });
    s.advance(4);
    expect(s.snapshot.safeGate).toBe(true);
    expect(s.snapshot.removedResidents).not.toContain(object(102));
    const saved = s.captureResume();
    const safe = new DamoclesSession(content, {
      ...saved,
      carried: [object(102), DETONATOR],
      residence: saved.residence
        .filter(item => item.instance !== object(102))
        .concat(carried(object(102)))
    });
    expect(safe.headOpens).toBe(true);
  });

  test('a larger blast clears the safe and an AUTHORS COMPUTER in reach', () => {
    const { x, z } = away();
    const s = armed(
      76,
      [placed(76, x, z), placed(101, x, z), placed(102, x, z)],
      { charge: 4 }
    );
    s.advance(4);
    expect(s.snapshot.safeGate).toBe(false);
    expect(s.snapshot.removedResidents).toContain(object(102));
    expect(s.snapshot.unravelling).toBe(true);
  });

  test('with $7A5A set, a structure resident in the blast cell goes whatever the distance', () => {
    // Slots 42 and 43 are residents of Bare Island's structure 56, in cell 86 (catalogue).
    // The EXPLOSIVE stands where 43 does, 108 units from 42 on Z, past a charge 0 reach of 64.
    const inStructure: Placement = {
      instance: object(76),
      residence: {
        body: ERIS,
        insertionGroup: 5,
        kind: 'structure',
        level: 4,
        parent: 'eris-bare-island-surface-56',
        placementClass: 0,
        position: { x: 302, y: 600, z: 1405 }
      }
    };
    for (const regionBlast of [false, true]) {
      const s = armed(76, [inStructure], { charge: 0, regionBlast });
      s.advance(4);
      expect(s.snapshot.removedResidents).toContain(object(76));
      expect(s.snapshot.removedResidents.includes(object(42))).toBe(
        regionBlast
      );
    }
  });
});

describe('the decoded rules', () => {
  test('$05A928 sets $7A5A from a charge of 4, indoors or near the extent', () => {
    expect(regionBlastFor(3, 5, 0)).toBe(false);
    expect(regionBlastFor(4, 5, 0xff_ff)).toBe(true);
    expect(regionBlastFor(4, 0, 0xff)).toBe(true);
    expect(regionBlastFor(4, 0, 0x1_00)).toBe(false);
    expect(regionBlastFor(9, 0, 0x1_ff_ff)).toBe(false);
  });

  test('$0541BA shifts each difference four bits, so one past 2^27 wraps', () => {
    expect(withinReach({ x: 64, y: -64, z: 0 }, 64)).toBe(true);
    expect(withinReach({ x: 65, y: 0, z: 0 }, 64)).toBe(false);
    expect(withinReach({ x: 2 ** 28, y: 0, z: 0 }, 64)).toBe(true);
  });
});

const identity = () =>
  damoclesSaveIdentity(content.catalogue, content.presentationSha256);

const record = (s: DamoclesSession) =>
  JSON.parse(
    encodeDamoclesSave({
      identity: identity(),
      savedAt: '2026-09-30T00:00:00.000Z',
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot: s.captureResume(),
      where: 'ERIS'
    })
  ) as { schemaVersion: number; snapshot: Record<string, unknown> };
const decoded = (value: unknown) =>
  decodeDamoclesSave(JSON.stringify(value), identity(), content).snapshot;
describe('the Save', () => {
  test('resumes an armed EXPLOSIVE, its region test and the safe gate', () => {
    const { x, z } = away();
    const s = armed(76, [placed(76, x, z)], { charge: 4, regionBlast: true });
    const saved = decoded({
      ...record(s),
      snapshot: { ...record(s).snapshot, safeGate: true }
    });
    expect(saved.timedDetonator).toEqual(s.snapshot.timedDetonator);
    expect(saved.safeGate).toBe(true);
    const resumed = new DamoclesSession(content, saved);
    resumed.advance(4);
    expect(resumed.snapshot.removedResidents).toContain(object(76));
  });

  test('resumes a pending blast, $7834 = −1', () => {
    const { x, z } = away();
    const s = armed(76, [placed(76, x, z)], { charge: 1 }, 1);
    for (let vbl = 0; vbl < 200; vbl += 1) {
      s.advance(1 / 50);
      if (s.snapshot.debrisPasses === BLAST_PENDING) {
        break;
      }
    }
    const saved = decoded(record(s));
    expect(saved.debrisPasses).toBe(BLAST_PENDING);
    const resumed = new DamoclesSession(content, saved);
    vbls(resumed, 20);
    expect(resumed.snapshot.removedResidents).toContain(object(76));
  });

  test('a schema-24 Save migrates with nothing armed and the safe shut', () => {
    const old = record(session());
    old.schemaVersion = 24;
    delete old.snapshot['timedDetonator'];
    delete old.snapshot['safeGate'];
    const migrated = decoded(old);
    expect(migrated.timedDetonator).toEqual(initialTimedDetonator());
    expect(migrated.safeGate).toBe(false);
  });

  test('a schema-25 Save without the detonator or the safe gate is refused', () => {
    for (const field of ['timedDetonator', 'safeGate']) {
      const incomplete = record(session());
      delete incomplete.snapshot[field];
      expect(() => decoded(incomplete)).toThrow(`snapshot.${field}`);
    }
  });

  test('an armed detonator must name its EXPLOSIVE', () => {
    const bad = record(session());
    bad.snapshot['timedDetonator'] = {
      ...initialTimedDetonator(),
      armed: true
    };
    expect(() => decoded(bad)).toThrow('arms no EXPLOSIVE');
  });
});
