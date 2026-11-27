import { beforeAll, describe, expect, test } from 'bun:test';

import { type Catalogue } from '../src/catalogue/data.ts';
import { ModelStore } from '../src/catalogue/modelStore.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
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
import {
  digitHop,
  insideTransporterCube,
  ringHop,
  ringStep,
  ringStepsUp
} from '../src/damocles/transporter.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { IDLE } from '../src/gameCore/index.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

let catalogue: Catalogue;
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

const allAvailable = () => 'available' as const;

describe('the ring rules', () => {
  test('a step moves one slot and wraps at both ends', () => {
    expect(ringStep(69, true)).toBe(70);
    expect(ringStep(69, false)).toBe(68);
    expect(ringStep(73, true)).toBe(64);
    expect(ringStep(64, false)).toBe(73);
  });

  test('the hop passes unavailable slots, noting it, and refuses only back at the entry', () => {
    expect(ringHop(69, true, allAvailable)).toEqual({
      kind: 'hop',
      skipped: false,
      slot: 70
    });
    expect(
      ringHop(73, true, slot => (slot === 64 ? 'unavailable' : 'available'))
    ).toEqual({ kind: 'hop', skipped: true, slot: 65 });
    expect(ringHop(69, false, () => 'unavailable')).toEqual({ kind: 'none' });
  });

  test('the compass halves split in world yaw, and inversion swaps them', () => {
    // Facing $300 round to $0FF steps up; $100 to $2FF steps down.
    for (const yaw of [0x3_00, 0x3_ff, 0, 0xc8, 0xff]) {
      expect(ringStepsUp(yaw, false)).toBe(true);
      expect(ringStepsUp(yaw, true)).toBe(false);
    }
    for (const yaw of [0x1_00, 0x2_00, 0x2_ff]) {
      expect(ringStepsUp(yaw, false)).toBe(false);
      expect(ringStepsUp(yaw, true)).toBe(true);
    }
  });

  test('a digit names slot 64 + n, refuses an unclaimed slot and ignores a carried one', () => {
    expect(digitHop(3, () => 'placed')).toEqual({ kind: 'hop', slot: 67 });
    expect(digitHop(7, () => 'placed')).toEqual({ kind: 'hop', slot: 71 });
    expect(digitHop(0, () => 'placed')).toEqual({ kind: 'hop', slot: 64 });
    expect(digitHop(9, () => 'unclaimed')).toEqual({ kind: 'refused' });
    expect(digitHop(3, () => 'carried')).toEqual({ kind: 'ignored' });
  });

  test('the cube is (−50, 50] on X and Z and (0, 128] above the slot', () => {
    const slot = { x: 0, y: 0, z: 0 };
    // `object-038820`'s published region box.
    const cube = [
      [-50, 50],
      [-128, 0],
      [-50, 50]
    ] as const;
    expect(insideTransporterCube({ x: 50, y: 128, z: 50 }, slot, cube)).toBe(
      true
    );
    expect(insideTransporterCube({ x: -50, y: 63, z: 0 }, slot, cube)).toBe(
      false
    );
    expect(insideTransporterCube({ x: 0, y: 0, z: 0 }, slot, cube)).toBe(false);
    expect(insideTransporterCube({ x: 0, y: 129, z: 0 }, slot, cube)).toBe(
      false
    );
  });
});

/// Slot 69, the Floor 10 Transporter at Capital City 11-08, as the session draws it.
const SLOT_69 = { x: 4_945_724, y: 1100, z: 8_944_934 };
const NORTH = 0;
const SOUTH = Math.PI;

const atSlot69Floor = (): DamoclesSaveSnapshot => {
  const session = new DamoclesSession(content);
  expect(session.switchToPose('eris-transporter-11-8').kind).toBe('switched');
  const drawn = session.snapshot.residents.find(
    item => item.id === 'object-slot-69'
  );
  expect(drawn?.position).toEqual(SLOT_69);
  return session.captureResume();
};

/// Stand `dz` units north of slot 69 at eye height, facing `heading`.
const near69 = (
  dz: number,
  heading: number,
  change: Partial<DamoclesSaveSnapshot> = {}
): DamoclesSession => {
  const saved = atSlot69Floor();
  return new DamoclesSession(content, {
    ...saved,
    ...change,
    pose: {
      ...saved.pose,
      heading,
      position: { x: SLOT_69.x, y: SLOT_69.y + 63, z: SLOT_69.z + dz }
    }
  });
};

/// Walk (`walk` 1 forwards, −1 backwards) until the Body changes or two seconds pass, then stop.
const walkIn = (session: DamoclesSession, walk: number): void => {
  const body = session.snapshot.pose.body;
  session.intent = { ...IDLE, walk };
  for (
    let frame = 0;
    frame < 100 && session.snapshot.pose.body === body;
    frame += 1
  ) {
    session.advance(1 / 50);
  }
  session.intent = IDLE;
  session.advance(1 / 50);
};

const at = (session: DamoclesSession) => {
  const snapshot = session.snapshot;
  return {
    body: snapshot.pose.body,
    cell: `${snapshot.islandCell.x}-${snapshot.islandCell.z}`,
    floor: snapshot.structure?.floor ?? 0
  };
};

const transporterCues = (session: DamoclesSession): number =>
  session
    .drainEffects()
    .filter(
      effect => effect.type === 'sound-request' && effect.cue === 'transporter'
    ).length;

describe('walking into a Transporter', () => {
  test('walking south into slot 69 steps up to Gaea slot 70, and north down to Vesta 68', () => {
    const south = near69(100, SOUTH);
    walkIn(south, 1);
    expect(at(south)).toEqual({ body: 'body-8', cell: '8-8', floor: 1 });
    // Measured live after the hop: Y is slot 70's resident Y plus $3F.
    expect(south.snapshot.pose.position.y).toBe(213);
    expect(transporterCues(south)).toBe(1);

    const north = near69(-100, NORTH);
    walkIn(north, 1);
    expect(at(north)).toEqual({ body: 'body-14', cell: '4-6', floor: 10 });
    expect(north.snapshot.pose.position.y).toBe(3170 + 63);
  });

  test('walking backwards reverses the direction', () => {
    const backingSouth = near69(-100, SOUTH);
    walkIn(backingSouth, -1);
    expect(at(backingSouth).body).toBe('body-14');
    const backingNorth = near69(100, NORTH);
    walkIn(backingNorth, -1);
    expect(at(backingNorth).body).toBe('body-8');
  });

  test('the yaw is not written, and the destination does not fire', () => {
    const session = near69(100, SOUTH);
    walkIn(session, 1);
    expect(session.snapshot.pose.heading).toBeCloseTo(SOUTH, 6);
    for (let frame = 0; frame < 100; frame += 1) {
      session.advance(1 / 50);
    }
    expect(at(session).body).toBe('body-8');
    expect(transporterCues(session)).toBe(1);
  });

  test('the panel names VOID while the player stands in a cube, and the Body once out', () => {
    const session = near69(100, SOUTH);
    walkIn(session, 1);
    expect(session.snapshot.locationName).toBe('VOID');
    // Only the panel's field: the console's `where` and the Save slots still name the Body.
    expect(session.snapshot.bodyName).toBe('GAEA');
    session.intent = { ...IDLE, walk: -1 };
    for (let frame = 0; frame < 50; frame += 1) {
      session.advance(1 / 50);
    }
    session.intent = IDLE;
    session.advance(1 / 50);
    expect(at(session).body).toBe('body-8');
    expect(session.snapshot.locationName).toBe('GAEA');
  });

  test('an unavailable slot is passed with string 18, and the hop still goes', () => {
    const session = near69(100, SOUTH, {
      removedResidents: ['object-slot-70']
    });
    walkIn(session, 1);
    expect(session.snapshot.message?.id).toBe('system-string-18');
    expect(at(session)).toEqual({ body: 'body-17', cell: '4-2', floor: 4 });
  });

  test('with every other slot unavailable, string 17 and no hop', () => {
    const others = [64, 65, 66, 67, 68, 70, 71, 72, 73].map(
      slot => `object-slot-${slot}`
    );
    const session = near69(100, SOUTH, { removedResidents: others });
    session.intent = { ...IDLE, walk: 1 };
    for (
      let frame = 0;
      frame < 100 && session.snapshot.message === null;
      frame += 1
    ) {
      session.advance(1 / 50);
    }
    session.intent = IDLE;
    expect(session.snapshot.message?.id).toBe('system-string-17');
    expect(at(session).body).toBe('body-11');
    expect(session.snapshot.locationName).toBe('VOID');
  });

  test('a destroyed Body is not checked: the hop lands there (#1013)', () => {
    const session = near69(100, SOUTH, { destroyedBodies: ['body-8'] });
    walkIn(session, 1);
    expect(at(session).body).toBe('body-8');
  });

  test('a restore inside a cube stands in it without firing', () => {
    const session = near69(0, SOUTH);
    expect(session.snapshot.locationName).toBe('VOID');
    expect(session.inTransporter).toBe(true);
    for (let frame = 0; frame < 50; frame += 1) {
      session.advance(1 / 50);
    }
    expect(at(session).body).toBe('body-11');
  });
});

describe('a digit key in a Transporter', () => {
  test('from the Gaea arrival, 3 goes to Metis slot 67 with the latch still set', () => {
    const session = near69(100, SOUTH);
    walkIn(session, 1);
    expect(session.inTransporter).toBe(true);
    expect(session.transporterKey(3).kind).toBe('hopped');
    expect(at(session)).toEqual({ body: 'body-15', cell: '0-6', floor: 9 });
    for (let frame = 0; frame < 50; frame += 1) {
      session.advance(1 / 50);
    }
    expect(at(session).body).toBe('body-15');
    expect(session.snapshot.locationName).toBe('VOID');
  });

  test('the slot stood in hops in place, and an unclaimed slot raises string 20', () => {
    const inPlace = near69(0, SOUTH);
    inPlace.drainEffects();
    expect(inPlace.transporterKey(5).kind).toBe('hopped');
    expect(at(inPlace).body).toBe('body-11');
    expect(inPlace.snapshot.pose.position).toEqual({
      ...SLOT_69,
      y: SLOT_69.y + 63
    });
    expect(transporterCues(inPlace)).toBe(1);

    const removed = near69(0, SOUTH, { removedResidents: ['object-slot-73'] });
    expect(removed.transporterKey(9).kind).toBe('refused');
    removed.advance(1 / 50);
    expect(removed.snapshot.message?.id).toBe('system-string-20');
    expect(at(removed).body).toBe('body-11');
  });

  test('outside a cube a digit is not the Transporter’s', () => {
    const session = near69(200, SOUTH);
    session.advance(1 / 50);
    expect(session.inTransporter).toBe(false);
    expect(session.transporterKey(7).kind).toBe('ignored');
    expect(at(session).body).toBe('body-11');
  });

  test('a Save showing a Transporter string restores', () => {
    const session = near69(100, SOUTH, {
      removedResidents: ['object-slot-70']
    });
    walkIn(session, 1);
    expect(session.snapshot.message?.id).toBe('system-string-18');
    const identity = damoclesSaveIdentity(catalogue, 'test');
    const decoded = decodeDamoclesSave(
      encodeDamoclesSave({
        identity,
        savedAt: '2026-11-27T12:00:00.000Z',
        schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
        snapshot: session.captureResume(),
        where: 'LOGOS'
      }),
      identity,
      { catalogue, poses: content.poses, strings: content.strings }
    );
    const restored = new DamoclesSession(content, decoded.snapshot);
    expect(restored.snapshot.message?.id).toBe('system-string-18');
    // Restored standing in the Logos cube: it does not fire.
    restored.advance(1);
    expect(at(restored).body).toBe('body-17');
  });
});

type AssembledModels = Catalogue & {
  readonly models: readonly { id: string }[];
};

/// A store that holds every Model but Metis's structure, whose fetch waits until released: a
/// destination still streaming in, as the browser sees it after a hop.
class DelayedModels extends ModelStore {
  private readonly released = Promise.withResolvers<void>();
  private readonly gate = this.released.promise;

  deliver(id: string): void {
    const model = (catalogue as AssembledModels).models.find(
      item => item.id === id
    );
    this.hold(id, model as never);
  }

  override async prefetch(ids: Iterable<string>): Promise<readonly Error[]> {
    const wanted = [...ids];
    if (wanted.includes(METIS_STRUCTURE)) {
      await this.gate;
      this.deliver(METIS_STRUCTURE);
    }
    return super.prefetch(wanted.filter(id => this.peek(id) === undefined));
  }

  land(): Promise<void> {
    this.released.resolve();
    return this.gate;
  }
}

const METIS_STRUCTURE = 'structure-01d35e';

const delayed = (): { content: DamoclesContent; models: DelayedModels } => {
  const models = new DelayedModels(catalogue, path =>
    Promise.reject(new Error(`${path} is withheld`))
  );
  for (const model of (catalogue as AssembledModels).models) {
    if (model.id !== METIS_STRUCTURE) {
      models.deliver(model.id);
    }
  }
  return { content: { ...content, models }, models };
};

describe('a hop whose destination is still streaming in', () => {
  test('stands in the destination cube, and a Save made then resumes there', async () => {
    const { content: streaming, models } = delayed();
    const saved = atSlot69Floor();
    const session = new DamoclesSession(streaming, {
      ...saved,
      pose: {
        ...saved.pose,
        position: { x: SLOT_69.x, y: SLOT_69.y + 63, z: SLOT_69.z }
      }
    });
    expect(session.transporterKey(3).kind).toBe('hopped');
    session.advance(1 / 50);
    // Metis's structure is not in hand, so nothing is bound yet: the player still stands in
    // slot 67's cube, and its panel and digit rules hold.
    expect(session.snapshot.structure).toBeNull();
    expect(session.snapshot.locationName).toBe('VOID');
    expect(session.inTransporter).toBe(true);

    // The Save holds no structure. Restored with every Model, it binds slot 67's Floor 9.
    const resume = session.captureResume();
    expect(resume.structure).toBeNull();
    const restored = new DamoclesSession(content, resume);
    expect(at(restored)).toEqual({ body: 'body-15', cell: '0-6', floor: 9 });
    expect(restored.snapshot.locationName).toBe('VOID');
    restored.advance(1);
    expect(at(restored).body).toBe('body-15');

    // The streaming session binds once the Model lands, and the destination does not fire.
    await models.land();
    await Bun.sleep(0);
    for (let frame = 0; frame < 50; frame += 1) {
      session.advance(1 / 50);
    }
    expect(at(session)).toEqual({ body: 'body-15', cell: '0-6', floor: 9 });
    expect(session.snapshot.locationName).toBe('VOID');
  });
});

/// Carry Transporter slot 66 into `saved`, as an ANTIGRAV take leaves it.
const carrying66 = (saved: DamoclesSaveSnapshot): DamoclesSaveSnapshot => ({
  ...saved,
  carried: ['object-slot-66', ...saved.carried],
  residence: [
    ...saved.residence.filter(item => item.instance !== 'object-slot-66'),
    {
      instance: 'object-slot-66',
      residence: {
        kind: 'carried',
        placementClass: catalogue.instances.find(
          item => item.id === 'object-slot-66'
        )!.placementClass!
      }
    }
  ]
});

/// Resume `saved` standing in slot 69's cube, or `dz` units north of it, facing `heading`.
const standAt69 = (
  saved: DamoclesSaveSnapshot,
  dz = 0,
  heading = SOUTH,
  change: Partial<DamoclesSaveSnapshot> = {}
): DamoclesSession =>
  new DamoclesSession(content, {
    ...saved,
    ...change,
    pose: {
      ...saved.pose,
      heading,
      position: { x: SLOT_69.x, y: SLOT_69.y + 63, z: SLOT_69.z + dz }
    }
  });

/// Walk forwards until a message shows or two seconds pass, then stop where the hop left it.
const walkUntilMessage = (session: DamoclesSession): void => {
  session.intent = { ...IDLE, walk: 1 };
  for (
    let frame = 0;
    frame < 100 && session.snapshot.message === null;
    frame += 1
  ) {
    session.advance(1 / 50);
  }
  session.intent = IDLE;
};

describe('a dropped Transporter (#1007)', () => {
  test('carried, it is passed by the ring and its digit does nothing', () => {
    const saved = carrying66(atSlot69Floor());
    const digit = standAt69(saved);
    expect(digit.transporterKey(2).kind).toBe('ignored');
    expect(at(digit).body).toBe('body-11');

    // Slots 68 and 67 gone and 66 carried: walking north steps down past all three to 65.
    const ring = standAt69(saved, -100, NORTH, {
      removedResidents: ['object-slot-67', 'object-slot-68']
    });
    walkUntilMessage(ring);
    expect(ring.snapshot.message?.id).toBe('system-string-18');
    // Passed exactly as if it were gone: both land at slot 65, on Eris too.
    const gone = standAt69(atSlot69Floor(), -100, NORTH, {
      removedResidents: ['object-slot-66', 'object-slot-67', 'object-slot-68']
    });
    walkUntilMessage(gone);
    expect(ring.snapshot.pose.position).toEqual(gone.snapshot.pose.position);
    expect(at(ring)).toEqual(at(gone));
    expect(ring.snapshot.pose.position.z).not.toBe(SLOT_69.z);
  });

  test('dropped on a Floor, it lies there and both its digit and the ring reach it', () => {
    const carrying = standAt69(carrying66(atSlot69Floor()), 300);
    carrying.advance(1 / 50);
    expect(carrying.inTransporter).toBe(false);
    const dropped = carrying.snapshot.pose.position;
    expect(carrying.drop()).toEqual({ kind: 'dropped' });
    const residence = carrying.snapshot.residence.find(
      item => item.instance === 'object-slot-66'
    )?.residence;
    expect(residence?.kind).toBe('structure');
    const saved = carrying.captureResume();
    // A hop stands the player at the resident's Y plus $3F: back where they dropped it.
    const arrival = dropped;

    const digit = standAt69(saved);
    expect(digit.transporterKey(2).kind).toBe('hopped');
    expect(at(digit)).toEqual({ body: 'body-11', cell: '11-8', floor: 10 });
    expect(digit.snapshot.pose.position).toEqual(arrival);
    expect(digit.inTransporter).toBe(true);

    const ring = standAt69(saved, -100, NORTH, {
      removedResidents: ['object-slot-67', 'object-slot-68']
    });
    walkUntilMessage(ring);
    expect(ring.snapshot.message?.id).toBe('system-string-18');
    expect(ring.snapshot.pose.position).toEqual(arrival);
    expect(at(ring)).toEqual({ body: 'body-11', cell: '11-8', floor: 10 });
  });

  test('dropped on the surface, its digit reaches it there', () => {
    const saved = carrying66(atSlot69Floor());
    const outside = new DamoclesSession(content, {
      ...saved,
      pose: {
        body: 'body-11',
        heading: 0,
        pitch: 0,
        position: { x: 0, y: content.doc.eye.heightUnits, z: 0 }
      },
      structure: null
    });
    expect(outside.drop()).toEqual({ kind: 'dropped' });
    expect(
      outside.snapshot.residence.find(
        item => item.instance === 'object-slot-66'
      )?.residence
    ).toEqual(
      expect.objectContaining({
        body: 'body-11',
        kind: 'surface',
        position: { x: 0, y: 0, z: 0 }
      })
    );

    const digit = standAt69(outside.captureResume());
    expect(digit.transporterKey(2).kind).toBe('hopped');
    expect(digit.snapshot.pose.body).toBe('body-11');
    expect(digit.snapshot.structure).toBeNull();
    expect(digit.snapshot.pose.position).toEqual({ x: 0, y: 63, z: 0 });
  });
});
