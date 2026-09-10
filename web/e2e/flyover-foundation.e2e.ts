import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    storageCalls: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.storageCalls = [];
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      window.storageCalls.push(`getItem:${key}`);
      return getItem.call(this, key);
    };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      window.storageCalls.push(`setItem:${key}`);
      setItem.call(this, key, value);
    };
    const removeItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key: string) {
      window.storageCalls.push(`removeItem:${key}`);
      removeItem.call(this, key);
    };
    const clear = Storage.prototype.clear;
    Storage.prototype.clear = function () {
      window.storageCalls.push('clear:');
      clear.call(this);
    };
  });
});

test('Targ and Gamma boot through the isolated Flyover document', async ({
  page
}) => {
  for (const path of ['/targ/debug', '/damocles/debug']) {
    const requests: string[] = [];
    page.on('request', request =>
      requests.push(new URL(request.url()).pathname)
    );
    await page.goto(path);
    await expect(page.getByRole('status')).toContainText(
      'renderer is not yet available'
    );
    await expect(page.getByRole('alert')).toBeHidden();
    expect(requests).not.toContain('/src/shell/boot.ts');
    expect(requests).not.toContain('/payload/world.json');
    expect(await page.evaluate(() => window.storageCalls)).toEqual([]);
  }
});

test('aliases canonicalise and a malformed document blocks startup', async ({
  page
}) => {
  await page.goto('/debug/?body=targ');
  await expect(page).toHaveURL(/\/targ\/debug\?body=targ$/);

  await page.route('**/flyover/targ.json', route =>
    route.fulfill({
      body: '{"schemaVersion":1}',
      contentType: 'application/json'
    })
  );
  await page.goto('/targ/debug');
  await expect(page.getByRole('alert')).toContainText('/flyover/targ.json');
  await expect(page.getByRole('alert')).toContainText('systemId');
  await expect(page.getByRole('status')).toBeHidden();
});

test('the HTTP boundary keeps documents separate from missing resources', async ({
  request
}) => {
  const rejected = await request.post('/payload/manifest.json');
  expect(rejected.status()).toBe(405);
  expect(rejected.headers()['allow']).toBe('GET, HEAD');

  const head = await request.head('/damocles/debug');
  expect(head.status()).toBe(200);
  expect(await head.body()).toHaveLength(0);

  const alias = await request.get('/catalogue.html?q=ship', {
    maxRedirects: 0
  });
  expect(alias.status()).toBe(308);
  const aliasLocation = new URL(alias.headers()['location']!);
  expect(`${aliasLocation.pathname}${aliasLocation.search}`).toBe(
    '/catalogue?q=ship'
  );

  const unknown = await request.get('/future-title?body=targ', {
    maxRedirects: 0
  });
  expect(unknown.status()).toBe(302);
  expect(new URL(unknown.headers()['location']!).pathname).toBe('/');

  expect((await request.get('/missing.css')).status()).toBe(404);
  expect((await request.get('/payload/damocles/missing.json')).status()).toBe(
    404
  );
});
