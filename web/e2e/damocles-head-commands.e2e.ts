import { expect, test, type Page } from '@playwright/test';

import { bootAt, inventory, watchErrors } from './damocles-play.ts';

/// Browser verification of the Head Commands (#597, #598).
///
/// The DAMOCLES FILE lies on the COFFEE TABLE on the Eris State Office's ground Floor, both at
/// local X 726, Z −287 in regions 1 and 6. Standing 200 units west and facing east puts both in
/// reach, so one test can take both, rotate between them and open the file. The screenshots are
/// the file open at PROBLEM and HISTORY, for comparison with the probe's Hatari frames
/// (`head-command-damocles-file-20260929T064900Z-a6c9fd60`).

const STATE_OFFICE = 'eris-surface-89';
const BESIDE_THE_TABLE = { x: 526, z: -287 };
const FACING_EAST = 768;
const FILE = 'DAMOCLES FILE';
const TABLE = 'COFFEE TABLE';

const frame = (page: Page) => page.locator('#frame');
const centreBox = (page: Page) => page.locator('#damocles-centre-canvas');

/// Take both objects and rotate until the file is the head.
const fileAtTheHead = async (page: Page): Promise<void> => {
  await page.keyboard.press('t');
  await expect(inventory(page)).not.toHaveText('EMPTY', { timeout: 5000 });
  const first = (await inventory(page).textContent())!.trim();
  await page.keyboard.press('t');
  const second = first === FILE ? TABLE : FILE;
  await expect(inventory(page)).toHaveText(second, { timeout: 5000 });
  if (second !== FILE) {
    // A rotation is refused while the head's name is still scrolling, 16 frames at 50 Hz.
    await page.waitForTimeout(500);
    await page.keyboard.press('[');
    await expect(inventory(page)).toHaveText(FILE, { timeout: 5000 });
  }
};

test('opens, pages and reads the DAMOCLES FILE on the centre box', async ({
  page
}, testInfo) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await bootAt(page, BESIDE_THE_TABLE, FACING_EAST, {
    structure: STATE_OFFICE
  });
  await expect(inventory(page)).toHaveText('EMPTY');
  await expect(centreBox(page)).toBeHidden();
  await fileAtTheHead(page);
  await expect(page.locator('#status')).toContainText(
    'ENTER OPEN · P READ · . NEXT · , PREVIOUS'
  );

  // Enter opens the head at item 0, over the 64-VBL transition.
  await page.keyboard.press('Enter');
  await expect(frame(page)).toHaveAttribute('data-document', '151 0 0');
  await expect(frame(page)).toHaveAttribute('data-centre-box-steps', '0', {
    timeout: 5000
  });
  await expect(centreBox(page)).toBeVisible();
  await expect(centreBox(page)).toHaveAttribute('data-panel', FILE);
  await expect(centreBox(page)).toHaveAttribute('data-item', 'PROBLEM');
  await testInfo.attach('damocles-file-problem', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });

  // `.` pages the open document even after `[` has rotated it away from the head.
  await page.keyboard.press('[');
  await expect(inventory(page)).toHaveText(TABLE, { timeout: 5000 });
  await page.keyboard.press('.');
  await expect(centreBox(page)).toHaveAttribute('data-item', 'HISTORY');
  await expect(frame(page)).toHaveAttribute('data-document', '151 1 1');

  // The Read queues behind the take's own two messages, 400 frames, then shows the body 48
  // cells a block in plane 1. The second block is the one the probe's Hatari frame caught.
  await page.keyboard.press('p');
  await expect(frame(page)).toHaveAttribute(
    'data-damocles-row',
    /A PARLIAMENTARY COMMITTEE/,
    { timeout: 15_000 }
  );
  await expect(frame(page)).toHaveAttribute(
    'data-damocles-row',
    'THE LAST THIRTY YEARS TO CONSIDER THE PROBLEM',
    { timeout: 10_000 }
  );
  await expect(frame(page)).toHaveAttribute('data-damocles-scroll', '0');
  await expect(frame(page)).toHaveAttribute('data-damocles-planes', /^1{48}$/);
  await testInfo.attach('damocles-file-history', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });

  // Escape closes the document before it opens the System Menu.
  await page.keyboard.press('Escape');
  await expect(frame(page)).toHaveAttribute('data-document', '');
  await expect(frame(page)).toHaveAttribute('data-centre-box-steps', '0', {
    timeout: 5000
  });
  await expect(centreBox(page)).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-layer',
    'menu'
  );
  expect(errors).toEqual([]);
});
