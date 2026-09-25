import { beforeAll, describe, expect, test } from 'bun:test';

import type {
  AssembledCatalogue,
  EntranceAttachment
} from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  attachmentOpenLimit,
  stepAttachment,
  type AttachmentState
} from '../src/damocles/selection.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { cellOf, erisSurfaceFrom } from '../src/damocles/world.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// How fast a Damocles door moves (#498, docs/research/damocles-door-speed.md). Every one of
/// `$05AA3C`'s twelve motion paths steps its moving edge by the constant 1, once a substep, so a
/// door's time is its travel: the constructor's leaf edge to eight units short of the far edge.

const SPACEPORT = 'eris-surface-87';
const SPACEPORT_DOOR = 0x03_fc;

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

const VBL = 1 / 50;

/// The travel of the door in `slot` of the structure the Catalogue places in `structureSlot`.
const travelOf = (structureSlot: number, slot: number): number => {
  const model = catalogue.models.find(
    item =>
      item.structureSelection !== undefined && item.slots[0] === structureSlot
  )!;
  return attachmentOpenLimit(
    model.structureSelection!.attachments.find(item => item.slot === slot)!
  );
};

/// A session at the Capital Spaceport with every door `openUnits` open, standing at local
/// (`x`, `z`). The spaceport is drawn unturned and this document keeps model Z.
const atSpaceport = (
  x: number,
  z: number,
  openUnits: number
): DamoclesSession => {
  const placement = content.surface.placements.find(
    item => item.id === SPACEPORT
  )!;
  const ground = new DamoclesSession(content);
  const cell = cellOf(placement.position, content.surface.grid);
  ground.teleportToCell(cell.x, cell.z);
  const saved = ground.captureResume();
  return new DamoclesSession(content, {
    ...saved,
    pose: {
      ...saved.pose,
      position: {
        x: placement.position.x + x,
        y: saved.pose.position.y,
        z: placement.position.z + z
      }
    },
    structure: {
      ...saved.structure!,
      attachments: placement.selection!.structure.attachments.map(item => ({
        latch: openUnits === 0 ? 'closed' : 'open',
        openUnits,
        slot: item.slot
      })),
      regionIndex: null
    }
  });
};

const spaceportDoor = (session: DamoclesSession) =>
  session.snapshot.structure!.attachments.find(
    item => item.slot === SPACEPORT_DOOR
  )!;
const doorUnits = (session: DamoclesSession): number =>
  spaceportDoor(session).openUnits;

/// Advances one VBL at a time until `done`, and says how many VBLs that took.
const vblsUntil = (session: DamoclesSession, done: () => boolean): number => {
  for (let vbls = 1; vbls <= 2000; vbls += 1) {
    session.advance(VBL);
    if (done()) {
      return vbls;
    }
  }
  throw new Error('the door did not settle in 2000 VBLs');
};

describe('every door moves one unit a tick', () => {
  test('the Capital Spaceport door opens in its 92 units of travel, a unit a tick', () => {
    const door = content.surface.placements
      .find(item => item.id === SPACEPORT)!
      .selection!.structure.attachments.find(
        item => item.slot === SPACEPORT_DOOR
      )!;
    const [x0, x1] = door.proximityBox.x;
    const [z0, z1] = door.proximityBox.z;
    const session = atSpaceport((x0 + x1) / 2, (z0 + z1) / 2, 0);
    const trace: number[] = [];
    const opened = vblsUntil(session, () => {
      trace.push(doorUnits(session));
      return doorUnits(session) === attachmentOpenLimit(door);
    });
    expect(opened).toBe(92);
    expect(trace).toEqual(Array.from({ length: 92 }, (_, tick) => tick + 1));
  });

  test('and closes behind the player in the same 92 ticks', () => {
    const door = content.surface.placements
      .find(item => item.id === SPACEPORT)!
      .selection!.structure.attachments.find(
        item => item.slot === SPACEPORT_DOOR
      )!;
    const [x0, x1] = door.proximityBox.x;
    // Just beyond the box's upper-exclusive Z edge, inside the spaceport.
    const session = atSpaceport(
      (x0 + x1) / 2,
      door.proximityBox.z[1] + 100,
      92
    );
    expect(session.snapshot.structure?.instanceId).toBe(SPACEPORT);
    expect(vblsUntil(session, () => doorUnits(session) === 0)).toBe(92);
  });

  test('a step shorter than a tick moves no door', () => {
    const door = content.surface.placements
      .find(item => item.id === SPACEPORT)!
      .selection!.structure.attachments.find(
        item => item.slot === SPACEPORT_DOOR
      )!;
    const [x0, x1] = door.proximityBox.x;
    const [z0, z1] = door.proximityBox.z;
    const session = atSpaceport((x0 + x1) / 2, (z0 + z1) / 2, 0);
    session.advance(VBL / 2);
    expect(doorUnits(session)).toBe(0);
    session.advance(VBL / 2);
    expect(doorUnits(session)).toBe(1);
  });
});

/// The first attachment the Catalogue carries of a constructor shape.
const firstOf = (
  leafCount: 1 | 2,
  movingSide?: 'high' | 'low'
): EntranceAttachment =>
  catalogue.models
    .flatMap(model => model.structureSelection?.attachments ?? [])
    .find(
      item =>
        item.constructor.leafCount === leafCount &&
        item.constructor.movingSide === movingSide
    )!;

/// Passes from one settled latch to the other, and the pass the edge arrived on.
const settle = (
  attachment: EntranceAttachment,
  opening: boolean
): { arrived: number; latched: number } => {
  const travel = attachmentOpenLimit(attachment);
  let state: AttachmentState = opening
    ? { latch: 'closed', openUnits: 0 }
    : { latch: 'open', openUnits: travel };
  let arrived = 0;
  for (let pass = 1; pass <= travel + 2; pass += 1) {
    const next = stepAttachment(attachment, state, opening);
    if (next === undefined) {
      return { arrived, latched: pass - 1 };
    }
    state = next;
    if (arrived === 0 && state.openUnits === (opening ? travel : 0)) {
      arrived = pass;
    }
  }
  throw new Error('the latch did not settle');
};

describe('the latch settles as its path compares the edge', () => {
  test('two leaves latch a pass after the edge arrives, opening and closing', () => {
    // `$05AB8C`–`$05AB92` and `$05ACEE`–`$05ACF2` test the rising inner edge with `bpl`.
    const door = firstOf(2);
    const travel = attachmentOpenLimit(door);
    for (const opening of [true, false]) {
      expect(settle(door, opening)).toEqual({
        arrived: travel,
        latched: travel + 1
      });
    }
  });

  test('a low leaf latches open a pass late and closed on arrival', () => {
    // Its low edge rises to open (`$05AC30`, `bpl`) and falls to close (`$05AAD2`, `bmi`).
    const door = firstOf(1, 'low');
    const travel = attachmentOpenLimit(door);
    expect(settle(door, true)).toEqual({
      arrived: travel,
      latched: travel + 1
    });
    expect(settle(door, false)).toEqual({ arrived: travel, latched: travel });
  });

  test('a high leaf latches open on arrival and closed a pass late', () => {
    // Its high edge falls to open (`$05AC5A`, `bmi`) and rises to close (`$05AAFA`, `bpl`).
    const door = firstOf(1, 'high');
    const travel = attachmentOpenLimit(door);
    expect(settle(door, true)).toEqual({ arrived: travel, latched: travel });
    expect(settle(door, false)).toEqual({
      arrived: travel,
      latched: travel + 1
    });
  });

  test('a door that has settled takes no path, and a moving latch at its endpoint settles', () => {
    const door = firstOf(2);
    const travel = attachmentOpenLimit(door);
    expect(
      stepAttachment(door, { latch: 'open', openUnits: travel }, true)
    ).toBeUndefined();
    expect(
      stepAttachment(door, { latch: 'closed', openUnits: 0 }, false)
    ).toBeUndefined();
    // As `$055B0A` leaves a shut door when a ride is admitted.
    expect(
      stepAttachment(door, { latch: 'moving', openUnits: 0 }, false)
    ).toEqual({ latch: 'closed', openUnits: 0 });
  });

  test('the Capital Spaceport door latches open a tick after its edge arrives', () => {
    const door = content.surface.placements
      .find(item => item.id === SPACEPORT)!
      .selection!.structure.attachments.find(
        item => item.slot === SPACEPORT_DOOR
      )!;
    const [x0, x1] = door.proximityBox.x;
    const [z0, z1] = door.proximityBox.z;
    const session = atSpaceport((x0 + x1) / 2, (z0 + z1) / 2, 0);
    expect(vblsUntil(session, () => doorUnits(session) === 92)).toBe(92);
    expect(spaceportDoor(session).latch).toBe('moving');
    session.advance(VBL);
    expect(spaceportDoor(session).latch).toBe('open');
  });
});

describe('the doors #472 timed on the ST', () => {
  // These are all two-leaf doors, so each latch changes at travel + 1 substeps: the tick after
  // the edge reaches its endpoint is the one that sets `$FF` or clears to `$00`.
  test('the State Office lift door $3F4 travels 32 units on every Floor it binds', () => {
    // Floors 0, 1, 2 and 10 bind slots 76, 78, 78 and 79; the ST cleared its latch at substep 33.
    expect([76, 78, 79].map(slot => travelOf(slot, 0x03_f4))).toEqual([
      32, 32, 32
    ]);
  });

  test('the Vesta transporter lift door $3FC travels 82 units on every Floor it binds', () => {
    // Structure 70 binds slots 90 to 93; the ST settled each movement at substep 83.
    expect([90, 91, 92, 93].map(slot => travelOf(slot, 0x03_fc))).toEqual([
      82, 82, 82, 82
    ]);
  });

  test('the Capital Spaceport door travels 92 units', () => {
    // The Structure 74 trace advanced 8 units a frame, at 8 substeps a frame.
    expect(travelOf(74, SPACEPORT_DOOR)).toBe(92);
  });
});
