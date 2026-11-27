import { expect, test, type Page } from '@playwright/test';

import { Chapter } from './ledger.ts';
import { CHAPTER_2 as STEP } from './route.ts';
import {
  attribute,
  expectAt,
  inventoryHead,
  islandAreas,
  pressUntil,
  row,
  takeUntilHead
} from './session.ts';
import { MOORBY_START, startFrom } from './starts.ts';
import {
  SteeringError,
  structureOrigin,
  walkTo,
  type Point
} from './steering.ts';
import {
  doorOutside,
  flyToEntrance,
  reboard,
  rideTo,
  type Parked
} from './travel.ts';

/// Playthrough Chapter 2: from EAGLE NINE S E at the Moorby School of Flying to NOVA TRIGGER 4
/// on Metis, after ST Format 20 steps 1 to 4.

const EAGLE = 'object-slot-3';
const NEWTON = 'eris-key-west-surface-77';
const SORTING_OFFICE = 'eris-snow-island-surface-03';
const CAPITAL_11_08 = 'eris-surface-8b';
/// Flights in this chapter never cross the surface's wrap seam: crossing it leaves the player
/// where nothing is bound (`chapter-2-seam.playthrough.ts` records that on its own), and a player
/// can always fly the long way.
const SEAMLESS = { crossSeam: false } as const;

/// A resident's recovered placement inside its parent, structure-local.
const placement = async (page: Page, slot: number): Promise<Point> => {
  const catalogue = (await (
    await page.request.get('/payload/damocles/catalogue.json')
  ).json()) as {
    readonly instances: readonly {
      readonly id: string;
      readonly placement: { readonly position: readonly number[] } | null;
    }[];
  };
  const position = catalogue.instances.find(
    item => item.id === `object-slot-${slot}`
  )?.placement?.position;
  if (position === undefined) {
    throw new Error(`object-slot-${slot} has no recovered placement`);
  }
  return { x: position[0]!, z: position[2]! };
};

const centreBox = (page: Page) =>
  page.locator('#panel-damocles [data-panel-control=centre]');

/// Open the carried head on the centre box, step its switch to ON, and drop it. The switch bits
/// `$7872` must change, or the trigger was not armed.
const switchOn = async (page: Page): Promise<void> => {
  const before = await attribute(page, 'switches');
  await page.keyboard.press('Enter');
  await expect(centreBox(page)).toHaveAttribute('data-panel', /NOVA TRIGGER/, {
    timeout: 10_000
  });
  // The centre box ignores the Head Commands while it is still opening.
  await expect(page.locator('#frame')).toHaveAttribute(
    'data-centre-box-steps',
    '0',
    { timeout: 10_000 }
  );
  // `.` is the laptop's keypad `+`: on.
  await pressUntil(
    page,
    '.',
    async () => (await centreBox(page).getAttribute('data-item')) === 'ON',
    'switch it on'
  );
  await expect(page.locator('#frame')).not.toHaveAttribute(
    'data-switches',
    before
  );
  await page.keyboard.press('Enter');
};

/// Drop the head where the player stands; on NO ROOM, carry it outside the structure and drop it
/// there, as a player would, noting the refusal.
const dropHere = async (
  page: Page,
  chapter: Chapter,
  instance: string,
  name: string
): Promise<void> => {
  const dropped = async () => (await inventoryHead(page)) !== name;
  try {
    await pressUntil(page, 'd', dropped, `drop ${name}`, 4000);
    return;
  } catch {
    const refusal = await row(page);
    const region = await attribute(page, 'region');
    chapter.note(
      `Dropping ${name} inside ${instance} (region ${region}) is refused${refusal === '' ? '' : ` with "${refusal}"`}; dropped outside instead.`
    );
  }
  await walkTo(page, instance, await doorOutside(page, instance), 'outside');
  await pressUntil(page, 'd', dropped, `drop ${name} outside`);
};

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
      parked = await flyToEntrance(page, NEWTON, SEAMLESS);
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
      await reboard(page, parked!);
      parked = await flyToEntrance(page, SORTING_OFFICE, SEAMLESS);
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
      await switchOn(page);
      await dropHere(page, chapter, SORTING_OFFICE, 'CUPBOARD');
    });

    await chapter.step(STEP.liftTheEagle, async () => {
      await reboard(page, parked!);
      parked = await flyToEntrance(page, CAPITAL_11_08, SEAMLESS);
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
      await walkTo(
        page,
        CAPITAL_11_08,
        await placement(page, 69),
        'the transporter',
        40
      );
      await expectAt(page, areas, STEP.transporter.target);
    });

    await chapter.step(STEP.washbasin, async () => {
      // The harness's own gap: no run has reached Metis to find the secret door and the table.
      throw new SteeringError(
        'not yet scripted: no run has reached Metis to scout this step'
      );
    });
  } finally {
    await chapter.finish();
  }
});
