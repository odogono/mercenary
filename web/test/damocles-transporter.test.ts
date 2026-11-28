import { beforeAll, describe, expect, test } from 'bun:test';

import { type Catalogue } from '../src/catalogue/data.ts';
import { ModelStore } from '../src/catalogue/modelStore.ts';
import {
  executeDamoclesConsoleCommand,
  type DamoclesConsoleHost
} from '../src/damocles/console.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  DAMOCLES_SAVE_SCHEMA_VERSION,
  damoclesSaveIdentity,
  damoclesWhere,
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
  parkedPosition,
  ringHop,
  ringStep,
  ringStepsUp
} from '../src/damocles/transporter.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { IDLE } from '../src/gameCore/index.ts';
import { parseConsoleCommand } from '../src/shell/console.ts';
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

  test('a digit names slot 64 + n and refuses only an unclaimed slot', () => {
    expect(digitHop(3, () => 'claimed')).toEqual({ kind: 'hop', slot: 67 });
    expect(digitHop(7, () => 'claimed')).toEqual({ kind: 'hop', slot: 71 });
    expect(digitHop(0, () => 'claimed')).toEqual({ kind: 'hop', slot: 64 });
    expect(digitHop(9, () => 'unclaimed')).toEqual({ kind: 'refused' });
  });

  test('a carried object is parked on VOID’s column by its stack index, wrapping at 10', () => {
    expect(parkedPosition(0)).toEqual({ x: 33_237, y: 0, z: 99_100 });
    expect(parkedPosition(2)).toEqual({ x: 33_237, y: 600, z: 99_100 });
    expect(parkedPosition(10)).toEqual({ x: 33_237, y: 0, z: 164_636 });
    expect(parkedPosition(13)).toEqual({ x: 33_237, y: 900, z: 164_636 });
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
  change: Partial<DamoclesSaveSnapshot> = {},
  saved = atSlot69Floor(),
  using = content
): DamoclesSession =>
  new DamoclesSession(using, {
    ...saved,
    ...change,
    pose: {
      ...saved.pose,
      heading,
      position: { x: SLOT_69.x, y: SLOT_69.y + 63, z: SLOT_69.z + dz }
    }
  });

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

  test('the location text names the Island-Local Cell the Cell Readout shows after a hop', () => {
    // Slot 70 stands in the Chaldea Metropolis Settlement, on a different Damocles Island from
    // the Ur City Settlement that anchors Gaea's workspace. The cell counted from that anchor
    // reads -248--1016 here, while the Cell Readout reads 08-08 (#1014).
    const south = near69(100, SOUTH);
    walkIn(south, 1);
    const snapshot = south.snapshot;
    expect(snapshot.cell).not.toEqual(snapshot.islandCell);
    expect(damoclesWhere(snapshot)).toBe('GAEA 08-08');
    const where = executeDamoclesConsoleCommand(
      parseConsoleCommand('where', 16)!,
      { session: () => south } as unknown as DamoclesConsoleHost
    );
    expect(where[0]).toStartWith('GAEA 08-08');
    expect(where[0]).not.toContain('· cell');
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

  // `$04C9D4`–`$04C9EE`: the marker clears the Association B of every resident on the Body, so
  // neither handler needs a destroyed-Body test of its own (#1013).
  test('a destroyed Body’s Transporter is passed with string 18', () => {
    const session = near69(100, SOUTH);
    expect(session.destroyBody('body-8')).toBe(true);
    walkIn(session, 1);
    expect(session.snapshot.message?.id).toBe('system-string-18');
    expect(at(session)).toEqual({ body: 'body-17', cell: '4-2', floor: 4 });
  });

  test('a destroyed Body’s Transporter refuses its digit with string 20', () => {
    const session = near69(0, SOUTH);
    session.destroyBody('body-8');
    expect(session.transporterKey(6).kind).toBe('refused');
    session.advance(1 / 50);
    expect(session.snapshot.message?.id).toBe('system-string-20');
    expect(at(session).body).toBe('body-11');
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

/// A store that holds every Model but one, Metis's structure unless told otherwise, whose fetch waits until released: a
/// destination still streaming in, as the browser sees it after a hop.
class DelayedModels extends ModelStore {
  withheld = METIS_STRUCTURE;
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
    if (wanted.includes(this.withheld)) {
      await this.gate;
      this.deliver(this.withheld);
    }
    return super.prefetch(wanted.filter(id => this.peek(id) === undefined));
  }

  land(): Promise<void> {
    this.released.resolve();
    return this.gate;
  }
}

const METIS_STRUCTURE = 'structure-01d35e';

const delayed = (
  withheld = METIS_STRUCTURE
): { content: DamoclesContent; models: DelayedModels } => {
  const models = new DelayedModels(catalogue, path =>
    Promise.reject(new Error(`${path} is withheld`))
  );
  models.withheld = withheld;
  for (const model of (catalogue as AssembledModels).models) {
    if (model.id !== withheld) {
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

/// Carry `instances` into `saved` ahead of what it carries, as takes leave them.
const carrying = (
  saved: DamoclesSaveSnapshot,
  instances: readonly string[]
): DamoclesSaveSnapshot => ({
  ...saved,
  carried: [...instances, ...saved.carried],
  residence: [
    ...saved.residence.filter(item => !instances.includes(item.instance)),
    ...instances.map(instance => ({
      instance,
      residence: {
        kind: 'carried' as const,
        placementClass: catalogue.instances.find(item => item.id === instance)!
          .placementClass!
      }
    }))
  ]
});

/// Carry Transporter slot 66 into `saved`, as an ANTIGRAV take leaves it, behind `ahead`.
const carrying66 = (
  saved: DamoclesSaveSnapshot,
  ahead: readonly string[] = []
): DamoclesSaveSnapshot => carrying(saved, [...ahead, 'object-slot-66']);

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
  test('carried, it is passed by the ring', () => {
    const saved = carrying66(atSlot69Floor());
    // Slots 68 and 67 gone and 66 carried: walking north steps down past all three to 65.
    const ring = near69(
      -100,
      NORTH,
      { removedResidents: ['object-slot-67', 'object-slot-68'] },
      saved
    );
    walkUntilMessage(ring);
    expect(ring.snapshot.message?.id).toBe('system-string-18');
    // Passed exactly as if it were gone: both land at slot 65, on Eris too.
    const gone = near69(-100, NORTH, {
      removedResidents: ['object-slot-66', 'object-slot-67', 'object-slot-68']
    });
    walkUntilMessage(gone);
    expect(ring.snapshot.pose.position).toEqual(gone.snapshot.pose.position);
    expect(at(ring)).toEqual(at(gone));
    expect(ring.snapshot.pose.position.z).not.toBe(SLOT_69.z);
  });

  test('dropped round the player, it does not fire until they leave and walk in again', () => {
    const session = near69(300, NORTH, {}, carrying66(atSlot69Floor()));
    session.advance(1 / 50);
    expect(session.drop()).toEqual({ kind: 'dropped' });
    for (let frame = 0; frame < 50; frame += 1) {
      session.advance(1 / 50);
    }
    // Standing in the dropped cube, not hopped: the Drop set the latch.
    expect(at(session)).toEqual({ body: 'body-11', cell: '11-8', floor: 10 });
    expect(session.inTransporter).toBe(true);
    expect(session.snapshot.locationName).toBe('VOID');
    expect(transporterCues(session)).toBe(0);

    // Out of the cube, then back in: now it fires.
    session.intent = { ...IDLE, walk: 1 };
    for (let frame = 0; frame < 25; frame += 1) {
      session.advance(1 / 50);
    }
    expect(session.inTransporter).toBe(false);
    walkIn(session, -1);
    expect(transporterCues(session)).toBe(1);
  });

  test('dropped while its Model is still streaming in, it does not fire once the Model lands', async () => {
    const model = catalogue.instances.find(
      item => item.id === 'object-slot-66'
    )!.model!;
    const { content: streaming, models } = delayed(model);
    const session = near69(
      300,
      NORTH,
      {},
      carrying66(atSlot69Floor()),
      streaming
    );
    session.advance(1 / 50);
    expect(session.drop()).toEqual({ kind: 'dropped' });
    for (let frame = 0; frame < 10; frame += 1) {
      session.advance(1 / 50);
    }
    await models.land();
    await Bun.sleep(0);
    for (let frame = 0; frame < 50; frame += 1) {
      session.advance(1 / 50);
    }
    expect(at(session)).toEqual({ body: 'body-11', cell: '11-8', floor: 10 });
    expect(session.inTransporter).toBe(true);
    expect(transporterCues(session)).toBe(0);
  });

  test('dropped on a Floor, it lies there and both its digit and the ring reach it', () => {
    const carrying = near69(300, SOUTH, {}, carrying66(atSlot69Floor()));
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

    const digit = near69(0, SOUTH, {}, saved);
    expect(digit.transporterKey(2).kind).toBe('hopped');
    expect(at(digit)).toEqual({ body: 'body-11', cell: '11-8', floor: 10 });
    expect(digit.snapshot.pose.position).toEqual(arrival);
    expect(digit.inTransporter).toBe(true);

    const ring = near69(
      -100,
      NORTH,
      { removedResidents: ['object-slot-67', 'object-slot-68'] },
      saved
    );
    walkUntilMessage(ring);
    expect(ring.snapshot.message?.id).toBe('system-string-18');
    expect(ring.snapshot.pose.position).toEqual(arrival);
    expect(at(ring)).toEqual({ body: 'body-11', cell: '11-8', floor: 10 });
  });

  test('dropped on the surface, both its digit and the ring reach it there', () => {
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

    const dropped = outside.captureResume();
    const digit = near69(0, SOUTH, {}, dropped);
    expect(digit.transporterKey(2).kind).toBe('hopped');
    expect(digit.snapshot.pose.body).toBe('body-11');
    expect(digit.snapshot.structure).toBeNull();
    expect(digit.snapshot.pose.position).toEqual({ x: 0, y: 63, z: 0 });

    const ring = near69(
      -100,
      NORTH,
      {
        removedResidents: ['object-slot-67', 'object-slot-68'],
        structure: atSlot69Floor().structure
      },
      dropped
    );
    walkUntilMessage(ring);
    expect(ring.snapshot.message?.id).toBe('system-string-18');
    expect(ring.snapshot.pose.body).toBe('body-11');
    expect(ring.snapshot.structure).toBeNull();
    expect(ring.snapshot.pose.position).toEqual({ x: 0, y: 63, z: 0 });
  });
});

/// Stand in slot 69's cube with `saved`'s Carried Stack, and press slot 66's digit, 2.
const intoVoid = (saved: DamoclesSaveSnapshot): DamoclesSession => {
  const session = near69(0, SOUTH, {}, saved);
  session.advance(1 / 50);
  expect(session.inTransporter).toBe(true);
  expect(session.transporterKey(2)).toEqual({ kind: 'hopped' });
  session.advance(1 / 50);
  return session;
};

describe('a carried Transporter’s digit (#1017)', () => {
  test('hops into VOID, into its own cube on the carried column, and stays', () => {
    const session = intoVoid(carrying66(atSlot69Floor()));
    // Live: VOID, X 33237, Y 0 + $3F, Z 99100, Cell Readout 00-01, the panel naming VOID.
    expect(session.snapshot.pose.body).toBe('body-30');
    expect(session.snapshot.pose.position).toEqual({
      x: 33_237,
      y: 63,
      z: 99_100
    });
    expect(session.snapshot.islandCell).toEqual({ x: 0, z: 1 });
    expect(session.snapshot.locationName).toBe('VOID');
    expect(session.snapshot.bodyName).toBe('VOID');
    expect(session.inTransporter).toBe(true);
    expect(transporterCues(session)).toBe(1);
    // The latch still holds slot 69, so the carried cube does not fire under the player.
    for (let frame = 0; frame < 100; frame += 1) {
      session.advance(1 / 50);
    }
    expect(session.snapshot.pose.body).toBe('body-30');
    expect(transporterCues(session)).toBe(0);
    // Drop refuses on VOID, and the Transporter stays carried.
    expect(session.drop()).toEqual({ kind: 'refused' });
    expect(session.snapshot.carried[0]).toBe('object-slot-66');
  });

  test('its height follows the stack index, and a digit there hops out', () => {
    // Two takeable objects ahead of it put it at index 2.
    const ahead = catalogue.instances
      .filter(
        item =>
          item.handling?.takeable === true &&
          item.handling.carried !== true &&
          item.location !== undefined &&
          item.placementClass !== undefined
      )
      .slice(0, 2)
      .map(item => item.id);
    expect(ahead).toHaveLength(2);
    const session = intoVoid(carrying66(atSlot69Floor(), ahead));
    // Live at index 2: Y 600 + $3F.
    expect(session.snapshot.pose.position).toEqual({
      x: 33_237,
      y: 663,
      z: 99_100
    });
    for (let frame = 0; frame < 50; frame += 1) {
      session.advance(1 / 50);
    }
    expect(session.snapshot.pose.position.y).toBe(663);
    expect(session.inTransporter).toBe(true);
    // Live, `1` in VOID's cube went to Eris slot 65.
    expect(session.transporterKey(1)).toEqual({ kind: 'hopped' });
    session.advance(1 / 50);
    expect(at(session).body).toBe('body-11');
  });

  test('leaving its cube and backing in again runs the ring from the carried slot', () => {
    const session = intoVoid(carrying66(atSlot69Floor()));
    session.intent = { ...IDLE, walk: 1 };
    for (let frame = 0; frame < 25; frame += 1) {
      session.advance(1 / 50);
    }
    session.intent = IDLE;
    session.advance(1 / 50);
    expect(session.inTransporter).toBe(false);
    expect(session.snapshot.locationName).toBe('VOID');
    // Outside every cube no digit is the Transporter's.
    expect(session.transporterKey(1)).toEqual({ kind: 'ignored' });
    walkIn(session, -1);
    // Facing south and backing in steps down from 66, to Eris slot 65.
    expect(at(session).body).toBe('body-11');
    const eris = near69(0, SOUTH);
    eris.advance(1 / 50);
    eris.transporterKey(1);
    eris.advance(1 / 50);
    expect(session.snapshot.pose.position).toEqual(eris.snapshot.pose.position);
  });

  test('one left in the BRIEFCASE hops to the column past the wrap', () => {
    const saved = atSlot69Floor();
    const session = intoVoid({
      ...saved,
      briefcaseStore: ['object-slot-66'],
      residence: saved.residence.filter(
        item => item.instance !== 'object-slot-66'
      )
    });
    // Live, store index 0: Z 164636, Y 63, Cell Readout 00-02.
    expect(session.snapshot.pose.body).toBe('body-30');
    expect(session.snapshot.pose.position).toEqual({
      x: 33_237,
      y: 63,
      z: 164_636
    });
    expect(session.snapshot.islandCell).toEqual({ x: 0, z: 2 });
    expect(session.inTransporter).toBe(true);
  });

  test('a Save made in VOID restores into the carried cube without firing', () => {
    const session = intoVoid(carrying66(atSlot69Floor()));
    const identity = damoclesSaveIdentity(catalogue, 'test');
    const decoded = decodeDamoclesSave(
      encodeDamoclesSave({
        identity,
        savedAt: '2026-11-28T12:00:00.000Z',
        schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
        snapshot: session.captureResume(),
        where: 'VOID'
      }),
      identity,
      { catalogue, poses: content.poses, strings: content.strings }
    );
    const restored = new DamoclesSession(content, decoded.snapshot);
    expect(restored.snapshot.pose.body).toBe('body-30');
    expect(restored.snapshot.pose.position).toEqual({
      x: 33_237,
      y: 63,
      z: 99_100
    });
    for (let frame = 0; frame < 50; frame += 1) {
      restored.advance(1 / 50);
    }
    expect(restored.inTransporter).toBe(true);
    expect(restored.snapshot.pose.body).toBe('body-30');
    expect(transporterCues(restored)).toBe(0);

    // Nothing but a carried Transporter reaches VOID, so a VOID Save without one is refused.
    const saved = session.captureResume();
    expect(() =>
      decodeDamoclesSave(
        encodeDamoclesSave({
          identity,
          savedAt: '2026-11-28T12:00:00.000Z',
          schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
          snapshot: {
            ...saved,
            carried: saved.carried.filter(id => id !== 'object-slot-66'),
            residence: saved.residence.filter(
              item => item.instance !== 'object-slot-66'
            )
          },
          where: 'VOID'
        }),
        identity,
        { catalogue, poses: content.poses, strings: content.strings }
      )
    ).toThrow('pose names a Body no admitted Pose or landing reaches');
  });
});
