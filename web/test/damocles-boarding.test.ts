import { beforeAll, describe, expect, test } from 'bun:test';

import type { Catalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { planErisFrame } from '../src/damocles/frame.ts';
import { damoclesPanelViewModel } from '../src/damocles/panel.ts';
import { catalogueResidence } from '../src/damocles/residence.ts';
import {
  readDamoclesResume,
  writeDamoclesResume
} from '../src/damocles/resume.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  decodeDamoclesSave,
  encodeDamoclesSave,
  initialDamoclesSaveScript,
  type DamoclesSaveSnapshot
} from '../src/damocles/save.ts';
import { createDamoclesSavePersistence } from '../src/damocles/saves.ts';
import { TRIGGER_FOR_RESIDENT } from '../src/damocles/scripts.ts';
import { structureRegionAt } from '../src/damocles/selection.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import {
  parseDamoclesStrings,
  presentedText
} from '../src/damocles/strings.ts';
import {
  bearingFromYaw,
  erisSurfaceFrom,
  insideCentralCellHalf,
  structureInCell,
  type ErisSurface
} from '../src/damocles/world.ts';
import { titleStorageKeys } from '../src/shell/title.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// Boarding and leaving against the #407 contract, docs/design/damocles-boarding-admission.md.
///
/// Every session here is restored standing somewhere a walk could reach, with the structure
/// bound the way the session binds it, because the gate reads the live Selection and the live
/// structure region rather than anything a test could hand it.

let content: DamoclesContent;
let eye: number;

beforeAll(async () => {
  const catalogue = await loadCatalogue();
  const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
  content = {
    catalogue,
    doc,
    models: modelsOf(catalogue),
    poses: await arrivalPoses(),
    presentationSha256: 'test',
    strings: parseDamoclesStrings(
      await Bun.file('../payload/damocles/strings.json').json()
    ),
    surface: erisSurfaceFrom(catalogue, modelsOf(catalogue), doc)
  };
  eye = doc.eye.heightUnits;
});

interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const surfaceOf = (body: string, of = content): ErisSurface => {
  const origin = of.poses.poses.find(
    pose => pose.body === body && pose.workspaceOrigin !== null
  )!.workspaceOrigin!;
  return erisSurfaceFrom(of.catalogue, of.models, of.doc, {
    bodyId: body,
    origin
  });
};

/// A session restored standing at `position`, with whatever structure its cell binds bound and
/// its region selected, and `carried` in the Carried Stack.
const standingAt = (
  body: string,
  position: Point,
  carried: readonly string[] = [],
  of = content
): DamoclesSession => {
  const surface = surfaceOf(body, of);
  const pose = { body, heading: 0, pitch: 0, position };
  const placement = structureInCell(surface, position);
  return new DamoclesSession(of, {
    angleBytes: [],
    bodyTurn: 0,
    briefcaseStore: [],
    carried: [...carried],
    craft: null,
    doorsMoving: false,
    elapsed: 0,
    frameAccumulator: 0,
    occupancy: { kind: 'onFoot' },
    pendingBriefcaseDrop: null,
    pose,
    residence: carried.map(instance => ({
      instance,
      residence: {
        kind: 'carried' as const,
        placementClass: of.catalogue.instances.find(
          item => item.id === instance
        )!.placementClass!
      }
    })),
    // Carrying a pickup trigger's object means its trigger has fired, as a Save must say.
    script: {
      ...initialDamoclesSaveScript(),
      triggers: initialDamoclesSaveScript().triggers.map(trigger =>
        carried.some(id => TRIGGER_FOR_RESIDENT[id] === trigger.index)
          ? { ...trigger, armed: false }
          : trigger
      )
    },
    scrollCounter: 0,
    structure:
      placement === undefined
        ? null
        : {
            attachments:
              placement.selection?.structure.attachments.map(attachment => ({
                latch: 'closed' as const,
                openUnits: 0,
                slot: attachment.slot
              })) ?? [],
            doorway: null,
            floor: 0,
            instanceId: placement.id,
            regionIndex: insideCentralCellHalf(position, surface.grid)
              ? structureRegionAt(
                  placement,
                  pose,
                  of.doc.orientation.modelZ === 'negate'
                )
              : null,
            ride: null
          }
  } satisfies DamoclesSaveSnapshot);
};

/// Where a surface-resident object stands on its Body, as the session's surface places it.
const placedAt = (instance: string, of = content): Point => {
  const body = of.catalogue.instances.find(item => item.id === instance)!
    .location!.body;
  return surfaceOf(body, of).placements.find(item => item.id === instance)!
    .position;
};

const bodyOf = (instance: string, of = content): string =>
  of.catalogue.instances.find(item => item.id === instance)!.location!.body;

/// Standing `distance` units east of a placed object, at the on-foot eye height.
const beside = (
  instance: string,
  carried: readonly string[] = [],
  distance = 150,
  of = content
): DamoclesSession => {
  const at = placedAt(instance, of);
  return standingAt(
    bodyOf(instance, of),
    { x: at.x + distance, y: at.y + eye, z: at.z },
    carried,
    of
  );
};

const LIMO = 'object-slot-5';
const LIMO_KEY = 'object-slot-183';

/// The Vehicle Key each placed keyed craft is paired with, read from the published block.
const pairedKey = (instance: string): string =>
  content.catalogue.instances.find(item => item.id === instance)!.boarding!
    .pairedInstance!;

describe('the board gate', () => {
  test('a keyed craft boards while its Vehicle Key is carried', () => {
    const session = beside(LIMO, [LIMO_KEY]);
    expect(session.snapshot.selection).toMatchObject({ instance: LIMO });

    expect(session.board()).toEqual({ kind: 'boarded' });

    const snapshot = session.snapshot;
    expect(snapshot.occupancy).toEqual({ instance: LIMO, kind: 'aboard' });
    expect(session.occupancy).toEqual({ instance: LIMO, kind: 'aboard' });
    // Removed from Object Residence: neither placed nor carried, and not drawn or selectable.
    expect(
      snapshot.residence.find(item => item.instance === LIMO)?.residence.kind
    ).toBe('occupied');
    expect(snapshot.residents.map(item => item.id)).not.toContain(LIMO);
    expect(
      snapshot.selection.kind === 'object' && snapshot.selection.instance
    ).not.toBe(LIMO);
    // Boarding does not consume the Vehicle Key.
    expect(snapshot.carried).toEqual([LIMO_KEY]);
    expect(snapshot.message).toBeNull();
  });

  test('the camera takes the recovered yaw and the resident position plus 63', () => {
    const at = placedAt(LIMO);
    const session = beside(LIMO, [LIMO_KEY]);
    session.board();
    const { pose } = session.snapshot;
    expect(pose.position).toEqual({ x: at.x, y: at.y + 63, z: at.z });
    expect(eye).toBe(63);
    // `occ-boarded`: instance byte $7F becomes yaw word $01FC, with no orientation bias.
    const byte = content.catalogue.instances.find(item => item.id === LIMO)!
      .location!.heading!;
    expect(byte).toBe(0x7f);
    expect(pose.heading).toBeCloseTo(
      bearingFromYaw(0x01_fc, content.doc.orientation),
      12
    );
    expect(pose.pitch).toBe(0);
  });

  test('a keyed craft without its Vehicle Key refuses with VEHICLE KEY REQUIRED', () => {
    const session = beside(LIMO);
    expect(session.board()).toEqual({ kind: 'refused' });
    const snapshot = session.snapshot;
    expect(snapshot.message?.id).toBe('system-string-3');
    expect(presentedText(content.strings, 'system-string-3')?.trim()).toBe(
      'VEHICLE KEY REQUIRED'
    );
    expect(snapshot.occupancy).toEqual({ kind: 'onFoot' });
    expect(snapshot.residence).toEqual([]);
    expect(snapshot.selection).toMatchObject({ instance: LIMO });
  });

  test("another craft's Vehicle Key does not admit it", () => {
    const eagle = 'object-slot-3';
    const session = beside(eagle, [LIMO_KEY]);
    expect(session.snapshot.selection).toMatchObject({ instance: eagle });
    expect(session.board()).toEqual({ kind: 'refused' });
    expect(session.snapshot.message?.id).toBe('system-string-3');
  });

  test('DART II, slot 1, boards unkeyed', () => {
    const dart = 'object-slot-1';
    const session = beside(dart);
    expect(session.snapshot.selection).toMatchObject({ instance: dart });
    expect(session.board()).toEqual({ kind: 'boarded' });
    expect(session.snapshot.occupancy).toEqual({
      instance: dart,
      kind: 'aboard'
    });
  });

  test('INTERSTELLARSHIP, slot 7, refuses with SHIP NOT REFITTED whether or not a key is held', () => {
    const ship = 'object-slot-7';
    for (const carried of [[], [LIMO_KEY], ['object-slot-181']]) {
      const session = beside(ship, carried);
      expect(session.snapshot.selection).toMatchObject({ instance: ship });
      expect(session.board()).toEqual({ kind: 'refused' });
      expect(session.snapshot.message?.id).toBe('system-string-22');
      expect(session.snapshot.occupancy).toEqual({ kind: 'onFoot' });
    }
    expect(presentedText(content.strings, 'system-string-22')?.trim()).toBe(
      'SHIP NOT REFITTED FOR FURTHER FLIGHT'
    );
  });

  test('nothing at slot 23 or above boards, and it refuses silently', () => {
    // Slot 49 is placed on Lucan's surface and is past the boardable bound.
    const high = 'object-slot-49';
    const session = beside(high);
    expect(session.snapshot.selection).toMatchObject({ instance: high });
    expect(session.board()).toEqual({ kind: 'refused' });
    expect(session.snapshot.message).toBeNull();
    expect(session.snapshot.occupancy).toEqual({ kind: 'onFoot' });
    expect(session.drainEffects()).toEqual([]);
  });

  test('boarding while already aboard refuses silently', () => {
    const session = beside(LIMO, [LIMO_KEY]);
    session.board();
    const before = session.snapshot;
    expect(session.board()).toEqual({ kind: 'refused' });
    expect(session.snapshot.occupancy).toEqual(before.occupancy);
    expect(session.snapshot.pose).toEqual(before.pose);
    expect(session.snapshot.message).toBeNull();
  });

  test('boarding has its own reach: under 1024 units, not the Take’s 512', () => {
    const near = beside(LIMO, [LIMO_KEY], 1000);
    // Past the Take's reach, so the Selection is not in range for a Take.
    expect(near.snapshot.selection.kind).toBe('none');
    expect(near.board()).toEqual({ kind: 'boarded' });

    const far = beside(LIMO, [LIMO_KEY], 1030);
    expect(far.board()).toEqual({ kind: 'refused' });
    expect(far.snapshot.message).toBeNull();
    expect(far.snapshot.occupancy).toEqual({ kind: 'onFoot' });
  });

  test('the model guard refuses silently, after the key test', () => {
    const catalogue: Catalogue = {
      ...content.catalogue,
      instances: content.catalogue.instances.map(item =>
        item.id === LIMO
          ? { ...item, boarding: { ...item.boarding!, boardable: false } }
          : item
      )
    };
    const variant = { ...content, catalogue, models: modelsOf(catalogue) };

    const keyed = beside(LIMO, [LIMO_KEY], 150, variant);
    expect(keyed.board()).toEqual({ kind: 'refused' });
    expect(keyed.snapshot.message).toBeNull();
    expect(keyed.snapshot.occupancy).toEqual({ kind: 'onFoot' });

    // The key test runs first, so without the key its refusal still presents.
    const unkeyed = beside(LIMO, [], 150, variant);
    expect(unkeyed.board()).toEqual({ kind: 'refused' });
    expect(unkeyed.snapshot.message?.id).toBe('system-string-3');
  });

  test('placed craft board on all five Bodies that carry them', () => {
    const craft = [
      'object-slot-2', // Gaea
      'object-slot-3', // Eris
      'object-slot-4', // Eris
      'object-slot-5', // Eris
      'object-slot-6', // Dion
      'object-slot-10', // Bacchus
      'object-slot-12', // Thalia
      'object-slot-13' // Gaea
    ];
    expect(new Set(craft.map(item => bodyOf(item))).size).toBe(5);
    for (const instance of craft) {
      const refused = beside(instance);
      expect(refused.board()).toEqual({ kind: 'refused' });
      expect(refused.snapshot.message?.id).toBe('system-string-3');

      const session = beside(instance, [pairedKey(instance)]);
      expect(session.snapshot.selection).toMatchObject({ instance });
      expect(session.board()).toEqual({ kind: 'boarded' });
      expect(session.leave()).toEqual({ kind: 'left' });
      expect(session.snapshot.occupancy).toEqual({ kind: 'onFoot' });
    }
  });
});

describe("AUTHOR'S CHAIR in Authors House", () => {
  const CHAIR = 'object-slot-14';
  const HOUSE = 'dion-surface-de';

  /// Standing in Authors House at the point nearest the chair where the given region selector
  /// binds. The chair itself stands in region 32, which is interior.
  const inRegion = (selector: number): DamoclesSession => {
    const surface = surfaceOf('body-4');
    const house = surface.placements.find(item => item.id === HOUSE)!;
    const [x, , z] = content.catalogue.instances.find(
      item => item.id === CHAIR
    )!.placement!.position;
    const chair = { x: house.position.x + x, y: eye, z: house.position.z + z };
    const negate = content.doc.orientation.modelZ === 'negate';
    let nearest: { distance: number; position: Point } | undefined;
    for (let dx = -1000; dx <= 1000; dx += 10) {
      for (let dz = -1000; dz <= 1000; dz += 10) {
        const distance = Math.hypot(dx, dz);
        const position = { x: chair.x + dx, y: eye, z: chair.z + dz };
        const region = structureRegionAt(
          house,
          { body: 'body-4', heading: 0, pitch: 0, position },
          negate
        );
        if (
          region === selector - 1 &&
          (nearest === undefined || distance < nearest.distance)
        ) {
          nearest = { distance, position };
        }
      }
    }
    const session = standingAt('body-4', nearest!.position);
    expect(session.snapshot.structure?.regionIndex).toBe(selector - 1);
    expect(session.snapshot.residents.map(item => item.id)).toContain(CHAIR);
    return session;
  };

  test('boards as a seatable object from an exterior-flagged region', () => {
    // Region 26 exposes the chair 778 units away, past the Take's reach and inside boarding's.
    const session = inRegion(26);
    expect(session.board()).toEqual({ kind: 'boarded' });
    expect(session.snapshot.occupancy).toEqual({
      instance: CHAIR,
      kind: 'aboard'
    });
    expect(session.snapshot.residents.map(item => item.id)).not.toContain(
      CHAIR
    );
    expect(session.snapshot.message).toBeNull();
  });

  test('refuses silently from a region without bit 14', () => {
    const session = inRegion(12);
    expect(session.board()).toEqual({ kind: 'refused' });
    expect(session.snapshot.message).toBeNull();
    expect(session.snapshot.occupancy).toEqual({ kind: 'onFoot' });
  });

  test('leaving returns the player on foot and the chair to Object Residence', () => {
    const session = inRegion(26);
    session.board();
    expect(session.leave()).toEqual({ kind: 'left' });
    expect(session.snapshot.occupancy).toEqual({ kind: 'onFoot' });
    // Authored, not established (#407): boarding takes the region afresh at the chair's
    // origin, interior region 32, so the direct placement takes the structure branch at
    // insertion group 32 and the chair returns to its own residence. Had the region stayed
    // at 26, bit 14 would have sent it to the surface branch at the same position.
    expect(session.snapshot.structure?.regionIndex).toBe(31);
    expect(
      session.snapshot.residence.find(item => item.instance === CHAIR)
        ?.residence
    ).toEqual(catalogueResidence(content.catalogue, CHAIR));
    expect(session.snapshot.residents.map(item => item.id)).toContain(CHAIR);
  });
});

/// One craft pass: `ticksPerPass` VBLs of session time.
const passes = (
  session: DamoclesSession,
  count: number,
  intent: { readonly pitch?: number; readonly turn?: number } = {}
): void => {
  session.intent = { ...session.intent, pitch: 0, turn: 0, ...intent };
  for (let pass = 0; pass < count; pass += 1) {
    session.advance(content.doc.time.ticksPerPass / content.doc.time.vblHertz);
  }
};
const cues = (session: DamoclesSession): string[] =>
  session
    .drainEffects()
    .flatMap(effect => (effect.type === 'sound-request' ? [effect.cue] : []));

describe('aboard', () => {
  test('the craft Mover runs instead of the walk, and Take, Drop, the Body switch and goto do nothing', () => {
    const session = beside(LIMO, [LIMO_KEY]);
    session.board();
    const seated = session.snapshot.pose;
    // With the throttle at the stop preset's zero, walking moves nothing. The stick turns the
    // limo 6 yaw units a pass, a pass every four ticks: 12 passes in a second. The ground pass
    // levels the pitch to `$1FF`, a unit above the view's `$200`.
    session.intent = { ...session.intent, turn: 1, walk: 1 };
    session.advance(1);
    const pose = session.snapshot.pose;
    expect(pose.position).toEqual({
      x: Math.round(seated.position.x),
      y: Math.round(seated.position.y),
      z: Math.round(seated.position.z)
    });
    const turn = ((pose.heading - seated.heading) / (2 * Math.PI)) * 1024;
    expect(((Math.round(turn) % 1024) + 1024) % 1024).toBe(12 * 6);
    expect(pose.pitch).toBeCloseTo((2 * Math.PI) / 1024, 12);
    session.intent = { ...session.intent, turn: 0, walk: 0 };

    expect(session.take()).toEqual({ kind: 'refused' });
    expect(session.drop()).toEqual({ kind: 'refused' });
    expect(session.snapshot.carried).toEqual([LIMO_KEY]);
    expect(session.switchToPose('thalia').kind).toBe('declined');
    expect(() => session.teleportToCell(1, 1)).toThrow();
    expect(session.snapshot.pose).toEqual(pose);
    expect(session.snapshot.occupancy).toEqual({
      instance: LIMO,
      kind: 'aboard'
    });
  });

  test('drives the limo on the throttle keys, and a Building detail box bounces it back once', () => {
    const session = beside(LIMO, [LIMO_KEY]);
    session.board();
    const start = session.snapshot.pose.position;
    // Key 4 is scancode `$05`: forward at exponent 7, one key effect.
    session.throttleKey(0x05);
    session.throttleKey(0x05);
    expect(cues(session)).toEqual(['throttle']);
    passes(session, 20);
    // On the ground the limo settles at 33.6 a pass, which the speed field prints as 012.
    expect(
      damoclesPanelViewModel(session.snapshot, content.doc).speedLabel
    ).toBe('+ 000 000 012');
    expect(session.snapshot.craft?.panelSpeed).toBe(34);
    const moved = session.snapshot.pose.position;
    expect(Math.hypot(moved.x - start.x, moved.z - start.z)).toBeGreaterThan(
      500
    );
    // Driven on, it meets the spaceport's first support box, bumps once and glides back with
    // the throttle's exponent at `$FFF0` and the mantissa flipped.
    passes(session, 120);
    expect(cues(session)).toEqual(['bump']);
    expect(session.snapshot.craft?.throttle).toBe(0xff_f0_f0_00);
    expect(
      damoclesPanelViewModel(session.snapshot, content.doc).speedLabel
    ).toBe('- 000 000 000');
    // Leaving drops it where it stopped, facing as it was driven.
    const at = session.snapshot.pose;
    expect(session.leave()).toEqual({ kind: 'left' });
    expect(
      session.snapshot.residence.find(item => item.instance === LIMO)?.residence
    ).toMatchObject({
      kind: 'surface',
      position: { x: at.position.x, y: at.position.y - eye, z: at.position.z }
    });
    expect(
      damoclesPanelViewModel(session.snapshot, content.doc).speedLabel
    ).toBe('+ 000 000 000');
  });

  test('flies EAGLE NINE S E off the ground, refuses to leave in the air, and lands it', () => {
    const EAGLE = 'object-slot-3';
    const session = beside(EAGLE, [pairedKey(EAGLE)]);
    expect(session.board()).toEqual({ kind: 'boarded' });
    session.throttleKey(0x05);
    passes(session, 30);
    // Taxiing at key 4: 50 a pass, in contact, the nose held level at `$1FF`.
    expect(session.snapshot.craft?.panelSpeed).toBe(50);
    expect(session.snapshot.pose.position.y).toBe(63);
    // The stick's down bit lifts the nose 8 a pass; at 32 or more it survives contact.
    passes(session, 20, { pitch: 1 });
    expect(session.snapshot.pose.position.y).toBeGreaterThan(1000);
    expect(
      damoclesPanelViewModel(session.snapshot, content.doc).altitude
    ).not.toBe('000000');
    expect(session.leave()).toEqual({ kind: 'refused' });
    // Nose down to `$22F` and hold: a soft touchdown, level and in contact.
    passes(session, 26, { pitch: -1 });
    passes(session, 80);
    expect(session.snapshot.pose.position.y).toBe(63);
    expect(session.snapshot.occupancy).toEqual({
      instance: EAGLE,
      kind: 'aboard'
    });
    expect(cues(session)).toEqual(['throttle']);
    expect(session.leave()).toEqual({ kind: 'left' });
  });

  test('a dive past 45° is a hard landing that puts the player on foot', () => {
    const EAGLE = 'object-slot-3';
    const session = beside(EAGLE, [pairedKey(EAGLE)]);
    session.board();
    session.throttleKey(0x05);
    passes(session, 30);
    passes(session, 20, { pitch: 1 });
    passes(session, 40);
    // `$0582E8`: a pitch at or past `$280` below 64 goes to the landing handler, which stops
    // the craft and, on land, runs the leave path under the noise `$04C5A8`.
    passes(session, 40, { pitch: -1 });
    passes(session, 60);
    expect(session.snapshot.occupancy).toEqual({ kind: 'onFoot' });
    expect(cues(session)).toEqual(['throttle', 'blast']);
    expect(session.snapshot.pose.position.y).toBe(63);
  });

  test('the first panel lamp lights aboard below $28FA and is dark on foot', () => {
    const session = beside(LIMO, [LIMO_KEY]);
    const lamp = (snapshot = session.snapshot) =>
      damoclesPanelViewModel(snapshot, content.doc).groundLamp;
    // `eris-spaceport-onfoot`: `$7A8E` = 1, the lamp dark.
    expect(lamp()).toBe(false);
    session.board();
    // `boarded-limo`: `$7A8E` = 0 and `$7AB6` = 63, the lamp lit.
    expect(lamp()).toBe(true);
    // `dion-north-airborne`: aboard at `$7AB6` = 70084, the lamp dark again.
    const { pose } = session.snapshot;
    const at = (y: number) =>
      lamp({
        ...session.snapshot,
        pose: { ...pose, position: { ...pose.position, y } }
      });
    expect(at(0x28_fa - 1)).toBe(true);
    expect(at(0x28_fa)).toBe(false);
  });
});

const identity = () => damoclesSaveIdentity(content.catalogue, 'test');

const aboardLimo = (): DamoclesSession => {
  const session = beside(LIMO, [LIMO_KEY]);
  expect(session.board()).toEqual({ kind: 'boarded' });
  return session;
};

const encoded = (snapshot: DamoclesSaveSnapshot): string =>
  encodeDamoclesSave({
    identity: identity(),
    savedAt: '2026-09-24T09:00:00.000Z',
    schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
    snapshot,
    where: 'ERIS 07-08'
  });
/// The Data Payload a shipping restore reads, so every rule applies.
const saveContent = () => ({
  catalogue: content.catalogue,
  poses: content.poses,
  strings: content.strings
});
const decoded = (text: string): DamoclesSaveSnapshot =>
  decodeDamoclesSave(text, identity(), saveContent()).snapshot;
const roundTrip = (session: DamoclesSession): DamoclesSession =>
  new DamoclesSession(content, decoded(encoded(session.captureResume())));

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    storage: {
      getItem: (key: string) => map.get(key) ?? null,
      removeItem: (key: string) => {
        map.delete(key);
      },
      setItem: (key: string, value: string) => {
        map.set(key, value);
      }
    }
  };
};

describe('Occupancy across a Save and a Session Resume', () => {
  test('a Save taken aboard restores aboard the same craft, at the same seated view', () => {
    const session = aboardLimo();
    const restored = roundTrip(session);

    expect(restored.snapshot.occupancy).toEqual({
      instance: LIMO,
      kind: 'aboard'
    });
    expect(restored.snapshot.pose).toEqual(session.snapshot.pose);
    expect(restored.snapshot.structure).toEqual(session.snapshot.structure);
    // Absent from Object Residence: neither placed nor carried, so it is not drawn.
    expect(
      restored.snapshot.residence.find(item => item.instance === LIMO)
        ?.residence.kind
    ).toBe('occupied');
    expect(restored.snapshot.residents.map(item => item.id)).not.toContain(
      LIMO
    );
    expect(restored.captureResume()).toEqual(session.captureResume());

    // Leaving the restored session reaches the state leaving the original does.
    expect(session.leave()).toEqual({ kind: 'left' });
    expect(restored.leave()).toEqual({ kind: 'left' });
    expect(restored.captureResume()).toEqual(session.captureResume());
  });

  test('a Save taken on foot after leaving restores on foot with the craft resident at the leave position', () => {
    const session = aboardLimo();
    session.leave();
    const restored = roundTrip(session);

    expect(restored.snapshot.occupancy).toEqual({ kind: 'onFoot' });
    expect(restored.snapshot.pose).toEqual(session.snapshot.pose);
    expect(
      restored.snapshot.residence.find(item => item.instance === LIMO)
        ?.residence
    ).toMatchObject({ body: 'body-11', position: placedAt(LIMO) });
    expect(restored.snapshot.selection).toMatchObject({ instance: LIMO });
    expect(restored.captureResume()).toEqual(session.captureResume());
  });

  test('the Session Resume carries the same state and restores identically', () => {
    const session = aboardLimo();
    const { storage } = memoryStorage();
    writeDamoclesResume(storage, identity(), session);
    const read = readDamoclesResume(storage, identity(), saveContent());
    if (read.kind !== 'restored') {
      throw new Error(`Session Resume was ${read.kind}`);
    }
    expect(read.snapshot).toEqual(decoded(encoded(session.captureResume())));
    const restored = new DamoclesSession(content, read.snapshot);
    expect(restored.snapshot.occupancy).toEqual(session.snapshot.occupancy);
    expect(restored.snapshot.pose).toEqual(session.snapshot.pose);
    expect(restored.captureResume()).toEqual(session.captureResume());
  });

  test('a schema 5 record is refused whole, leaving the live session and the stored Save untouched', () => {
    let session = aboardLimo();
    const live = session;
    const { map, storage } = memoryStorage();
    const keys = titleStorageKeys('damocles');
    const { occupancy: _, ...schema5Snapshot } = session.captureResume();
    const schema5 = JSON.stringify({
      ...JSON.parse(encoded(session.captureResume())),
      schemaVersion: 5,
      snapshot: {
        ...schema5Snapshot,
        residence: schema5Snapshot.residence.filter(
          item => item.residence.kind !== 'occupied'
        )
      }
    });
    map.set(keys.save(1), schema5);
    const before = JSON.stringify(live.captureResume());
    const persistence = createDamoclesSavePersistence({
      capture: () => ({ snapshot: session.captureResume(), where: 'ERIS' }),
      catalogue: content.catalogue,
      identity: identity(),
      poses: content.poses,
      release: () => undefined,
      restore: snapshot => {
        session = new DamoclesSession(content, snapshot);
      },
      slotKey: keys.save,
      storage,
      strings: content.strings
    });

    expect(persistence.load(1).kind).toBe('failed');
    expect(session).toBe(live);
    expect(JSON.stringify(session.captureResume())).toBe(before);
    expect(map.get(keys.save(1))).toBe(schema5);
    expect(() => decoded(schema5)).toThrow(/schema 5/);
  });

  test('an occupied instance that is absent, not boardable, or still resident is refused', () => {
    const snapshot = aboardLimo().captureResume();
    const occupied = (instance: string): DamoclesSaveSnapshot => ({
      ...snapshot,
      occupancy: { instance, kind: 'aboard' },
      residence: snapshot.residence.map(item =>
        item.instance === LIMO ? { ...item, instance } : item
      )
    });
    const refusals: [string, DamoclesSaveSnapshot, RegExp][] = [
      ['absent', occupied('object-slot-999'), /Occupancy/],
      // The limo's Vehicle Key is handled but is no craft.
      [
        'not boardable',
        {
          ...occupied(LIMO_KEY),
          carried: [],
          residence: [
            {
              instance: LIMO_KEY,
              residence: { kind: 'occupied', placementClass: 4 }
            }
          ]
        },
        /Occupancy/
      ],
      [
        'still resident',
        {
          ...snapshot,
          residence: snapshot.residence.filter(item => item.instance !== LIMO)
        },
        /Occupancy/
      ],
      [
        'placed as well as occupied',
        {
          ...snapshot,
          residence: snapshot.residence.map(item =>
            item.instance === LIMO
              ? {
                  instance: LIMO,
                  residence: {
                    body: 'body-11',
                    kind: 'surface' as const,
                    placementClass: item.residence.placementClass,
                    position: placedAt(LIMO)
                  }
                }
              : item
          )
        },
        /Occupancy/
      ],
      [
        'occupied on foot',
        { ...snapshot, occupancy: { kind: 'onFoot' } },
        /Occupancy/
      ],
      [
        'malformed',
        {
          ...snapshot,
          occupancy: {
            kind: 'driving'
          } as unknown as DamoclesSaveSnapshot['occupancy']
        },
        /occupancy/i
      ]
    ];
    for (const [label, record, reason] of refusals) {
      expect(() => decoded(encoded(record)), label).toThrow(reason);
      expect(() => new DamoclesSession(content, record), label).toThrow(reason);
    }
  });
});

/// Runs `session` and an uninterrupted twin through the same play and holds them equal.
const inStep = (
  session: DamoclesSession,
  twin: DamoclesSession,
  play: (each: DamoclesSession) => void
): void => {
  play(session);
  play(twin);
  expect(session.captureResume()).toEqual(twin.captureResume());
  expect(session.snapshot.pose).toEqual(twin.snapshot.pose);
  expect(session.snapshot.craft).toEqual(twin.snapshot.craft);
  expect(cues(session)).toEqual(cues(twin));
};

/// A tick short of a whole pass, so a Save lands between two passes.
const partPass = (session: DamoclesSession): void => {
  session.advance(
    (content.doc.time.ticksPerPass - 1) / content.doc.time.vblHertz
  );
};

/// A current record as schema 11 wrote it: no craft words and no angle bytes.
const schema11 = (snapshot: DamoclesSaveSnapshot): string => {
  const { angleBytes: _a, craft: _c, ...older } = snapshot;
  return JSON.stringify({
    ...JSON.parse(encoded(snapshot)),
    schemaVersion: 11,
    snapshot: older
  });
};

describe('the craft words across a Save and a Session Resume (#557)', () => {
  test('a Save taken mid-drive resumes driving, and the next passes match an uninterrupted run', () => {
    const session = aboardLimo();
    session.throttleKey(0x05);
    passes(session, 12, { turn: 1 });
    partPass(session);
    const saved = session.captureResume();
    expect(saved.craft).toMatchObject({
      contact: 0x3f,
      passTicks: content.doc.time.ticksPerPass - 1,
      throttle: session.snapshot.craft!.throttle
    });
    cues(session);
    const restored = roundTrip(session);
    expect(restored.snapshot.pose).toEqual(session.snapshot.pose);
    expect(restored.snapshot.craft).toEqual(session.snapshot.craft);
    expect(restored.captureResume()).toEqual(saved);
    const at = session.snapshot.pose.position;
    inStep(restored, session, each => passes(each, 30, { turn: -1 }));
    const moved = session.snapshot.pose.position;
    expect(Math.hypot(moved.x - at.x, moved.z - at.z)).toBeGreaterThan(500);
  });

  test('a Save taken mid-flight resumes climbing and banking, through the Session Resume too', () => {
    const EAGLE = 'object-slot-3';
    const session = beside(EAGLE, [pairedKey(EAGLE)]);
    session.board();
    session.throttleKey(0x05);
    passes(session, 30);
    passes(session, 20, { pitch: 1 });
    passes(session, 6, { turn: 1 });
    partPass(session);
    const pose = session.snapshot.pose;
    expect(pose.position.y).toBeGreaterThan(1000);
    expect(pose.roll ?? 0).not.toBe(0);
    expect(session.captureResume().craft?.contact).toBe(0);
    cues(session);

    const restored = roundTrip(session);
    expect(restored.snapshot.pose).toEqual(pose);
    expect(restored.leave()).toEqual({ kind: 'refused' });

    const { storage } = memoryStorage();
    writeDamoclesResume(storage, identity(), session);
    const read = readDamoclesResume(storage, identity(), saveContent());
    if (read.kind !== 'restored') {
      throw new Error(`Session Resume was ${read.kind}`);
    }
    const resumed = new DamoclesSession(content, read.snapshot);
    expect(resumed.snapshot.pose).toEqual(pose);

    const play = (each: DamoclesSession) => {
      passes(each, 10, { turn: 1 });
      passes(each, 26, { pitch: -1 });
      passes(each, 80);
    };
    play(resumed);
    inStep(restored, session, play);
    expect(resumed.captureResume()).toEqual(session.captureResume());
    expect(session.snapshot.pose.position.y).not.toBe(pose.position.y);
    expect(session.snapshot.occupancy).toEqual({
      instance: EAGLE,
      kind: 'aboard'
    });
  });

  test('a Save taken on the boarding frame keeps the on-foot sines the first pass reads', () => {
    const session = aboardLimo();
    const saved = session.captureResume().craft!;
    expect(saved.trig.yaw).not.toBe(saved.yaw);
    const restored = roundTrip(session);
    expect(restored.captureResume().craft).toEqual(saved);
    session.throttleKey(0x05);
    restored.throttleKey(0x05);
    inStep(restored, session, each => passes(each, 4, { turn: 1 }));
  });

  test('a left craft keeps the angle byte its leave wrote across a Save', () => {
    const session = aboardLimo();
    passes(session, 12, { turn: 1 });
    expect(session.leave()).toEqual({ kind: 'left' });
    const saved = session.captureResume();
    expect(saved.craft).toBeNull();
    expect(saved.angleBytes).toEqual([
      { byte: expect.any(Number), instance: LIMO }
    ]);
    const heading = (of: DamoclesSession) =>
      of.snapshot.residents.find(item => item.id === LIMO)?.heading;
    const restored = roundTrip(session);
    expect(heading(restored)).toBe(heading(session)!);
    expect(heading(restored)).not.toBe(heading(aboardLimo()));
    expect(restored.captureResume()).toEqual(saved);
  });

  test('a schema-11 record aboard is migrated to the boarding preset, facing the saved heading', () => {
    const session = aboardLimo();
    session.throttleKey(0x05);
    passes(session, 12, { turn: 1 });
    const record = decodeDamoclesSave(
      schema11(session.captureResume()),
      identity(),
      saveContent()
    );
    expect(record.schemaVersion).toBe(DAMOCLES_SAVE_SCHEMA_VERSION);
    expect(record.snapshot.craft).toBeNull();
    expect(record.snapshot.angleBytes).toEqual([]);

    const restored = new DamoclesSession(content, record.snapshot);
    const zero = content.catalogue.craft!.constants.zero.operand >>> 0;
    expect(restored.snapshot.occupancy).toEqual({
      instance: LIMO,
      kind: 'aboard'
    });
    expect(restored.snapshot.craft).toMatchObject({
      held: null,
      panelSpeed: 0,
      speed: zero,
      throttle: zero
    });
    const pose = restored.snapshot.pose;
    expect(pose.position).toEqual(session.snapshot.pose.position);
    expect(pose.heading).toBeCloseTo(session.snapshot.pose.heading, 12);
    expect(pose.pitch).toBe(0);
    expect(restored.captureResume().craft).toMatchObject({
      contact: 0x3f,
      passTicks: 0,
      turnRate: zero
    });
    // It drives again from rest.
    restored.throttleKey(0x05);
    passes(restored, 10);
    expect(restored.snapshot.craft?.panelSpeed).toBeGreaterThan(0);
  });

  test('a schema-11 record on foot loads as it did, and schema 10 is still refused', () => {
    const session = aboardLimo();
    session.leave();
    const current = session.captureResume();
    const migrated = decoded(schema11(current));
    expect(migrated).toEqual({ ...current, angleBytes: [] });
    const schema10 = JSON.stringify({
      ...JSON.parse(schema11(current)),
      schemaVersion: 10
    });
    expect(() => decoded(schema10)).toThrow(/schema 10/);
  });

  test('craft words that contradict Occupancy, their bounds or the Pose are refused', () => {
    const aboard = aboardLimo();
    aboard.throttleKey(0x05);
    passes(aboard, 12, { turn: 1 });
    const snapshot = aboard.captureResume();
    const craft = snapshot.craft!;
    const onFoot = (() => {
      const session = aboardLimo();
      session.leave();
      return session.captureResume();
    })();
    const decodeRefusals: [string, DamoclesSaveSnapshot, RegExp][] = [
      ['aboard with none', { ...snapshot, craft: null }, /Occupancy/],
      ['on foot with some', { ...onFoot, craft }, /Occupancy/],
      ['contact', { ...snapshot, craft: { ...craft, contact: 1 } }, /contact/],
      ['yaw', { ...snapshot, craft: { ...craft, yaw: 0x1_00_00 } }, /yaw/],
      ['speed', { ...snapshot, craft: { ...craft, speed: -1 } }, /speed/],
      [
        'angle byte',
        { ...onFoot, angleBytes: [{ byte: 256, instance: LIMO }] },
        /byte/
      ],
      [
        'angle byte of no craft',
        { ...onFoot, angleBytes: [{ byte: 1, instance: LIMO_KEY }] },
        /boardable/
      ]
    ];
    for (const [label, record, reason] of decodeRefusals) {
      expect(() => decoded(encoded(record)), label).toThrow(reason);
    }
    const sessionRefusals: [string, DamoclesSaveSnapshot, RegExp][] = [
      [
        'heading',
        { ...snapshot, pose: { ...snapshot.pose, heading: 0.5 } },
        /craft words draw/
      ],
      [
        'position',
        {
          ...snapshot,
          pose: {
            ...snapshot.pose,
            position: { ...snapshot.pose.position, x: 0.5 }
          }
        },
        /craft words draw/
      ],
      [
        'pass phase',
        {
          ...snapshot,
          craft: { ...craft, passTicks: content.doc.time.ticksPerPass }
        },
        /pass phase/
      ]
    ];
    for (const [label, record, reason] of sessionRefusals) {
      expect(() => new DamoclesSession(content, record), label).toThrow(reason);
    }
  });
});

/// What the boot hands the planner: every resident with a departure is hidden from its
/// Catalogue placement, and the residents drawn at a departure are passed in.
const drawn = (session: DamoclesSession): readonly string[] => {
  const snapshot = session.snapshot;
  return planErisFrame(
    snapshot.surface,
    snapshot.pose,
    content.doc,
    snapshot.structure,
    snapshot.residents,
    [
      ...snapshot.carried,
      ...snapshot.briefcaseStore,
      ...snapshot.residence.map(item => item.instance)
    ]
  ).drawnPlacements;
};
const count = (ids: readonly string[], id: string): number =>
  ids.filter(item => item === id).length;

describe('the frame plan', () => {
  test('draws an occupied craft nowhere and a left one exactly once', () => {
    const session = beside(LIMO, [LIMO_KEY]);
    expect(count(drawn(session), LIMO)).toBe(1);
    session.board();
    expect(count(drawn(session), LIMO)).toBe(0);
    session.leave();
    expect(count(drawn(session), LIMO)).toBe(1);
  });
});

describe('leaving', () => {
  test('restores the craft at the leave position as a direct-placement Drop and returns the player on foot', () => {
    const at = placedAt(LIMO);
    const session = beside(LIMO, [LIMO_KEY]);
    session.board();
    const aboard = session.snapshot.pose;

    expect(session.leave()).toEqual({ kind: 'left' });

    const snapshot = session.snapshot;
    expect(snapshot.occupancy).toEqual({ kind: 'onFoot' });
    expect(snapshot.pose.position).toEqual(aboard.position);
    expect(snapshot.pose.heading).toBe(aboard.heading);
    expect(snapshot.pose.pitch).toBe(0);
    const residence = snapshot.residence.find(
      item => item.instance === LIMO
    )?.residence;
    // The Drop's direct placement: 63 below the Pose, which is where the limo stood.
    expect(residence).toMatchObject({ body: 'body-11', position: at });
    expect(['surface', 'structure']).toContain(residence!.kind);
    expect(snapshot.carried).toEqual([LIMO_KEY]);
    expect(snapshot.selection).toMatchObject({ instance: LIMO });
    expect(snapshot.message).toBeNull();
    // It is not refused with system-string-9, and presents nothing.
    expect(session.drainEffects()).toEqual([]);
  });

  test('refuses silently on foot', () => {
    const session = beside(LIMO, [LIMO_KEY]);
    expect(session.leave()).toEqual({ kind: 'refused' });
    expect(session.snapshot.message).toBeNull();
    expect(session.snapshot.residence).toEqual(
      beside(LIMO, [LIMO_KEY]).snapshot.residence
    );
  });

  test('a left craft can be boarded again and the left state survives a Session Resume', () => {
    const session = beside(LIMO, [LIMO_KEY]);
    session.board();
    session.leave();
    const restored = new DamoclesSession(content, session.captureResume());
    expect(restored.snapshot.selection).toMatchObject({ instance: LIMO });
    expect(restored.board()).toEqual({ kind: 'boarded' });
  });
});
