import { expect, test, type Page } from '@playwright/test';

/// The Gamma Atlas's research search (#453): find a recovered record, inspect its known
/// placements, and share the investigation.

const results = (page: Page) => page.locator('#search-results li');

const search = async (page: Page, q: string) => {
  await page.locator('#search-q').fill(q);
  await expect(page.locator('#search-status')).not.toContainText(
    'reading the Catalogue'
  );
};

test('a Model found by name lists every recorded occurrence, and chooses none', async ({
  page
}) => {
  await page.goto('/damocles/atlas');
  await expect(page.locator('#status')).toContainText('markers');
  await search(page, 'black beacon');
  // Duplicate names stay apart: every line carries its type and its own record id.
  const lines = await results(page).allInnerTexts();
  expect(lines.length).toBe(9);
  const ids = lines.map(line => /(object-[\da-z-]+)/.exec(line)?.[1]);
  expect(new Set(ids).size).toBe(9);
  await expect(page).toHaveURL(/\?q=black\+beacon$/);

  await page
    .locator('#search-results a.search-result', { hasText: /^BLACK BEACON$/ })
    .click();
  await expect(page).toHaveURL(/model=object-03e2c6/);
  const model = page.locator('#search-model');
  await expect(model.locator('h3')).toHaveText('Model · BLACK BEACON');
  await expect(model.locator('h4')).toHaveCount(8);
  await expect(model.locator('a.search-result')).toHaveCount(8);
  // Nothing was chosen for the reader: the map is still the System Range.
  await expect(page.locator('#range-system')).toBeVisible();
});

test('choosing an object locates it with a marker, and Back restores the search', async ({
  page
}) => {
  await page.goto('/damocles/atlas?q=black+beacon&model=object-03e2c6');
  const first = page.locator('#search-model a.search-result').first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page).toHaveURL(
    /body=icarus&instance=object-slot-164&.*span=1&q=black\+beacon&model=object-03e2c6/
  );
  await expect(page.locator('#system-scale')).toContainText('Street Range');
  const heading = page.locator('#instance-heading');
  await expect(heading).toHaveText('BLACK BEACON · slot 164');
  await expect(heading).toHaveAttribute('data-absence', 'object');
  await expect(page.locator('#panel')).toContainText('Catalogue placement');
  await expect(page.locator('#panel')).toContainText(
    'It is not its live Object Residence'
  );
  // The search section survived the hop.
  await expect(page.locator('#search-q')).toHaveValue('black beacon');
  await expect(page.locator('#search-model h3')).toHaveText(
    'Model · BLACK BEACON'
  );

  await page.goBack();
  await expect(page).toHaveURL(/\?q=black\+beacon&model=object-03e2c6$/);
  await expect(page.locator('#range-system')).toBeVisible();
  await expect(page.locator('#search-q')).toHaveValue('black beacon');

  await page.reload();
  await expect(page.locator('#search-q')).toHaveValue('black beacon');
  await expect(page.locator('#search-model a.search-result')).toHaveCount(8);
});

test('a structure with no outline keeps its identity and marker; a footprint still selects', async ({
  page
}) => {
  await page.goto(
    '/damocles/atlas?body=eris&instance=eris-surface-33&x=2560&z=3584&span=1'
  );
  const heading = page.locator('#instance-heading');
  await expect(heading).toHaveAttribute('data-absence', 'gap', {
    timeout: 20_000
  });
  await expect(page.locator('#panel')).toContainText(
    'recovered neither an exterior nor a plan'
  );

  // Capital Spaceport has a footprint, so the existing footprint panel answers for it.
  await page.goto('/damocles/atlas?q=eris-surface-87&kind=instance');
  await page.locator('#search-results a.search-result').click();
  await expect(page.locator('#footprint-derived')).toHaveAttribute(
    'data-source',
    'exterior',
    { timeout: 20_000 }
  );
  await expect(page.locator('#instance-heading')).toHaveCount(0);
});

test('parent-local and unlocated Instances are never given a map position', async ({
  page
}) => {
  await page.goto("/damocles/atlas?q=author's+chair&kind=instance");
  const chair = results(page).filter({ hasText: 'object-slot-14' });
  await expect(chair).toContainText('at a position local to it');
  await expect(chair.locator('a.search-result')).toHaveCount(0);
  await expect(chair.locator('a.search-catalogue')).toHaveAttribute(
    'href',
    '/catalogue?instance=object-slot-14'
  );

  // A deep link naming one clears itself rather than inventing a location.
  await page.goto(
    '/damocles/atlas?body=dion&instance=object-slot-14&x=100&z=100&span=1'
  );
  await expect(page.locator('#system-scale')).toContainText('Range');
  await expect(page).not.toHaveURL(/instance=/, { timeout: 20_000 });
  await expect(page.locator('#instance-heading')).toHaveCount(0);
});

test('a coastline-less Settlement and a Place are both locatable', async ({
  page
}) => {
  await page.goto('/damocles/atlas?q=takoushi&kind=settlement');
  await page.locator('#search-results a.search-result').click();
  await expect(page).toHaveURL(
    /body=icarus&settlement=island-icarus-063150&x=632&z=696&span=28/
  );
  await expect(page.locator('#system-scale')).toContainText('Settlement Range');
  await expect(page.locator('#settlement-heading')).toHaveText(
    'Settlement · TAKOUSHI BASE'
  );
  await expect(page.locator('#panel')).toContainText(
    'none recovered on the record carrying it'
  );

  await page.goto('/damocles/atlas?q=capital+spaceport&kind=place');
  await page.locator('#search-results a.search-result').click();
  await expect(page).toHaveURL(/body=eris&place=place-025042/);
  await expect(page.locator('#panel')).toContainText(
    'Place · CAPITAL SPACEPORT'
  );
});

test('the searched Body is not the Body on screen', async ({ page }) => {
  await page.goto('/damocles/atlas?body=icarus&q=beacon&searchBody=eris');
  await expect(page.locator('#breadcrumb-body')).toHaveText('ICARUS');
  await expect(page.locator('#search-body')).toHaveValue('eris');
  await expect(page.locator('#search-status')).toContainText('on ERIS');
  for (const line of await results(page).allInnerTexts()) {
    expect(line).toContain('ERIS');
  }
  await page.locator('#search-kind').selectOption('model');
  await expect(page).toHaveURL(/kind=model/);
  await expect(page).toHaveURL(/body=icarus/);
});

test('search and the map share one Catalogue request, and a failed one can be retried', async ({
  page
}) => {
  let requests = 0;
  let refuse = true;
  await page.route('**/payload/damocles/catalogue.json', async route => {
    requests += 1;
    await (refuse
      ? route.fulfill({ body: 'gone', status: 503 })
      : route.continue());
  });
  await page.goto('/damocles/atlas');
  await expect(page.locator('#status')).toContainText('markers');
  await page.locator('#search-q').fill('eris');
  await expect(page.locator('#search-status')).toContainText(
    'could not be read'
  );
  // Bodies are still searched without the Catalogue.
  await expect(results(page)).toHaveCount(1);
  refuse = false;
  await page.locator('#search-retry').click();
  await expect(page.locator('#search-retry')).toBeHidden();
  await expect(page.locator('#search-status')).toContainText('results');
  expect(requests).toBe(2);

  // Entering a Body reuses what the search already read.
  await page.locator('#search-results a.search-result').first().click();
  await expect(page.locator('#breadcrumb-body')).toHaveText('ERIS');
  await expect(page.locator('#status')).toContainText('recovered island');
  expect(requests).toBe(2);
});

test('the search is usable from the keyboard alone, on a narrow screen', async ({
  page
}) => {
  await page.setViewportSize({ height: 860, width: 420 });
  await page.goto('/damocles/atlas');
  await page.locator('#search-q').focus();
  await page.keyboard.type('capital city');
  await expect(page.locator('#search-status')).toContainText('result');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveText('CAPITAL CITY');
  await page.keyboard.press('Enter');
  await expect(page.locator('#settlement-heading')).toHaveText(
    'Settlement · CAPITAL CITY'
  );
});
