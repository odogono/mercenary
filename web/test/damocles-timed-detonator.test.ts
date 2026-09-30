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
  ARMED_EXPLOSIVE_MODEL,
  EXPLOSIVE_MODEL,
  doorUnkeyed,
  initialTimedDetonator,
  regionBlastFor,
  structureDamageFor,
  withStructureDamage,
  withinReach,
  type StructureDamage,
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

/// #649's live runs, against the port of what the blast leaves behind (#650).

/// A player at arrival Pose `pose` carrying the armed EXPLOSIVE 75 and the TIMED DETONATOR, the
/// EXPLOSIVE going off in 3 s, with `changes` over the Pose's own record.
const posed = (
  pose: string,
  detonator: Partial<TimedDetonator>,
  changes: (
    saved: DamoclesSaveSnapshot
  ) => Partial<DamoclesSaveSnapshot> = () => ({})
): DamoclesSession => {
  const start = fresh();
  expect(start.switchToPose(pose).kind).toBe('switched');
  const saved = start.captureResume();
  const held = [object(75), DETONATOR];
  return new DamoclesSession(content, {
    ...saved,
    carried: held,
    residence: [
      ...saved.residence.filter(item => !held.includes(item.instance)),
      ...held.map(carried)
    ],
    timedDetonator: {
      ...initialTimedDetonator(),
      armed: true,
      deadline: Math.floor(saved.elapsed) + 3,
      fuse: 3,
      slot: 75,
      ...detonator
    },
    ...changes(saved)
  });
};

const placementIds = (s: DamoclesSession) =>
  new Set(s.snapshot.surface.placements.map(placement => placement.id));

/// The view's flash, one character a VBL: 1 where the VBL painted it white.
const flashes = (s: DamoclesSession, count: number): string => {
  let seen = '';
  for (let vbl = 0; vbl < count; vbl += 1) {
    s.advance(1 / 50);
    seen += s.snapshot.screen.white ? '1' : '0';
  }
  return seen;
};

const bits = (word: number) => word.toString(2).padStart(16, '0');

describe("the structure damage table, against #649's runs", () => {
  test('a dropped charge 7 on dion-2-3 sets $7A5A and adds 02 32 0000 00 00; charge 6 adds none', () => {
    for (const charge of [6, 7]) {
      const s = posed('dion-2-3', { charge });
      expect(s.drop().kind).toBe('dropped');
      expect(s.snapshot.timedDetonator.regionBlast).toBe(charge === 7);
      s.advance(5);
      expect(s.snapshot.structureDamage).toEqual(
        charge === 7
          ? [{ cell: 0x32, door: 0, group: 2, level: 0, word: 0 }]
          : []
      );
      expect(placementIds(s).has('dion-surface-32')).toBe(charge !== 7);
    }
  });

  test('on gaea-ur-city-4-2 charge 7 adds none, and charge 8 removes cell $24 and keeps its ground', () => {
    for (const charge of [7, 8]) {
      const s = posed('gaea-ur-city-4-2', { charge });
      const before = s.snapshot.surface.placements;
      expect(s.drop().kind).toBe('dropped');
      s.advance(5);
      expect(s.snapshot.structureDamage).toEqual(
        charge === 8
          ? [{ cell: 0x24, door: 0, group: 7, level: 0, word: 0 }]
          : []
      );
      const after = placementIds(s);
      const gone = before.filter(placement => !after.has(placement.id));
      expect(gone.map(placement => placement.id)).toEqual(
        charge === 8 ? ['gaea-ur-city-surface-24'] : []
      );
      // The player stood in that cell, so the rebind leaves no structure bound.
      expect(s.snapshot.structure === null).toBe(charge === 8);
    }
  });

  test('a carried charge 4 in dion-transporter takes $7A5A from the proxy and adds 02 E3', () => {
    const s = posed('dion-transporter', { charge: 4 });
    s.advance(5);
    expect(s.snapshot.message?.id).toBe('system-string-34');
    expect(s.snapshot.timedDetonator.regionBlast).toBe(true);
    expect(s.snapshot.structureDamage).toEqual([
      { cell: 0xe3, door: 0, group: 2, level: 0, word: 0 }
    ]);
    expect(placementIds(s).has('dion-surface-e3')).toBe(false);
  });

  test('the proxy carries $7B5D, so a player indoors in the blast cell dies at any distance', () => {
    // The EXPLOSIVE stands where slot 34 does, in region 3 of cell $E3, as in #649's capture run.
    const at = content.catalogue.instances.find(
      item => item.id === object(34)
    )!.placement!;
    const s = posed('dion-transporter', {}, saved => ({
      carried: [DETONATOR],
      residence: [
        ...saved.residence.filter(
          item => item.instance !== object(75) && item.instance !== DETONATOR
        ),
        carried(DETONATOR),
        {
          instance: object(75),
          residence: {
            body: 'body-4',
            insertionGroup: 3,
            kind: 'structure',
            level: 9,
            parent: at.parent,
            placementClass: 0,
            position: {
              x: at.position[0],
              y: at.position[1],
              z: at.position[2]
            }
          }
        }
      ],
      timedDetonator: {
        ...initialTimedDetonator(),
        armed: true,
        charge: 4,
        deadline: Math.floor(saved.elapsed) + 3,
        fuse: 3,
        regionBlast: true,
        slot: 75
      }
    }));
    expect(s.snapshot.structure?.regionIndex).toBe(3);
    const host = s.snapshot.surface.placements.find(
      placement => placement.id === at.parent
    )!;
    const pose = s.snapshot.pose.position;
    // The proxy stands `$3F` below the eye. The box test would miss it.
    expect(
      withinReach(
        {
          x: host.position.x + at.position[0] - pose.x,
          y: host.position.y + at.position[1] - (pose.y - 0x3f),
          z: host.position.z + at.position[2] - pose.z
        },
        0x4_00
      )
    ).toBe(false);
    s.advance(5);
    expect(s.snapshot.removedResidents).toContain(object(75));
    expect(s.snapshot.screen.dead).toBe(true);
    expect(s.snapshot.message?.id).toBe('system-string-35');
  });

  test('the blast walks object slots only: no structure or ground is cleared', () => {
    const s = posed('dion-2-3', { charge: 9 });
    expect(s.drop().kind).toBe('dropped');
    s.advance(5);
    expect(
      s.snapshot.removedResidents.every(id => id.startsWith('object-slot-'))
    ).toBe(true);
  });

  test('the table survives a Save, and every workspace load replays it', () => {
    const s = posed('gaea-ur-city-4-2', { charge: 8 });
    s.drop();
    s.advance(5);
    const saved = decoded(record(s));
    expect(saved.structureDamage).toEqual(s.snapshot.structureDamage);
    const resumed = new DamoclesSession(content, {
      ...saved,
      structureDamage: saved.structureDamage!
    });
    expect(placementIds(resumed).has('gaea-ur-city-surface-24')).toBe(false);
    expect(resumed.switchToPose('dion-2-3').kind).toBe('switched');
    expect(resumed.switchToPose('gaea-ur-city-4-2').kind).toBe('switched');
    expect(placementIds(resumed).has('gaea-ur-city-surface-24')).toBe(false);
    expect(placementIds(resumed).has('gaea-ur-city-surface-23')).toBe(
      placementIds(fresh()).has('gaea-ur-city-surface-23') ||
        content.catalogue.instances.some(
          item => item.id === 'gaea-ur-city-surface-23'
        )
    );
  });
});

/// Authors House, DION group 2 cell `$DE`: its one keyed door is slot `$3FC`, key A in slot 30
/// (damocles-keyed-entrance.test.ts).
const AUTHORS_HOUSE = 'dion-surface-de';

/// A player in Authors House's keyed door's Proximity Box, carrying `held` over `changes`.
const atAuthorsHouseDoor = (
  held: readonly string[],
  changes: Partial<DamoclesSaveSnapshot> = {}
): DamoclesSession => {
  const start = fresh();
  expect(start.switchToPose('dion-2-3').kind).toBe('switched');
  const placement = start.snapshot.surface.placements.find(
    item => item.id === AUTHORS_HOUSE
  )!;
  const box = placement.selection!.structure.attachments.find(
    item => item.keyIndex !== undefined
  )!.proximityBox;
  const saved = start.captureResume();
  return new DamoclesSession(content, {
    ...saved,
    carried: [...held],
    pose: {
      ...saved.pose,
      position: {
        x: placement.position.x + (box.x[0] + box.x[1]) / 2,
        y: saved.pose.position.y,
        z: placement.position.z + (box.z[0] + box.z[1]) / 2
      }
    },
    residence: [
      ...saved.residence.filter(item => !held.includes(item.instance)),
      ...held.map(carried)
    ],
    structure: {
      attachments: placement.selection!.structure.attachments.map(item => ({
        latch: 'closed' as const,
        openUnits: 0,
        slot: item.slot
      })),
      doorway: null,
      floor: 0,
      instanceId: AUTHORS_HOUSE,
      regionIndex: null,
      ride: null
    },
    ...changes
  });
};

const doorUnits = (session: DamoclesSession) =>
  session.snapshot.structure!.attachments.find(item => item.slot === 0x3_fc)!
    .openUnits;

const modelOf = (s: DamoclesSession, slot: number) =>
  s.snapshot.residents.find(item => item.id === object(slot))?.modelId;

const DOOR_ENTRY: StructureDamage = {
  cell: 0xde,
  door: 0xfc,
  group: 2,
  level: 0,
  word: 0x80_1e
};

describe('the door entry', () => {
  test('a charge 3 dropped in a keyed door takes $7A56/$7A58 and adds a door entry', () => {
    const s = atAuthorsHouseDoor([object(75), DETONATOR], {
      timedDetonator: {
        ...initialTimedDetonator(),
        armed: true,
        charge: 3,
        deadline: Math.floor(fresh().captureResume().elapsed) + 3,
        fuse: 3,
        slot: 75
      }
    });
    expect(s.drop().kind).toBe('dropped');
    expect(s.snapshot.timedDetonator.door).toEqual({
      key: 30,
      level: 0,
      slot: 0x3_fc
    });
    expect(s.snapshot.timedDetonator.regionBlast).toBe(false);
    s.advance(5);
    expect(s.snapshot.structureDamage).toEqual([DOOR_ENTRY]);
    // A door entry removes no structure.
    expect(placementIds(s).has(AUTHORS_HOUSE)).toBe(true);
  });

  test('the door then opens without its key and says nothing', () => {
    const locked = atAuthorsHouseDoor([]);
    locked.advance(2);
    expect(doorUnits(locked)).toBe(0);
    const blown = atAuthorsHouseDoor([], { structureDamage: [DOOR_ENTRY] });
    blown.advance(2);
    expect(doorUnits(blown)).toBeGreaterThan(0);
    expect(blown.snapshot.message?.id).not.toBe('system-string-0');
  });

  test('the builder matches group, Floor and door slot, not the cell ($059F7A is dead)', () => {
    const table = [DOOR_ENTRY];
    expect(doorUnkeyed(table, 2, 0, 0x3_fc)).toBe(true);
    expect(doorUnkeyed([{ ...DOOR_ENTRY, cell: 0x10 }], 2, 0, 0x3_fc)).toBe(
      true
    );
    expect(doorUnkeyed(table, 7, 0, 0x3_fc)).toBe(false);
    expect(doorUnkeyed(table, 2, 1, 0x3_fc)).toBe(false);
    expect(doorUnkeyed(table, 2, 0, 0x3_f8)).toBe(false);
  });
});

describe('the entry rules', () => {
  test("#649's Parliament door run: 05 64 8022 00 EC", () => {
    expect(
      structureDamageFor(3, 5, 0x64, {
        door: { key: 0x22, level: 0, slot: 0x3_ec },
        regionBlast: false
      })
    ).toEqual({ cell: 0x64, door: 0xec, group: 5, level: 0, word: 0x80_22 });
  });

  test('none below charge 3, or with a group or cell of 0, or with no door and $7A5A clear', () => {
    const door = { key: 0x22, level: 0, slot: 0x3_ec };
    expect(structureDamageFor(2, 5, 0x64, { door, regionBlast: true })).toBe(
      null
    );
    expect(structureDamageFor(4, 0, 0x64, { door, regionBlast: true })).toBe(
      null
    );
    expect(structureDamageFor(4, 5, 0, { door, regionBlast: true })).toBe(null);
    expect(
      structureDamageFor(9, 5, 0x64, { door: null, regionBlast: false })
    ).toBe(null);
  });

  test('$7A5A set wins over a door', () => {
    expect(
      structureDamageFor(4, 5, 0x64, {
        door: { key: 0x22, level: 0, slot: 0x3_ec },
        regionBlast: true
      })
    ).toEqual({ cell: 0x64, door: 0, group: 5, level: 0, word: 0 });
  });

  test('nine entries, and a full table overwrites the ninth', () => {
    let table: readonly StructureDamage[] = [];
    for (let cell = 1; cell <= 10; cell += 1) {
      table = withStructureDamage(table, { ...DOOR_ENTRY, cell });
    }
    expect(table.map(entry => entry.cell)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 10
    ]);
  });
});

describe('the flash by charge', () => {
  test("a blast on the player's Body flashes the code word its charge reads", () => {
    for (const [charge, word] of [
      [4, 0xff_fa],
      [0, 0x70_08]
    ] as const) {
      const { x, z } = away();
      const s = armed(76, [placed(76, x, z)], { charge });
      expect(flashes(s, 250)).toContain(bits(word).replace(/^0+/, ''));
      expect(s.snapshot.screen.dead).toBe(false);
    }
  });

  test('a blast on another Body does not flash', () => {
    const s = armed(76, [placed(76, 0, 0)], { charge: 4 });
    expect(s.switchToPose('gaea-ur-city-4-2').kind).toBe('switched');
    expect(flashes(s, 250)).not.toContain('1');
  });

  test('the marker flashes $CA00 for a Body it destroys', () => {
    const s = fresh();
    s.destroyBody('body-4');
    expect(flashes(s, 16)).toBe(bits(0xca_00));
  });
});

describe('EXPLOSIVE-ARMED!', () => {
  test('* swaps model 257 in and out, and the label reads its name', () => {
    const s = session();
    expect(s.snapshot.inventoryLabel).toBe('EXPLOSIVE');
    expect(s.headCommand('read').kind).toBe('computed');
    expect(s.snapshot.inventoryLabel).toBe('EXPLOSIVE-ARMED!');
    expect(s.objectName(object(75))).toBe('EXPLOSIVE-ARMED!');
    expect(s.headCommand('read').kind).toBe('computed');
    expect(s.snapshot.inventoryLabel).toBe('EXPLOSIVE');
  });

  test('a placed armed EXPLOSIVE is drawn in the armed model, which a restore re-arms', () => {
    const { x, z } = away();
    const s = armed(76, [placed(76, x, z), placed(77, x, z)], { charge: 1 }, 5);
    expect(modelOf(s, 76)).toBe(ARMED_EXPLOSIVE_MODEL);
    expect(modelOf(s, 77)).toBe(EXPLOSIVE_MODEL);
  });

  test('a restore with the blast pending has reset the model ($058E60)', () => {
    const { x, z } = away();
    const s = armed(76, [placed(76, x, z)], { charge: 1 }, 1);
    for (let vbl = 0; vbl < 200; vbl += 1) {
      s.advance(1 / 50);
      if (s.snapshot.debrisPasses === BLAST_PENDING) {
        break;
      }
    }
    // The deadline leaves model 257 in; the Load's reset takes it out.
    expect(modelOf(s, 76)).toBe(ARMED_EXPLOSIVE_MODEL);
    const resumed = new DamoclesSession(content, s.captureResume());
    expect(modelOf(resumed, 76)).toBe(EXPLOSIVE_MODEL);
  });
});

describe('the Save, schema 26', () => {
  test('a schema-25 Save migrates with no damage and no door', () => {
    const old = record(session());
    old.schemaVersion = 25;
    delete old.snapshot['structureDamage'];
    const detonator = old.snapshot['timedDetonator'] as Record<string, unknown>;
    delete detonator['door'];
    const migrated = decoded(old);
    expect(migrated.structureDamage).toEqual([]);
    expect(migrated.timedDetonator?.door).toBe(null);
  });

  test('resumes the door $05A928 found', () => {
    const door = { key: 30, level: 0, slot: 0x3_fc };
    const s = session({ detonator: { door } });
    expect(decoded(record(s)).timedDetonator?.door).toEqual(door);
  });

  test('refuses a missing table, a stray word or a tenth entry', () => {
    const missing = record(session());
    delete missing.snapshot['structureDamage'];
    expect(() => decoded(missing)).toThrow('snapshot.structureDamage');
    const stray = record(session());
    stray.snapshot['structureDamage'] = [{ ...DOOR_ENTRY, word: 0x12 }];
    expect(() => decoded(stray)).toThrow('neither 0 nor a door');
    const full = record(session());
    full.snapshot['structureDamage'] = Array.from(
      { length: 10 },
      () => DOOR_ENTRY
    );
    expect(() => decoded(full)).toThrow('more than nine');
  });
});
