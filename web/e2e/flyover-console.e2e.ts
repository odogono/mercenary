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

const log = (page: Page) => page.locator('#console-log');

test('the Flyover console places the Camera, sets the Targ clock and keeps the address', async ({
  page
}) => {
  await page.goto('/targ/debug');
  await ready(page);
  const main = page.locator('main');
  await expect(main).toHaveAttribute('data-console', 'closed');

  await page.keyboard.press('Backquote');
  await expect(main).toHaveAttribute('data-console', 'open');
  await expect(page.locator('#console-input')).toBeFocused();
  await expect(page.locator('#console-input')).toHaveValue('');

  await run(page, 'goto surface 0 34 0.07 0 -20');
  await expect(html(page)).toHaveAttribute('data-range', 'coastal-surface');
  await expect(html(page)).toHaveAttribute('data-speed-notch', '0');
  await expect(log(page)).toContainText(
    'goto surface 0.000000 34.000000 0.0700000000 0.000000 340.000000'
  );
  await expect(page.locator('#flyover-surface')).toBeVisible();

  // The console's own keys: arrows recall history and digits are typed, and neither reaches
  // the Camera.
  const heading = await html(page).getAttribute('data-heading');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(200);
  await page.keyboard.up('ArrowLeft');
  await page.locator('#console-input').press('ArrowUp');
  await expect(page.locator('#console-input')).toHaveValue(
    'goto surface 0 34 0.07 0 -20'
  );
  await page.locator('#console-input').fill('');
  await page.keyboard.type('9');
  await expect(html(page)).toHaveAttribute('data-heading', heading!);
  await expect(html(page)).toHaveAttribute('data-speed-notch', '0');

  await run(page, 'time 21:15');
  await expect(log(page)).toContainText('time 21:15:00');

  const before = await html(page).getAttribute('data-camera-z');
  await run(page, 'goto body nowhere');
  await expect(log(page)).toContainText('unknown Body nowhere');
  await expect(html(page)).toHaveAttribute('data-camera-z', before!);

  await run(page, 'goto body targ');
  await expect(html(page)).toHaveAttribute('data-range', 'orbital');
  await run(page, 'save 1');
  await expect(log(page)).toContainText("unknown command 'save'");

  await run(page, 'reset');
  await expect(log(page)).toContainText('reset to the System overview');
  await run(page, 'time');
  await expect(log(page)).toContainText(/time 09:0\d:\d\d/);

  await page.keyboard.press('Escape');
  await expect(main).toHaveAttribute('data-console', 'closed');
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(
    '/targ/debug'
  );
});

test('the Gamma Flyover console has no clock and no surface', async ({
  page
}) => {
  await page.goto('/damocles/debug');
  await ready(page);
  await page.keyboard.press('Backquote');
  await run(page, 'time');
  await expect(log(page)).toContainText('time is only in Targ');
  await run(page, 'goto surface 0 0 0.1');
  await expect(log(page)).toContainText('goto surface is only in Targ');
  await run(page, 'goto body dialis');
  await expect(html(page)).toHaveAttribute('data-nearest-body', 'dialis');
  await run(page, 'pose');
  await expect(log(page)).toContainText('body dialis · range orbital');
});
