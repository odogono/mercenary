import { expect, test, type Page } from '@playwright/test';

import {
  bootAt,
  displayRow,
  held,
  messageText,
  walkUntil,
  watchErrors
} from './damocles-play.ts';

/// Browser verification of the State Office's location trigger (#611,
/// docs/research/damocles-location-triggers.md). Outside the front door, in outdoor region 9
/// (index 9 here), nothing fires. Walking in, the region walk selects door region 8 (`$83F0`,
/// index 7), and the table entry for cell `$89`, any indoor region, Floor 0 launches trigger 3:
/// the State President's welcome.

const STATE_OFFICE = 'eris-surface-89';
/// Local (0, 350), the `front-door` case's outdoor start, facing the door: local −Z, which is
/// south, yaw 0 on the recovered 1024-unit clockwise-from-north scale.
const OUTSIDE = { x: 0, z: 350 };
const FACING_THE_DOOR = 0;

const frame = (page: Page) => page.locator('#frame');

const region = async (page: Page): Promise<string> =>
  (await frame(page).getAttribute('data-region')) ?? '';

test('walking in through the front door presents the State President’s welcome', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await bootAt(page, OUTSIDE, FACING_THE_DOOR, { structure: STATE_OFFICE });
  await expect(frame(page)).toHaveAttribute(
    'data-structure-instance',
    STATE_OFFICE
  );
  const first = held(await messageText(page, 'script3-inline-1'));
  const second = held(await messageText(page, 'script3-inline-2'));

  // Walking through the outdoor regions fires nothing. The row may still be revealing what the
  // boot presented, so only the welcome's absence is asserted.
  await walkUntil(page, 'ArrowUp', async () => {
    const at = await region(page);
    if (at !== '7' && at !== '0') {
      expect(await displayRow(page)).not.toBe(first);
    }
    return at === '0';
  });

  await expect
    .poll(async () => displayRow(page), { timeout: 10_000 })
    .toBe(first);
  // Each line holds 200 frames, four seconds, and the next scrolls in over it.
  await expect
    .poll(async () => displayRow(page), { timeout: 10_000 })
    .toBe(second);
  expect(errors).toEqual([]);
});
