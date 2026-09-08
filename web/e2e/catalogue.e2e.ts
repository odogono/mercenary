import { expect, test } from '@playwright/test';

test('key strokes rotate with the plate and are hidden behind the solid body', async ({
  page
}) => {
  await page.goto('/catalogue?instance=object-slot-183');
  await expect(page.locator('#model-name')).toHaveText('KEY- V.I.P. LIMO');
  await expect(page.locator('#viewer-message')).toBeHidden();
  const inkPixels = async (keys: string[]) =>
    page.locator('#model-view').evaluate((element, keys) => {
      const canvas = element as HTMLCanvasElement;
      for (const key of keys) {
        canvas.dispatchEvent(new KeyboardEvent('keydown', { key }));
      }
      const gl = canvas.getContext('webgl2')!;
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(
        0,
        0,
        canvas.width,
        canvas.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels
      );
      let black = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (
          pixels[index]! < 3 &&
          pixels[index + 1]! < 3 &&
          pixels[index + 2]! < 3
        ) {
          black++;
        }
      }
      return black;
    }, keys);
  expect(await inkPixels(['0'])).toBeGreaterThan(30);
  await page
    .locator('#model-view')
    .screenshot({ path: 'test-results/key-oblique.png' });
  expect(await inkPixels(Array(8).fill('ArrowLeft'))).toBeGreaterThan(10);
  await page
    .locator('#model-view')
    .screenshot({ path: 'test-results/key-side.png' });
  expect(await inkPixels(Array(24).fill('ArrowLeft'))).toBe(0);
  await page
    .locator('#model-view')
    .screenshot({ path: 'test-results/key-back.png' });
});

test('the V.I.P. limo opens visibly at its recovered Spaceport placement', async ({
  page
}) => {
  await page.goto('/catalogue?instance=object-slot-5');
  await expect(page.locator('#model-name')).toHaveText('V.I.P. LIMO');
  await expect(page.locator('#details')).toContainText(
    'ERIS · 71.514, 0.000, 136.474 · ST surface grid units'
  );
  await expect(page.locator('#details')).toContainText('source heading 0');
  await expect(page.locator('#details')).toContainText(
    'refuses an empty inventory with VEHICLE KEY REQUIRED'
  );
  await expect(
    page.locator('#details').getByRole('link', { name: /KEY- V.I.P. LIMO/ })
  ).toBeVisible();
  await expect(
    page.locator('#map').getByRole('link', { name: /V.I.P. LIMO/ })
  ).toHaveAttribute('aria-current', 'true');
  const visiblePixels = await page.locator('#model-view').evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: '0' }));
    const gl = canvas.getContext('webgl2')!;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(
      0,
      0,
      canvas.width,
      canvas.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels
    );
    let visible = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (
        pixels[index]! > 12 ||
        pixels[index + 1]! > 12 ||
        pixels[index + 2]! > 16
      ) {
        visible++;
      }
    }
    return visible;
  });
  expect(visiblePixels).toBeGreaterThan(1000);
  await page
    .locator('#model-view')
    .screenshot({ path: 'test-results/catalogue-vip-limo.png' });
});

test('another recovered vehicle and key link to each other without a claimed location', async ({
  page
}) => {
  await page.goto('/catalogue?instance=object-slot-2');
  await expect(page.locator('#model-name')).toHaveText('99 CHEVY');
  await expect(page.locator('#details')).toContainText(
    'body/residence and coordinate interpretation remain unresolved'
  );
  await page
    .locator('#details')
    .getByRole('link', { name: /KEY - 99 CHEVY/ })
    .click();
  await expect(page).toHaveURL(/instance=object-slot-180/);
  await expect(page.locator('#model-name')).toHaveText('KEY - 99 CHEVY');
  await expect(
    page.locator('#details').getByRole('link', { name: /99 CHEVY · slot 2/ })
  ).toBeVisible();
});

test('direct catalogue access, search, inspection and Back never start Targ', async ({
  page
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('catalogue-preservation-sentinel', 'unchanged');
    localStorage.setItem(
      'mercenary.browser-shell.session-resume.v1',
      'existing-resume'
    );
    localStorage.setItem(
      'mercenary.browser-shell.save.v1.slot-1',
      'existing-save'
    );
  });
  await page.goto('/catalogue?model=object-035d12');
  await expect(page.locator('#model-name')).toHaveText('DART II');
  await expect(page.locator('#viewer-message')).toBeHidden();
  await page.locator('#search').fill('chevy');
  await expect(page.locator('#results a')).toHaveCount(2);
  await page
    .locator('#results a')
    .filter({ hasText: '99 CHEVY' })
    .first()
    .click();
  await expect(page.locator('#model-name')).toHaveText('99 CHEVY');
  await page.locator('#wireframe').check();
  await page.getByRole('button', { exact: true, name: 'Zoom in' }).click();
  await page.locator('#model-view').focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Reset view' }).click();
  await page.goBack();
  await expect(page.locator('#model-name')).toHaveText('DART II');
  expect(requests).not.toContain('/src/shell/boot.ts');
  expect(requests).not.toContain('/payload/world.json');
  expect(
    await page.evaluate(() =>
      localStorage.getItem('catalogue-preservation-sentinel')
    )
  ).toBe('unchanged');
  expect(
    await page.evaluate(() =>
      localStorage.getItem('mercenary.browser-shell.session-resume.v1')
    )
  ).toBe('existing-resume');
  expect(
    await page.evaluate(() =>
      localStorage.getItem('mercenary.browser-shell.save.v1.slot-1')
    )
  ).toBe('existing-save');
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/catalogue-object.png' });
});

test('maps known placements and links a surface assembly to building detail', async ({
  page
}) => {
  await page.goto('/catalogue?instance=eris-surface-87&q=structure');
  await expect(page.locator('#details')).toContainText('CAPITAL SPACEPORT');
  await expect(page.locator('#map a')).toHaveCount(77);
  await page
    .locator('#map')
    .getByRole('link', { exact: true, name: 'CAPITAL SPACEPORT' })
    .click();
  await expect(page).toHaveURL(/instance=eris-surface-87/);
  await page.screenshot({ path: 'test-results/catalogue-structure.png' });
  await page
    .locator('#details')
    .getByRole('link', { exact: true, name: 'Building detail 88' })
    .click();
  await expect(page.locator('#model-name')).toHaveText('Building detail 88');
  await expect(page.locator('#viewer-message')).toBeHidden();
  await page.screenshot({ path: 'test-results/catalogue-interior.png' });
  await page.locator('#body').selectOption('body-1');
  await expect(page.locator('#map a')).toHaveCount(0);
  await expect(page.locator('#map-note')).toContainText(
    'No verified surface placements'
  );
});

test('unresolved records, empty filters and invalid links are explained', async ({
  page
}) => {
  await page.goto('/catalogue?model=object-035cfc');
  await expect(page.locator('#viewer-message')).toContainText(
    'Geometry unresolved'
  );
  await page.locator('#search').fill('no-such-model-name');
  await expect(page.locator('#results')).toContainText('No matching models');
  await page.goto('/catalogue?instance=missing');
  await expect(page.locator('#model-name')).toHaveText('Model not found');
});

test('missing and incompatible datasets show recovery instructions', async ({
  page
}) => {
  await page.route('**/payload/damocles/catalogue.json', route =>
    route.fulfill({ body: 'missing', status: 404 })
  );
  await page.goto('/catalogue');
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error')).toContainText('regenerate');
  await page.unroute('**/payload/damocles/catalogue.json');
  await page.route('**/payload/damocles/catalogue.json', route =>
    route.fulfill({ json: { schemaVersion: 99 } })
  );
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#error-message')).toContainText(
    'unsupported schema version'
  );
});

test('shared geometry variants remain selectable', async ({ page }) => {
  await page.goto('/catalogue?model=object-03852a');
  await expect(page.locator('#variant')).toBeEnabled();
  const values = await page
    .locator('#variant option')
    .evaluateAll(options =>
      options.map(option => (option as HTMLOptionElement).value)
    );
  await page.locator('#variant').selectOption(values.at(-1)!);
  await expect(page.locator('#viewer-message')).toBeHidden();
  await expect(page).toHaveURL(/variant=/);
});

test('viewer resolves front/back colours and puts the near surface in front', async ({
  page
}) => {
  await page.goto('/catalogue');
  const pixels = await page.evaluate(async () => {
    // Exercise the production renderer, reading immediately after its draw.
    const { createViewer } = await import('../src/catalogue/viewer.ts');
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:256px;height:256px';
    document.body.append(canvas);
    const viewer = createViewer(canvas);
    const gl = canvas.getContext('webgl2')!;
    const pixel = () => {
      const rgba = new Uint8Array(4);
      gl.readPixels(
        canvas.width / 2,
        canvas.height / 2,
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        rgba
      );
      return [...rgba].slice(0, 3);
    };
    const vertices: [number, number, number][] = [
      [-1, -1, 0],
      [1, -1, 0],
      [1, 1, 0],
      [-1, 1, 0]
    ];
    viewer.show({
      faces: [
        { colour: '#ff0000', sourceColour: 0, vertices: [3, 2, 1, 0] },
        { colour: '#00ff00', sourceColour: 0, vertices: [0, 1, 2, 3] }
      ],
      lines: [],
      vertices
    });
    const sides = pixel();
    for (let i = 0; i < 32; i++) {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    }
    const reverse = pixel();
    viewer.show({
      faces: [
        { colour: '#ff0000', sourceColour: 0, vertices: [3, 2, 1, 0] },
        { colour: '#00ff00', sourceColour: 0, vertices: [7, 6, 5, 4] }
      ],
      lines: [],
      vertices: [
        ...vertices.map(([x, y]) => [x, y, -0.2] as [number, number, number]),
        ...vertices.map(([x, y]) => [x, y, 0.2] as [number, number, number])
      ]
    });
    const depth = pixel();
    viewer.show({
      faces: [
        {
          colour: '#ff0000',
          doubleSided: true,
          sourceColour: 0,
          vertices: [0, 1, 2, 3]
        }
      ],
      lines: [],
      vertices
    });
    return { depth, reverse, sides, wall: pixel() };
  });
  expect(pixels).toEqual({
    depth: [255, 0, 0],
    reverse: [0, 255, 0],
    sides: [255, 0, 0],
    wall: [255, 0, 0]
  });
});

test('Capital Spaceport exposes its interior layout independently of its exterior', async ({
  page
}) => {
  await page.goto(
    '/catalogue?instance=eris-surface-87&variant=interior-layout'
  );
  await expect(page.locator('#model-name')).toHaveText('Capital Spaceport');
  await expect(page.locator('#variant')).toHaveValue('interior-layout');
  await expect(page.locator('#details')).toContainText('region 1');
  await expect(page.locator('#details')).toContainText('CAPITAL SPACEPORT');
  await expect(page.locator('#details')).toContainText('Recovery evidence');
  await expect(page.locator('#details')).toContainText(
    'Dynamic door proximity box: X 1200–1600, Z -1200–-200.'
  );
  await expect(page.locator('#details')).toContainText(
    'Region 1 places resident slot 183, KEY- V.I.P. LIMO, at local (1038, 0, 789).'
  );
  await expect(
    page.locator('#details').getByRole('link', { name: /KEY- V.I.P. LIMO/ })
  ).toHaveAttribute('href', /instance=object-slot-183/);
  await expect(page.locator('#model-status')).toHaveText('partial');
  await expect(page.locator('#viewer-message')).toBeHidden();
  await page.screenshot({
    path: 'test-results/catalogue-spaceport-room-key.png'
  });
  const interiorCounts = await page.locator('#details').innerText();
  await page.locator('#variant').selectOption('exterior');
  await expect(page).toHaveURL(/variant=exterior/);
  await expect(page.locator('#viewer-message')).toBeHidden();
  expect(await page.locator('#details').innerText()).not.toBe(interiorCounts);
  await page.reload();
  await expect(page.locator('#variant')).toHaveValue('exterior');
  await page.locator('#variant').selectOption('combined');
  await expect(page).toHaveURL(/variant=combined/);
  await page.reload();
  await expect(page.locator('#variant')).toHaveValue('combined');
  await expect(page.locator('#viewer-message')).toBeHidden();
  await page.screenshot({
    path: 'test-results/catalogue-spaceport-with-key.png'
  });
  await page
    .locator('#details')
    .getByRole('link', { name: /KEY- V.I.P. LIMO/ })
    .click();
  await expect(page.locator('#model-name')).toHaveText('KEY- V.I.P. LIMO');
  await expect(page.locator('#model-status')).toHaveText('decoded');
  await expect(page.locator('#model-label')).toHaveCount(0);
  await expect(page.locator('#viewer-message')).toBeHidden();
  await expect(page.locator('#details')).toContainText(
    'Inside CAPITAL SPACEPORT · 1038, 0, 789 · Capital Spaceport local model units'
  );
  await expect(page.locator('#details')).toContainText(
    'display code VL at local anchor [-8, 24, 0]'
  );
  await expect(page.locator('#details')).toContainText(
    'Observed pickup removes slot 183 from the room queue'
  );
  await page.screenshot({ path: 'test-results/catalogue-spaceport-key.png' });
});

test('source negative-Z facade keeps the spaceport entrance on the right', async ({
  page
}) => {
  await page.goto('/catalogue');
  const result = await page.evaluate(async () => {
    const { createViewer } = await import('../src/catalogue/viewer.ts');
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:256px;height:256px';
    document.body.append(canvas);
    const viewer = createViewer(canvas);
    // An asymmetric source facade: cyan window on the left, blue door on the
    // right, both facing the source's negative-Z approach direction.
    viewer.show({
      faces: [
        { colour: '#00ffff', sourceColour: 0, vertices: [3, 2, 1, 0] },
        { colour: '#0000ff', sourceColour: 0, vertices: [2, 5, 4, 1] }
      ],
      lines: [],
      vertices: [
        [-1, -1, -1],
        [0, -1, -1],
        [0, 1, -1],
        [-1, 1, -1],
        [1, -1, -1],
        [1, 1, -1]
      ]
    });
    const gl = canvas.getContext('webgl2')!;
    const bytes = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(
      0,
      0,
      canvas.width,
      canvas.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      bytes
    );
    const xs = [[], []] as number[][];
    for (let i = 0; i < bytes.length; i += 4) {
      if (bytes[i] === 0 && bytes[i + 2] === 255) {
        xs[bytes[i + 1] === 255 ? 0 : 1]!.push((i / 4) % canvas.width);
      }
    }
    return xs.map(values =>
      values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
    );
  });
  expect(result[0]).not.toBeNull();
  expect(result[1]).not.toBeNull();
  expect(result[0]!).toBeLessThan(result[1]!);
});

test('spaceport door states preserve the view and survive direct navigation', async ({
  page
}) => {
  await page.goto('/catalogue?model=structure-01484e&variant=combined');
  await expect(page.locator('#door')).toHaveValue('open');
  await page.locator('#door').selectOption('closed');
  await expect(page.locator('#variant')).toHaveValue('combined-closed');
  await expect(page).toHaveURL(/variant=combined-closed/);
  await page.reload();
  await expect(page.locator('#door')).toHaveValue('closed');
  await expect(page.locator('#viewer-message')).toBeHidden();
  await page.locator('#door').selectOption('open');
  await expect(page.locator('#variant')).toHaveValue('combined');
  await page.goto('/catalogue?model=object-035d12');
  await expect(page.locator('#door-control')).toBeHidden();
});
