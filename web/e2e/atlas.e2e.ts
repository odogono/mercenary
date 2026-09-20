import { expect, test } from '@playwright/test';

test('the Damocles System Menu reaches the Atlas', async ({ page }) => {
  await page.goto('/damocles');
  const surface = page.locator('#game-surface');
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready');
  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'menu');
  await page.locator('#page-menu #menu-atlas').click();
  await expect(page).toHaveURL('/damocles/atlas');
  await expect(page.locator('#title')).toHaveText('Gamma Atlas');
  await expect(page.locator('#failure')).toBeHidden();
});

test('the Targ System Menu offers no Atlas, and the aliases land on one', async ({
  page
}) => {
  // The Atlas presents the Gamma System, so only the Damocles Title's copy names it.
  await page.goto('/');
  const surface = page.locator('#game-surface');
  await expect(surface).toHaveAttribute('data-state', 'ready');
  await page.keyboard.press('Space');
  await page.locator('#departure-skip').click();
  await expect(surface).toHaveAttribute('data-arrival', 'done');
  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'menu');
  await expect(page.locator('#page-menu #menu-atlas')).toHaveCount(0);

  for (const alias of ['/atlas.html', '/damocles/atlas/']) {
    await page.goto(alias);
    await expect(page).toHaveURL('/damocles/atlas');
    await expect(page.locator('#title')).toHaveText('Gamma Atlas');
  }
});
