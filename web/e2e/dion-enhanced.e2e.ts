import { expect, test } from '@playwright/test';

const KEY = 'mercenary.browser-shell.dion.presentation.v1';
const openSettings = async (page: import('@playwright/test').Page) => {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { exact: true, name: 'SETTINGS' }).click();
};

test('Dion switches the same snapshot to display-resolution shared rendering and preserves its panel', async ({
  page
}, info) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'mercenary.browser-shell.preferences.v1',
      '{"presentationPreset":"enhanced"}'
    )
  );
  await page.goto('/dion');
  const screen = page.locator('#screen');
  await expect(screen).toHaveAttribute('data-state', 'ready');
  await expect(screen).toHaveAttribute('data-presentation', 'authentic');
  await expect(page.locator('#dion-enhanced-view')).toHaveCount(0);
  await openSettings(page);
  const before = await screen.evaluate((el: HTMLCanvasElement) => ({
    pixels: Array.from(el.getContext('2d')!.getImageData(0, 136, 320, 64).data),
    tick: el.dataset['tick']
  }));
  await page.getByRole('button', { exact: true, name: 'ENHANCED' }).click();
  await expect(screen).toHaveAttribute('data-presentation', 'enhanced');
  const gpu = page.locator('#dion-enhanced-view');
  await expect(gpu).toBeVisible();
  expect(await screen.getAttribute('data-tick')).toBe(before.tick);
  expect(
    await screen.evaluate((el: HTMLCanvasElement) =>
      Array.from(el.getContext('2d')!.getImageData(0, 136, 320, 64).data)
    )
  ).toEqual(before.pixels);
  const sizes = await gpu.evaluate((el: HTMLCanvasElement) => ({
    css: el.getBoundingClientRect().toJSON(),
    height: el.height,
    ratio: devicePixelRatio,
    width: el.width
  }));
  expect(sizes.width).toBe(Math.round(sizes.css.width * sizes.ratio));
  expect(sizes.height).toBe(Math.round(sizes.css.height * sizes.ratio));
  const screenBox = await screen.boundingBox();
  expect(sizes.css.height).toBeCloseTo((screenBox!.height * 136) / 200, 1);
  await page.screenshot({ path: info.outputPath('enhanced-opening.png') });
  await page.getByRole('button', { exact: true, name: 'AUTHENTIC' }).click();
  await expect(gpu).toBeHidden();
  expect(await screen.getAttribute('data-tick')).toBe(before.tick);
  expect(
    await page.evaluate(() =>
      localStorage.getItem('mercenary.browser-shell.preferences.v1')
    )
  ).toBe('{"presentationPreset":"enhanced"}');
  await page.getByRole('button', { exact: true, name: 'ENHANCED' }).click();
  await page.setViewportSize({ height: 640, width: 320 });
  await expect
    .poll(async () => gpu.evaluate((el: HTMLCanvasElement) => el.width))
    .toBe(320);
  await page.evaluate(() => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 2
    });
    window.dispatchEvent(new Event('resize'));
  });
  await expect
    .poll(async () => gpu.evaluate((el: HTMLCanvasElement) => el.width))
    .toBe(640);
  expect(await screen.getAttribute('data-tick')).toBe(before.tick);
  expect(
    await screen.evaluate((el: HTMLCanvasElement) =>
      Array.from(el.getContext('2d')!.getImageData(0, 136, 320, 64).data)
    )
  ).toEqual(before.pixels);
  await page.reload();
  await expect(screen).toHaveAttribute('data-presentation', 'enhanced');
  await expect(page.locator('#failure')).toBeHidden();
});

test('unavailable WebGL falls back without changing the stored choice or stopping play, and allows retry', async ({
  page
}) => {
  await page.addInitScript(key => {
    localStorage.setItem(key, '"enhanced"');
    const original = HTMLCanvasElement.prototype.getContext;
    let refused = false;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (args[0] === 'webgl2' && !refused) {
        refused = true;
        return null;
      }
      return Reflect.apply(original, this, args);
    } as typeof original;
  }, KEY);
  await page.goto('/dion');
  const screen = page.locator('#screen');
  await expect(screen).toHaveAttribute('data-presentation', 'authentic');
  await expect(page.locator('#status')).toContainText('Enhanced unavailable');
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe(
    '"enhanced"'
  );
  await expect
    .poll(async () => Number(await screen.getAttribute('data-tick')))
    .toBeGreaterThan(22);
  await openSettings(page);
  await page.getByRole('button', { exact: true, name: 'ENHANCED' }).click();
  await expect(screen).toHaveAttribute('data-presentation', 'enhanced');
  await expect(page.locator('#failure')).toBeHidden();
  await expect(page.locator('#status')).toBeHidden();
});

test('context loss falls back on the same paused frame and waits for an explicit retry', async ({
  page
}) => {
  await page.addInitScript(key => localStorage.setItem(key, '"enhanced"'), KEY);
  await page.goto('/dion');
  const screen = page.locator('#screen');
  await expect(screen).toHaveAttribute('data-presentation', 'enhanced');
  await openSettings(page);
  const tick = await screen.getAttribute('data-tick');
  await page
    .locator('#dion-enhanced-view')
    .evaluate((el: HTMLCanvasElement) =>
      el.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext()
    );
  await expect(screen).toHaveAttribute('data-presentation', 'authentic');
  expect(await screen.getAttribute('data-tick')).toBe(tick);
  expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe(
    '"enhanced"'
  );
  await expect(
    page.getByRole('button', { exact: true, name: 'AUTHENTIC' })
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { exact: true, name: 'ENHANCED' }).click();
  await expect(screen).toHaveAttribute('data-presentation', 'enhanced');
  expect(await screen.getAttribute('data-tick')).toBe(tick);
});
