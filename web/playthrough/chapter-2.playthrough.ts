import { expect, test } from '@playwright/test';

import { Chapter } from './ledger.ts';
import { dropHere, placement, rotateTo, switchOn } from './objects.ts';
import { CHAPTER_2 as STEP } from './route.ts';
import {
  at,
  attribute,
  expectAt,
  inventoryHead,
  islandAreas,
  pressUntil,
  takeUntilHead
} from './session.ts';
import { MOORBY_START, NIXON, NIXON_BACK_ROOM, startFrom } from './starts.ts';
import { structureOrigin, walkTo } from './steering.ts';
import {
  doorOutside,
  flyToEntrance,
  hopByDigit,
  reboard,
  rideTo,
  stepOutOfCube,
  walkIntoTransporter,
  type Parked
} from './travel.ts';

/// Playthrough Chapter 2: from EAGLE NINE S E at the Moorby School of Flying to NOVA TRIGGER 4
/// on Metis, after ST Format 20 steps 1 to 4.

const EAGLE = 'object-slot-3';
const NEWTON = 'eris-key-west-surface-77';
const SORTING_OFFICE = 'eris-snow-island-surface-03';
const CAPITAL_11_08 = 'eris-surface-8b';
/// DOOBERRYS SOLICITORS at Metis 00-06, whose Floor 9 holds Transporter slot 67.
const METIS_00_06 = 'metis-surface-60';
/// NIXON INTR COURT at Metis 05-06. Its inner door's Proximity Box takes in the TABLE, so walking
/// to the table opens the "secret door" to the back room and the WASHBASIN.
const METIS_05_06 = NIXON;
test('Chapter 2: Moorby to NOVA TRIGGER 4 on Metis', async ({
  page
}, testInfo) => {
  await page.goto('/damocles');
  const eagle = await structureOrigin(page, EAGLE);
  const setup = await startFrom(page, {
    ...MOORBY_START,
    at: { x: eagle.x + 150, z: eagle.z }
  });
  const chapter = new Chapter(
    page,
    testInfo,
    'chapter-2',
    'Moorby to NOVA TRIGGER 4 on Metis',
    setup
  );
  const areas = await islandAreas(page);
  let parked: Parked | null = null;

  try {
    await chapter.step(STEP.antigrav, async () => {
      await pressUntil(
        page,
        'b',
        async () => (await attribute(page, 'occupancy')) === EAGLE,
        'board the Eagle'
      );
      parked = await flyToEntrance(page, NEWTON);
      await walkTo(page, NEWTON, { x: -240, z: -1900 }, 'inside the lobby');
      await rideTo(page, NEWTON, 10);
      await expectAt(page, areas, STEP.antigrav.target);
      await walkTo(
        page,
        NEWTON,
        await placement(page, 157),
        'beside the ANTIGRAV',
        300
      );
      await takeUntilHead(page, 'ANTIGRAV');
    });

    await chapter.step(STEP.cupboard, async () => {
      await rideTo(page, NEWTON, 0);
      await reboard(page, parked!, NEWTON);
      parked = await flyToEntrance(page, SORTING_OFFICE);
      await expectAt(page, areas, {
        body: STEP.cupboard.target.body,
        island: STEP.cupboard.target.island
      });
      await walkTo(
        page,
        SORTING_OFFICE,
        await placement(page, 85),
        'beside the CUPBOARD',
        300
      );
      await takeUntilHead(page, 'CUPBOARD');
      await switchOn(page, 2);
      await dropHere(page, chapter, SORTING_OFFICE, 'CUPBOARD');
    });

    await chapter.step(STEP.liftTheEagle, async () => {
      await reboard(page, parked!, SORTING_OFFICE);
      parked = await flyToEntrance(page, CAPITAL_11_08);
      await expectAt(page, areas, {
        ...STEP.liftTheEagle.target,
        floor: 0
      });
      // With the ANTIGRAV carried, a craft is takeable (docs/research/damocles-carry-capacity.md).
      await walkTo(page, null, parked.at, 'beside the Eagle', 150);
      await takeUntilHead(page, 'EAGLE NINE S E');
      await walkTo(page, CAPITAL_11_08, { x: 0, z: 0 }, 'inside');
      await rideTo(page, CAPITAL_11_08, 10);
    });

    await chapter.step(STEP.transporter, async () => {
      // Come at slot 69 from the north and walk south into it: facing the southern half of the
      // compass steps up the ring, to GAEA slot 70 (docs/research/damocles-arrival-routes.md).
      await walkIntoTransporter(
        page,
        CAPITAL_11_08,
        await placement(page, 69),
        'north'
      );
      expect(await attribute(page, 'body')).toBe('body-8');
      // Stopped in the arrival cube: the panel names VOID and the Cell Readout the destination.
      const arrived = await at(page, areas);
      expect([arrived.body, arrived.cell]).toEqual(['VOID', '08-08']);
      // Key n names slot 64 + n: 3 is Metis slot 67.
      await hopByDigit(page, 3, 'body-15');
      await stepOutOfCube(page, areas);
      await expectAt(page, areas, STEP.transporter.target);
    });

    await chapter.step(STEP.washbasin, async () => {
      // Take slot 67, which the ANTIGRAV makes takeable like any craft. Carried, the ring passes
      // it; dropped, it is a resident where it lies (docs/research/damocles-carry-capacity.md).
      const slot = await placement(page, 67);
      await walkTo(
        page,
        METIS_00_06,
        { x: slot.x - 120, z: slot.z },
        'beside the transporter',
        25
      );
      await pressUntil(
        page,
        't',
        async () => (await inventoryHead(page)).startsWith('TRANSPORTER'),
        'take the transporter',
        15_000
      );

      // Out of DOOBERRYS SOLICITORS, drop the Eagle and fly it to NIXON INTR COURT.
      await rideTo(page, METIS_00_06, 0);
      await walkTo(
        page,
        METIS_00_06,
        await doorOutside(page, METIS_00_06),
        'outside',
        60
      );
      await rotateTo(page, 'EAGLE NINE S E');
      await pressUntil(
        page,
        'd',
        async () => (await inventoryHead(page)) !== 'EAGLE NINE S E',
        'drop the Eagle'
      );
      await pressUntil(
        page,
        'b',
        async () => (await attribute(page, 'occupancy')) === EAGLE,
        'board the Eagle'
      );
      // A short hop: most of it is the slow final approach, which outlasts the default budget.
      parked = await flyToEntrance(page, METIS_05_06, { timeoutSeconds: 600 });

      // Take the Eagle again, go in past the table, and leave the transporter in the back room.
      await walkTo(page, null, parked.at, 'beside the Eagle', 150);
      await takeUntilHead(page, 'EAGLE NINE S E');
      const table = await placement(page, 114);
      await walkTo(
        page,
        METIS_05_06,
        { x: table.x, z: table.z - 60 },
        'at the table',
        40
      );
      await walkTo(page, METIS_05_06, NIXON_BACK_ROOM, 'in the back room', 40);
      await rotateTo(page, 'TRANSPORTER');
      await pressUntil(
        page,
        'd',
        async () => !(await inventoryHead(page)).startsWith('TRANSPORTER'),
        'drop the transporter'
      );

      await walkTo(
        page,
        METIS_05_06,
        await placement(page, 87),
        'beside the WASHBASIN',
        300
      );
      await takeUntilHead(page, 'WASHBASIN');
      await switchOn(page, 4);
      await dropHere(page, chapter, METIS_05_06, 'WASHBASIN');
      await expectAt(page, areas, STEP.washbasin.target);
    });
  } finally {
    await chapter.finish();
  }
});
