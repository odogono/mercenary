import { expect, test, type Page } from '@playwright/test';

test.use({ deviceScaleFactor: 1, viewport: { height: 800, width: 1280 } });

const ready = async (page: Page) => {
  await expect(page.locator('html')).toHaveAttribute(
    'data-flyover-ready',
    'true'
  );
};

const camera = async (page: Page) =>
  await page.locator('html').evaluate(element => ({
    heading: Number((element as HTMLElement).dataset['heading']),
    pitch: Number((element as HTMLElement).dataset['pitch']),
    speedNotch: Number((element as HTMLElement).dataset['speedNotch']),
    x: Number((element as HTMLElement).dataset['cameraX']),
    y: Number((element as HTMLElement).dataset['cameraY']),
    z: Number((element as HTMLElement).dataset['cameraZ'])
  }));

test('Body queries enter without rewriting the address and invalid queries diagnose', async ({
  page
}) => {
  await page.goto('/targ/debug?body=targ&inspection=1');
  await ready(page);
  expect(page.url()).toContain('/targ/debug?body=targ&inspection=1');
  expect(await camera(page)).toMatchObject({
    heading: 0,
    pitch: 0,
    speedNotch: 0,
    x: 0,
    y: 0
  });
  expect((await camera(page)).z).toBeCloseTo(8_010_530.573_161_308, 3);
  await expect(page.locator('#notice')).toBeHidden();

  await page.goto('/targ/debug?body=TARG');
  await ready(page);
  await expect(page.locator('#notice')).toContainText('Unknown Body TARG');
  await expect(page.locator('#failure')).toBeHidden();

  await page.goto('/targ/debug?body=targ&body=sun');
  await ready(page);
  await expect(page.locator('#notice')).toContainText(
    'must name exactly one Body'
  );
});

test('the Flyover reuses the Damocles panel component for sessionless navigation', async ({
  page
}) => {
  await page.goto('/damocles/debug?body=dialis');
  await ready(page);
  const dashboard = page.getByRole('region', {
    name: 'Flyover navigation dashboard'
  });
  await expect(dashboard).toBeVisible();
  const component = dashboard.locator('damocles-panel#panel-damocles');
  await expect(component).toBeVisible();
  await expect(component.locator('#damocles-nav')).toBeVisible();
  await expect(component.locator('#damocles-compass-canvas')).toBeVisible();
  await expect(component.locator('#damocles-elevation-canvas')).toBeVisible();
  await expect(component.locator('[data-field="locationName"]')).toHaveText(
    'GAMMA · DIALIS'
  );
  await expect(component.locator('[data-field="message"]')).toHaveText(
    'ORBITAL FLYOVER'
  );
  await expect(component.locator('[data-field="locationLabel"]')).toHaveText(
    'X+0.000E+0'
  );
  await expect(component.locator('[data-field="altitude"]')).toHaveText(
    'Y+0.000E+0'
  );
  await expect(component.locator('#damocles-right')).toBeHidden();
  await expect(component.locator('.tp-gauge').nth(0)).toBeHidden();
  await expect(component.locator('.tp-gauge').nth(1)).toBeHidden();
  await expect(component.locator('#damocles-aux')).toBeHidden();

  await page.keyboard.press('1');
  await expect(component.locator('[data-field="speedLabel"]')).toContainText(
    'N01'
  );
});

test('the Browser Shell and Flyover instantiate the same Damocles panel element', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.locator('damocles-panel#panel-damocles')).toHaveCount(1);
  await page.goto('/damocles/debug');
  await ready(page);
  await expect(page.locator('damocles-panel#panel-damocles')).toHaveCount(1);
});

test('keyboard flight admits held arrows and discrete unmodified speed keys', async ({
  page
}) => {
  await page.goto('/targ/debug?body=targ');
  await ready(page);
  await page.keyboard.press('1');
  await expect(page.locator('html')).toHaveAttribute('data-speed-notch', '1');
  await page.keyboard.press('+');
  await expect(page.locator('html')).toHaveAttribute('data-speed-notch', '2');
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-speed-notch', '0');
  await page.keyboard.press('-');
  await expect(page.locator('html')).toHaveAttribute('data-speed-notch', '0');
  await page.keyboard.press('0');
  await expect(page.locator('html')).toHaveAttribute('data-speed-notch', '10');

  const before = await camera(page);
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(120);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowUp');
  const turned = await camera(page);
  const rightwardTurn =
    (before.heading - turned.heading + 2 * Math.PI) % (2 * Math.PI);
  expect(rightwardTurn).toBeGreaterThan(0.05);
  expect(rightwardTurn).toBeLessThan(Math.PI);
  expect(turned.pitch).toBeGreaterThan(before.pitch);
  expect(turned.y).toBeGreaterThan(before.y);

  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(80);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const blurred = await camera(page);
  await page.waitForTimeout(100);
  expect((await camera(page)).heading).toBeCloseTo(blurred.heading, 5);

  const admitted = await page.evaluate(() => {
    const modified = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: 'ArrowLeft'
    });
    window.dispatchEvent(modified);
    return modified.defaultPrevented;
  });
  expect(admitted).toBeFalsy();
});

test('a lost WebGL context blocks the Flyover until reload', async ({
  page
}) => {
  await page.goto('/damocles/debug');
  await ready(page);
  await page.locator('#flyover').evaluate(canvas => {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2')!;
    gl.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await expect(page.locator('#failure')).toContainText(
    'graphics context was lost'
  );
  await expect(page.locator('#flyover')).toBeHidden();
  await expect(page.locator('#flyover-dashboard')).toBeHidden();
});

for (const [name, path] of [
  ['targ-overview', '/targ/debug'],
  ['gamma-overview', '/damocles/debug'],
  ['targ-entry', '/targ/debug?body=targ'],
  ['gamma-entry', '/damocles/debug?body=dialis']
] as const) {
  test(`captures the ${name} review frame`, async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      Object.defineProperty(performance, 'now', { value: () => 0 });
    });
    await page.goto(path);
    await ready(page);
    const pixels = await page.locator('#flyover').evaluate(canvas => {
      const surface = canvas as HTMLCanvasElement;
      const gl = surface.getContext('webgl2')!;
      const pixels = new Uint8Array(surface.width * surface.height * 4);
      gl.readPixels(
        0,
        0,
        surface.width,
        surface.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels
      );
      const differsFromBackdrop = (pixel: number) =>
        pixels[pixel] !== 0 ||
        pixels[pixel + 1] !== 0 ||
        pixels[pixel + 2] !== 8;
      let changed = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (differsFromBackdrop(index)) {
          changed += 1;
        }
      }
      let solidBlocks = 0;
      for (let y = 0; y < surface.height - 1; y += 1) {
        for (let x = 0; x < surface.width - 1; x += 1) {
          const pixel = (y * surface.width + x) * 4;
          if (
            differsFromBackdrop(pixel) &&
            differsFromBackdrop(pixel + 4) &&
            differsFromBackdrop(pixel + surface.width * 4) &&
            differsFromBackdrop(pixel + (surface.width + 1) * 4)
          ) {
            solidBlocks += 1;
          }
        }
      }
      return { changed, solidBlocks };
    });
    expect(pixels.changed).toBeGreaterThan(100);
    // Backdrop stars occupy isolated one-pixel points; a 2x2 block proves
    // that at least one Body was rasterised as well.
    expect(pixels.solidBlocks).toBeGreaterThan(0);
    const pathName = testInfo.outputPath(`issue-186-${name}.png`);
    await page.screenshot({ path: pathName });
    await testInfo.attach(`issue-186-${name}`, {
      contentType: 'image/png',
      path: pathName
    });
  });
}
