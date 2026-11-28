import { expect, test, type Page } from '@playwright/test';

import { Chapter } from './ledger.ts';
import { dropHere, placement, rotateTo, switchOn } from './objects.ts';
import { CHAPTER_3 as STEP } from './route.ts';
import {
  attribute,
  expectAt,
  field,
  inventoryHead,
  islandAreas,
  pressUntil,
  takeUntilHead
} from './session.ts';
import { NIXON, NIXON_BACK_ROOM, NIXON_START, startFrom } from './starts.ts';
import { local, structureOrigin, walkTo, type Point } from './steering.ts';
import {
  doorOutside,
  flyToEntrance,
  hopByDigit,
  rideTo,
  stepOutOfCube,
  walkIntoTransporter,
  type Parked
} from './travel.ts';

/// Playthrough Chapter 3: from NOVA TRIGGER 4 on Metis to selling the gold on Gaea, after ST
/// Format 20 steps 5 and 6. The Sale is the last step until the session has Trading Posts (#1024).

const EAGLE = 'object-slot-3';
const GAEA = 'body-8';
/// HANTZENS NEW HOUSE at Ur City 07-01, which holds Transporter slot 64 and the SIDEBOARD.
const HANTZENS = 'gaea-ur-city-surface-17';
/// TRADE COMMISSION at Chaldea 08-08, which holds Transporter slot 70.
const TRADE_COMMISSION = 'gaea-chaldea-metropolis-surface-88';
/// BANK OF GAEA HQ at Chaldea 06-06, whose basement holds GOLD slot 155.
const BANK = 'gaea-chaldea-metropolis-surface-66';
/// The Trading Post at Chaldea 04-06.
const CHALDEA_04_06 = 'gaea-chaldea-metropolis-surface-64';
/// Its trading room, region 9 (index 8), where a Drop is a Sale: `$7AFC` = 9
/// (docs/research/damocles-object-drops.md, "Trading Post credit and buy-back").
const TRADING_ROOM = { x: 2690, z: -1395 };

/// Out of `from` by its door, drop EAGLE NINE S E there and board it.
const boardFromCarried = async (page: Page, from: string): Promise<void> => {
  if (Number(await attribute(page, 'floor')) !== 0) {
    await rideTo(page, from, 0);
  }
  await walkTo(page, from, await doorOutside(page, from), 'outside', 60);
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
};

/// Beside the parked Eagle, take it again: the ANTIGRAV makes a craft takeable.
const takeTheEagle = async (page: Page, parked: Parked): Promise<void> => {
  await walkTo(page, null, parked.at, 'beside the Eagle', 150);
  await takeUntilHead(page, 'EAGLE NINE S E');
};

test('Chapter 3: Metis to selling the gold on Gaea', async ({
  page
}, testInfo) => {
  await page.goto('/damocles');
  const transporter: Point = local(
    await structureOrigin(page, NIXON),
    NIXON_BACK_ROOM
  );
  // South of the Transporter, outside its cube, so the first walk into it is from the south.
  const setup = await startFrom(page, {
    ...NIXON_START,
    at: { x: transporter.x, z: transporter.z - 150 },
    placed: [{ at: transporter, slot: 67 }]
  });
  const chapter = new Chapter(
    page,
    testInfo,
    'chapter-3',
    'Metis to selling the gold on Gaea',
    setup
  );
  const areas = await islandAreas(page);

  try {
    await chapter.step(STEP.sideboard, async () => {
      // Walking north into it steps down the ring, off Metis.
      await walkIntoTransporter(page, NIXON, NIXON_BACK_ROOM, 'south');
      // Key n names slot 64 + n: 0 is Ur City slot 64.
      await hopByDigit(page, 0, GAEA);
      await stepOutOfCube(page, areas);
      await expectAt(page, areas, STEP.sideboard.target);
      await walkTo(
        page,
        HANTZENS,
        await placement(page, 84),
        'beside the SIDEBOARD',
        300
      );
      await takeUntilHead(page, 'SIDEBOARD');
      await switchOn(page, 1);
      await dropHere(page, chapter, HANTZENS, 'SIDEBOARD');
    });

    await chapter.step(STEP.gold, async () => {
      // Walking south into slot 64 steps up the ring, to Eris slot 65; 6 is Chaldea slot 70.
      await walkIntoTransporter(
        page,
        HANTZENS,
        await placement(page, 64),
        'north'
      );
      await hopByDigit(page, 6, GAEA);
      await stepOutOfCube(page, areas);
      await expectAt(page, areas, {
        body: STEP.gold.target.body,
        cell: '08-08',
        island: STEP.gold.target.island
      });
      await boardFromCarried(page, TRADE_COMMISSION);
      const parked = await flyToEntrance(page, BANK);
      await takeTheEagle(page, parked);
      await rideTo(page, BANK, 10);
      await expectAt(page, areas, STEP.gold.target);
      await walkTo(
        page,
        BANK,
        await placement(page, 155),
        'beside the GOLD',
        300
      );
      await takeUntilHead(page, 'GOLD');
    });

    await chapter.step(
      STEP.sell,
      async () => {
        await boardFromCarried(page, BANK);
        const parked = await flyToEntrance(page, CHALDEA_04_06);
        await takeTheEagle(page, parked);
        await walkTo(
          page,
          CHALDEA_04_06,
          TRADING_ROOM,
          'in the trading room',
          60
        );
        await expectAt(page, areas, STEP.sell.target);
        // The frame publishes the region's index: region 9 is index 8.
        expect(await attribute(page, 'region')).toBe('8');
        await rotateTo(page, 'GOLD');
        const before = (await field(page, 'cash').textContent()) ?? '';
        await pressUntil(
          page,
          'd',
          async () => (await inventoryHead(page)) !== 'GOLD',
          'drop the GOLD'
        );
        await expect
          .poll(async () => (await field(page, 'cash').textContent()) ?? '', {
            message: `dropping the GOLD in the trading room left the balance at ${before.trim()}: no Sale (#1024)`,
            timeout: 5000
          })
          .not.toBe(before);
      },
      { lead: 'missing feature' }
    );
  } finally {
    await chapter.finish();
  }
});
