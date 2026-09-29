import { expect, test } from '@playwright/test';

import { bootAt, inventory, watchErrors } from './damocles-play.ts';

/// Browser verification of the Head Command keys and Carried Stack rotation (#597).
///
/// The DAMOCLES FILE lies on the COFFEE TABLE on the Eris State Office's ground Floor, both at
/// local X 726, Z −287 in regions 1 and 6. Standing 200 units west and facing east puts both in
/// reach, so one test can take both, rotate between them and see the keys notice the file's take
/// shows.

const STATE_OFFICE = 'eris-surface-89';
const BESIDE_THE_TABLE = { x: 526, z: -287 };
const FACING_EAST = 768;
const FILE = 'DAMOCLES FILE';
const TABLE = 'COFFEE TABLE';

test('taking the DAMOCLES FILE names the keys, and the brackets rotate the stack', async ({
  page
}) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await bootAt(page, BESIDE_THE_TABLE, FACING_EAST, {
    structure: STATE_OFFICE
  });
  await expect(inventory(page)).toHaveText('EMPTY');

  // Whichever the selection offers first, two takes carry both.
  await page.keyboard.press('t');
  await expect(inventory(page)).not.toHaveText('EMPTY', { timeout: 5000 });
  const first = (await inventory(page).textContent())!.trim();
  await page.keyboard.press('t');
  const second = first === FILE ? TABLE : FILE;
  await expect(inventory(page)).toHaveText(second, { timeout: 5000 });
  await expect(page.locator('#status')).toContainText(
    'ENTER OPEN · P READ · . NEXT · , PREVIOUS'
  );

  // The Head Commands are bound but do nothing yet (#598): the head stays where it was.
  for (const key of ['Enter', 'p', '.', ',', 'NumpadEnter']) {
    await page.keyboard.press(key);
  }
  await expect(inventory(page)).toHaveText(second);

  // `[` sends the head to the back, as the ST's Left does, and `]` brings it back.
  await page.keyboard.press('[');
  await expect(inventory(page)).toHaveText(first, { timeout: 5000 });
  // A rotation is refused while the head's name is still scrolling, 16 frames at 50 Hz.
  await page.waitForTimeout(500);
  await page.keyboard.press(']');
  await expect(inventory(page)).toHaveText(second, { timeout: 5000 });
  expect(errors).toEqual([]);
});
