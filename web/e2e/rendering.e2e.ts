import { expect, test } from '@playwright/test';

for (const deviceScaleFactor of [1, 2]) {
  test(`the shared GPU renderer paints ordered camera polygons, line quads, points and palette bands at DPR ${deviceScaleFactor}`, async ({
    browser
  }) => {
    const context = await browser.newContext({ deviceScaleFactor });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/e2e/rendering-fixture.html');
      await expect(page.locator('#result')).toHaveText('ready');
      const pixels = await page.evaluate(() =>
        window.renderingFixture.render()
      );
      expect(pixels.upper).toEqual([255, 0, 0, 255]);
      expect(pixels.lower).toEqual([0, 0, 255, 255]);
      expect(pixels.line).toEqual([0, 255, 0, 255]);
      expect(pixels.point).toEqual([0, 0, 255, 255]);
      expect(pixels.background).toEqual([0, 0, 0, 255]);
      expect(pixels.width).toBe(400 * deviceScaleFactor);
      expect(pixels.height).toBe(300 * deviceScaleFactor);
      expect(pixels.error).toBe(0);
      expect(
        (await page.evaluate(() => window.renderingFixture.render(true))).point
      ).toEqual([12, 180, 7, 255]);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
