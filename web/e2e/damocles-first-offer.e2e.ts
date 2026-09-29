import { expect, test, type Page } from '@playwright/test';

import {
  FACING_EAST,
  bootAt,
  closeConsole,
  displayRow,
  held,
  messageText,
  run,
  soundCues,
  walkUntil,
  watchErrors
} from './damocles-play.ts';

/// Browser verification of the first work offer (#612, docs/research/damocles-location-triggers.md).
/// On Floor 2 of the Eris STATE OFFICE, region 1 runs east to door 6 and region 7 lies behind it.
/// Entering region 7 fires location trigger 4: eight lines of briefing, then the first offer,
/// which Y accepts.

const STATE_OFFICE = 'eris-surface-89';
/// Local (200, −335), in Floor 2's region 1 and on the line through door 6.
const BEFORE_DOOR_6 = { x: 200, z: -335 };

const frame = (page: Page) => page.locator('#frame');

test('entering the Floor 2 room presents the first offer, and Y accepts it', async ({
  page
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await bootAt(page, BEFORE_DOOR_6, FACING_EAST, { structure: STATE_OFFICE });
  expect(await run(page, 'floor 2')).toContain('moved to Floor 2');
  await closeConsole(page);
  await expect(frame(page)).toHaveAttribute('data-floor', '2');

  const briefing = held(await messageText(page, 'script4-inline-1'));
  const question = held(await messageText(page, 'script4-inline-9'));
  const accepted = held(await messageText(page, 'script4-inline-15'));

  // Region 7 is index 6 as the page publishes it.
  await walkUntil(
    page,
    'ArrowUp',
    async () => (await frame(page).getAttribute('data-region')) === '6'
  );
  await expect
    .poll(async () => displayRow(page), { timeout: 10_000 })
    .toBe(briefing);

  // 1,700 frames of briefing at 50 a second, then the question holds its 200.
  await expect
    .poll(async () => displayRow(page), { intervals: [100], timeout: 60_000 })
    .toBe(question);
  expect(await soundCues(page)).not.toContain('answer');
  await page.keyboard.press('y');
  await expect
    .poll(async () => displayRow(page), { timeout: 15_000 })
    .toBe(accepted);
  expect(await soundCues(page)).toContain('answer:1');
  expect(errors).toEqual([]);
});
