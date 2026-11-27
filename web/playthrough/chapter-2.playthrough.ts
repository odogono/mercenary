import { expect, test, type Page } from '@playwright/test';

import { instance } from './catalogue.ts';
import { Chapter } from './ledger.ts';
import { CHAPTER_2 as STEP } from './route.ts';
import {
  at,
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
  local,
  steer,
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
/// A resident's recovered placement inside its parent, structure-local.
const placement = async (page: Page, slot: number): Promise<Point> => {
  const position = (await instance(page, `object-slot-${slot}`))?.placement
    ?.position;
  if (position === undefined) {
    throw new Error(`object-slot-${slot} has no recovered placement`);
  }
  return { x: position[0]!, z: position[2]! };
};

const centreBox = (page: Page) =>
  page.locator('#panel-damocles [data-panel-control=centre]');

/// Open the carried head on the centre box, step its switch to ON, and drop it. The switch bits
/// `$7872` must change, or the trigger was not armed.
/// The four detonators' bits of `$7872`: a switch row's index halved is its bit
/// (`headCommands.ts`, `SWITCH_ROWS`, `switchBit`).
const TRIGGER_BITS = { 1: 0x08, 2: 0x10, 3: 0x20, 4: 0x40 } as const;

/// Open the head on the centre box, check it is the named NOVA TRIGGER, and switch it on: its own
/// bit of `$7872` must be set.
const switchOn = async (page: Page, trigger: 1 | 2 | 3 | 4): Promise<void> => {
  await page.keyboard.press('Enter');
  await expect(centreBox(page)).toHaveAttribute(
    'data-panel',
    `NOVA TRIGGER ${trigger}`,
    { timeout: 10_000 }
  );
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
  await expect
    .poll(
      async () =>
        Number.parseInt(await attribute(page, 'switches'), 16) &
        TRIGGER_BITS[trigger]
    )
    .toBe(TRIGGER_BITS[trigger]);
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
      const slot = await placement(page, 69);
      await walkTo(
        page,
        CAPITAL_11_08,
        { x: slot.x, z: slot.z + 120 },
        'north of the transporter',
        25
      );
      await steer(
        page,
        [
          {
            name: 'into the transporter',
            radius: 5,
            to: local(await structureOrigin(page, CAPITAL_11_08), slot)
          }
        ],
        { mode: 'walk', untilBodyChanges: true }
      );
      expect(await attribute(page, 'body')).toBe('body-8');
      // Stopped in the arrival cube: the panel names VOID and the Cell Readout the destination.
      const arrived = await at(page, areas);
      expect([arrived.body, arrived.cell]).toEqual(['VOID', '08-08']);
      // Key n names slot 64 + n: 3 is Metis slot 67.
      await page.keyboard.press('Digit3');
      await expect
        .poll(async () => attribute(page, 'body'), {
          message: 'digit 3 in the Gaea cube did not reach Metis',
          timeout: 5000
        })
        .toBe('body-15');
      // Step out of the Metis cube so the panel names the Body again.
      for (const key of ['ArrowUp', 'ArrowDown']) {
        if ((await at(page, areas)).body !== 'VOID') {
          break;
        }
        await page.keyboard.down(key);
        await page.waitForTimeout(700);
        await page.keyboard.up(key);
        await page.waitForTimeout(200);
      }
      await expectAt(page, areas, STEP.transporter.target);
    });

    await chapter.step(STEP.washbasin, async () => {
      // The harness's own gap: no run has yet walked Metis to find the secret door and the table.
      throw new SteeringError('not yet scripted: the Metis steps');
    });
  } finally {
    await chapter.finish();
  }
});
