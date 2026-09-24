import { beforeAll, describe, expect, test } from 'bun:test';

import type { AssembledCatalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { cellOf, erisSurfaceFrom } from '../src/damocles/world.ts';
import { arrivalPoses } from './damocles-pose.ts';
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
      expect(session.rideLift(floor)).toEqual({ kind: 'rode' });
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
        expect(session.rideLift(floor)).toEqual({ kind: 'rode' });
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
    expect(session.rideLift(2)).toEqual({ kind: 'rode' });
    const upstairs = session.captureResume();
    expect(session.rideLift(2)).toEqual({ kind: 'refused' });
    expect(session.captureResume()).toEqual(upstairs);
  });

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
