import { expect, test } from '@playwright/test';

for (const deviceScaleFactor of [1, 2]) {
  test(`view-fixed models paint over nearer world geometry in both render paths at DPR ${deviceScaleFactor}`, async ({
    browser
  }) => {
    const context = await browser.newContext({ deviceScaleFactor });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/e2e/rendering-fixture.html');
      await expect(page.locator('#result')).toHaveText('ready');
      for (const enhanced of [false, true]) {
        const frame = await page.evaluate(
          enhanced => window.renderingFixture.renderViewFixed(enhanced),
          enhanced
        );
        expect(frame.cab).toEqual([0, 255, 0, 255]);
        expect(frame.wall).toEqual([255, 0, 0, 255]);
        expect(frame.error).toBe(0);
      }
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test(`distant island fills survive the finite sea plane in both render paths at DPR ${deviceScaleFactor}`, async ({
    browser
  }) => {
    const context = await browser.newContext({ deviceScaleFactor });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/e2e/rendering-fixture.html');
      await expect(page.locator('#result')).toHaveText('ready');
      for (const enhanced of [false, true]) {
        const island = await page.evaluate(
          enhanced => window.renderingFixture.renderDistantIsland(enhanced),
          enhanced
        );
        expect(island.centre).toEqual([255, 255, 255, 255]);
        expect(island.foreground).toEqual([0, 255, 0, 255]);
        expect(island.error).toBe(0);
      }
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
