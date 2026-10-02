import { expect, test } from '@playwright/test';

test('Targ starts when canvas readback alters the Title Logo pixels', async ({
  page
}) => {
  await page.addInitScript(() => {
    const read = OffscreenCanvasRenderingContext2D.prototype.getImageData;
    OffscreenCanvasRenderingContext2D.prototype.getImageData = function (
      ...args: Parameters<typeof read>
    ) {
      const image = read.apply(this, args);
      // Helium returns 253 rather than 255 for this yellow pixel when the whole
      // 304 by 116 logo is read. Its downloaded PNG is unchanged.
      if (image.width === 304 && image.height === 116) {
        image.data[250 * 4 + 1] = 253;
      }
      return image;
    };
  });
  await page.goto('/');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-state',
    'ready'
  );
  await expect(page.locator('#failure')).toBeHidden();
});
