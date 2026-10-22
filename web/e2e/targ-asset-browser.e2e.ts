import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/targ/assets?id=targ:object-model:1700');
  await expect(page.locator('#entry-name')).toHaveText(
    'targ:object-model:1700'
  );
  await page.locator('#view').focus();
});

test('drag orbits the preview, keeps capture outside it and stops on release', async ({
  page
}) => {
  const canvas = page.locator('#view');
  const bounds = (await canvas.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  const initial = await canvas.screenshot();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(canvas).toHaveCSS('cursor', 'grabbing');
  await page.mouse.move(x + 80, y + 40, { steps: 5 });
  const orbited = await canvas.screenshot();
  expect(orbited.equals(initial)).toBe(false);
  await page.mouse.move(bounds.x - 20, y);
  const outside = await canvas.screenshot();
  expect(outside.equals(orbited)).toBe(false);
  await page.mouse.up();
  await expect(canvas).toHaveCSS('cursor', 'grab');
  await page.mouse.move(x, y);
  expect((await canvas.screenshot()).equals(outside)).toBe(true);
  await page.getByRole('button', { name: 'Reset view' }).click();
  expect((await canvas.screenshot()).equals(initial)).toBe(true);
});

test('wheel zooms both ways without scrolling and shares the button and keyboard controls', async ({
  page
}) => {
  const canvas = page.locator('#view');
  const initial = await canvas.screenshot();
  await page.getByRole('button', { exact: true, name: 'Zoom in' }).click();
  const zoomedIn = await canvas.screenshot();
  expect(zoomedIn.equals(initial)).toBe(false);
  await page.getByRole('button', { name: 'Reset view' }).click();
  await canvas.hover();
  const scroll = await page.evaluate(() => window.scrollY);
  // A wheel delta of ln(f) / WHEEL_ZOOM_PER_PIXEL (0.001) zooms by f, matching
  // the 0.8 and 1.25 steps of the zoom buttons.
  await page.mouse.wheel(0, Math.log(0.8) * 1000);
  await expect
    .poll(async () => (await canvas.screenshot()).equals(zoomedIn))
    .toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
  await page.mouse.wheel(0, Math.log(1.25) * 1000);
  await expect
    .poll(async () => (await canvas.screenshot()).equals(initial))
    .toBe(true);
  await canvas.press('+');
  expect((await canvas.screenshot()).equals(zoomedIn)).toBe(true);
  await canvas.press('0');
  expect((await canvas.screenshot()).equals(initial)).toBe(true);
});
