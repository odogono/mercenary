import { beforeAll, describe, expect, test } from 'bun:test';

import type { Catalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import { planErisFrame } from '../src/damocles/frame.ts';
import { initialHeadCommands } from '../src/damocles/headCommands.ts';
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
import { NEW_GAME_NOISE } from '../src/damocles/script.ts';
import {
  COMPUTER_TRIGGERS,
  DESTRUCTION_TRIGGERS,
  ENDING_TRIGGERS,
  TRIGGER_FOR_RESIDENT
} from '../src/damocles/scripts.ts';
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
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// The endings a record older than schema 22 does not carry.
const OLDER_ENDINGS = [
  ...ENDING_TRIGGERS,
  ...DESTRUCTION_TRIGGERS,
  ...COMPUTER_TRIGGERS
];

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
    documents: await damoclesDocuments(),
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
    encounter: null,
    footTicks: 0,
    frameAccumulator: 0,
    headCommands: initialHeadCommands(),
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
    running: false,
    script: {
      ...initialDamoclesSaveScript(),
      triggers: initialDamoclesSaveScript().triggers.map(trigger =>
        carried.some(id => TRIGGER_FOR_RESIDENT[id] === trigger.index)
          ? { ...trigger, armed: false }
          : trigger
      )
    },
    scrollCounter: 0,
    spaceMemory: null,
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
  test('the craft Mover runs instead of the walk, and Take, the Body switch and goto do nothing', () => {
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
    expect(session.snapshot.carried).toEqual([LIMO_KEY]);
    expect(session.switchToPose('thalia').kind).toBe('declined');
    expect(() => session.teleportToCell(1, 1)).toThrow();
    expect(session.snapshot.pose).toEqual(pose);
    expect(session.snapshot.occupancy).toEqual({
      instance: LIMO,
      kind: 'aboard'
    });
  });

  test('the pad steps the throttle a notch at a time, from a stop and between notches', () => {
    const session = beside(LIMO, [LIMO_KEY]);
    session.board();
    const throttle = () => session.snapshot.craft?.throttle;
    // From the boarding stop, up is key 1; the digits double from there, as Targ's ladder does.
    session.throttleNotchStep(1);
    expect(throttle()).toBe(0x4_10_00);
    session.throttleNotchStep(1);
    expect(throttle()).toBe(0x5_10_00);
    session.throttleNotchStep(-1);
    session.throttleNotchStep(-1);
    expect(throttle()).toBe(0xff_00_10_00);
    // Between notches after `=`, up and down land on the notches either side.
    session.throttleKey(0x05);
    session.throttleScale(1);
    session.throttleNotchStep(1);
    expect(throttle()).toBe(0x8_10_00);
    session.throttleScale(1);
    session.throttleNotchStep(-1);
    expect(throttle()).toBe(0x8_10_00);
    // Key 0 is the top: up writes nothing.
    session.throttleKey(0x0b);
    session.throttleNotchStep(1);
    expect(throttle()).toBe(0xd_10_00);
    // In reverse the step keeps the gear, on the function keys.
    session.throttleKey(0x3e);
    session.throttleNotchStep(1);
    expect(throttle()).toBe(0x8_f0_00);
    session.throttleNotchStep(-1);
    session.throttleNotchStep(-1);
    expect(throttle()).toBe(0x6_f0_00);
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

  // #357, the route `ground-contact-probe.py` runs: a Drop on the ground passes the contact
  // gate `$05462A`; the same Drop after the climb has cleared `$7ACA` refuses there, silently.
  test('a Drop aboard completes on the ground and refuses in the air', () => {
    const EAGLE = 'object-slot-3';
    const session = beside(EAGLE, [pairedKey(EAGLE), LIMO_KEY]);
    session.board();
    expect(session.drop()).toEqual({ kind: 'dropped' });
    expect(session.snapshot.carried).toEqual([LIMO_KEY]);
    session.drainEffects();

    session.throttleKey(0x05);
    passes(session, 30);
    passes(session, 20, { pitch: 1 });
    expect(session.captureResume().craft?.contact).toBe(0);
    expect(session.drop()).toEqual({ kind: 'refused' });
    expect(session.snapshot.carried).toEqual([LIMO_KEY]);
    expect(session.snapshot.message).toBeNull();
    expect(cues(session)).toEqual(['throttle']);
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

  // #357: aboard a craft on the ground, a Drop passes the contact gate and places the head
  // of the Carried Stack one eye height below the eye -- where the craft stands. Aboard, the
  // direct placement writes insertion group zero, so it lands on the surface.
  test('a Drop completes aboard as a surface placement where the craft stands', () => {
    const session = beside(LIMO, [LIMO_KEY]);
    session.board();
    const pose = session.snapshot.pose;
    const at = { ...pose.position, y: pose.position.y - eye };

    expect(session.drop()).toEqual({ kind: 'dropped' });

    const snapshot = session.snapshot;
    expect(snapshot.carried).toEqual([]);
    expect(snapshot.pose).toEqual(pose);
    expect(snapshot.occupancy).toEqual({ instance: LIMO, kind: 'aboard' });
    expect(
      snapshot.residence.find(item => item.instance === LIMO_KEY)?.residence
    ).toMatchObject({ body: 'body-11', kind: 'surface', position: at });
    expect(snapshot.message).toBeNull();

    const restored = new DamoclesSession(content, session.captureResume());
    expect(restored.snapshot.carried).toEqual([]);
    expect(restored.leave()).toEqual({ kind: 'left' });
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

/// A schema-13 or older record's script: the six pickup triggers, and no landing state (#576).
const olderScript = (script: DamoclesSaveSnapshot['script']) => {
  const { encounter: _e, flags: _f, noise: _n, ...older } = script;
  return {
    ...older,
    triggers: older.triggers.filter(({ index }) =>
      [2, 5, 6, 11, 20, 62].includes(index)
    )
  };
};

/// A current record as schema 11 wrote it: no craft words, no angle bytes and no space words.
const schema11 = (snapshot: DamoclesSaveSnapshot): string => {
  const { angleBytes: _a, craft: _c, spaceMemory: _m, ...older } = snapshot;
  return JSON.stringify({
    ...JSON.parse(encoded(snapshot)),
    schemaVersion: 11,
    snapshot: { ...older, script: olderScript(snapshot.script) }
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
    // The drive stepped the noise pointer, which a migrated record restarts from New Game's.
    expect(migrated).toEqual({
      ...current,
      angleBytes: [],
      encounter: null,
      script: { ...current.script, noise: NEW_GAME_NOISE },
      spaceMemory: null
    });
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

/// Passes until the space entry, which the launch's climb reaches within a few hundred.
/// EAGLE NINE S E boarded and set down on DION by authored Atlas Travel aboard.
const onDion = (): DamoclesSession => {
  const eagle = 'object-slot-3';
  const session = beside(eagle, [pairedKey(eagle)]);
  session.board();
  expect(session.travelToAtlas({ bodyId: 'body-4', x: 3260, z: 1322 })).toEqual(
    { kind: 'travelled' }
  );
  return session;
};

/// Up from DION, into space from its centre, and steered onto LACHESIS until the landing.
const flyToLachesis = (session: DamoclesSession): void => {
  session.throttleKey(0x05);
  passes(session, 30);
  passes(session, 20, { pitch: 1 });
  session.launchCraft();
  toSpace(session);
  expect(session.snapshot.craft?.space?.position).toEqual({
    x: -300_000,
    y: 64,
    z: -72_000
  });
  // Coast clear of DION on the launch throttle, then key 9, turning onto LACHESIS.
  passes(session, 5);
  session.throttleKey(0x39);
  session.throttleKey(0x0a);
  const lachesis = content.catalogue.craft!.bodies[7]!;
  let before = session.snapshot.craft!.space!.position;
  for (let pass = 0; pass < 400; pass += 1) {
    const at = session.snapshot.craft!.space!.position;
    const moving = { x: at.x - before.x, z: at.z - before.z };
    const wanted = { x: lachesis.x - at.x, z: lachesis.z - at.z };
    before = at;
    // The stick right turns the motion clockwise: steer the motion onto the Body.
    const cross = moving.x * wanted.z - moving.z * wanted.x;
    passes(session, 1, { turn: cross > 0 ? -1 : 1 });
    if (session.snapshot.craft?.space === null) {
      expect(pass).toBeGreaterThan(0);
      return;
    }
  }
  throw new Error('the crossing never landed');
};

const toSpace = (session: DamoclesSession): number => {
  for (let pass = 1; pass <= 400; pass += 1) {
    passes(session, 1);
    if (session.snapshot.craft?.space !== null) {
      return pass;
    }
  }
  throw new Error('the launch never reached space');
};

describe('launch and space (#566)', () => {
  const EAGLE = 'object-slot-3';
  /// EAGLE NINE S E off the ground over Eris: key 4, then the nose up.
  const aloft = (): DamoclesSession => {
    const session = beside(EAGLE, [pairedKey(EAGLE)]);
    session.board();
    session.throttleKey(0x05);
    passes(session, 30);
    passes(session, 20, { pitch: 1 });
    expect(session.snapshot.pose.position.y).toBeGreaterThan(1000);
    cues(session);
    return session;
  };

  test('launches aloft, swings the nose down, climbs backwards into space and turns there', () => {
    const session = aloft();
    const pitch = session.snapshot.pose.pitch;
    session.launchCraft();
    expect(session.snapshot.craft?.swing).toBe(true);
    expect(cues(session)).toEqual(['throttle']);
    // The swing moves the nose alone, 16 a pass, and nothing else.
    const { position } = session.snapshot.pose;
    passes(session, 1);
    expect(session.snapshot.pose.position).toEqual(position);
    expect(session.snapshot.pose.pitch).not.toBe(pitch);
    toSpace(session);
    const entered = session.snapshot;
    expect(entered.craft?.swing).toBe(false);
    // From ERIS's centre, 64 up, nearest ERIS as the first world boots.
    expect(entered.craft?.space).toMatchObject({
      nearest: 'body-11',
      position: { x: -630_000, y: 64, z: 390_000 }
    });
    // The Pose stays where the craft left the Body; the view is the craft's.
    passes(session, 10, { turn: 1 });
    const flying = session.snapshot;
    expect(flying.pose.position).toEqual(entered.pose.position);
    expect(flying.pose.heading).not.toBe(entered.pose.heading);
    expect(flying.craft?.space?.position).not.toEqual(
      entered.craft?.space?.position
    );
    // Reverse thrust near the speed of light, and the range in the altitude window.
    const panel = damoclesPanelViewModel(flying, content.doc);
    expect(panel.speedLabel).toMatch(/^- [12]\d\d /);
    expect(panel.altitude).not.toBe('******');
    expect(panel.groundLamp).toBe(false);
    // In space there is no ground contact to leave from, and no second launch.
    expect(session.leave()).toEqual({ kind: 'refused' });
    session.launchCraft();
    expect(cues(session)).toEqual([]);
    // The frame draws the sky alone.
    const plan = planErisFrame(
      flying.surface,
      flying.pose,
      content.doc,
      flying.structure,
      flying.residents,
      [],
      () => false,
      false,
      null,
      true
    );
    expect(plan.triangleCount).toBe(0);
    expect(plan.drawnPlacements).toEqual([]);
  });

  test('refuses silently on the ground, and a throttle key ends the swing', () => {
    const session = beside(EAGLE, [pairedKey(EAGLE)]);
    session.board();
    session.launchCraft();
    expect(session.snapshot.craft?.swing).toBe(false);
    expect(cues(session)).toEqual([]);

    const flying = aloft();
    flying.launchCraft();
    passes(flying, 1);
    flying.throttleKey(0x05);
    expect(flying.snapshot.craft?.swing).toBe(false);
  });

  test('CONCORD III, whose +$1A is 90, is not equipped for space travel', () => {
    const CONCORD = 'object-slot-10';
    const session = beside(CONCORD, [pairedKey(CONCORD)]);
    expect(session.board()).toEqual({ kind: 'boarded' });
    session.throttleKey(0x05);
    passes(session, 30);
    passes(session, 20, { pitch: 1 });
    expect(session.snapshot.pose.position.y).toBeGreaterThan(1000);
    session.launchCraft();
    expect(session.snapshot.craft?.swing).toBe(false);
    expect(session.snapshot.message?.id).toBe('system-string-21');
  });

  test('stopped in ERIS’s range, the craft lands back over ERIS once the hold runs out (#567)', () => {
    const session = aloft();
    session.launchCraft();
    toSpace(session);
    const turn = session.snapshot.bodyTurn;
    // Space at once: the craft stays inside ERIS's arrival range, as the traced `return` does.
    session.throttleKey(0x39);
    // Fifty passes count the hold `$7B0A` down; the next raises the arrival and lands.
    passes(session, 50);
    expect(session.snapshot.craft?.space).not.toBeNull();
    const yaw = session.snapshot.pose.heading;
    passes(session, 1);
    const landed = session.snapshot;
    expect(landed.craft?.space).toBeNull();
    expect(landed.craft?.held).toBeNull();
    expect(landed.occupancy).toEqual({ instance: EAGLE, kind: 'aboard' });
    expect(landed.pose.body).toBe('body-11');
    expect(landed.surface.body.id).toBe('body-11');
    // 25,165,824 up over the point under the craft, the heading kept.
    expect(landed.pose.position.y).toBe(0x01_80_00_00);
    expect(landed.pose.heading).toBe(yaw);
    expect(landed.pose.position.x % 0x1_00_00).toBe(0);
    expect(landed.pose.position.z % 0x1_00_00).toBe(0);
    // The same Body's turn, carried on the clock, is the one it had.
    expect(landed.bodyTurn).toBeGreaterThan(turn);
    // ERIS queues no landing trigger, and the surface pass flies on from here.
    expect(landed.message).toBeNull();
    passes(session, 5);
    expect(session.snapshot.craft?.space).toBeNull();
    expect(session.snapshot.pose.position.y).toBeLessThanOrEqual(0x01_80_00_00);
    // A Save after the landing resumes over the point, aboard.
    const restored = roundTrip(session);
    expect(restored.snapshot.pose).toEqual(session.snapshot.pose);
    expect(restored.snapshot.craft).toEqual(session.snapshot.craft);
  });

  test('crosses from DION to LACHESIS, lands over it, and flies down to its surface (#567)', () => {
    const session = onDion();
    flyToLachesis(session);
    const landed = session.snapshot;
    expect(landed.pose.body).toBe('body-7');
    expect(landed.bodyName).toBe('LACHESIS');
    expect(landed.surface.body.id).toBe('body-7');
    expect(landed.pose.position.y).toBe(0x01_80_00_00);
    // LACHESIS has no admitted Pose: the cell counts from the Body's own origin.
    expect(landed.surface.grid.origin).toEqual({ x: 0, z: 0 });
    expect(landed.cell).toEqual({
      x: Math.floor(landed.pose.position.x / 0x1_00_00),
      z: Math.floor(landed.pose.position.z / 0x1_00_00)
    });
    // The landing launched LACHESIS's `$26`, which is spent whichever way its draw went.
    expect(
      session.captureResume().script.triggers.find(item => item.index === 0x26)
    ).toEqual({ armed: false, index: 0x26 });
    expect(landed.message).toBeNull();
    // Nose down under power to the surface: at sea there, the landing handler keeps the
    // player aboard.
    session.throttleKey(0x0a);
    passes(session, 40, { pitch: -1 });
    passes(session, 300);
    const down = session.snapshot;
    expect(down.pose.body).toBe('body-7');
    expect(down.craft?.space).toBeNull();
    expect(down.pose.position.y).toBe(63);
    expect(down.landSea).toBe('sea');
    expect(down.occupancy.kind).toBe('aboard');
    // A Save on LACHESIS resumes there, though no admitted Pose anchors it (ADR 0052).
    const restored = roundTrip(session);
    expect(restored.snapshot.pose).toEqual(down.pose);
    expect(restored.snapshot.surface.grid.origin).toEqual({ x: 0, z: 0 });
    expect(restored.snapshot.daylight).toBe(down.daylight);
  });
});

/// Resumes `session` from its Save, holds the restore equal to it, and returns the restore.
const resumed = (session: DamoclesSession): DamoclesSession => {
  cues(session);
  const restored = roundTrip(session);
  expect(restored.captureResume()).toEqual(session.captureResume());
  expect(restored.snapshot.pose).toEqual(session.snapshot.pose);
  expect(restored.snapshot.craft).toEqual(session.snapshot.craft);
  return restored;
};

describe('a Save in space and during the launch swing (#568)', () => {
  const EAGLE = 'object-slot-3';
  const aloft = (): DamoclesSession => {
    const session = beside(EAGLE, [pairedKey(EAGLE)]);
    session.board();
    session.throttleKey(0x05);
    passes(session, 30);
    passes(session, 20, { pitch: 1 });
    cues(session);
    return session;
  };

  test('mid-swing, the swing runs on into space as an uninterrupted run does', () => {
    const session = aloft();
    session.launchCraft();
    passes(session, 2);
    partPass(session);
    const saved = session.captureResume();
    expect(saved.craft).toMatchObject({ space: null, swing: true });
    const restored = resumed(session);
    inStep(restored, session, each => {
      toSpace(each);
      passes(each, 20, { turn: 1 });
    });
    expect(session.snapshot.craft?.space).not.toBeNull();
  });

  test('on the space entry’s frame, the first pass reads the last flight’s range', () => {
    const session = aloft();
    session.launchCraft();
    toSpace(session);
    const saved = session.captureResume();
    expect(saved.craft?.space).toMatchObject({
      hold: content.catalogue.craft!.constants.spaceHold.operand,
      x: -630_000,
      y: 64,
      z: 390_000
    });
    const restored = resumed(session);
    inStep(restored, session, each => passes(each, 12, { pitch: 1 }));
  });

  test('in flight, turning and pitching, the next passes match an uninterrupted run', () => {
    const session = aloft();
    session.launchCraft();
    toSpace(session);
    passes(session, 10, { turn: 1 });
    passes(session, 6, { pitch: -1 });
    partPass(session);
    const saved = session.captureResume();
    // The Pose stays where the craft left ERIS; the space words carry the flight.
    expect(saved.pose.position).toEqual(session.snapshot.pose.position);
    expect(saved.craft?.space).not.toBeNull();
    expect(saved.spaceMemory?.pitchRate).not.toBe(
      content.catalogue.craft!.boot.pitchRate.value
    );
    const restored = resumed(session);
    inStep(restored, session, each => {
      passes(each, 20, { pitch: 1, turn: -1 });
      passes(each, 20);
    });
    expect(restored.snapshot.craft?.space?.position).not.toMatchObject(
      saved.craft!.space as object
    );
  });

  test('in the hold, the resumed craft lands when the uninterrupted one does, and flies on', () => {
    const session = aloft();
    session.launchCraft();
    toSpace(session);
    session.throttleKey(0x39);
    passes(session, 20);
    const saved = session.captureResume();
    expect(saved.craft?.space).toMatchObject({ hold: 30 });
    const restored = resumed(session);
    inStep(restored, session, each => passes(each, 30));
    expect(session.snapshot.craft?.space).not.toBeNull();
    inStep(restored, session, each => passes(each, 1));
    expect(session.snapshot.craft?.space).toBeNull();
    expect(restored.snapshot.pose.position.y).toBe(0x01_80_00_00);
    // The space words the flight left carry over the surface, across a Save, to the next launch.
    const landed = resumed(session);
    expect(landed.captureResume().spaceMemory).toEqual(saved.spaceMemory);
    inStep(landed, session, each => {
      passes(each, 20, { pitch: 1 });
      each.launchCraft();
      toSpace(each);
      passes(each, 10);
    });
  });

  test('a Session Resume in space keeps flying', () => {
    const session = aloft();
    session.launchCraft();
    toSpace(session);
    passes(session, 8, { turn: 1 });
    const { storage } = memoryStorage();
    writeDamoclesResume(storage, identity(), session);
    const read = readDamoclesResume(storage, identity(), saveContent());
    if (read.kind !== 'restored') {
      throw new Error(`Session Resume was ${read.kind}`);
    }
    const restored = new DamoclesSession(content, read.snapshot);
    cues(session);
    inStep(restored, session, each => passes(each, 30, { turn: -1 }));
  });

  test('a schema-12 record in space enters space afresh from its Body, as it did', () => {
    const session = aloft();
    const aboard = session.captureResume();
    const { space: _s, swing: _w, ...words } = aboard.craft!;
    const { spaceMemory: _m, ...older } = aboard;
    const record = JSON.stringify({
      ...JSON.parse(encoded(aboard)),
      schemaVersion: 12,
      snapshot: {
        ...older,
        craft: { ...words, enteringSpace: true },
        script: olderScript(older.script)
      }
    });
    const snapshot = decoded(record);
    expect(snapshot.craft).toMatchObject({ space: 'entry', swing: false });
    expect(snapshot.spaceMemory).toBeNull();
    const restored = new DamoclesSession(content, snapshot);
    expect(restored.snapshot.craft?.space).toMatchObject({
      nearest: 'body-11',
      position: { x: -630_000, y: 64, z: 390_000 }
    });
    expect(restored.snapshot.pose.position).toEqual(aboard.pose.position);
    // Its next Save is a current one in space, which resumes as it stands.
    passes(restored, 5, { turn: 1 });
    const again = roundTrip(restored);
    expect(again.captureResume()).toEqual(restored.captureResume());

    // Aboard on a Body, a schema-12 record has no swing and the first world's space words.
    const ground = decoded(
      JSON.stringify({
        ...JSON.parse(record),
        snapshot: {
          ...older,
          craft: { ...words, enteringSpace: false },
          script: olderScript(older.script)
        }
      })
    );
    expect(ground.craft).toMatchObject({ space: null, swing: false });
    const onGround = new DamoclesSession(content, ground);
    // The flight stepped the noise pointer, which a migrated record restarts from New Game's.
    expect(onGround.captureResume()).toEqual({
      ...aboard,
      script: { ...aboard.script, noise: NEW_GAME_NOISE },
      spaceMemory: {
        nearest: content.catalogue.craft!.boot.nearest.value,
        pitchRate: content.catalogue.craft!.boot.pitchRate.value,
        range: content.catalogue.craft!.boot.range.value
      }
    });
  });

  test('space words no flight leaves are refused', () => {
    const session = aloft();
    session.launchCraft();
    toSpace(session);
    passes(session, 3);
    const snapshot = session.captureResume();
    const craft = snapshot.craft!;
    const space = craft.space as Exclude<typeof craft.space, 'entry' | null>;
    const decodeRefusals: [string, DamoclesSaveSnapshot, RegExp][] = [
      [
        'a swing in space',
        { ...snapshot, craft: { ...craft, swing: true } },
        /swings in space/
      ],
      [
        'a position past a long',
        { ...snapshot, craft: { ...craft, space: { ...space, x: 2 ** 31 } } },
        /space\.x/
      ],
      [
        'an unaligned nearest Body',
        { ...snapshot, spaceMemory: { ...snapshot.spaceMemory!, nearest: 6 } },
        /nearest/
      ],
      [
        'a nearest Body past the table',
        {
          ...snapshot,
          spaceMemory: { ...snapshot.spaceMemory!, nearest: 4 * 64 }
        },
        /nearest/
      ]
    ];
    for (const [label, record, reason] of decodeRefusals) {
      expect(() => decoded(encoded(record)), label).toThrow(reason);
    }
    const held = {
      ...snapshot,
      craft: { ...craft, space: { ...space, hold: 51 } }
    };
    expect(() => new DamoclesSession(content, decoded(encoded(held)))).toThrow(
      /space words/
    );
  });
});

const noiseWords = () => content.catalogue.craft!.noise.words;
/// DION with the noise pointer at `noise`, which only the draw at the landing reads.
const seeded = (noise: number): DamoclesSession => {
  const snapshot = onDion().captureResume();
  return new DamoclesSession(content, {
    ...snapshot,
    script: { ...snapshot.script, noise }
  });
};
const messages = (session: DamoclesSession, frames: number): string[] => {
  const seen: string[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    session.advance(1 / content.doc.time.vblHertz);
    for (const effect of session.drainEffects()) {
      if (effect.type === 'message') {
        seen.push(effect.text.trim());
      }
    }
  }
  return seen;
};
const inlineText = (id: string): string =>
  content.strings.inlineMessages.find(item => item.id === id)!.text.trim();

describe('the landing messages (#576)', () => {
  /// The pointer the crossing reaches the landing's draw at, from a start of 0: the flight is
  /// the same every time, so it steps the pointer the same number of passes.
  let flight = -1;
  beforeAll(() => {
    const session = seeded(0);
    flyToLachesis(session);
    flight = session.captureResume().script.noise - 1;
  });
  const drawnAt = (shown: boolean): number => {
    const start = Array.from({ length: 0x8_00 }, (_, k) => k).find(
      k => noiseWords()[(k + flight) % 0x8_00]! >= 0xa0_00 === shown
    )!;
    return start;
  };
  test('a draw of $A000 or more presents LACHESIS three lines after 100 frames', () => {
    const session = seeded(drawnAt(true));
    flyToLachesis(session);
    session.drainEffects();
    const landed = session.captureResume().script;
    expect(landed.execution).toMatchObject({
      script: 'damocles.script.slot-38',
      step: 2
    });
    expect(session.snapshot.message).toBeNull();
    // A one-shot trigger is disarmed as its script launches, so a Save cannot hold both.
    const saved = session.captureResume();
    expect(() =>
      decoded(
        encoded({
          ...saved,
          script: {
            ...saved.script,
            triggers: saved.script.triggers.map(item =>
              item.index === 0x26 ? { ...item, armed: true } : item
            )
          }
        })
      )
    ).toThrow('trigger 38 is armed while its own script is running');
    // The craft flies on while the script waits: stepping the pointer does not disturb it.
    const first = messages(session, 101);
    expect(first).toEqual([inlineText('script38-inline-1')]);
    // A Save mid-message resumes it.
    const restored = resumed(session);
    expect(messages(restored, 650)).toEqual([
      inlineText('script38-inline-2'),
      inlineText('script38-inline-3'),
      ''
    ]);
    expect(restored.captureResume().script).toMatchObject({
      execution: null,
      message: null
    });
  });

  test('a draw below $A000 presents nothing and spends the trigger all the same', () => {
    const session = seeded(drawnAt(false));
    flyToLachesis(session);
    const script = session.captureResume().script;
    expect(script.execution).toBeNull();
    expect(script.triggers.find(item => item.index === 0x26)?.armed).toBe(
      false
    );
    expect(messages(session, 800)).toEqual([]);
  });

  test("the encounter gate lights the panel's second lamp and crosses a Save", () => {
    const session = onDion();
    const snapshot = session.captureResume();
    expect(
      damoclesPanelViewModel(session.snapshot, content.doc).attackLamp
    ).toBe(false);
    const visited = new DamoclesSession(
      content,
      decoded(
        encoded({
          ...snapshot,
          script: { ...snapshot.script, encounter: 1, flags: 0x00_02 }
        })
      )
    );
    expect(visited.snapshot.encounter).toBe(1);
    expect(
      damoclesPanelViewModel(visited.snapshot, content.doc).attackLamp
    ).toBe(true);
  });

  test('landing state no play reaches is refused', () => {
    const snapshot = onDion().captureResume();
    const refused = (script: object, message: string) =>
      expect(() =>
        decoded(
          encoded({
            ...snapshot,
            script: { ...snapshot.script, ...script }
          } as DamoclesSaveSnapshot)
        )
      ).toThrow(message);
    refused(
      { encounter: 1 },
      'the encounter gate is armed but TOLOSA was never visited'
    );
    // A kill or a zap clears the gate and leaves the flag (#581), so this one is reachable.
    expect(
      decoded(
        encoded({
          ...snapshot,
          script: { ...snapshot.script, flags: 0x00_02 }
        } as DamoclesSaveSnapshot)
      ).script.flags
    ).toBe(0x00_02);
    refused(
      { flags: 0x00_04 },
      'script flags name a bit no ported script writes'
    );
    refused(
      { noise: 0x8_00 },
      'snapshot.script.noise is outside its recovered bounds'
    );
    refused(
      { triggers: snapshot.script.triggers.slice(0, 6) },
      'script trigger table is incomplete or duplicated'
    );
  });
});

/// `ticks` VBLs of session time, one at a time.
const tick = (session: DamoclesSession, ticks: number): void => {
  for (let k = 0; k < ticks; k += 1) {
    session.advance(1 / content.doc.time.vblHertz);
  }
};
const noiseOf = (session: DamoclesSession): number =>
  session.captureResume().script.noise;

describe('the noise pointer on foot and at New Game (#582)', () => {
  test('a New Game starts where the arrival leaves the pointer, word 1,041', () => {
    expect(NEW_GAME_NOISE).toBe(1041);
    const session = new DamoclesSession(content);
    expect(session.captureResume()).toMatchObject({
      footTicks: 0,
      headCommands: initialHeadCommands(),
      script: { noise: NEW_GAME_NOISE }
    });
  });

  test('on foot the pointer steps once every eight ticks, a pass', () => {
    const session = beside(LIMO);
    const start = noiseOf(session);
    const period = content.doc.time.ticksPerPassOnFoot;
    expect(period).toBe(8);
    tick(session, period - 1);
    expect(noiseOf(session)).toBe(start);
    expect(session.captureResume().footTicks).toBe(period - 1);
    tick(session, 1);
    expect(noiseOf(session)).toBe((start + 1) % 0x8_00);
    tick(session, 10 * period);
    expect(noiseOf(session)).toBe((start + 11) % 0x8_00);
  });

  test('aboard the on-foot phase holds and the craft pass steps instead', () => {
    const session = beside(LIMO, [LIMO_KEY]);
    tick(session, 3);
    expect(session.board()).toEqual({ kind: 'boarded' });
    const start = noiseOf(session);
    passes(session, 5);
    expect(session.captureResume()).toMatchObject({
      footTicks: 3,
      headCommands: initialHeadCommands(),
      script: { noise: (start + 5) % 0x8_00 }
    });
  });

  test('a Save carries the phase, so a restore steps where an uninterrupted walk steps', () => {
    const session = beside(LIMO);
    tick(session, 13);
    const restored = roundTrip(session);
    expect(restored.captureResume().footTicks).toBe(5);
    tick(session, 3);
    tick(restored, 3);
    expect(noiseOf(restored)).toBe(noiseOf(session));
    const saved = session.captureResume();
    expect(
      () =>
        new DamoclesSession(
          content,
          decoded(encoded({ ...saved, footTicks: 8 }))
        )
    ).toThrow('saved on-foot pass phase is outside a pass');
  });

  test('a schema-14 record migrates at phase 0 with its own pointer', () => {
    const session = beside(LIMO);
    tick(session, 13);
    const current = session.captureResume();
    const { footTicks: _f, ...older } = current;
    const migrated = decoded(
      JSON.stringify({
        ...JSON.parse(encoded(current)),
        schemaVersion: 14,
        snapshot: {
          ...older,
          script: {
            ...older.script,
            triggers: older.script.triggers.filter(
              item =>
                item.index !== 3 &&
                item.index !== 4 &&
                item.index !== 15 &&
                !OLDER_ENDINGS.includes(item.index)
            )
          }
        }
      })
    );
    expect(migrated).toEqual({ ...current, encounter: null, footTicks: 0 });
  });
});

const ERIS_SELECTOR = 0x2c;
/// The craft's position as the pool's camera holds it.
const cameraOf = (session: DamoclesSession) => {
  const { x, y, z } = session.snapshot.pose.position;
  return [x >>> 0, y >>> 0, z >>> 0] as const;
};
const poolOf = (session: DamoclesSession) =>
  session.captureResume().encounter!.pool;
const drawnIds = (session: DamoclesSession) =>
  session.snapshot.residents.map(item => item.id);

describe('the TOLOSA encounter (#581)', () => {
  const ERIS = ERIS_SELECTOR;
  const at = cameraOf;
  const record = (
    counter: number,
    position: readonly [number, number, number],
    body = ERIS
  ): {
    body: number;
    counter: number;
    position: readonly [number, number, number];
    velocity: readonly [number, number, number];
  } => ({
    body,
    counter,
    position,
    velocity: [0, 0, 0]
  });
  const idle = record(0, [0, 0, 0], 0);
  /// The session again with the gate armed, as TOLOSA's landing leaves it, and the ship as given.
  const armedWith = (
    session: DamoclesSession,
    ship: ReturnType<typeof record>,
    shipShot = idle
  ): DamoclesSession => {
    const snapshot = session.captureResume();
    return new DamoclesSession(
      content,
      decoded(
        encoded({
          ...snapshot,
          encounter: { dead: false, pool: { ship, shipShot, shot: idle } },
          script: { ...snapshot.script, encounter: 1, flags: 0x00_02 }
        })
      )
    );
  };
  const pool = poolOf;

  test('held fire launches a shot every 32 passes and draws it, never selecting it', () => {
    const session = aboardLimo();
    cues(session);
    session.firing = true;
    passes(session, 1);
    expect(cues(session)).toContain('shot');
    expect(pool(session).shot).toMatchObject({ body: ERIS, counter: 31 });
    expect(drawnIds(session)).toContain('object-slot-8');
    expect(session.snapshot.selection).not.toMatchObject({
      instance: 'object-slot-8'
    });
    passes(session, 31);
    expect(pool(session).shot).toMatchObject({ body: 0, counter: 0 });
    expect(drawnIds(session)).not.toContain('object-slot-8');
    cues(session);
    passes(session, 1);
    expect(cues(session)).toContain('shot');
    expect(pool(session).shot.counter).toBe(31);
  });

  test('on foot the pool does not run', () => {
    const walker = beside(LIMO);
    const [x, y, z] = at(walker);
    const session = armedWith(walker, {
      ...record(0x80_30, [x + 0x1_00_00, y, z]),
      velocity: [-0x1_00, 0, 0]
    });
    const before = pool(session);
    tick(session, 200);
    expect(pool(session)).toEqual(before);
    expect(session.snapshot.encounter).toBe(1);
  });

  test('the ship steers at a craft outside its window', () => {
    const craft = aboardLimo();
    const [x, y, z] = at(craft);
    const session = armedWith(craft, record(0, [x + 0x40_00, y, z]));
    passes(session, 1);
    // The attack routine runs after the stepper, so the coast starts counting next pass.
    expect(pool(session).ship).toMatchObject({
      body: ERIS,
      counter: 0x80_5a,
      velocity: [-0x1_00, 0, 0]
    });
    passes(session, 1);
    expect(pool(session).ship.position[0]).toBe(x + 0x40_00 - 0x1_00);
    expect(drawnIds(session)).toContain('object-slot-11');
  });

  test('shooting the ship down clears the gate and flashes the view', () => {
    const craft = aboardLimo();
    // Parked on the camera and coasting, so it neither steers nor fires: the shot's first step
    // is inside the $400 box.
    const session = armedWith(craft, record(0x80_50, at(craft)));
    cues(session);
    session.firing = true;
    passes(session, 1);
    // The launch and the kill each ask for the shot programme `$04C610`.
    expect(cues(session).filter(cue => cue === 'shot')).toHaveLength(2);
    expect(session.snapshot.message?.id).toBe('system-string-49');
    expect(session.snapshot.encounter).toBe(0);
    expect(pool(session).ship).toMatchObject({ body: 0, counter: 0 });
    expect(pool(session).shot).toMatchObject({ body: 0, counter: 0 });
    expect(drawnIds(session)).not.toContain('object-slot-11');
    // `$AA00`: four white ticks in the next eight.
    session.firing = false;
    let white = 0;
    for (let k = 0; k < 8; k += 1) {
      tick(session, 1);
      white += session.snapshot.screen.white ? 1 : 0;
    }
    expect(white).toBe(4);
    expect(session.snapshot.screen.dead).toBe(false);
  });

  test('a zap kills the player: noise, the flash, the fade, VOID and the death message', () => {
    const craft = aboardLimo();
    const [x, y, z] = at(craft);
    // Parked inside the window with its shot already on the camera.
    const session = armedWith(
      craft,
      record(0x7f_ff, [x + 0x1_00, y, z]),
      record(0x10, [x, y, z])
    );
    const noise = session.captureResume().script.noise;
    cues(session);
    passes(session, 1);
    expect(cues(session)).toContain('zap');
    expect(session.snapshot.screen).toMatchObject({ dead: false, noise: true });
    expect(session.snapshot.encounter).toBe(0);
    expect(session.captureResume().script.zaps).toEqual([
      (noise + 1 - 2 + 0x8_00) % 0x8_00
    ]);
    const pose = session.snapshot.pose;
    session.throttleKey(0x05);
    expect(session.leave()).toEqual({ kind: 'refused' });
    const shown = messages(session, content.doc.time.zapNoiseTicks + 2);
    expect(shown).toEqual(["YOU'VE BEEN ZAPPED"]);
    expect(session.snapshot.screen.noise).toBe(false);
    tick(session, 64);
    expect(session.snapshot.screen).toMatchObject({ dead: true, fade: 8 });
    expect(session.snapshot.bodyName).toBe('VOID');
    expect(session.snapshot.pose).toEqual(pose);
    expect(messages(session, 400)).toEqual([
      "YOU'RE A BIT DEAD - TO QUIT OR LOAD PRESS HELP"
    ]);
    // A Save of a dead game restores dead, as the original's F1 does.
    const restored = roundTrip(session);
    expect(restored.snapshot.screen.dead).toBe(true);
    expect(restored.captureResume().encounter?.dead).toBe(true);
    expect(restored.board()).toEqual({ kind: 'refused' });
  });

  test('the Save refuses pool state no play reaches', () => {
    const snapshot = armedWith(
      aboardLimo(),
      record(0x80_5a, [0, 0, 0])
    ).captureResume();
    const refused = (encounter: object, message: string) =>
      expect(() =>
        decoded(encoded({ ...snapshot, encounter } as DamoclesSaveSnapshot))
      ).toThrow(message);
    const { pool: saved } = snapshot.encounter!;
    refused(
      { dead: false, pool: { ...saved, ship: { ...saved.ship, counter: 5 } } },
      'snapshot.encounter.pool.ship.counter is not one the pool reaches'
    );
    refused(
      {
        dead: false,
        pool: { ...saved, shot: { ...saved.shot, counter: 0x21 } }
      },
      'snapshot.encounter.pool.shot.counter is not one the pool reaches'
    );
    refused(
      { dead: true, pool: saved },
      'a dead player with the encounter gate armed'
    );
  });
});
