import { test, type Page } from '@playwright/test';

import { Chapter } from './ledger.ts';
import { CHAPTER_1 as STEP } from './route.ts';
import {
  attribute,
  expectAt,
  field,
  islandAreas,
  message,
  pressUntil,
  rowShows,
  takeUntilHead
} from './session.ts';
import {
  local,
  steer,
  structureOrigin,
  walkTo,
  type Leg,
  type Point
} from './steering.ts';

/// Playthrough Chapter 1: from the start on foot at Capital Spaceport to EAGLE NINE S E in the
/// air, after ST Format 14's opening. It starts where a New Game does, so it assumes nothing.
///
/// Each place a step names is a structure-local offset; the route between them on foot comes from
/// the structure's own region boxes (`planner.ts`), and outdoors runs straight.

const SPACEPORT = 'eris-surface-87';
const STATE_OFFICE = 'eris-surface-89';
const LIMO = 'object-slot-5';
/// The State Office's lift car, region 4 on every Floor (`web/e2e/damocles-lift.e2e.ts`).
const LIFT_CAR = { x: -750, z: 0 };
const EAGLE = 'object-slot-3';

const leg = (origin: Point, offset: Point, name: string, radius = 60): Leg => ({
  name,
  radius,
  to: local(origin, offset)
});

const instancePoint = async (page: Page, id: string): Promise<Point> =>
  structureOrigin(page, id);

/// Ride a Damocles Lift from inside its car: press the Floor key, then wait for the arrival.
const ride = async (page: Page, key: string, floor: string): Promise<void> => {
  await pressUntil(
    page,
    key,
    async () =>
      (await attribute(page, 'floor')) === floor ||
      (await attribute(page, 'ride-destination')) === floor,
    `ride to Floor ${floor}`
  );
  await test
    .expect(page.locator('#frame'))
    .toHaveAttribute('data-floor', floor, {
      timeout: 30_000
    });
};

test('Chapter 1: Capital Spaceport to the Eagle in the air', async ({
  page
}, testInfo) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/damocles');
  await test
    .expect(page.locator('#frame'))
    .toHaveAttribute('data-state', 'ready', {
      timeout: 60_000
    });
  const chapter = new Chapter(
    page,
    testInfo,
    'chapter-1',
    'Capital Spaceport to the Eagle',
    {
      assumes: [],
      how: 'a New Game: /damocles with no Session Resume record'
    }
  );
  const areas = await islandAreas(page);
  const office = await structureOrigin(page, STATE_OFFICE);
  const walk = (legs: readonly Leg[]) => steer(page, legs, { mode: 'walk' });
  const drive = (legs: readonly Leg[]) =>
    steer(page, legs, {
      mode: 'drive',
      stallSeconds: 15,
      timeoutSeconds: 900
    });

  try {
    await chapter.step(STEP.limoKey, async () => {
      await expectAt(page, areas, STEP.limoKey.target);
      // The start stands outside on the spaceport's south side; the key lies inside.
      await walkTo(page, SPACEPORT, { x: 1400, z: 700 }, 'beside the key');
      await takeUntilHead(page, 'KEY- V.I.P. LIMO');
    });

    await chapter.step(STEP.boardLimo, async () => {
      const limo = await instancePoint(page, LIMO);
      await walkTo(
        page,
        SPACEPORT,
        { x: 1400, z: -1000 },
        'out through the spaceport door',
        80
      );
      await walk([{ name: 'beside the limo', radius: 250, to: limo }]);
      await pressUntil(
        page,
        'b',
        async () => (await attribute(page, 'occupancy')) === LIMO,
        'board the limo'
      );
    });

    await chapter.step(STEP.driveToStateOffice, async () => {
      await drive([
        leg(office, { x: 0, z: 1200 }, 'before the State Office', 300)
      ]);
      await pressUntil(
        page,
        'l',
        async () => (await attribute(page, 'occupancy')) === '',
        'leave the limo'
      );
      await expectAt(page, areas, STEP.driveToStateOffice.target);
    });

    await chapter.step(STEP.welcome, async () => {
      const welcome = await message(page, 'script3-inline-1');
      await walkTo(page, STATE_OFFICE, { x: 0, z: -100 }, 'the hall');
      await rowShows(page, welcome, 30);
      await expectAt(page, areas, STEP.welcome.target);
    });

    await chapter.step(STEP.readFile, async () => {
      await walkTo(
        page,
        STATE_OFFICE,
        { x: 526, z: -287 },
        'beside the coffee table'
      );
      await takeUntilHead(page, 'DAMOCLES FILE');
      await page.keyboard.press('Enter');
      await test
        .expect(page.locator('#frame'))
        .not.toHaveAttribute('data-document', '', { timeout: 10_000 });
      await page.keyboard.press('p');
      await page.waitForTimeout(2000);
      await page.keyboard.press('Enter');
    });

    await chapter.step(STEP.liftToPresident, async () => {
      await walkTo(page, STATE_OFFICE, LIFT_CAR, 'inside the lift car');
      await ride(page, '2', '2');
      await expectAt(page, areas, STEP.liftToPresident.target);
    });

    await chapter.step(STEP.haggle, async () => {
      const [question, fifteen, twenty, accepted, basement] = await Promise.all(
        [
          'script4-inline-9',
          'script4-inline-10',
          'script4-inline-12',
          'script4-inline-15',
          'script4-inline-20'
        ].map(id => message(page, id))
      );
      await walkTo(
        page,
        STATE_OFFICE,
        { x: 600, z: -335 },
        'the President’s office'
      );
      // The briefing runs about 34 seconds before the question.
      await rowShows(page, question!, 90);
      await page.keyboard.press('n');
      await rowShows(page, fifteen!, 30);
      await page.keyboard.press('n');
      await rowShows(page, twenty!, 30);
      await page.keyboard.press('y');
      await rowShows(page, accepted!, 30);
      await rowShows(page, basement!, 60);
    });

    await chapter.step(STEP.eagleKey, async () => {
      await walkTo(page, STATE_OFFICE, LIFT_CAR, 'inside the lift car');
      await ride(page, 'b', '10');
      await expectAt(page, areas, STEP.eagleKey.target);
      await walkTo(
        page,
        STATE_OFFICE,
        { x: 363, z: 92 },
        'beside the spacecraft key'
      );
      await takeUntilHead(page, 'KEY - EAGLE 9SE');
    });

    await chapter.step(STEP.backToLimo, async () => {
      await walkTo(page, STATE_OFFICE, LIFT_CAR, 'inside the lift car');
      await ride(page, 'g', '0');
      await walkTo(
        page,
        STATE_OFFICE,
        { x: 0, z: 1100 },
        'where the limo was left',
        250
      );
      await pressUntil(
        page,
        'b',
        async () => (await attribute(page, 'occupancy')) === LIMO,
        'board the limo'
      );
    });

    await chapter.step(STEP.boardEagle, async () => {
      const eagle = await instancePoint(page, EAGLE);
      await drive([
        { name: 'the Moorby School of Flying pad', radius: 400, to: eagle }
      ]);
      await pressUntil(
        page,
        'l',
        async () => (await attribute(page, 'occupancy')) === '',
        'leave the limo'
      );
      await walk([{ name: 'beside the Eagle', radius: 150, to: eagle }]);
      await pressUntil(
        page,
        'b',
        async () => (await attribute(page, 'occupancy')) === EAGLE,
        'board the Eagle'
      );
      await expectAt(page, areas, STEP.boardEagle.target);
    });

    await chapter.step(STEP.takeOff, async () => {
      await page.keyboard.press('4');
      await test
        .expect(field(page, 'speedLabel'))
        .not.toHaveText('+ 000 000 000', { timeout: 20_000 });
      await page.keyboard.down('ArrowDown');
      try {
        await test.expect
          .poll(async () => Number(await attribute(page, 'y')), {
            timeout: 30_000
          })
          .toBeGreaterThan(2000);
      } finally {
        await page.keyboard.up('ArrowDown');
      }
      await test.expect(field(page, 'altitude')).not.toHaveText('000000');
    });
  } finally {
    await chapter.finish();
  }
});
