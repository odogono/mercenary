import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    storageCalls: string[];
  }
}

const TARG_RESUME_KEY = 'mercenary.browser-shell.session-resume.v1';
const DAMOCLES_RESUME_KEY =
  'mercenary.browser-shell.damocles.session-resume.v1';
const PREFERENCES_KEY = 'mercenary.browser-shell.preferences.v1';

test('structure faces change at the window, doorway and inside the spaceport', async ({
  page
}, testInfo) => {
  await page.addInitScript(
    key => localStorage.removeItem(key),
    DAMOCLES_RESUME_KEY
  );
  const catalogue = (await (
    await page.request.get('/payload/damocles/catalogue.json')
  ).json()) as {
    instances: { id: string; location: { position: number[] } | null }[];
  };
  const origin = catalogue.instances.find(i => i.id === 'eris-surface-87')!
    .location!.position;
  const counts: number[] = [];
  for (const [name, x, z] of [
    ['window', 700, 0],
    ['doorway', 1400, -1000],
    ['inside', 1200, 0]
  ] as const) {
    await page.route('**/damocles/eris.json', async route => {
      const response = await route.fetch();
      const doc = await response.json();
      doc.start.yaw = name === 'window' ? 768 : 512;
      doc.start.position = {
        x: origin[0]! * 65_536 + x,
        y: 63,
        z: origin[2]! * 65_536 + z
      };
      await route.fulfill({ json: doc });
    });
    await page.goto('/damocles');
    await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready');
    const frame = page.locator('#frame');
    expect(Number(await frame.getAttribute('data-x'))).toBe(
      origin[0]! * 65_536 + x
    );
    counts.push(Number(await frame.getAttribute('data-triangles')));
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
    await page.evaluate(
      key => localStorage.removeItem(key),
      DAMOCLES_RESUME_KEY
    );
    await page.unroute('**/damocles/eris.json');
  }
  expect(new Set(counts).size).toBe(3);
});

test('the spaceport and current-cell structures use recovered selector behavior', async ({
  page
}) => {
  await page.addInitScript(
    key => localStorage.removeItem(key),
    DAMOCLES_RESUME_KEY
  );
  const catalogue = (await (
    await page.request.get('/payload/damocles/catalogue.json')
  ).json()) as {
    instances: {
      id: string;
      location: { position: number[] } | null;
    }[];
  };
  const originOf = (id: string) =>
    catalogue.instances.find(instance => instance.id === id)!.location!
      .position;
  const startAt = async (
    instanceId: string,
    x: number,
    z: number,
    yaw: number
  ) => {
    const origin = originOf(instanceId);
    await page.route('**/damocles/eris.json', async route => {
      const response = await route.fetch();
      const doc = await response.json();
      doc.start.yaw = yaw;
      doc.start.position = {
        x: origin[0]! * 65_536 + x,
        y: 63,
        z: origin[2]! * 65_536 + z
      };
      await route.fulfill({ json: doc });
    });
    await page.goto('/damocles');
    await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready');
    return origin;
  };

  const frame = page.locator('#frame');
  const spaceport = await startAt('eris-surface-87', 1400, -1300, 512);
  await expect(frame).toHaveAttribute('data-attachment-open-units', '0');
  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () =>
      Number(await frame.getAttribute('data-attachment-open-units'))
    )
    .toBeGreaterThan(0);
  await page.keyboard.up('ArrowUp');
  await expect
    .poll(async () =>
      Number(await frame.getAttribute('data-attachment-open-units'))
    )
    .toBe(92);
  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () => Number(await frame.getAttribute('data-z')))
    .toBeGreaterThan(spaceport[2]! * 65_536 - 740);
  await page.keyboard.up('ArrowUp');
  await page.unroute('**/damocles/eris.json');

  const windowOrigin = await startAt('eris-surface-87', 700, 0, 768);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowUp');
  expect(Number(await frame.getAttribute('data-x'))).toBeLessThan(
    windowOrigin[0]! * 65_536 + 840
  );
  await page.unroute('**/damocles/eris.json');

  const other = await startAt('eris-surface-52', -130, -150, 512);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(700);
  const otherZ = Number(await frame.getAttribute('data-z'));
  expect(otherZ).toBeGreaterThan(other[2]! * 65_536 - 150);
  expect(otherZ).toBeLessThan(other[2]! * 65_536 - 100);
  await page.keyboard.up('ArrowUp');
  await page.unroute('**/damocles/eris.json');

  const office = await startAt('eris-surface-89', 330, -100, 1280);
  await expect(frame).toHaveAttribute(
    'data-structure-instance',
    'eris-surface-89'
  );
  await expect
    .poll(async () =>
      Number(await frame.getAttribute('data-attachment-open-units'))
    )
    .toBe(52);
  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () => Number(await frame.getAttribute('data-x')))
    .toBeLessThan(office[0]! * 65_536 + 280);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowDown');
  await expect
    .poll(async () => Number(await frame.getAttribute('data-x')))
    .toBeGreaterThan(office[0]! * 65_536 + 520);
  await page.keyboard.up('ArrowDown');
  await expect
    .poll(async () =>
      Number(await frame.getAttribute('data-attachment-open-units'))
    )
    .toBe(0);
  await page.unroute('**/damocles/eris.json');
});

test('Enhanced sunlight reaches the floor through the spaceport window', async ({
  page
}, testInfo) => {
  await page.addInitScript(
    ({ preferences, resume }) => {
      localStorage.removeItem(resume);
      localStorage.setItem(
        preferences,
        JSON.stringify({ presentationPreset: 'enhanced' })
      );
    },
    { preferences: PREFERENCES_KEY, resume: DAMOCLES_RESUME_KEY }
  );
  const catalogue = (await (
    await page.request.get('/payload/damocles/catalogue.json')
  ).json()) as {
    instances: { id: string; location: { position: number[] } | null }[];
  };
  const origin = catalogue.instances.find(i => i.id === 'eris-surface-87')!
    .location!.position;
  await page.route('**/damocles/eris.json', async route => {
    const response = await route.fetch();
    const doc = await response.json();
    doc.start.yaw = 256;
    doc.start.position = {
      x: origin[0]! * 65_536 + 1300,
      y: 63,
      z: origin[2]! * 65_536
    };
    await route.fulfill({ json: doc });
  });

  await page.goto('/damocles');
  const frame = page.locator('#frame');
  await expect(frame).toHaveAttribute('data-state', 'ready');
  const luminanceOf = (capture: Buffer) =>
    page.evaluate(
      async source => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const region = (top: number, bottom: number): number => {
          const x = Math.floor(image.width * 0.25);
          const y = Math.floor(image.height * top);
          const width = Math.floor(image.width * 0.5);
          const height = Math.floor(image.height * (bottom - top));
          const pixels = context.getImageData(x, y, width, height).data;
          let sum = 0;
          for (let offset = 0; offset < pixels.length; offset += 4) {
            sum +=
              pixels[offset]! * 0.2126 +
              pixels[offset + 1]! * 0.7152 +
              pixels[offset + 2]! * 0.0722;
          }
          return sum / (pixels.length / 4);
        };
        // At the documented inside-west pose, the higher band is the far floor under the
        // roof; the lower band is the nearer floor reached by the west-window beam.
        return {
          roofShadowedFloor: region(0.67, 0.7),
          windowLitFloor: region(0.75, 0.79)
        };
      },
      `data:image/png;base64,${capture.toString('base64')}`
    );
  const capture = await frame.screenshot();
  await testInfo.attach('damocles-enhanced-window-light', {
    body: capture,
    contentType: 'image/png'
  });
  const luminance = await luminanceOf(capture);
  expect(luminance.windowLitFloor).toBeGreaterThan(
    luminance.roofShadowedFloor + 15
  );

  await page.keyboard.press('Escape');
  await page.locator('button[data-goto="settings"]').click();
  await page.locator('[data-setting="sky"] button[value="authentic"]').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-layer',
    'none'
  );
  await expect
    .poll(async () => {
      const authentic = await luminanceOf(await frame.screenshot());
      return Math.abs(authentic.windowLitFloor - authentic.roofShadowedFloor);
    })
    .toBeLessThan(1);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.storageCalls = [];
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      window.storageCalls.push(`setItem:${key}`);
      setItem.call(this, key, value);
    };
  });
});

test('/damocles boots the Damocles Gameplay Session on foot at Eris Capital Spaceport', async ({
  page
}, testInfo) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.goto('/damocles/');
  await expect(page).toHaveURL(/\/damocles$/);
  await expect(page.locator('html')).toHaveAttribute('data-title', 'damocles');
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#frame')).toBeVisible();
  await expect(page.locator('#status')).toBeHidden();
  await expect(page.getByRole('alert')).toBeHidden();

  expect(requests).toContain('/payload/damocles/catalogue.json');
  expect(requests).toContain('/damocles/eris.json');
  expect(requests).not.toContain('/payload/manifest.json');
  expect(requests).not.toContain('/payload/world.json');
  expect(requests).not.toContain('/settings.json');
  expect(requests).not.toContain('/src/shell/boot.ts');

  const panel = page.locator('#panel-damocles');
  await expect(panel.locator('[data-field=locationName]')).toHaveText('ERIS');
  // The original's lower navigation row reads body coordinates, then the cell, then altitude.
  await expect(panel.locator('[data-field=bodyCoordinates]')).toHaveText(
    '016-283'
  );
  await expect(panel.locator('[data-field=locationLabel]')).toHaveText('07-08');
  // Pinned in document order: the readouts once sat in the wrong windows, which asserting
  // each field's value alone cannot catch.
  expect(
    await panel
      .locator('.nav-row [data-field]')
      .evaluateAll(nodes => nodes.map(node => node.dataset['field']))
  ).toEqual([
    'locationName',
    'speedLabel',
    'bodyCoordinates',
    'locationLabel',
    'altitude'
  ]);
  await expect(panel.locator('[data-field=inventory]')).toHaveText('EMPTY');
  await expect(panel.locator('[data-field=speedLabel]')).toHaveText(
    '+ 000 000 000'
  );
  await expect(panel.locator('.aux-title')).toHaveText('DAMOCLES');
  const frame = page.locator('#frame');
  expect(await frame.getAttribute('data-cell')).toBe('7-8');
  expect(Number(await frame.getAttribute('data-triangles'))).toBeGreaterThan(
    1000
  );
  expect(await frame.getAttribute('data-unresolved')).toBe('19');

  await testInfo.attach('damocles-start', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });
});

test('the arrow keys walk the player and the Session Resume is Damocles-only', async ({
  page
}) => {
  await page.goto('/damocles');
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready');
  const frame = page.locator('#frame');
  const startX = Number(await frame.getAttribute('data-x'));
  const startZ = Number(await frame.getAttribute('data-z'));
  const startHeading = Number(await frame.getAttribute('data-heading'));
  const triangles = await frame.getAttribute('data-triangles');

  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () => {
      const x = Number(await frame.getAttribute('data-x'));
      const z = Number(await frame.getAttribute('data-z'));
      return Math.hypot(x - startX, z - startZ);
    })
    .toBeGreaterThan(100);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowRight');
  await expect
    .poll(async () => Number(await frame.getAttribute('data-heading')))
    .not.toBeCloseTo(startHeading, 3);
  await page.keyboard.up('ArrowRight');
  // Every placement is drawn from wherever the player stands.
  expect(await frame.getAttribute('data-triangles')).toBe(triangles);

  // Blur suspends and writes the resume; a reload lands where the player stood.
  const walkedX = Number(await frame.getAttribute('data-x'));
  const walkedZ = Number(await frame.getAttribute('data-z'));
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide'))
  );
  const calls = await page.evaluate(() => window.storageCalls);
  expect(calls).toContain(`setItem:${DAMOCLES_RESUME_KEY}`);
  expect(calls).not.toContain(`setItem:${TARG_RESUME_KEY}`);
  expect(
    await page.evaluate(
      key => window.localStorage.getItem(key),
      TARG_RESUME_KEY
    )
  ).toBeNull();

  await page.reload();
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready');
  expect(Number(await frame.getAttribute('data-x'))).toBeCloseTo(walkedX, 3);
  expect(Number(await frame.getAttribute('data-z'))).toBeCloseTo(walkedZ, 3);
});

test('R latches running, which lights the lamp and lengthens the step', async ({
  page
}) => {
  await page.goto('/damocles');
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready');
  const frame = page.locator('#frame');
  const lamp = page.locator('#panel-damocles [data-lamp=runLamp]');

  // One leg of the same held walk, so the two are compared over equal frames.
  const leg = async (): Promise<number> => {
    const fromX = Number(await frame.getAttribute('data-x'));
    const fromZ = Number(await frame.getAttribute('data-z'));
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowUp');
    return Math.hypot(
      Number(await frame.getAttribute('data-x')) - fromX,
      Number(await frame.getAttribute('data-z')) - fromZ
    );
  };

  await expect(lamp).not.toHaveClass(/on/);
  const walked = await leg();

  await page.keyboard.press('KeyR');
  await expect(lamp).toHaveClass(/on/);
  const ran = await leg();
  // Exact-VBL Working Authority traces recover a $50 run update against a
  // $30 walk update (5/3); the bounds allow browser-timed leg variation.
  expect(ran).toBeGreaterThan(walked * 1.4);
  expect(ran).toBeLessThan(walked * 1.9);

  // The toggle outlasts the key, and a second press puts it back.
  await expect(lamp).toHaveClass(/on/);
  await page.keyboard.press('KeyR');
  await expect(lamp).not.toHaveClass(/on/);
  expect(await leg()).toBeLessThan(ran * 0.75);
});

test('a long walk crosses into the neighbouring cell', async ({ page }) => {
  await page.goto('/e2e/damocles-fixture.html');
  await expect(page.locator('#result')).not.toHaveText('loading');
  const text = await page.locator('#result').textContent();
  expect(text).not.toContain('error');
  const result = JSON.parse(text!) as {
    after: string;
    before: string;
    elapsed: number;
  };
  expect(result.before).toBe('07-08');
  expect(result.after).toBe('06-08');
  expect(result.elapsed).toBeGreaterThan(90);
});

test('the System Menu, Saves, New Game and Shell Console are on /damocles', async ({
  page
}) => {
  await page.goto('/damocles');
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready');
  const surface = page.locator('#game-surface');
  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'menu');
  await expect(page.getByRole('dialog', { name: 'System Menu' })).toBeVisible();
  await expect(page.locator('#page-menu .chrome-title')).toHaveText('DAMOCLES');
  await page.locator('button[data-goto="settings"]').click();
  await expect(surface).toHaveAttribute('data-layer', 'settings');
  await page.locator('[data-setting="rendition"] button[value="targ"]').click();
  await expect(page.locator('#panel-damocles')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'menu');
  await page.locator('button[data-goto="saves"]').click();
  await expect(surface).toHaveAttribute('data-layer', 'saves');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'none');
  await page.keyboard.press('`');
  const input = page.locator('#console-input');
  await expect(input).toBeFocused();
  await input.fill('goto 3 4');
  await input.press('Enter');
  await expect(page.locator('#frame')).toHaveAttribute('data-cell', '3-4');
  await input.fill('goto room 3');
  await input.press('Enter');
  await expect(page.locator('#console-log')).toContainText('no Rooms');
  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-console', 'closed');
  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'menu');
  await page.locator('button[data-goto="saves"]').click();
  await page.locator('[data-slot="1"] button[data-action="save"]').click();
  await expect(page.locator('[data-slot="1"] .slot-detail')).toContainText(
    'ERIS 03-04'
  );
  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'menu');
  await page.getByRole('button', { name: 'NEW GAME' }).click();
  await page.getByRole('button', { name: 'CONFIRM NEW GAME' }).click();
  await expect(page.locator('#frame')).toHaveAttribute('data-cell', '7-8');
  expect(
    await page.evaluate(
      () =>
        window.localStorage.getItem(
          'mercenary.browser-shell.damocles.save.v1.slot-1'
        ) !== null
    )
  ).toBe(true);
  await page.keyboard.press('Escape');
  await page.locator('button[data-goto="saves"]').click();
  await page.locator('[data-slot="1"] button[data-action="load"]').click();
  await expect(page.locator('#frame')).toHaveAttribute('data-cell', '3-4');
});

test('a malformed presentation document blocks the Damocles boot', async ({
  page
}) => {
  await page.route('**/damocles/eris.json', route =>
    route.fulfill({
      body: '{"schemaVersion":1}',
      contentType: 'application/json'
    })
  );
  await page.goto('/damocles');
  await expect(page.getByRole('alert')).toContainText('/damocles/eris.json');
  await expect(page.getByRole('alert')).toContainText('missing field');
  await expect(page.locator('#frame')).toBeHidden();
});
