import { expect, test } from '@playwright/test';

import { ready } from './damocles-play.ts';

test('menu opens at the player; a pin travels across Bodies once', async ({
  page
}) => {
  await page.goto('/damocles');
  await ready(page);
  await page.keyboard.press('Escape');
  const heading = Number(
    await page.locator('#frame').getAttribute('data-heading')
  );
  await page.locator('#menu-atlas').click();
  await expect(page).toHaveURL(/\/damocles\/atlas\?body=eris/);
  await expect(page.locator('#atlas-player')).toBeVisible();
  await expect(page.locator('.player-cone')).toBeVisible();
  expect(
    await page
      .locator('#atlas-player')
      .evaluate(element => element.style.getPropertyValue('--heading'))
  ).toBe(`${heading}rad`);
  await expect(page.locator('#return-game')).toBeVisible();
  await page.goto(
    '/damocles/atlas?body=vesta&x=1087.1&z=313.1&span=1&pinBody=vesta&pinX=1087.1&pinZ=313.1'
  );
  await page.locator('#atlas-pin').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Travel Here' }).click();
  await ready(page);
  await expect(page.locator('#frame')).toHaveAttribute('data-body', 'body-14');
  await expect(page).toHaveURL('/damocles');
  await page.reload();
  await ready(page);
  await expect(page.locator('#frame')).toHaveAttribute('data-body', 'body-14');
});

test('console opens the atlas and Return to Game preserves the position', async ({
  page
}) => {
  await page.goto('/damocles');
  await ready(page);
  const x = await page.locator('#frame').getAttribute('data-x');
  await page.keyboard.press('`');
  await page.locator('#console-input').fill('atlas');
  await page.locator('#console-input').press('Enter');
  await expect(page.locator('#atlas-player')).toBeVisible();
  await page.locator('#return-game').click();
  await ready(page);
  await expect(page.locator('#frame')).toHaveAttribute('data-x', x!);
});

const pinnedVesta =
  '/damocles/atlas?body=vesta&x=1087.1&z=313.1&span=1&pinBody=vesta&pinX=1087.1&pinZ=313.1';

test('a direct atlas visit starts play only when no resume exists', async ({
  page
}) => {
  await page.goto(pinnedVesta);
  await page.locator('#travel-here').click();
  await ready(page);
  await expect(page.locator('#frame')).toHaveAttribute('data-body', 'body-14');
});

test('an invalid resume is preserved and requires explicit recovery', async ({
  page
}) => {
  await page.goto(pinnedVesta);
  await page.evaluate(() =>
    localStorage.setItem(
      'mercenary.browser-shell.damocles.session-resume.v1',
      'invalid resume'
    )
  );
  await page.locator('#travel-here').click();
  await ready(page);
  await expect(page.locator('#status')).toContainText('Restore a valid Save');
  expect(
    await page.evaluate(() =>
      localStorage.getItem('mercenary.browser-shell.damocles.session-resume.v1')
    )
  ).toBe('invalid resume');
  await page.reload();
  await ready(page);
  await expect(page.locator('#status')).toContainText('Restore a valid Save');
  expect(
    await page.evaluate(() =>
      localStorage.getItem('mercenary.browser-shell.damocles.session-resume.v1')
    )
  ).toBe('invalid resume');
});

test('tapping replaces the pin, positions its marker, and survives reload; dragging only pans', async ({
  page
}) => {
  await page.goto(pinnedVesta);
  const map = page.locator('#range-body');
  const bounds = (await map.boundingBox())!;
  await map.click({
    position: { x: bounds.width * 0.6, y: bounds.height * 0.6 }
  });
  const url = new URL(page.url());
  const x = Number(url.searchParams.get('pinX'));
  expect(x).toBeCloseTo(1087.2, 2);
  const pin = (await page.locator('#atlas-pin').boundingBox())!;
  expect(pin.x + pin.width / 2).toBeCloseTo(
    bounds.x + 1 + bounds.width * 0.6,
    0
  );
  expect(pin.y + pin.height / 2).toBeCloseTo(
    bounds.y + 1 + bounds.height * 0.6,
    0
  );
  await page.reload();
  await expect(page.locator('#atlas-pin')).toBeVisible();
  await page.mouse.move(bounds.x + 30, bounds.y + 30);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 100, bounds.y + 100, { steps: 5 });
  await page.mouse.up();
  expect(Number(new URL(page.url()).searchParams.get('pinX'))).toBe(x);
  await page.locator('#atlas-pin').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#pin-menu-travel')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#atlas-pin')).toBeFocused();
});

test('sea travel is refused without moving the resumed player', async ({
  page
}) => {
  await page.goto('/damocles');
  await ready(page);
  const x = await page.locator('#frame').getAttribute('data-x');
  await page.goto('/damocles/atlas?body=eris&pinBody=eris&pinX=0&pinZ=0');
  await page.locator('#travel-here').click();
  await ready(page);
  await expect(page.locator('#status')).toContainText('at sea');
  await expect(page.locator('#frame')).toHaveAttribute('data-x', x!);
});

test('failed arrival persistence retains the original resume and position', async ({
  page
}) => {
  await page.goto('/damocles');
  await ready(page);
  await page.keyboard.press('Escape');
  const x = await page.locator('#frame').getAttribute('data-x');
  const original = await page.evaluate(() =>
    localStorage.getItem('mercenary.browser-shell.damocles.session-resume.v1')
  );
  await page.goto(pinnedVesta);
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'mercenary.browser-shell.damocles.session-resume.v1') {
        throw new Error('test quota failure');
      }
      return setItem.call(this, key, value);
    };
  });
  await page.locator('#travel-here').click();
  await ready(page);
  await expect(page.locator('#status')).toContainText(
    'Arrival could not be saved'
  );
  await expect(page.locator('#frame')).toHaveAttribute('data-x', x!);
  expect(
    await page.evaluate(() =>
      localStorage.getItem('mercenary.browser-shell.damocles.session-resume.v1')
    )
  ).toBe(original);
});

test('checkpoint failure keeps the game open instead of abandoning it', async ({
  page
}) => {
  await page.goto('/damocles');
  await ready(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new Error('test quota failure');
    };
  });
  await page.keyboard.press('Escape');
  await page.locator('#menu-atlas').click();
  await expect(page.locator('#status')).toContainText('Atlas could not open');
  await expect(page).toHaveURL('/damocles');
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready');
});

test('a travel request waits for ownership before applying to the resumed session', async ({
  context,
  page
}) => {
  await page.goto('/damocles');
  await ready(page);
  const atlas = await context.newPage();
  await atlas.goto(pinnedVesta);
  await atlas.locator('#travel-here').click();
  await expect(atlas.locator('#page-ownership')).toBeVisible();
  await expect(atlas.locator('#frame')).toHaveAttribute('data-body', 'body-11');
  await atlas.locator('#take-over').click();
  await expect(atlas.locator('#frame')).toHaveAttribute('data-body', 'body-14');
  await expect(atlas).toHaveURL('/damocles');
  await expect(page.locator('#page-ownership')).toBeVisible();
});

test('destination content failure leaves the original session at its position', async ({
  page
}) => {
  await page.goto('/damocles');
  await ready(page);
  await page.keyboard.press('Escape');
  const x = await page.locator('#frame').getAttribute('data-x');
  await page.goto(pinnedVesta);
  const catalogue = (await (
    await page.request.get('/payload/damocles/catalogue.json')
  ).json()) as {
    instances: { location: { body: string } | null; model: string }[];
  };
  const erisModels = new Set(
    catalogue.instances
      .filter(item => item.location?.body === 'body-11')
      .map(item => item.model)
  );
  const vestaOnly = catalogue.instances.find(
    item => item.location?.body === 'body-14' && !erisModels.has(item.model)
  )!.model;
  await page.route(`**/payload/damocles/models/${vestaOnly}.json`, route =>
    route.abort()
  );
  await page.locator('#travel-here').click();
  await ready(page);
  await expect(page.locator('#status')).toContainText(
    'Destination content could not be loaded'
  );
  await expect(page.locator('#frame')).toHaveAttribute('data-body', 'body-11');
  await expect(page.locator('#frame')).toHaveAttribute('data-x', x!);
});

test('unplayable Bodies disable travel, and narrow layouts retain a usable map', async ({
  page
}) => {
  await page.setViewportSize({ height: 720, width: 320 });
  await page.goto(
    '/damocles/atlas?body=damocles&pinBody=damocles&pinX=0&pinZ=0'
  );
  await expect(page.locator('#pin-status')).toContainText(
    'no admitted arrival data'
  );
  await expect(page.locator('#travel-here')).toBeDisabled();
  const bounds = (await page.locator('#range-body').boundingBox())!;
  expect(bounds.height).toBeGreaterThan(200);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(320);
});

test('unavailable session ownership cannot silently start replacement play', async ({
  page
}) => {
  await page.goto('/damocles');
  await ready(page);
  await page.keyboard.press('Escape');
  const original = await page.evaluate(() =>
    localStorage.getItem('mercenary.browser-shell.damocles.session-resume.v1')
  );
  await page.goto(pinnedVesta);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'locks', { value: undefined })
  );
  await page.locator('#travel-here').click();
  await ready(page);
  await expect(page.locator('#status')).toContainText('Restore a valid Save');
  await page.keyboard.press('Escape');
  const elapsed = await page.locator('#frame').getAttribute('data-elapsed');
  await page.keyboard.press('ArrowUp');
  expect(await page.locator('#frame').getAttribute('data-elapsed')).toBe(
    elapsed
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem('mercenary.browser-shell.damocles.session-resume.v1')
    )
  ).toBe(original);
});

test('an open pin menu survives destination availability loading', async ({
  page
}) => {
  const { promise: gate, resolve: release } = Promise.withResolvers<void>();
  await page.route('**/payload/damocles/arrival-poses.json', async route => {
    await gate;
    await route.continue();
  });
  await page.goto(pinnedVesta);
  await page.locator('#atlas-pin').click({ button: 'right' });
  await expect(page.locator('#pin-menu')).toBeVisible();
  release();
  await expect(page.locator('#pin-menu-travel')).toBeEnabled();
  await expect(page.locator('#pin-menu')).toBeVisible();
});

test('dragging the player travels to the drop point without panning the map', async ({
  page
}) => {
  await page.goto('/damocles');
  await ready(page);
  const before = Number(await page.locator('#frame').getAttribute('data-x'));
  await page.keyboard.press('Escape');
  await page.locator('#menu-atlas').click();
  const player = page.locator('#atlas-player');
  await expect(player).toBeVisible();
  const box = (await player.boundingBox())!;
  const map = (await page.locator('#range-body').boundingBox())!;
  const atlasUrl = page.url();
  const cellUnits = (
    await (
      await page.request.get('/payload/damocles/arrival-poses.json')
    ).json()
  ).coordinateSystem.cellUnits;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, {
    steps: 5
  });
  await expect(page).toHaveURL(atlasUrl);
  await page.mouse.up();
  await expect(page.locator('#pin-status')).toContainText(
    'Player position updated'
  );
  await expect(page).toHaveURL(atlasUrl);
  expect((await player.boundingBox())!.x).toBeCloseTo(box.x + 20, 1);
  await page.locator('#return-game').click();
  await ready(page);
  const after = Number(await page.locator('#frame').getAttribute('data-x'));
  expect(
    Math.abs(after - (before + (20 / map.width) * cellUnits))
  ).toBeLessThan(2);
});

for (const cancellation of ['Escape', 'outside', 'pointercancel']) {
  test(`${cancellation} cancels a player drag without changing the map or player`, async ({
    page
  }) => {
    await page.goto('/damocles');
    await ready(page);
    await page.keyboard.press('Escape');
    await page.locator('#menu-atlas').click();
    const player = page.locator('#atlas-player');
    await expect(player).toBeVisible();
    const box = (await player.boundingBox())!;
    const url = page.url();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, {
      steps: 5
    });
    if (cancellation === 'Escape') {
      await page.keyboard.press('Escape');
    } else if (cancellation === 'outside') {
      await page.mouse.move(0, 0);
    } else {
      await player.dispatchEvent('pointercancel');
    }
    await page.mouse.up();
    await expect(page).toHaveURL(url);
    expect((await player.boundingBox())!.x).toBeCloseTo(box.x, 1);
  });
}

test('a failed player drag save keeps the Atlas and original position intact', async ({
  page
}) => {
  await page.goto('/damocles');
  await ready(page);
  await page.keyboard.press('Escape');
  await page.locator('#menu-atlas').click();
  const player = page.locator('#atlas-player');
  await expect(player).toBeVisible();
  const box = (await player.boundingBox())!;
  const url = page.url();
  const original = await page.evaluate(() =>
    localStorage.getItem('mercenary.browser-shell.damocles.session-resume.v1')
  );
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'mercenary.browser-shell.damocles.session-resume.v1') {
        throw new Error('Storage full');
      }
      setItem.call(this, key, value);
    };
  });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, {
    steps: 5
  });
  await page.mouse.up();
  await expect(page.locator('#pin-status')).toContainText(
    'Player move refused'
  );
  await expect(page).toHaveURL(url);
  expect((await player.boundingBox())!.x).toBeCloseTo(box.x, 1);
  expect(
    await page.evaluate(() =>
      localStorage.getItem('mercenary.browser-shell.damocles.session-resume.v1')
    )
  ).toBe(original);
});
