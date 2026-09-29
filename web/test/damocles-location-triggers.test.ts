import { beforeAll, describe, expect, test } from 'bun:test';

import type {
  AssembledCatalogue,
  LocationEntry
} from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { locationTrigger } from '../src/damocles/locationTriggers.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  decodeDamoclesSave,
  encodeDamoclesSave,
  type DamoclesSaveSnapshot
} from '../src/damocles/save.ts';
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

/// The location-trigger table `[$7A68]` and the region walk `$05A6EC` that reads it (#611,
/// docs/research/damocles-location-triggers.md). In the Eris STATE OFFICE, trigger 3 presents
/// the State President's welcome the first time the eye enters an indoor region on Floor 0.

const STATE_OFFICE = 'eris-surface-89';
const STATE_OFFICE_CELL = 0x89;
const VBL = 1 / 50;

/// `$7B34` for the State Office's hall (`$8000`), a door strip (`$83F0`), a lift car
/// (`$2001`) and its outdoor regions (`$C000`).
const HALL = 0x80_00;
const OUTDOORS = 0xc0_00;

const ERIS_TABLE: readonly LocationEntry[] = [
  { cell: 0x89, floor: 0, region: 0, trigger: 0x03 },
  { cell: 0x89, floor: 2, region: 7, trigger: 0x04 },
  { cell: 0xcf, floor: 10, region: 6, trigger: 0x08 },
  { cell: 0xec, floor: 1, region: 3, trigger: 0x1c },
  { cell: 0x11, floor: 1, region: 3, trigger: 0x1d }
];

describe('the region walk $05A6EC', () => {
  const where = {
    cell: STATE_OFFICE_CELL,
    floor: 0,
    region: 1,
    regionFlags: HALL
  };

  test('matches the cell byte, and nothing in another cell', () => {
    expect(locationTrigger(ERIS_TABLE, where)).toBe(3);
    expect(locationTrigger(ERIS_TABLE, { ...where, cell: 0x88 })).toBeNull();
    expect(
      locationTrigger(ERIS_TABLE, {
        ...where,
        cell: 0xec,
        floor: 1,
        region: 3
      })
    ).toBe(0x1c);
  });

  test('region 0 is any region whose flags have bit 14 clear: bit 6 of $7B34', () => {
    for (const regionFlags of [HALL, 0x83_f0, 0x20_01, 0x00_01]) {
      expect(locationTrigger(ERIS_TABLE, { ...where, regionFlags })).toBe(3);
    }
    for (const regionFlags of [OUTDOORS, 0xd0_00, 0x40_00]) {
      expect(
        locationTrigger(ERIS_TABLE, { ...where, region: 9, regionFlags })
      ).toBeNull();
    }
  });

  test('a named region matches its 1-based index only, whatever its flags', () => {
    const offer = { ...where, floor: 2, region: 7, regionFlags: 0x00_01 };
    // Trigger 3's entry names Floor 0, so on Floor 2 region 7 the offer's entry is the match.
    expect(locationTrigger(ERIS_TABLE, offer)).toBe(4);
    expect(locationTrigger(ERIS_TABLE, { ...offer, region: 6 })).toBeNull();
    expect(
      locationTrigger([{ cell: 0x89, floor: 2, region: 7, trigger: 4 }], {
        ...offer,
        regionFlags: OUTDOORS
      })
    ).toBe(4);
  });

  test('Floor 0 is Floor 0 only, and a negative Floor is any', () => {
    expect(locationTrigger(ERIS_TABLE, { ...where, floor: 1 })).toBeNull();
    expect(locationTrigger(ERIS_TABLE, { ...where, floor: 10 })).toBeNull();
    const anyFloor: LocationEntry[] = [
      { cell: 0x89, floor: -1, region: 0, trigger: 3 }
    ];
    for (const floor of [0, 1, 2, 10]) {
      expect(locationTrigger(anyFloor, { ...where, floor })).toBe(3);
    }
  });

  test('the first match ends the walk', () => {
    const table: LocationEntry[] = [
      { cell: 0xb2, floor: 0, region: 0, trigger: 0x09 },
      { cell: 0xb2, floor: -1, region: 0, trigger: 0x0c }
    ];
    expect(locationTrigger(table, { ...where, cell: 0xb2 })).toBe(0x09);
    expect(locationTrigger(table, { ...where, cell: 0xb2, floor: 1 })).toBe(
      0x0c
    );
  });

  test('a zero cell byte terminates the table, and an empty table matches nothing', () => {
    const table: LocationEntry[] = [
      { cell: 0, floor: 0, region: 0, trigger: 0x3f },
      { cell: 0x89, floor: 0, region: 0, trigger: 3 }
    ];
    expect(locationTrigger(table, where)).toBeNull();
    expect(locationTrigger(table, { ...where, cell: 0 })).toBeNull();
    expect(locationTrigger([], where)).toBeNull();
  });

  test('compares low bytes, as the walk reads $7B5C, $7AFD and $7AA5', () => {
    expect(
      locationTrigger(ERIS_TABLE, {
        ...where,
        cell: 0x1_00 + STATE_OFFICE_CELL,
        region: 0x1_01
      })
    ).toBe(3);
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

describe('the Catalogue’s tables', () => {
  test('CAPITAL CITY carries the State Office’s two entries and three more', () => {
    const island = content.surface.islands.find(
      item => item.areaName === 'CAPITAL CITY'
    )!;
    expect(island.locationTable).toEqual(ERIS_TABLE);
    // The other Eris islands' groups carry none.
    expect(
      content.surface.islands
        .filter(item => item !== island)
        .every(item => item.locationTable.length === 0)
    ).toBeTrue();
  });
});

const placement = () =>
  content.surface.placements.find(item => item.id === STATE_OFFICE)!;

/// A session outside the State Office's front door, in outdoor region 10 at local (0, 350),
/// facing the door (local −Z) and walking, as the `front-door` case placed the eye.
const beforeTheFrontDoor = (saved?: DamoclesSaveSnapshot): DamoclesSession => {
  const origin = placement().position;
  let snapshot = saved;
  if (snapshot === undefined) {
    const ground = new DamoclesSession(content);
    const cell = cellOf(origin, content.surface.grid);
    ground.teleportToCell(cell.x, cell.z);
    snapshot = ground.captureResume();
  }
  const session = new DamoclesSession(content, {
    ...snapshot,
    pose: {
      ...snapshot.pose,
      heading: Math.PI,
      position: { x: origin.x, y: snapshot.pose.position.y, z: origin.z + 350 }
    },
    structure: { ...snapshot.structure!, regionIndex: null }
  });
  session.intent = intent({ walk: 1 });
  return session;
};

/// Each message that begins presenting over `vbls` VBLs, with the VBL it begins on.
const presented = (
  session: DamoclesSession,
  vbls: number
): [number, string][] => {
  const seen: [number, string][] = [];
  let last: string | null = null;
  for (let vbl = 1; vbl <= vbls; vbl += 1) {
    session.advance(VBL);
    const id = session.snapshot.message?.id ?? null;
    if (id !== null && id !== last) {
      seen.push([vbl, id]);
    }
    last = id;
  }
  return seen;
};

/// Walk until the eye is inside the hall, region 1, and stop.
const walkIn = (session: DamoclesSession): number => {
  for (let vbl = 1; vbl <= 400; vbl += 1) {
    session.advance(VBL);
    if (session.snapshot.structure?.regionIndex === 0) {
      session.intent = intent({});
      return vbl;
    }
  }
  throw new Error('the eye never reached the hall');
};

const armed = (session: DamoclesSession, index: number): boolean =>
  session.captureResume().script.triggers.find(item => item.index === index)!
    .armed;

const identity = () => damoclesSaveIdentity(catalogue, 'test');

const decode = (encoded: string): DamoclesSaveSnapshot =>
  decodeDamoclesSave(encoded, identity(), {
    catalogue,
    poses: content.poses,
    strings: content.strings
  }).snapshot;

const roundTrip = (session: DamoclesSession): DamoclesSaveSnapshot =>
  decode(
    encodeDamoclesSave({
      identity: identity(),
      savedAt: '2026-09-29T00:00:00.000Z',
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot: session.captureResume(),
      where: 'ERIS 09-08'
    })
  );

describe('entering the State Office (#611)', () => {
  test('outdoors nothing fires, and trigger 3 fires on the pass the door strip is selected', () => {
    const session = beforeTheFrontDoor();
    expect(armed(session, 3)).toBeTrue();
    let vbl = 0;
    while (session.snapshot.structure?.regionIndex !== 7) {
      vbl += 1;
      session.advance(VBL);
      // Outdoor regions 9 and 10 are `$C000`, which region 0 does not match.
      if (session.snapshot.structure?.regionIndex !== 7) {
        expect(session.snapshot.message).toBeNull();
      }
      expect(vbl).toBeLessThan(400);
    }
    // Door region 8, `$83F0`: an indoor region of cell `$89` on Floor 0.
    expect(session.snapshot.message?.id).toBe('script3-inline-1');
    expect(session.captureResume().script.execution?.script).toBe(
      'damocles.script.slot-3'
    );
    expect(armed(session, 3)).toBeFalse();
  });

  test('presents the six lines with the clearing line after the fourth, then clears busy and holds the last row', () => {
    const session = beforeTheFrontDoor();
    const heard = presented(session, 1600);
    const start = heard[0]![0];
    // The walk launches the script in the pass's step, before that VBL's frame counts the first
    // line down, so every line holds 200 frames and the clearing line 50, counted from there.
    expect(heard.map(([vbl, id]) => [vbl - start + 1, id])).toEqual([
      [1, 'script3-inline-1'],
      [200, 'script3-inline-2'],
      [400, 'script3-inline-3'],
      [600, 'script3-inline-4'],
      [800, 'system-string-50'],
      [850, 'script3-inline-5'],
      [1050, 'script3-inline-6']
    ]);
    const script = session.captureResume().script;
    expect(script.execution).toBeNull();
    // Its own ending clears busy with no clearing line, so the last line stays on the row.
    expect(script.display.kind).toBe('held');
    expect(
      script.display.kind === 'held' ? script.display.cells.trim() : ''
    ).not.toBe('');
  });

  test('entering again presents nothing', () => {
    const session = beforeTheFrontDoor();
    walkIn(session);
    presented(session, 1300);
    // Out through the front door and back in.
    const out = beforeTheFrontDoor(session.captureResume());
    expect(presented(out, 600)).toEqual([]);
    expect(out.snapshot.structure?.regionIndex).toBe(0);
  });

  test('a Save taken after the messages does not replay them; one taken before entering does', () => {
    const after = beforeTheFrontDoor();
    walkIn(after);
    presented(after, 1300);
    const spent = roundTrip(after);
    expect(spent.script.triggers.find(item => item.index === 3)?.armed).toBe(
      false
    );
    expect(presented(beforeTheFrontDoor(spent), 600)).toEqual([]);

    const before = roundTrip(beforeTheFrontDoor());
    expect(before.script.triggers.find(item => item.index === 3)?.armed).toBe(
      true
    );
    expect(presented(beforeTheFrontDoor(before), 600)[0]?.[1]).toBe(
      'script3-inline-1'
    );
  });

  test('a schema-18 record migrates with trigger 3 armed, and a current one must carry it', () => {
    const snapshot = beforeTheFrontDoor().captureResume();
    const record = (schemaVersion: number, triggers: unknown) =>
      JSON.stringify({
        ...JSON.parse(
          encodeDamoclesSave({
            identity: identity(),
            savedAt: '2026-09-29T00:00:00.000Z',
            schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
            snapshot,
            where: 'ERIS 09-08'
          })
        ),
        schemaVersion,
        snapshot: { ...snapshot, script: { ...snapshot.script, triggers } }
      });
    const withoutLocations = snapshot.script.triggers.filter(
      item => item.index !== 3 && item.index !== 4 && item.index !== 15
    );
    expect(decode(record(18, withoutLocations)).script.triggers).toEqual(
      snapshot.script.triggers
    );
    expect(() =>
      decode(record(DAMOCLES_SAVE_SCHEMA_VERSION, withoutLocations))
    ).toThrow('script trigger table is incomplete or duplicated');
    expect(() => decode(record(18, snapshot.script.triggers))).toThrow(
      'script trigger table is incomplete or duplicated'
    );
  });

  test('a Save mid-welcome resumes the script where it stood', () => {
    const session = beforeTheFrontDoor();
    // About 90 VBLs of walking to the door, then two lines and part of the third.
    const heard = presented(session, 550);
    expect(heard.map(([, id]) => id)).toEqual([
      'script3-inline-1',
      'script3-inline-2',
      'script3-inline-3'
    ]);
    const resumed = new DamoclesSession(content, roundTrip(session));
    const rest = presented(resumed, 900);
    // The third line is still presenting as the resumed session opens, and holds its own frames.
    expect(rest[0]).toEqual([1, 'script3-inline-3']);
    expect(rest[1]![0]).toBe(heard[2]![0] + 200 - 550);
    expect(rest.map(([, id]) => id)).toEqual([
      'script3-inline-3',
      'script3-inline-4',
      'system-string-50',
      'script3-inline-5',
      'script3-inline-6'
    ]);
  });
});
