import { expect, test, type Page } from '@playwright/test';

const skipArrival = async (page: Page): Promise<void> => {
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-state',
    'ready'
  );
  await page.keyboard.press('Space');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-arrival',
    'done'
  );
};

const command = async (page: Page, text: string): Promise<void> => {
  const surface = page.locator('#game-surface');
  if ((await surface.getAttribute('data-console')) !== 'open') {
    await page.keyboard.press('Backquote');
  }
  await page.locator('#console-input').fill(text);
  await page.keyboard.press('Enter');
};

test('Metal Detector recolours every Benson surface together', async ({
  page
}, testInfo) => {
  await page.goto('/');
  await skipArrival(page);
  for (const id of ['#message', '#panel-message', '#damocles-message']) {
    await expect(page.locator(id)).toHaveAttribute('data-benson-colour', '');
  }
  await command(page, 'get 26');
  await command(page, 'goto 3 15');
  await page.keyboard.press('Backquote');

  const fields = page.locator('#message, #panel-message, #damocles-message');
  await expect(fields).toHaveCount(3);
  for (const id of ['#message', '#panel-message', '#damocles-message']) {
    await expect(page.locator(id)).toHaveAttribute(
      'data-benson-colour',
      /[256]/
    );
  }
  const colours = await fields.evaluateAll(elements =>
    elements.map(element => getComputedStyle(element).color)
  );
  expect(new Set(colours).size).toBe(1);
  await testInfo.attach('metal-detector-benson-display', {
    body: await page.locator('#benson-panel').screenshot(),
    contentType: 'image/png'
  });
});

test('Lift Journey visibly advances the recovered camera and filled raster bar', async ({
  page
}, testInfo) => {
  await page.goto('/');
  await skipArrival(page);
  await command(page, 'goto room 1');
  await page.keyboard.press('Backquote');
  const canvas = page.locator('#frame');
  const before = await canvas.screenshot();
  const altitude = page.locator('#panel-targ [data-field="altitude"]');
  const beforeAltitude = await altitude.textContent();
  await page.keyboard.press('e');
  await expect
    .poll(async () => {
      const raw = await page.evaluate(() =>
        localStorage.getItem('mercenary.browser-shell.session-resume.v1')
      );
      const saved =
        raw === null
          ? undefined
          : (JSON.parse(raw) as {
              snapshot: { liftJourney: { stage: number } | null };
            });
      return saved?.snapshot.liftJourney?.stage ?? -1;
    })
    .toBeGreaterThanOrEqual(8);
  await expect(canvas).toHaveAttribute('data-lines', '0');
  await expect(canvas).toHaveAttribute('data-points', '0');
  await expect(altitude).toHaveText(beforeAltitude!);
  expect(await canvas.screenshot()).not.toEqual(before);
  await testInfo.attach('lift-journey-raster-split', {
    body: await canvas.screenshot(),
    contentType: 'image/png'
  });
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem(
          'mercenary.browser-shell.session-resume.v1'
        );
        return raw === null
          ? null
          : (
              JSON.parse(raw) as {
                snapshot: { liftJourney: { stage: number } | null };
              }
            ).snapshot.liftJourney?.stage;
      })
    )
    .toBe(13);
  await expect(altitude).toHaveText(beforeAltitude!);
  await testInfo.attach('lift-final-ascent-reveals-surface', {
    body: await canvas.screenshot(),
    contentType: 'image/png'
  });
});
