import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    storageCalls: string[];
  }
}

const TARG_RESUME_KEY = 'mercenary.browser-shell.session-resume.v1';
const DAMOCLES_RESUME_KEY =
  'mercenary.browser-shell.damocles.session-resume.v1';

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
  await expect(panel.locator('[data-field=locationLabel]')).toHaveText('07-08');
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
  expect(await frame.getAttribute('data-unresolved')).toBe('21');

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
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
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
