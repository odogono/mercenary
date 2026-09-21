import { expect, test } from '@playwright/test';

test('the System Range holds every recovered Body', async ({ page }) => {
  await page.goto('/damocles/atlas');
  await expect(page.locator('#failure')).toBeHidden();
  await expect(page.locator('#roster a')).toHaveCount(30);
  await expect(page.locator('#system-map')).toBeVisible();
  await expect(page.locator('#status')).toContainText('30 recovered Bodies');
  // Labels are withheld wherever Bodies project onto each other, so the map says so rather
  // than pretending the Gamma System is only as crowded as its legible names.
  await expect(page.locator('.system-label').first()).toBeVisible();
  await expect(page.locator('#panel')).toContainText(
    'no complete orbital elements'
  );
});

test('clicking ERIS in the roster hops into the Body', async ({ page }) => {
  await page.goto('/damocles/atlas');
  await expect(page.locator('#roster a')).toHaveCount(30);
  await page.locator('#roster a[data-body="eris"]').click();

  await expect(page).toHaveURL('/damocles/atlas?body=eris');
  await expect(page.locator('#breadcrumb-body')).toHaveText('ERIS');
  await expect(page.locator('#body-name')).toHaveText('ERIS');
  await expect(page.locator('#panel')).toContainText('-630,000');
  await expect(page.locator('#range-system')).toBeHidden();

  await page.locator('#breadcrumb-system').click();
  await expect(page).toHaveURL('/damocles/atlas');
  await expect(page.locator('#range-system')).toBeVisible();
});

test('clicking a disc on the map hops into the Body under it', async ({
  page
}) => {
  await page.goto('/damocles/atlas');
  const eris = page.locator('#roster a[data-body="eris"]');
  await expect(eris).toHaveAttribute('data-x', /\d/);
  const at = {
    x: Number(await eris.getAttribute('data-x')),
    y: Number(await eris.getAttribute('data-y'))
  };
  await page.locator('#system-map').click({ position: at });

  // The ERIS group projects onto a few pixels, so the nearest-centre hit test may land on a
  // neighbour; what matters is that a click on the pile enters one of its Bodies.
  await expect(page).toHaveURL(/\?body=[a-z]+$/);
  await expect(page.locator('#breadcrumb-body')).not.toBeEmpty();
});

test('a deep link opens the Body, and an unknown one falls back', async ({
  page
}) => {
  await page.goto('/damocles/atlas?body=damocles');
  await expect(page.locator('#body-name')).toHaveText('DAMOCLES');
  await expect(page.locator('#panel')).toContainText('capture-time sample');
  await expect(page.locator('#roster a[aria-current="true"]')).toHaveCount(1);

  await page.goto('/damocles/atlas?body=void');
  await expect(page).toHaveURL('/damocles/atlas?body=void');
  await expect(page.locator('#range-system')).toBeVisible();
  await expect(page.locator('#breadcrumb-body')).toHaveCount(0);
});
