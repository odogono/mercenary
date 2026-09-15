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

test('99 Chevy is mapped on Gaea and links to its key', async ({ page }) => {
  await page.goto('/catalogue?instance=object-slot-2');
  await expect(page.locator('#model-name')).toHaveText('99 CHEVY');
  await expect(page.locator('#details')).toContainText(
    'GAEA · 519.487, 0.000, 1793.487 · ST surface grid units'
  );
  await expect(page.locator('#details')).toContainText('source heading 0');
  await expect(page.locator('#map a')).toHaveCount(147);
  await expect(
    page.locator('#map').getByRole('link', { name: /99 CHEVY/ })
  ).toHaveAttribute('aria-current', 'true');
  await expect(
    page
      .locator('#map')
      .getByRole('link', { exact: true, name: 'ELMDON SPACEPORT' })
  ).toHaveAttribute('href', /instance=gaea-surface-40/);
  await expect(
    page
      .locator('#map')
      .getByRole('link', { exact: true, name: 'Gaea surface cell 8,2' })
  ).toHaveAttribute('href', /instance=gaea-surface-28/);
  await page.goto('/catalogue?instance=gaea-surface-40');
  await expect(page.locator('#details')).toContainText('ELMDON SPACEPORT');
  await expect(page.locator('#details')).toContainText(
    'GAEA · 512.484, 0.000, 1796.523 · ST surface grid units'
  );
  await expect(page.locator('#ledger')).toContainText('Gaea Birmingham Island');
  await expect(page.locator('#ledger')).toContainText('title-screen RAM');
  await expect(page.locator('#ledger')).toContainText('NULL');
  await expect(page.locator('#ledger')).toContainText('Building detail');
  await page.goBack();
  await expect(page).toHaveURL(/instance=object-slot-2/);
  await page
    .locator('#details')
    .getByRole('link', { name: /KEY - 99 CHEVY/ })
    .click();
  await expect(page).toHaveURL(/instance=object-slot-180/);
  await expect(page.locator('#model-name')).toHaveText('KEY - 99 CHEVY');
  await expect(page.locator('#details')).toContainText(
    'ERIS selectors · structure group $14 · insertion group $03 · level $01 · cell $26'
  );
  await expect(page.locator('#details')).toContainText(
    'Inside Eris structure group $14 cell $26 · -394, 200, 1846'
  );
  await expect(
    page
      .locator('#details')
      .getByRole('link', { name: 'Eris structure group $14 cell $26' })
  ).toHaveAttribute('href', /instance=eris-structure-0251d7/);
  await expect(
    page.locator('#details').getByRole('link', { name: /99 CHEVY · slot 2/ })
  ).toBeVisible();
  await page
    .locator('#details')
    .getByRole('link', { name: 'Eris structure group $14 cell $26' })
    .click();
  await expect(page).toHaveURL(/instance=eris-structure-0251d7/);
  await expect(page.locator('#model-name')).toHaveText('Structure 145');
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
  await expect(page.locator('#map a')).toHaveCount(174);
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
  await expect(page.locator('#map a')).toHaveCount(1);
  await expect(
    page.locator('#map').getByRole('link', { name: /BLACK BEACON/ })
  ).toBeVisible();
});

test('unresolved records, empty filters and invalid links are explained', async ({
  page
}) => {
  await page.goto('/catalogue?instance=object-slot-65');
  await expect(page.locator('#details')).toContainText(
    'ERIS selectors · structure group $14 · insertion group $03 · level $00 · cell $26'
  );
  await expect(page.locator('#details')).toContainText(
    'no parent or local placement is claimed'
  );
  await page.goto('/catalogue?model=object-035cfc');
  await expect(page.locator('#model-status')).toContainText('null');
  await expect(page.locator('#viewer-message')).toContainText(
    'Geometry unresolved'
  );
  await page.goto('/catalogue?model=structure-01a618');
  await expect(page.locator('#model-name')).toHaveText('Structure 100');
  await expect(page.locator('#viewer-message')).toContainText(
    'Geometry unresolved'
  );
  await expect(page.locator('#details')).toContainText('Empty surface record');
  await expect(page.locator('#details')).toContainText('empty vertex list');
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
  await expect(
    page.locator('#details').getByRole('link', { name: 'CAPITAL SPACEPORT' })
  ).toHaveAttribute('href', /instance=eris-surface-87/);
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

test('the placement map zooms, pans and resets by pointer and keyboard without losing pins', async ({
  page
}) => {
  const zoom = async () =>
    Number(
      (await page.locator('#map-scale').innerText())
        .match(/Zoom ([\d,.]+)×/)![1]!
        .replaceAll(',', '')
    );
  const centre = async (name: string) => {
    const box = (await page
      .locator('#map')
      .getByRole('link', { exact: true, name })
      .boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  await page.goto('/catalogue?instance=eris-surface-89');
  await expect(page.locator('#model-name')).toHaveText('Structure 75');
  await expect(page.locator('#map a')).toHaveCount(174);
  await page.locator('#map').scrollIntoViewIfNeeded();
  // Opening a placement frames its local workspace: neighbouring cells one
  // unit apart are separate pins.
  expect(await zoom()).toBeGreaterThan(150);
  await expect(page.locator('#map-scale')).toContainText('grid 2 units');
  const office = await centre('STATE OFFICE'),
    spaceport = await centre('CAPITAL SPACEPORT');
  expect(Math.abs(office.x - spaceport.x)).toBeGreaterThan(40);
  await expect(
    page
      .locator('#map')
      .getByRole('link', { exact: true, name: 'STATE OFFICE' })
  ).toHaveAttribute('aria-current', 'true');
  // Fit all collapses the workspace back onto one spot, still 174 pins.
  await page.getByRole('button', { name: 'Fit all' }).click();
  expect(await zoom()).toBe(1);
  await expect(page.locator('#map-scale')).toContainText('grid 500 units');
  const collapsed = await centre('STATE OFFICE');
  expect(
    Math.abs(collapsed.x - (await centre('CAPITAL SPACEPORT')).x)
  ).toBeLessThan(4);
  await expect(page.locator('#map a')).toHaveCount(174);
  // Wheel zoom keeps the world under the pointer still. Marker boxes are
  // pixel-snapped, so the check stays at a zoom where that error is small.
  await page.mouse.move(collapsed.x, collapsed.y);
  await page.mouse.wheel(0, -1000);
  expect(await zoom()).toBeCloseTo(2.7, 0);
  const anchored = await centre('STATE OFFICE');
  expect(Math.abs(anchored.x - collapsed.x)).toBeLessThan(8);
  expect(Math.abs(anchored.y - collapsed.y)).toBeLessThan(8);
  await page.mouse.wheel(0, -2000);
  expect(await zoom()).toBeGreaterThan(15);
  const underPointer = await centre('STATE OFFICE');
  // Dragging pans by the pointer distance and does not follow a marker link.
  await page.mouse.move(underPointer.x, underPointer.y);
  await page.mouse.down();
  await page.mouse.move(underPointer.x + 40, underPointer.y + 20, { steps: 4 });
  await page.mouse.move(underPointer.x + 80, underPointer.y + 40, { steps: 4 });
  await page.mouse.up();
  const dragged = await centre('STATE OFFICE');
  expect(dragged.x - underPointer.x).toBeGreaterThan(70);
  expect(dragged.y - underPointer.y).toBeGreaterThan(30);
  await expect(page).toHaveURL(/instance=eris-surface-89/);
  // Buttons and keys.
  await page.getByRole('button', { name: 'Zoom map in' }).click();
  const zoomedIn = await zoom();
  await page.getByRole('button', { name: 'Zoom map out' }).click();
  expect(await zoom()).toBeLessThan(zoomedIn);
  await page.locator('#map').focus();
  await page.keyboard.press('0');
  expect(await zoom()).toBe(1);
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  expect(await zoom()).toBeCloseTo(2.3, 0);
  const beforeArrow = await centre('STATE OFFICE');
  await page.keyboard.press('ArrowLeft');
  expect((await centre('STATE OFFICE')).x - beforeArrow.x).toBeGreaterThan(30);
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  expect(await zoom()).toBe(1);
  // The maximum zoom separates a structure from its own ground record, which
  // sits 0.023 units away, without inventing positions for the coincident pair
  // one cell over.
  const pin = await centre('STATE OFFICE');
  await page.mouse.move(pin.x, pin.y);
  await page.mouse.wheel(0, -30_000);
  expect(await zoom()).toBe(8192);
  await expect(page.locator('#map-scale')).toContainText('grid 0.05 units');
  const structure = await centre('STATE OFFICE'),
    ground = await centre('STATE OFFICE ground');
  expect(
    Math.hypot(structure.x - ground.x, structure.y - ground.y)
  ).toBeGreaterThan(12);
  await page
    .locator('#map')
    .getByRole('link', { exact: true, name: 'STATE OFFICE ground' })
    .click();
  await expect(page).toHaveURL(/instance=eris-ground-89/);
  await expect(page.locator('#map-note')).not.toContainText(
    'shares its position'
  );
  await page
    .locator('.map-section')
    .screenshot({ path: 'test-results/catalogue-map-zoomed.png' });
  // Opening a placement from the list recentres; Back keeps that view.
  await page
    .locator('#locations')
    .getByRole('link', { name: /^PLAYTESTER STORES ground · 73\.500/ })
    .click();
  await expect(page).toHaveURL(/instance=eris-ground-29/);
  await expect(page.locator('#map-note')).toContainText(
    'shares its position with 1 other'
  );
  const opened = await page.locator('#map-scale').innerText();
  expect(await zoom()).toBeGreaterThan(150);
  await page.goBack();
  await expect(page).toHaveURL(/instance=eris-ground-89/);
  await expect(page.locator('#map-scale')).toHaveText(opened);
  await expect(
    page
      .locator('#map')
      .getByRole('link', { exact: true, name: 'STATE OFFICE ground' })
  ).toHaveAttribute('aria-current', 'true');
  // A lone outlier opens at 8×; changing body fits the new body.
  await page
    .locator('#locations')
    .getByRole('link', { name: /^DART II/ })
    .click();
  expect(await zoom()).toBe(8);
  await page.locator('#body').selectOption('body-8');
  expect(await zoom()).toBe(1);
  await expect(page.locator('#map a')).toHaveCount(147);
  await page.goBack();
  await expect(page.locator('#map a')).toHaveCount(174);
});
