import { beforeAll, describe, expect, test } from 'bun:test';

import type { AssembledCatalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import type { DamoclesCue } from '../src/damocles/psg.ts';
import { attachmentOpenLimit } from '../src/damocles/selection.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import {
  cellOf,
  erisSurfaceFrom,
  pitchFromWord
} from '../src/damocles/world.ts';
import { intent } from '../src/gameCore/index.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { damoclesProcessor, vblLevels } from './damocles-sound-processor.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// Riding a Damocles Lift (#475) at the Eris State Office, whose Floor Table binds Floors 0, 1, 2
/// and 10 at a storey pitch of 150 (docs/research/damocles-lift-control.md). A lift is a region
/// whose flags have bit 13; the State Office's two lift cars are regions 3 and 4.

const STATE_OFFICE = 'eris-surface-89';
const STOREY = 150;
const LIFT = 0x20_00;

let catalogue: AssembledCatalogue;
let content: DamoclesContent;

beforeAll(async () => {
  catalogue = await loadCatalogue();
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
});

const eye = () => content.doc.eye.heightUnits;

/// A session on Floor 0 of the State Office, standing at the centre of its region `index`.
///
/// The point is the recovered region's own centre, placed through the placement. The State
/// Office is drawn unturned and this document keeps model Z, so the frames agree on sign.
const standingIn = (index: number): DamoclesSession => {
  const ground = new DamoclesSession(content);
  const placement = content.surface.placements.find(
    item => item.id === STATE_OFFICE
  )!;
  const cell = cellOf(placement.position, content.surface.grid);
  ground.teleportToCell(cell.x, cell.z);
  const saved = ground.captureResume();
  const [x, z] = placement.selection!.structure.regions[index]!.bounds;
  const [x0, x1] = x!;
  const [z0, z1] = z!;
  return new DamoclesSession(content, {
    ...saved,
    pose: {
      ...saved.pose,
      position: {
        x: placement.position.x + (x0 + x1) / 2,
        y: saved.pose.position.y,
        z: placement.position.z + (z0 + z1) / 2
      }
    },
    structure: { ...saved.structure!, regionIndex: index }
  });
};

const inLift = (): DamoclesSession => {
  const session = standingIn(4);
  const region = content.surface.placements.find(
    item => item.id === STATE_OFFICE
  )!.selection!.structure.regions[4]!;
  expect(region.flags & LIFT).toBe(LIFT);
  expect(session.inLift).toBeTrue();
  return session;
};

/// The slot of the structure the bound State Office placement carries on its Floor.
const boundSlot = (session: DamoclesSession): number | undefined => {
  const selection = session.snapshot.surface.placements.find(
    item => item.id === STATE_OFFICE
  )?.selection?.structure;
  // A Floor's selector is recoloured through its palette, which leaves its regions as they are.
  const model = catalogue.models.find(
    item => item.structureSelection?.regions === selection?.regions
  );
  return model?.recordClass === 'alias'
    ? model.levelBinding?.floors.find(entry => entry.level === 0)?.structureSlot
    : model?.slots[0];
};

describe('the lift admits its keys only where the player is in one', () => {
  test('in the hall the key is not the lift’s, and nothing changes', () => {
    const session = standingIn(0);
    expect(session.inLift).toBeFalse();
    const before = session.captureResume();
    expect(session.rideLift(2)).toEqual({ kind: 'noLift' });
    expect(session.captureResume()).toEqual(before);
  });

  test('outside any structure there is no lift', () => {
    const session = new DamoclesSession(content);
    const { cellsPerAxis } = content.surface.grid;
    for (let x = 0; x < cellsPerAxis; x += 1) {
      for (let z = 0; z < cellsPerAxis; z += 1) {
        session.teleportToCell(x, z);
        if (session.snapshot.structure === null) {
          expect(session.rideLift(1)).toEqual({ kind: 'noLift' });
          return;
        }
      }
    }
    throw new Error('every Eris cell binds a structure');
  });
});

const VBL = 1 / 50;

/// Advances one VBL at a time until `done`, and says how many VBLs that took.
const vblsUntil = (session: DamoclesSession, done: () => boolean): number => {
  for (let vbls = 1; vbls <= 2000; vbls += 1) {
    session.advance(VBL);
    if (done()) {
      return vbls;
    }
  }
  throw new Error('the ride did not finish in 2000 VBLs');
};

const riding = (session: DamoclesSession) => session.snapshot.structure?.ride;

/// Asks for `floor` and plays the ride out, returning the VBLs from the key to the arrival.
const ride = (session: DamoclesSession, floor: number): number => {
  expect(session.rideLift(floor)).toEqual({ kind: 'admitted' });
  return vblsUntil(session, () => riding(session) === null);
};

const LIFT_DOOR = 0x03_f4;

/// In the lift car having walked in through its doorway, region 2, whose door `$3F4` stands
/// open around the player, as it does in the State Office capture.
const throughTheDoor = (): DamoclesSession => {
  const saved = inLift().captureResume();
  const door = content.surface.placements
    .find(item => item.id === STATE_OFFICE)!
    .selection!.structure.attachments.find(item => item.slot === LIFT_DOOR)!;
  const session = new DamoclesSession(content, {
    ...saved,
    structure: {
      ...saved.structure!,
      attachments: saved.structure!.attachments.map(item =>
        item.slot === LIFT_DOOR
          ? {
              latch: 'open',
              openUnits: attachmentOpenLimit(door),
              slot: item.slot
            }
          : item
      ),
      doorway: LIFT_DOOR
    }
  });
  session.advance(VBL);
  expect(openUnits(session)).toBe(attachmentOpenLimit(door));
  session.drainEffects();
  return session;
};

const liftDoor = (session: DamoclesSession) =>
  session.snapshot.structure?.attachments.find(item => item.slot === LIFT_DOOR);
const openUnits = (session: DamoclesSession): number | undefined =>
  liftDoor(session)?.openUnits;
const latchOf = (session: DamoclesSession): string | undefined =>
  liftDoor(session)?.latch;

/// The door moves one unit a tick, so its edge travels 32 units in 32 ticks. It has two leaves,
/// whose paths settle the latch on the pass after the edge arrives, so the latch changes on the
/// 33rd, as the ST's did (docs/research/damocles-door-speed.md).
const DOOR_TRAVEL = 32;
const DOOR_LATCH_VBLS = DOOR_TRAVEL + 1;

describe('a ride in the State Office lift', () => {
  test('G, 2, B, 1 and back to G, with X and Z kept', () => {
    const session = inLift();
    const start = session.snapshot.pose.position;
    const route = [
      { floor: 2, slot: 78 },
      { floor: 10, slot: 79 },
      { floor: 1, slot: 78 },
      { floor: 0, slot: 76 }
    ];
    for (const { floor, slot } of route) {
      ride(session, floor);
      const { pose, structure } = session.snapshot;
      expect(structure?.floor).toBe(floor);
      expect(boundSlot(session)).toBe(slot);
      expect(pose.position).toEqual({
        x: start.x,
        y: floor * STOREY + eye(),
        z: start.z
      });
      // Every Floor the State Office binds has a lift car where the player arrives.
      expect(session.inLift).toBeTrue();
    }
  });

  test('Floors 3 to 9 are never bound, from any Floor', () => {
    const session = inLift();
    for (const floor of [0, 1, 2, 10]) {
      if (floor !== session.snapshot.structure?.floor) {
        ride(session, floor);
      }
      const before = session.captureResume();
      for (let unbound = 3; unbound <= 9; unbound += 1) {
        expect(session.rideLift(unbound)).toEqual({ kind: 'refused' });
      }
      expect(session.captureResume()).toEqual(before);
    }
  });

  test('the Floor the label shows is refused and changes nothing', () => {
    const session = inLift();
    const ground = session.captureResume();
    expect(session.rideLift(0)).toEqual({ kind: 'refused' });
    expect(session.captureResume()).toEqual(ground);
    ride(session, 2);
    const upstairs = session.captureResume();
    expect(session.rideLift(2)).toEqual({ kind: 'refused' });
    expect(session.captureResume()).toEqual(upstairs);
  });
});

describe('the ride as #472 recovered it', () => {
  test('G to 1: the door shuts, the label steps 25 VBLs later, and 25 more bring the arrival', () => {
    const session = throughTheDoor();
    const before = session.snapshot;
    expect(session.rideLift(1)).toEqual({ kind: 'admitted' });
    expect(riding(session)).toEqual({
      countdown: 25,
      destination: 1,
      label: 0
    });

    // The door is pinned shut although the player stands inside its Proximity Box. Its edge
    // is shut after its travel, and the latch clears on the pass after.
    expect(vblsUntil(session, () => openUnits(session) === 0)).toBe(
      DOOR_TRAVEL
    );
    expect(latchOf(session)).toBe('moving');
    const shut =
      DOOR_TRAVEL + vblsUntil(session, () => latchOf(session) === 'closed');
    expect(shut).toBe(DOOR_LATCH_VBLS);
    expect(riding(session)?.countdown).toBe(25);

    const stepped = vblsUntil(session, () => session.labelFloor !== 0);
    expect(stepped).toBe(25);
    expect(session.labelFloor).toBe(1);
    // Nothing but the label has moved: the player is on Floor 0, in the ground structure.
    const during = session.snapshot;
    expect(during.structure?.floor).toBe(0);
    expect(boundSlot(session)).toBe(76);
    expect(during.pose).toEqual(before.pose);
    // The only sound so far is the door's tone and burst as it shut.
    expect(cuesOf(session)).toEqual(['door-start', 'door-stop']);

    const arrived = vblsUntil(session, () => riding(session) === null);
    expect(arrived).toBe(25);
    // 83 ticks from the key: the 83 substeps #472 traced. The ST stamped the arrival at VBL
    // 80-81 because it ran several substeps a frame; the port's clock is the substep (ADR 0049).
    expect(shut + stepped + arrived).toBe(83);
    const after = session.snapshot;
    expect(after.structure?.floor).toBe(1);
    expect(boundSlot(session)).toBe(78);
    expect(after.pose.position).toEqual({
      ...before.pose.position,
      y: STOREY + eye()
    });
    expect(after.pose.heading).toBe(before.pose.heading);
    expect(after.pose.pitch).toBe(
      pitchFromWord(0x01_ff, content.doc.orientation)
    );
    // `$055B88`'s shared sound request, once, at the arrival, and the new Floor's door starts
    // moving in the same tick.
    expect(session.drainEffects()).toEqual([
      { cue: 'take', type: 'sound-request' },
      { cue: 'door-start', type: 'sound-request' }
    ]);

    // The new Floor's door starts shut, and the arrival's own tick already opens it a unit:
    // `$05AA3C` runs after the step in the same substep.
    expect(openUnits(session)).toBe(1);
    session.advance(10 * VBL);
    expect(openUnits(session)).toBe(11);
  });

  test('2 to B steps the label through 1 and G, 25 VBLs apart', () => {
    const session = throughTheDoor();
    ride(session, 2);
    vblsUntil(session, () => openUnits(session) === 32);
    expect(session.rideLift(10)).toEqual({ kind: 'admitted' });
    const shut = vblsUntil(session, () => latchOf(session) === 'closed');
    const labels: [number, number][] = [];
    let vbls = shut;
    while (riding(session) !== null) {
      const label = session.labelFloor;
      session.advance(VBL);
      vbls += 1;
      if (riding(session) !== null && session.labelFloor !== label) {
        labels.push([vbls - shut, session.labelFloor]);
      }
    }
    expect(labels).toEqual([
      [25, 1],
      [50, 0],
      [75, 10]
    ]);
    expect(vbls - shut).toBe(100);
    expect(session.snapshot.structure?.floor).toBe(10);
    expect(session.snapshot.pose.position.y).toBe(10 * STOREY + eye());
  });

  test('a key mid-ride replaces the destination; the Floor the label shows is refused', () => {
    const session = throughTheDoor();
    expect(session.rideLift(2)).toEqual({ kind: 'admitted' });
    vblsUntil(session, () => session.labelFloor === 1);
    expect(session.rideLift(1)).toEqual({ kind: 'refused' });
    expect(session.rideLift(10)).toEqual({ kind: 'admitted' });
    expect(riding(session)).toMatchObject({ destination: 10, label: 1 });
    vblsUntil(session, () => riding(session) === null);
    expect(session.snapshot.structure?.floor).toBe(10);
  });

  test('the region holds for the whole ride', () => {
    const session = throughTheDoor();
    session.rideLift(1);
    session.intent = intent({ walk: 1 });
    vblsUntil(session, () => {
      expect(session.snapshot.structure?.regionIndex).toBe(4);
      return riding(session) === null;
    });
  });

  test('a ride saved part-way resumes where it was', () => {
    const played = throughTheDoor();
    played.rideLift(2);
    vblsUntil(played, () => played.labelFloor === 1);
    const saved = played.captureResume();
    expect(saved.structure?.ride).toMatchObject({ destination: 2, label: 1 });
    const resumed = new DamoclesSession(content, saved);
    expect(vblsUntil(resumed, () => riding(resumed) === null)).toBe(
      vblsUntil(played, () => riding(played) === null)
    );
    expect(resumed.snapshot.pose).toEqual(played.snapshot.pose);
    expect(resumed.snapshot.structure?.floor).toBe(2);
  });

  test('a saved ride outside a lift is refused', () => {
    const saved = standingIn(0).captureResume();
    expect(
      () =>
        new DamoclesSession(content, {
          ...saved,
          structure: {
            ...saved.structure!,
            ride: { countdown: 25, destination: 1, label: 0 }
          }
        })
    ).toThrow('saved lift ride does not match the bound structure');
  });

  test('with no doorway crossed there is no door to wait on', () => {
    const session = inLift();
    expect(session.snapshot.structure?.doorway).toBeNull();
    expect(ride(session, 1)).toBe(50);
  });

  test('a key with the door already shut still waits a pass for its latch', () => {
    // `$055B0A` sets the latch moving on admission, so a door that is already shut takes one
    // pass to clear it again, and that pass raises the door tone for one tick.
    const saved = throughTheDoor().captureResume();
    const session = new DamoclesSession(content, {
      ...saved,
      structure: {
        ...saved.structure!,
        attachments: saved.structure!.attachments.map(item =>
          item.slot === LIFT_DOOR
            ? { latch: 'closed', openUnits: 0, slot: item.slot }
            : item
        )
      }
    });
    expect(session.rideLift(1)).toEqual({ kind: 'admitted' });
    expect(latchOf(session)).toBe('moving');
    const heard = heardUntil(session, () => riding(session) === null);
    // One pass later than with no doorway to wait on, and the new Floor's door starts at once.
    expect(heard).toEqual([
      [1, 'door-start'],
      [2, 'door-stop'],
      [51, 'take'],
      [51, 'door-start']
    ]);
    expect(heard.slice(0, 2)).toEqual([
      [1, 'door-start'],
      [2, 'door-stop']
    ]);
  });
});

const cuesOf = (session: DamoclesSession): string[] =>
  session.drainEffects().map(effect => effect.cue);

/// Advances one VBL at a time until `done` is given the VBL count and says true, noting each cue
/// asked for with the VBL it was asked for on.
const heardUntil = (
  session: DamoclesSession,
  done: (vbls: number) => boolean
): [number, string][] => {
  const heard: [number, string][] = [];
  let vbls = 0;
  vblsUntil(session, () => {
    vbls += 1;
    heard.push(...cuesOf(session).map((cue): [number, string] => [vbls, cue]));
    return done(vbls);
  });
  return heard;
};

/// Every VBL's cues, in order, until no cue has been asked for and no ride is pending for
/// `settle` VBLs.
const tones = (session: DamoclesSession, settle: number): string[] => {
  const heard: string[] = [];
  let still = 0;
  vblsUntil(session, () => {
    const cues = cuesOf(session);
    heard.push(...cues);
    still = cues.length === 0 && riding(session) === null ? still + 1 : 0;
    return still === settle;
  });
  return heard;
};

describe('the door tones (#499)', () => {
  test('a door opening asks for one start and one stop, and closing the same again', () => {
    const session = inLift();
    expect(openUnits(session)).toBe(0);
    // Standing in the car, its door opens around the player and then stands open.
    expect(tones(session, 100)).toEqual(['door-start', 'door-stop']);
    expect(openUnits(session)).toBe(32);

    // In the hall the same door, left open, shuts.
    const hall = standingIn(0).captureResume();
    const away = new DamoclesSession(content, {
      ...hall,
      structure: {
        ...hall.structure!,
        attachments: session.captureResume().structure!.attachments
      }
    });
    expect(openUnits(away)).toBe(32);
    expect(tones(away, 100)).toEqual(['door-start', 'door-stop']);
    expect(openUnits(away)).toBe(0);
  });

  test('a ride: start and stop as the door shuts, nothing while the label steps, the arrival, then the new door', () => {
    const session = throughTheDoor();
    expect(session.rideLift(1)).toEqual({ kind: 'admitted' });
    // Long enough for the new Floor's door to open and stand open a while.
    const heard = heardUntil(session, vbls => vbls === 400);
    const arrival = DOOR_LATCH_VBLS + 50;
    expect(heard).toEqual([
      [1, 'door-start'],
      // The door's edge is shut on tick 32 and its latch clears on tick 33, a pass that still
      // raises `$5A9D8`. The pass after that sees it still.
      [DOOR_LATCH_VBLS + 1, 'door-stop'],
      // `$05AA3C` runs after the arrival's step in the same substep, so the new door starts at
      // once, and latches open 33 ticks in.
      [arrival, 'take'],
      [arrival, 'door-start'],
      [arrival + DOOR_LATCH_VBLS, 'door-stop']
    ]);
  });

  test('the edge survives a Save: a door saved moving does not start again', () => {
    const session = throughTheDoor();
    session.rideLift(1);
    session.advance(VBL);
    expect(cuesOf(session)).toEqual(['door-start']);
    const saved = session.captureResume();
    expect(saved.doorsMoving).toBeTrue();
    const resumed = new DamoclesSession(content, saved);
    expect(heardUntil(resumed, () => latchOf(resumed) === 'closed')).toEqual(
      []
    );
    resumed.advance(VBL);
    expect(cuesOf(resumed)).toEqual(['door-stop']);
  });
});

describe('the ride heard (#508)', () => {
  test('the door tone and burst, silence while the label steps, then the arrival effect and the new door', async () => {
    const session = throughTheDoor();
    expect(session.rideLift(1)).toEqual({ kind: 'admitted' });
    const heard = heardUntil(session, vbls => vbls === 400);
    // The cues go through the processor as the boot presents them: each VBL's at its end.
    const processor = await damoclesProcessor();
    for (const [vbl, cue] of heard) {
      processor.post({
        at: vbl * VBL,
        commands: [{ cue: cue as DamoclesCue, kind: 'cue' }]
      });
    }
    const levels = vblLevels(processor.render(401 * VBL));
    const at = (cue: string, nth = 0): number =>
      heard.filter(([, name]) => name === cue)[nth]![0];
    const audible = (from: number, to: number): boolean =>
      levels.slice(from, to).every(level => level > 3e-3);
    const silent = (from: number, to: number): boolean =>
      levels.slice(from, to).every(level => level < 5e-4);
    const closed = at('door-stop');
    const arrival = at('take');
    expect(arrival).toBe(at('door-start', 1));
    // The door shuts to its tone.
    expect(audible(1, closed)).toBeTrue();
    // Its burst, four VBLs, and then nothing while the label steps.
    expect(audible(closed, closed + 3)).toBeTrue();
    expect(silent(closed + 5, arrival)).toBeTrue();
    // The arrival: the shared effect over the new Floor's door opening, the door's burst, and
    // the effect's decay, a little over a second, to silence.
    expect(audible(arrival + 1, at('door-stop', 1) + 3)).toBeTrue();
    expect(silent(arrival + 55, levels.length)).toBeTrue();
  });
});

describe('outside a lift', () => {
  test('aboard there is no lift', () => {
    const session = inLift();
    // The board gate itself refuses in a region without bit 14, so the craft is restored aboard.
    const saved = session.captureResume();
    const craft = catalogue.instances.find(
      item => item.boarding?.admission === 'unkeyed'
    )!;
    const aboard = new DamoclesSession(content, {
      ...saved,
      occupancy: { instance: craft.id, kind: 'aboard' },
      residence: [
        ...saved.residence.filter(item => item.instance !== craft.id),
        {
          instance: craft.id,
          residence: {
            kind: 'occupied',
            placementClass: craft.placementClass ?? 0
          }
        }
      ]
    });
    expect(aboard.inLift).toBeFalse();
    expect(aboard.rideLift(2)).toEqual({ kind: 'noLift' });
  });
});

test('Atlas Travel cancels a lift journey even within the same structure', () => {
  const session = inLift();
  const start = session.snapshot.pose;
  expect(session.rideLift(2).kind).toBe('admitted');
  session.advance(1 / 50);
  expect(session.snapshot.structure?.ride).not.toBeNull();
  expect(
    session.travelToAtlas({
      bodyId: start.body,
      x: start.position.x / content.doc.grid.cellUnits,
      z: start.position.z / content.doc.grid.cellUnits
    })
  ).toEqual({ kind: 'travelled' });
  expect(session.snapshot.structure).toMatchObject({
    doorway: null,
    floor: 0,
    ride: null
  });
  expect(session.snapshot.pose.position.y).toBe(eye());
  const restored = new DamoclesSession(content, session.captureResume());
  expect(restored.snapshot.structure?.ride).toBeNull();
});
