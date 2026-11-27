import { beforeAll, describe, expect, test } from 'bun:test';

import { readErisPresentation } from '../src/damocles/documents.ts';
import { structureInsertionGroups } from '../src/damocles/residence.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom } from '../src/damocles/world.ts';
import { damoclesDocuments } from './damocles-documents.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

/// A Drop inside a structure takes the current region's number as its Insertion Group and is
/// refused unless the structure's record lists that group (`$05453A`, #1000). Snow Island's
/// POSTOFFICE SORTING lists groups 1, 2, 4-8 and 19: every room, but not the latch-gated
/// doorway regions 3, 9 and 10.

const SORTING = 'eris-snow-island-surface-03';
const CLIPBOARD = 'object-slot-143';

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

/// A session at the middle of POSTOFFICE SORTING's region `index`, carrying the CLIPBOARD.
const inSorting = (index: number): DamoclesSession => {
  const resume = new DamoclesSession(content).captureResume();
  const bound = content.surface.placements.find(item => item.id === SORTING)!;
  const structure = bound.selection!.structure;
  const [xs, zs] = structure.regions[index]!.bounds;
  const negate = content.doc.orientation.modelZ === 'negate';
  const x = (xs![0] + xs![1]) / 2;
  const z = ((zs![0] + zs![1]) / 2) * (negate ? -1 : 1);
  const cos = Math.cos(bound.heading);
  const sin = Math.sin(bound.heading);
  return new DamoclesSession(content, {
    ...resume,
    carried: [CLIPBOARD],
    pose: {
      ...resume.pose,
      position: {
        ...resume.pose.position,
        x: bound.position.x + x * cos + z * sin,
        z: bound.position.z - x * sin + z * cos
      }
    },
    residence: [
      {
        instance: CLIPBOARD,
        residence: { kind: 'carried', placementClass: 0 }
      }
    ],
    structure: {
      attachments: structure.attachments.map(item => ({
        latch: 'closed' as const,
        openUnits: 0,
        slot: item.slot
      })),
      doorway: null,
      floor: 0,
      instanceId: SORTING,
      regionIndex: index,
      ride: null
    }
  });
};

const residenceOf = (session: DamoclesSession) =>
  session.snapshot.residence.find(item => item.instance === CLIPBOARD)
    ?.residence;

const floorGroups = (level: number) =>
  structureInsertionGroups(content.catalogue, 'eris-surface-89', level)?.map(
    item => item.group
  );

test("above Floor 0 the Floor's structure, not the building's, lists the groups", () => {
  // The State Office binds structure-014aec on Floor 0, structure-014f52 on Floors 1 and 2,
  // and structure-01532a on Floor 10; `$7B0E` follows the Floor (#355).
  expect(floorGroups(0)).toEqual([1, 7]);
  expect(floorGroups(1)).toEqual([1, 7, 8, 9]);
  expect(floorGroups(10)).toEqual([1, 7]);
  expect(floorGroups(3)).toBeUndefined();
});

describe('a Drop inside POSTOFFICE SORTING', () => {
  test('is placed in region 7, at Insertion Group 7', () => {
    const session = inSorting(6);
    expect(session.drop()).toEqual({ kind: 'dropped' });
    expect(residenceOf(session)).toMatchObject({
      insertionGroup: 7,
      kind: 'structure',
      parent: SORTING
    });
  });

  test('is refused in doorway region 3, which no group numbers', () => {
    const session = inSorting(2);
    expect(session.drop()).toEqual({ kind: 'refused' });
    expect(residenceOf(session)?.kind).toBe('carried');
  });
});
