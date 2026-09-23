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
    'ERIS · 71.514, 0.000, 136.474 · Body Coordinates'
  );
  // $77BC, plus the record's zero $8001 bias (#361).
  await expect(page.locator('#details')).toContainText(
    'source instance angle 127 · drawn 127'
  );
  await expect(page.locator('#details')).toContainText(
    'refuses an empty inventory with VEHICLE KEY REQUIRED'
  );
  await expect(
    page.locator('#details').getByRole('link', { name: /KEY- V.I.P. LIMO/ })
  ).toBeVisible();
  // One map: the placement itself is inspected on the Atlas, at its own Body Coordinates (#415).
  await expect(page.locator('#instance-atlas-link')).toHaveAttribute(
    'href',
    '/damocles/atlas?body=eris&instance=object-slot-5&x=71.51&z=136.47&span=1'
  );
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

test('99 Chevy is listed on Gaea and links to its key', async ({ page }) => {
  await page.goto('/catalogue?instance=object-slot-2');
  await expect(page.locator('#model-name')).toHaveText('99 CHEVY');
  await expect(page.locator('#details')).toContainText(
    'GAEA · 519.487, 0.000, 1793.487 · Body Coordinates'
  );
  // The Chevy is modelled the other way round: a zero angle with an $8001 bias of $40.
  await expect(page.locator('#details')).toContainText(
    'source instance angle 0 · drawn 64'
  );
  await expect(page.locator('#instance-atlas-link')).toHaveAttribute(
    'href',
    '/damocles/atlas?body=gaea&instance=object-slot-2&x=519.49&z=1793.49&span=1'
  );
  // The Body's own placements stay here as a list, each reaching its own entry: 372 of them on
  // Gaea, which is the one thing the Atlas is not for (#415).
  await expect(page.locator('#placement-note')).toContainText(
    '372 recovered placements · Body Coordinates'
  );
  await expect(page.locator('#locations a')).toHaveCount(372);
  await expect(
    page
      .locator('#locations')
      .getByRole('link', { name: /^ELMDON SPACEPORT · / })
  ).toHaveAttribute('href', /instance=gaea-surface-40/);
  await expect(
    page
      .locator('#locations')
      .getByRole('link', { name: /^Gaea surface cell 8,2 · / })
  ).toHaveAttribute('href', /instance=gaea-surface-28/);
  await page.goto('/catalogue?instance=gaea-surface-40');
  await expect(page.locator('#details')).toContainText('ELMDON SPACEPORT');
  await expect(page.locator('#details')).toContainText(
    'GAEA · 512.484, 0.000, 1796.523 · Body Coordinates'
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

test('lists known placements and links a surface assembly to building detail', async ({
  page
}) => {
  await page.goto('/catalogue?instance=eris-surface-87&q=structure');
  await expect(page.locator('#details')).toContainText('CAPITAL SPACEPORT');
  await expect(page.locator('#locations a')).toHaveCount(207);
  await page
    .locator('#locations')
    .getByRole('link', { name: /^CAPITAL SPACEPORT · / })
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
  await expect(page.locator('#locations a')).toHaveCount(13);
  await expect(
    page.locator('#locations').getByRole('link', { name: /BLACK BEACON/ })
  ).toBeVisible();
  // The Body select carries the hop with it: one Atlas, entered at whichever Body is listed.
  await expect(page.locator('#placement-hop-link')).toHaveAttribute(
    'href',
    '/damocles/atlas?body=icarus'
  );
  await expect(page.locator('#placement-hop-link')).toHaveText(
    'ICARUS on the Gamma Atlas'
  );
});

test('a structure offers each recovered region as its own inspection form', async ({
  page
}) => {
  await page.goto('/catalogue?instance=eris-surface-87');
  await expect(page.locator('#model-name')).toHaveText('Capital Spaceport');
  const forms = page.locator('#variant option');
  await expect(forms.filter({ hasText: /^Region / })).toHaveCount(12);
  await page.locator('#variant').selectOption('region-0');
  await expect(page.locator('#variant')).toHaveValue('region-0');
  await expect(page.locator('#details')).toContainText('63 faces');
  await expect(page.locator('#viewer-message')).toHaveText('');
  // The region is a real form, so it survives a reload through the query.
  await page.reload();
  await expect(page.locator('#variant')).toHaveValue('region-0');
});

test('an $F0 entrance explains the key letter the cell supplies', async ({
  page
}) => {
  await page.goto('/catalogue?model=structure-01454e');
  await expect(page.locator('#model-name')).toHaveText('Structure 70');
  await expect(page.locator('#details')).toContainText(
    'One entrance takes a key letter from the cell rather than from this record'
  );
  await expect(page.locator('#details')).toContainText('Slot $3EC key index 0');
  await expect(page.locator('#details')).toContainText(
    'VESTA cell 100 installs $7AFB base $22, so the $F0 entrance in slot $3EC carries key letter E at $CD3F.'
  );
});

test('a building detail offers each recovered visibility list as a form', async ({
  page
}) => {
  await page.goto('/catalogue?model=interior-0303d6');
  await expect(page.locator('#model-name')).toHaveText('Building detail 88');
  await expect(page.locator('#details')).toContainText(
    '$053CC2 picks group 2 on foot inside a structure and group 1 otherwise'
  );
  const forms = page.locator('#variant option');
  await expect(forms.filter({ hasText: /^Group / })).toHaveCount(7);
  await expect(forms.filter({ hasText: /^Group 2 · box 1 / })).toHaveCount(0);
  await page.locator('#variant').selectOption('group-0-box-0');
  await expect(
    forms.filter({ hasText: 'Group 1 · box 1 · viewer within' })
  ).toHaveText(/X 200–1000, Y 600–1200, Z 200–800/);
  await expect(page.locator('#details')).toContainText('30 faces');
  await expect(page.locator('#viewer-message')).toHaveText('');
  await page.screenshot({ path: 'test-results/catalogue-detail-form.png' });
  // The list is a real form, so it survives a reload through the query.
  await page.reload();
  await expect(page.locator('#variant')).toHaveValue('group-0-box-0');
});

test('an articulated detail is inspectable in every frame that places it', async ({
  page
}) => {
  await page.goto('/catalogue?model=interior-026556');
  await expect(page.locator('#model-name')).toHaveText('Building detail 7');
  await expect(page.locator('#details')).toContainText(
    'The game selects among these forms by articulation angle ($7888), structure scale ($539CE/$539D2)'
  );
  const forms = page.locator('#variant option');
  // Five structures place this one detail, two of them at a nonuniform scale.
  await expect(forms.filter({ hasText: /^Scale 4×2 · / })).toHaveCount(8);
  await expect(forms.filter({ hasText: /^Scale -4×-2 · / })).toHaveCount(8);
  await page.locator('#variant').selectOption('palette-129-scale-4x2-angle-40');
  await expect(page.locator('#viewer-message')).toHaveText('');
  await page.screenshot({
    path: 'test-results/catalogue-articulated-frame.png'
  });
  // The frame is a real form, so it survives a reload through the query.
  await page.reload();
  await expect(page.locator('#variant')).toHaveValue(
    'palette-129-scale-4x2-angle-40'
  );
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
  // An authored empty is decoded, so it says so rather than claiming a failure.
  await page.goto('/catalogue?model=object-035cfc');
  await expect(page.locator('#model-status')).toContainText('decoded · null');
  await expect(page.locator('#viewer-message')).toContainText('Authored empty');
  await page.goto('/catalogue?model=structure-01a618');
  await expect(page.locator('#model-name')).toHaveText('Structure 100');
  await expect(page.locator('#model-status')).toContainText('decoded · empty');
  await expect(page.locator('#viewer-message')).toContainText('Authored empty');
  await expect(page.locator('#details')).toContainText('Empty surface record');
  await expect(page.locator('#details')).toContainText(
    'intentionally empty record'
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

test('a placement hands off to the Atlas at the Street Range', async ({
  page
}) => {
  await page.goto('/catalogue?instance=eris-surface-89');
  await expect(page.locator('#model-name')).toHaveText('Structure 75');
  // The Catalogue draws no map of its own any more: the section states what was recovered,
  // lists it, and hands the drawing to the Atlas (#415).
  await expect(page.locator('#map')).toHaveCount(0);
  await expect(page.locator('#placement-note')).toHaveText(
    '207 recovered placements · Body Coordinates'
  );
  await expect(page.locator('#locations a')).toHaveCount(207);
  await expect(page.locator('#placement-hop-link')).toHaveAttribute(
    'href',
    '/damocles/atlas?body=eris'
  );
  await page
    .locator('.placements')
    .screenshot({ path: 'test-results/catalogue-placements.png' });

  // The hop itself: this record's own cell, at the band its footprint is drawn in.
  await expect(page.locator('#instance-atlas-link')).toHaveAttribute(
    'href',
    '/damocles/atlas?body=eris&instance=eris-surface-89&x=73.5&z=136.48&span=1'
  );
  await page.locator('#instance-atlas-link').click();
  await expect(page.locator('#title')).toHaveText('Gamma Atlas');
  await expect(page.locator('#system-scale')).toContainText('Street Range');
  await expect(page.locator('#panel')).toContainText('STATE OFFICE', {
    timeout: 30_000
  });
  // Arrived on the footprint itself, selected, with its provenance stated.
  await expect(page.locator('#footprint-derived')).toHaveAttribute(
    'data-source',
    'plan'
  );
  await expect(page.locator('#panel')).toContainText(
    'derived from recovered geometry'
  );
  await page.screenshot({ path: 'test-results/catalogue-atlas-handoff.png' });
  // And the Atlas hands the same record back.
  await expect(page.locator('#footprint-catalogue-link')).toHaveAttribute(
    'href',
    '/catalogue?body=body-11&instance=eris-surface-89'
  );
});

test('the ledger states measured bank extents and the loads behind them', async ({
  page
}) => {
  await page.goto('/catalogue');
  const ledger = page.locator('#ledger');
  // The extents were provisional until #280 measured both of their bounds.
  await expect(ledger).not.toContainText('extent is provisional');
  await expect(ledger).toContainText('378 entries');
  await expect(ledger).toContainText('bounded above, not assumed');
  await expect(ledger).toContainText('the $031700 glyph source table');
  await expect(ledger).toContainText('Pasti STX track inventory');
  await expect(ledger).toContainText(
    'protected sectors are not a second, directly readable model bank'
  );
  await expect(ledger).toContainText('world resident-object stream');
  await expect(ledger).toContainText('Source coverage incomplete');

  // A slot a world binds says so on the record that holds it here.
  await page.goto('/catalogue?model=object-041e7c');
  await expect(page.locator('#details')).toContainText(
    'differ between captured worlds'
  );
  await expect(page.locator('#details')).toContainText('GAEA holds it as');
});

test('reads only the Model it shows, never the whole Catalogue (ADR 0048)', async ({
  page
}) => {
  const models: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/payload/damocles/models/')) {
      models.push(path);
    }
  });
  await page.goto('/catalogue?model=object-035d12');
  await expect(page.locator('#model-name')).toHaveText('DART II');
  await expect(page.locator('#result-count')).toContainText('1241 models');
  expect(models).toEqual(['/payload/damocles/models/object-035d12.json']);
});
