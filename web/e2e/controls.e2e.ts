import { expect, test, type Page } from '@playwright/test';

import {
  DOORWAY_LINE_LOCAL,
  FACING_DOORWAY,
  bootAt,
  inventory,
  spaceportWorld,
  walkUntil,
  watchErrors
} from './damocles-play.ts';

/// Browser verification of the Controls Page (#600, ADR 0056): the System Menu lists the Title's
/// Bindings, grouped by where they hold, and marks the Occupancy the player is in.

const LIMO = 'object-slot-5';
const LIMO_KEY_LABEL = 'KEY- V.I.P. LIMO';

const surface = (page: Page) => page.locator('#game-surface');
const controlsPage = (page: Page) => page.locator('#page-controls');
const group = (page: Page, name: string) =>
  controlsPage(page).locator(`[data-group=${name}]`);

const openControls = async (page: Page): Promise<void> => {
  await page.keyboard.press('Escape');
  await expect(surface(page)).toHaveAttribute('data-layer', 'menu');
  await page.locator('#page-menu [data-goto=controls]').click();
  await expect(surface(page)).toHaveAttribute('data-layer', 'controls');
  await expect(controlsPage(page)).toBeVisible();
};

test('the Damocles Controls Page lists its Bindings and marks the Occupancy', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await bootAt(page, DOORWAY_LINE_LOCAL, FACING_DOORWAY);

  await openControls(page);
  await expect(controlsPage(page).locator('.chrome-title')).toHaveText(
    'CONTROLS · KEYBOARD / PAD'
  );
  await expect(controlsPage(page).locator('.controls-group-title')).toHaveText([
    'SHELL',
    'POINTER',
    'ALWAYS',
    'ON FOOT',
    'IN A LIFT',
    'ABOARD'
  ]);
  await expect(group(page, 'always')).toContainText('ENTER / NUMPAD ENTER');
  await expect(group(page, 'always')).toContainText('ROTATE STACK');
  await expect(group(page, 'always')).toContainText('FIRE (HOLD)');
  await expect(group(page, 'always')).toContainText('RUN (TOGGLE)');
  await expect(group(page, 'aboard')).toContainText('LAUNCH');
  await expect(group(page, 'onFoot')).not.toContainText('SKIP MESSAGE');
  await expect(group(page, 'onFoot')).toHaveAttribute('aria-current', 'true');
  await expect(group(page, 'aboard')).not.toHaveAttribute('aria-current');
  await testInfo.attach('controls on foot', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });

  // Escape steps back to the menu, and BACK does the same.
  await page.keyboard.press('Escape');
  await expect(surface(page)).toHaveAttribute('data-layer', 'menu');
  await page.locator('#page-menu [data-goto=controls]').click();
  await controlsPage(page).locator('[data-goto=menu]').click();
  await expect(surface(page)).toHaveAttribute('data-layer', 'menu');
  await page.keyboard.press('Escape');
  await expect(surface(page)).toHaveAttribute('data-layer', 'none');

  // Aboard the limo, the page is drawn again and marks the other Occupancy.
  const origin = await spaceportWorld(page);
  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText(LIMO_KEY_LABEL, { timeout: 5000 });
  await walkUntil(
    page,
    'ArrowUp',
    async () =>
      Number(await page.locator('#frame').getAttribute('data-z')) - origin.z <
      -3000
  );
  await page.keyboard.press('b');
  await expect(page.locator('#frame')).toHaveAttribute('data-occupancy', LIMO);
  await openControls(page);
  await expect(group(page, 'aboard')).toHaveAttribute('aria-current', 'true');
  await expect(group(page, 'onFoot')).not.toHaveAttribute('aria-current');
  await testInfo.attach('controls aboard', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });
  expect(errors).toEqual([]);
});

test('the Targ Controls Page lists only the Bindings Targ has', async ({
  page
}) => {
  await page.goto('/');
  await expect(surface(page)).toHaveAttribute('data-state', 'ready');
  await page.keyboard.press('Space');
  await page.locator('#departure-skip').click();
  await expect(surface(page)).toHaveAttribute('data-arrival', 'done');

  await openControls(page);
  await expect(controlsPage(page).locator('.controls-group-title')).toHaveText([
    'SHELL',
    'POINTER',
    'ALWAYS',
    'ON FOOT',
    'ABOARD'
  ]);
  await expect(group(page, 'always')).toContainText('RIDE LIFT');
  await expect(group(page, 'always')).not.toContainText('ROTATE STACK');
  await expect(group(page, 'always')).not.toContainText('OPEN');
  await expect(group(page, 'onFoot')).toContainText('SKIP MESSAGE');
  await expect(group(page, 'onFoot')).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('Escape');
  await expect(surface(page)).toHaveAttribute('data-layer', 'menu');
});

test('the Controls Page names the keys as the player layout prints them', async ({
  page
}) => {
  // French AZERTY, as Chromium's Keyboard Map API gives it (#606).
  await page.addInitScript(() => {
    const layout = new Map([
      ['Equal', '='],
      ['Minus', ')']
    ]);
    Object.defineProperty(navigator, 'keyboard', {
      configurable: true,
      value: { getLayoutMap: () => Promise.resolve(layout) }
    });
  });
  await page.goto('/');
  await expect(surface(page)).toHaveAttribute('data-state', 'ready');
  await page.keyboard.press('Space');
  await page.locator('#departure-skip').click();
  await expect(surface(page)).toHaveAttribute('data-arrival', 'done');

  await openControls(page);
  await expect(group(page, 'aboard')).toContainText(') / =');
  await expect(group(page, 'aboard')).not.toContainText('- / =');
});
