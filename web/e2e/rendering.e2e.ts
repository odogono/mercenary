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

  test(`Haze fades the world toward the horizon colour, and never the sky or the cab, at DPR ${deviceScaleFactor}`, async ({
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
        const clear = await page.evaluate(
          enhanced => window.renderingFixture.renderHaze(enhanced, false),
          enhanced
        );
        expect(clear.wall).toEqual([255, 255, 255, 255]);
        const frame = await page.evaluate(
          enhanced => window.renderingFixture.renderHaze(enhanced),
          enhanced
        );
        // A little over 100 units along the pixel's ray: a little under half white.
        const [red, green, blue] = frame.wall;
        expect(red).toBe(green);
        expect(red).toBeGreaterThan(100);
        expect(red).toBeLessThan(128);
        expect(blue).toBe(255);
        expect(frame.sky).toEqual([255, 0, 0, 255]);
        expect(frame.cab).toEqual([0, 255, 0, 255]);
        expect(frame.error).toBe(0);
      }
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
