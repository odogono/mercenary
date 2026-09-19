import { beforeAll, describe, expect, test } from 'bun:test';

import { parseCatalogue, type Catalogue } from '../src/catalogue/data.ts';
import { readErisPresentation } from '../src/damocles/documents.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { arrivalPoses } from './damocles-pose.ts';

/// A door key's own object slot is the cell's `$7AFB` base plus the entrance's key index, and
/// its printed letter is that slot's distance from slot 30 ($059FA0). Authors House stands on
/// DION `14-13`, whose base is `$1E`, so its one `$F0` entrance is key A: slot 30.
const AUTHORS_HOUSE = 'dion-surface-de';
const KEY_A = 'object-slot-30';

let catalogue: Catalogue;
let content: DamoclesContent;

beforeAll(async () => {
  catalogue = parseCatalogue(
    await Bun.file('../payload/damocles/catalogue.json').json()
  );
  const doc = readErisPresentation(await Bun.file('damocles/eris.json').json());
  content = {
    catalogue,
    doc,
    poses: await arrivalPoses(),
    presentationSha256: 'test',
    strings: parseDamoclesStrings(
      await Bun.file('../payload/damocles/strings.json').json()
    ),
    surface: erisSurfaceFrom(catalogue, doc)
  };
});

/// Stand in the keyed entrance's Proximity Box, carrying whatever the case is testing.
///
/// The point comes from the recovered placement and the recovered box, not from a number this
/// suite chose: the box's own centre in model-local units, placed through the placement. Authors
/// House is drawn unturned and this document keeps model Z, so the two frames agree on sign.
const atAuthorsHouseDoor = (carried: readonly string[]): DamoclesSession => {
  const session = new DamoclesSession(content);
  expect(session.switchToPose('dion-2-3').kind).toBe('switched');
  const placement = session.snapshot.surface.placements.find(
    item => item.id === AUTHORS_HOUSE
  )!;
  const box = placement.selection!.structure.attachments.find(
    item => item.keyIndex !== undefined
  )!.proximityBox;
  const saved = session.captureResume();
  return new DamoclesSession(content, {
    ...saved,
    carried: [...carried],
    pose: {
      ...saved.pose,
      position: {
        x: placement.position.x + (box.x[0] + box.x[1]) / 2,
        y: saved.pose.position.y,
        z: placement.position.z + (box.z[0] + box.z[1]) / 2
      }
    },
    residence: carried.map(instance => ({
      instance,
      residence: {
        kind: 'carried',
        placementClass:
          catalogue.instances.find(item => item.id === instance)!
            .placementClass ?? 0
      } as const
    })),
    structure: {
      attachments: placement.selection!.structure.attachments.map(item => ({
        openUnits: 0,
        slot: item.slot
      })),
      instanceId: AUTHORS_HOUSE,
      regionIndex: null
    }
  });
};

const doorUnits = (session: DamoclesSession): number =>
  session.snapshot.structure!.attachments.find(item => item.slot === 0x03_fc)!
    .openUnits;

describe('a keyed Entrance Attachment', () => {
  test('is the one Authors House carries, keyed to door key A', () => {
    const placement = erisSurfaceFrom(catalogue, content.doc, {
      bodyId: 'body-4',
      origin: content.doc.grid.origin
    }).placements.find(item => item.id === AUTHORS_HOUSE)!;
    expect(placement.keyBase).toBe(0x1e);
    const keyed = placement.selection!.structure.attachments.filter(
      item => item.keyIndex !== undefined
    );
    expect(keyed).toHaveLength(1);
    expect(placement.keyBase! + keyed[0]!.keyIndex!).toBe(30);
  });

  test('stays shut inside its Proximity Box while the key is not carried', () => {
    const session = atAuthorsHouseDoor([]);
    session.advance(2);
    expect(doorUnits(session)).toBe(0);
  });

  test('says LOCKED rather than refusing in silence', () => {
    const session = atAuthorsHouseDoor([]);
    session.advance(2);
    expect(session.snapshot.message?.id).toBe('system-string-0');
    expect(
      content.strings.systemStrings.entries.find(
        item => item.id === 'system-string-0'
      )?.text
    ).toContain('LOCKED');
  });

  test('opens on proximity once door key A is in the Carried Stack', () => {
    const session = atAuthorsHouseDoor([KEY_A]);
    session.advance(2);
    expect(doorUnits(session)).toBeGreaterThan(0);
  });

  test('leaves an unkeyed entrance opening on proximity alone', () => {
    const session = atAuthorsHouseDoor([]);
    session.advance(2);
    const unkeyed = session.snapshot.structure!.attachments.filter(
      item => item.slot !== 0x03_fc
    );
    expect(unkeyed.every(item => item.openUnits === 0)).toBe(true);
  });
});
