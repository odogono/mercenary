import { expect, test, type Page } from '@playwright/test';

test.use({ deviceScaleFactor: 1, viewport: { height: 800, width: 1280 } });

const html = (page: Page) => page.locator('html');

const ready = async (page: Page) => {
  await expect(html(page)).toHaveAttribute('data-flyover-ready', 'true');
};

const run = async (page: Page, line: string) => {
  await page.locator('#console-input').fill(line);
  await page.locator('#console-input').press('Enter');
};

test('Escape pauses the Targ Flyover under its System Menu, whose rows last until reload', async ({
  page
}) => {
  await page.goto('/');
  await page.goto('/targ/debug');
  await ready(page);
  const menu = page.getByRole('dialog', { name: 'System Menu' });
  await expect(menu).toBeHidden();

  await page.keyboard.press('Digit5');
  await expect(html(page)).toHaveAttribute('data-speed-notch', '5');
  await page.keyboard.press('Escape');
  await expect(menu).toBeVisible();
  await expect(html(page)).toHaveAttribute('data-layer', 'menu');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeFocused();

  // Paused: neither the Camera nor the Targ clock moves, and the camera keys do nothing.
  const z = await html(page).getAttribute('data-camera-z');
  await page.keyboard.press('Backquote');
  await run(page, 'time');
  const shown = await page.locator('#console-log div').last().textContent();
  await page.waitForTimeout(1500);
  await run(page, 'time');
  await expect(page.locator('#console-log div').last()).toHaveText(shown!);
  await page.keyboard.press('Escape');
  await expect(page.locator('main')).toHaveAttribute('data-console', 'closed');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Digit9');
  await expect(html(page)).toHaveAttribute('data-camera-z', z!);
  await expect(html(page)).toHaveAttribute('data-speed-notch', '5');

  // Only the Flyover's own rows, starting as tuned.
  await expect(menu.getByRole('group')).toHaveCount(5);
  const weight = menu.getByRole('group', { name: 'WIREFRAME WEIGHT' });
  await expect(
    weight.getByRole('button', { name: 'AS TUNED' })
  ).toHaveAttribute('aria-pressed', 'true');
  await weight.getByRole('button', { name: 'HEAVY' }).click();
  await expect(weight.getByRole('button', { name: 'HEAVY' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  const day = menu.getByRole('group', { name: 'TARG DAY LENGTH' });
  await day.getByRole('button', { name: '96 MIN' }).click();
  await expect(menu).not.toContainText(/save|resume game|preset|audio/i);

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(html(page)).toHaveAttribute('data-layer', 'none');
  await expect
    .poll(async () => await html(page).getAttribute('data-camera-z'))
    .not.toBe(z);

  // Nothing is kept: a reload starts as tuned, and no preference was written.
  const stored = await page.evaluate(() => Object.keys(localStorage));
  expect(stored.filter(key => /flyover/i.test(key))).toEqual([]);
  await page.reload();
  await ready(page);
  await page.keyboard.press('Escape');
  await expect(
    menu
      .getByRole('group', { name: 'WIREFRAME WEIGHT' })
      .getByRole('button', { name: 'AS TUNED' })
  ).toHaveAttribute('aria-pressed', 'true');
});

test('LEAVE FLYOVER replaces the Flyover in history with the start page', async ({
  page
}) => {
  await page.goto('/');
  await page.goto('/damocles/debug');
  await ready(page);
  await page.keyboard.press('Escape');
  const menu = page.getByRole('dialog', { name: 'System Menu' });
  // Gamma has no clock and no wireframe, so no rows.
  await expect(menu.getByRole('group')).toHaveCount(0);
  await menu.getByRole('button', { name: 'Leave Flyover' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page).not.toHaveURL(/debug/);
});
