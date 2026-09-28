import { beforeAll, describe, expect, test } from 'bun:test';

import { readErisPresentation } from '../src/damocles/documents.ts';
import { placementZone } from '../src/damocles/residence.ts';
import { initialDamoclesSaveScript } from '../src/damocles/save.ts';
import { structureRegionAt } from '../src/damocles/selection.ts';
import {
  DamoclesSession,
  type DamoclesContent
} from '../src/damocles/session.ts';
import { parseDamoclesStrings } from '../src/damocles/strings.ts';
import { erisSurfaceFrom, type ErisPlacement } from '../src/damocles/world.ts';
import { arrivalPoses } from './damocles-pose.ts';
import { loadCatalogue, modelsOf } from './fixtures/catalogue.ts';

let loaded: DamoclesContent;

beforeAll(async () => {
  const [catalogue, presentation, stringsValue] = await Promise.all([
    loadCatalogue(),
    Bun.file(new URL('../damocles/eris.json', import.meta.url)).json(),
    Bun.file('../payload/damocles/strings.json').json()
  ]);
  const doc = readErisPresentation(presentation);
  loaded = {
    catalogue,
    doc,
    models: modelsOf(catalogue),
    poses: await arrivalPoses(),
    presentationSha256: 'test',
    strings: parseDamoclesStrings(stringsValue),
    surface: erisSurfaceFrom(catalogue, modelsOf(catalogue), doc)
  };
});

const spaceport = (): ErisPlacement =>
  loaded.surface.placements.find(
    placement => placement.id === 'eris-surface-87'
  )!;

/// On foot beside Capital Spaceport carrying KEY- V.I.P. LIMO (slot 183, authored class 4),
/// standing at a capture's `$7AB2`/`$7ABA`.
const carryingKeyAt = (x: number, z: number): DamoclesSession => {
  const parent = spaceport();
  const pose = {
    body: 'body-11',
    heading: 0,
    pitch: 0,
    position: { x, y: loaded.doc.eye.heightUnits, z }
  };
  return new DamoclesSession(loaded, {
    angleBytes: [],
    bodyTurn: 0,
    briefcaseStore: [],
    carried: ['object-slot-183'],
    craft: null,
    doorsMoving: false,
    elapsed: 0,
    footTicks: 0,
    frameAccumulator: 0,
    occupancy: { kind: 'onFoot' },
    pendingBriefcaseDrop: null,
    pose,
    residence: [
      {
        instance: 'object-slot-183',
        residence: { kind: 'carried', placementClass: 4 }
      }
    ],
    script: {
      ...initialDamoclesSaveScript(),
      triggers: initialDamoclesSaveScript().triggers.map(trigger =>
        trigger.index === 2 ? { ...trigger, armed: false } : trigger
      )
    },
    scrollCounter: 0,
    spaceMemory: null,
    structure: {
      attachments: parent.selection!.structure.attachments.map(attachment => ({
        latch: 'closed' as const,
        openUnits: 0,
        slot: attachment.slot
      })),
      doorway: null,
      floor: 0,
      instanceId: parent.id,
      regionIndex: structureRegionAt(parent, pose, false),
      ride: null
    }
  });
};

const droppedKeyClass = (session: DamoclesSession): number | undefined => {
  expect(session.drop()).toEqual({ kind: 'dropped' });
  const residence = session.snapshot.residence.find(
    item => item.instance === 'object-slot-183'
  )?.residence;
  return residence?.placementClass;
};

describe('the placement class a direct Drop writes (#356)', () => {
  test('every Building detail publishes its extent, or null where it carries none', async () => {
    const { models } = await loadCatalogue();
    const details = models.filter(model => model.kind === 'interior');
    expect(details).toHaveLength(61);
    expect(details.every(model => model.extent !== undefined)).toBe(true);
    // Only Building detail 1, the one structure 0 binds, carries none.
    expect(
      details.filter(model => model.extent === null).map(model => model.id)
    ).toEqual(['interior-02620e']);
  });

  test('publishes Capital Spaceport detail extent in raw units', () => {
    const selection = spaceport().selection!;
    expect(selection.structure.detailModel).toBe('interior-0303d6');
    expect(selection.structure.scale).toEqual([2, 2]);
    expect(selection.extent).toEqual({
      header: 850,
      x: [400, 800],
      z: [-400, 600]
    });
  });

  test('outside Capital Spaceport a surface Drop writes 0 over the authored 4', () => {
    // limo-key-reverse-surface: dropped at $0047714B, $00886648 with the Spaceport bound, and
    // Association A's final byte went from 4 to 0. eris-spaceport-onfoot ($004770B1,
    // $00886C2D) is outside the rectangle too, but the port selects INTERSTELLARSHIP (slot 7)
    // there, so its Drop is a support attempt rather than a direct placement.
    expect(droppedKeyClass(carryingKeyAt(0x47_71_4b, 0x88_66_48))).toBe(0);
    expect(
      placementZone({ x: 0x47_70_b1, y: 0, z: 0x88_6c_2d }, spaceport())
    ).toBe(0);
  });

  test('interior-window is inside it and writes 4', () => {
    // interior-window: $7AB2 = $004780C9, $7ABA = $008886C5, $7A39 = 4.
    expect(droppedKeyClass(carryingKeyAt(0x47_80_c9, 0x88_86_c5))).toBe(4);
  });

  test('reproduces every Capital Spaceport capture zone', () => {
    // [$7910] reads 32758, 33558, 33528, 35528 in all six: origin 31958, 34328 at 2x2.
    const captures: readonly (readonly [number, number, number])[] = [
      [0x47_70_b1, 0x88_6c_2d, 0], // eris-spaceport-onfoot, observed.ram
      [0x47_83_88, 0x88_79_6f, 2], // boarded-car
      [0x47_83_0f, 0x88_7c_2e, 1], // boarded-limo
      [0x47_80_c9, 0x88_86_c5, 4], // interior-window
      [0x47_83_88, 0x88_7b_06, 2] // left-limo
    ];
    for (const [x, z, zone] of captures) {
      expect(placementZone({ x, y: 0, z }, spaceport())).toBe(zone);
    }
  });

  test('a negative scale swaps each pair, and the edges wrap in a word', () => {
    // damocles.mentor.transporter binds the same detail at -2 x -1 from origin 33668, 32258:
    // [$7910] reads 32068, 32868, 31658, 32658 and $7A39 = 8.
    const mentor = {
      position: { x: 0x0b_83_84, y: 0, z: 0x01_7e_02 },
      selection: {
        ...spaceport().selection!,
        structure: {
          ...spaceport().selection!.structure,
          scale: [-2, -1] as const
        }
      }
    };
    expect(
      placementZone({ x: 0x0b_0a_83_0b, y: 0, z: 0x01_13_80_c7 }, mentor)
    ).toBe(8);
    const wrapped = {
      position: { x: 0x80_00, y: 0, z: 0x80_00 },
      selection: {
        ...spaceport().selection!,
        extent: { header: 30_000, x: [-25_000, 25_000], z: [-20_000, 20_000] },
        structure: {
          ...spaceport().selection!.structure,
          scale: [2, 2] as const
        }
      }
    } as const;
    // At 2x the X pair is 32768 -/+ 50000, which wraps to 48304 and 17232, and Z to 58304
    // and 7232: every position is below the first edge or above the second.
    expect(placementZone({ x: 0x80_00, y: 0, z: 0x80_00 }, wrapped)).toBe(0);
    expect(placementZone({ x: 0xff_ff, y: 0, z: 0x80_00 }, wrapped)).toBe(2);
    expect(placementZone({ x: 0xff_ff, y: 0, z: 0xff_ff }, wrapped)).toBe(8);
  });

  test('no bound structure, or a detail without an extent, gives zone 0', () => {
    expect(placementZone({ x: 0x80_00, y: 0, z: 0x80_00 }, null)).toBe(0);
    const none = {
      ...spaceport(),
      selection: { ...spaceport().selection!, extent: null }
    };
    expect(placementZone({ x: 0x47_80_c9, y: 0, z: 0x88_86_c5 }, none)).toBe(0);
  });
});
