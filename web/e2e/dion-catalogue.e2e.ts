import { expect, test } from '@playwright/test';

test('Catalogue routing, filters, previews and host Floor navigation stay sessionless', async ({
  page,
  request
}) => {
  const response = await request.get('/dion/catalogue/?id=object-030', {
    maxRedirects: 0
  });
  expect(response.status()).toBe(308);
  expect(response.headers()['location']).toContain(
    '/dion/catalogue?id=object-030'
  );
  const paths: string[] = [];
  page.on('request', r => paths.push(new URL(r.url()).pathname));
  await page.addInitScript(() => {
    const operations: string[] = [];
    Object.defineProperty(window, 'catalogueStorageOperations', {
      value: operations
    });
    for (const method of [
      'getItem',
      'setItem',
      'removeItem',
      'clear',
      'key'
    ] as const) {
      const original = Storage.prototype[method];
      Object.defineProperty(Storage.prototype, method, {
        value(...args: string[]) {
          operations.push(`${method}:${args[0] ?? ''}`);
          return Reflect.apply(original, this, args);
        }
      });
    }
  });
  await page.goto('/dion/catalogue?id=object-030');
  await expect(page.locator('#entry-name')).toHaveText('DOOR KEY A');
  await expect(page.locator('#view')).toHaveAttribute(
    'data-primitives',
    /^[1-9]\d*$/
  );
  await page.locator('#host-link').click();
  await expect(page).toHaveURL(/id=placement-02-03.*floor=4/);
  await expect(page.locator('#floor')).toHaveValue('4');
  await expect(page.locator('#details')).toContainText('base height 600');
  await expect(page.locator('#view')).toHaveAttribute(
    'data-primitives',
    /^[1-9]\d*$/
  );
  await page
    .locator('#details')
    .getByRole('link', { exact: true, name: 'DOOR KEY A' })
    .click();
  await page.goBack();
  await expect(page.locator('#floor')).toHaveValue('4');
  await page.locator('#details a[href*="variant="]').click();
  await page.locator('#details a[href*="id=placement-02-03"]').click();
  await expect(page.locator('#floor')).toHaveValue('4');
  await page.locator('#kind').selectOption('object');
  await page.locator('#search').fill('SUPERPERSON SUIT');
  await expect(page.locator('#result-count')).toContainText('1 of');
  await page
    .getByRole('button', { exact: true, name: 'Clear filters' })
    .click();
  await page.locator('#group').selectOption('1');
  await expect(page.locator('#results')).toContainText('unused');
  await page.locator('#group').selectOption('');
  await page.locator('#search').fill('no such name');
  await expect(page.locator('#results')).toContainText('No matching entries');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { catalogueStorageOperations: string[] })
          .catalogueStorageOperations
    )
  ).toEqual([]);
  expect(
    paths.filter(
      p =>
        p.startsWith('/payload/') && !p.startsWith('/payload/dion/catalogue/')
    )
  ).toEqual([]);
  expect(
    paths.some(p => /\/(session|save|resume|script|title)\.ts$/.test(p))
  ).toBe(false);
});

test('MIDAS, LOGOS, carried entries and unknown links explain their dispositions', async ({
  page
}) => {
  await page.goto('/dion/catalogue?id=object-101');
  await page.locator('#host-link').click();
  await expect(page.locator('#field-reference')).toContainText('56:69');
  await expect(page.locator('#details')).toContainText('2122, 3632');
  await page.locator('#field-x').fill('9');
  await page.locator('#field-z').fill('6');
  await page.getByRole('button', { name: 'Inspect occurrence' }).click();
  await expect(page).toHaveURL(/fieldX=9.*fieldZ=6/);
  await page.goto('/dion/catalogue?id=placement-08-32');
  await expect(page.locator('#preview-message')).toContainText('LOGOS initial');
  await page.locator('#state').selectOption('constructed');
  await expect(page).toHaveURL(/state=constructed/);
  await expect(page.locator('#view')).toHaveAttribute(
    'data-primitives',
    /^[1-9]\d*$/
  );
  await page.reload();
  await expect(page.locator('#state')).toHaveValue('constructed');
  await page.goto('/dion/catalogue?id=object-104');
  await expect(page.locator('#details')).toContainText(
    'No physical coordinates'
  );
  await expect(page.locator('#host-link')).toHaveCount(0);
  await page.goto('/dion/catalogue?id=absent');
  await expect(page.locator('#entry-name')).toHaveText('Entry not found');
});

test('invalid payloads and missing geometry give useful diagnostics and can retry', async ({
  page
}) => {
  await page.route('**/payload/dion/catalogue/catalogue.json', route =>
    route.fulfill({
      body: '{"kind":"damocles-catalogue"}',
      contentType: 'application/json'
    })
  );
  await page.goto('/dion/catalogue');
  await expect(page.locator('#failure')).toBeVisible();
  await expect(page.locator('#failure-message')).toContainText(
    '/payload/dion/catalogue/catalogue.json'
  );
  await page.unroute('**/payload/dion/catalogue/catalogue.json');
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await expect(page.locator('#catalogue')).toBeVisible();
  await page.route(
    '**/payload/dion/catalogue/geometry/model-02edd6.json',
    route => route.fulfill({ body: 'not found', status: 404 })
  );
  await page.goto('/dion/catalogue?id=object-001');
  await expect(page.locator('#preview-message')).toContainText(
    'model-02edd6.json: HTTP 404'
  );
  await page.unroute('**/payload/dion/catalogue/geometry/model-02edd6.json');
  await page.getByRole('button', { name: 'Retry preview' }).click();
  await expect(page.locator('#view')).toHaveAttribute(
    'data-primitives',
    /^[1-9]\d*$/
  );
});
