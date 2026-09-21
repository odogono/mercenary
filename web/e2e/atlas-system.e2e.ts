import { expect, test, type Page } from '@playwright/test';

test('the System Range holds every recovered Body', async ({ page }) => {
  await page.goto('/damocles/atlas');
  await expect(page.locator('#failure')).toBeHidden();
  await expect(page.locator('#roster a')).toHaveCount(30);
  await expect(page.locator('#system-map')).toBeVisible();
  await expect(page.locator('#status')).toContainText('30 recovered Bodies');
  // Ten markers, because whole satellite groups sit within a pixel or two of each other at a
  // whole-System camera. Most of them keep a name, and the roster carries every Body either way.
  await expect(page.locator('#status')).toContainText('10 markers');
  await expect(page.locator('#status')).toContainText('group more than one');
  await expect(page.locator('.system-label')).toHaveCount(9);
  await expect(
    page.locator('.system-label').filter({ hasText: 'ERIS +5' })
  ).toHaveCount(1);
  // Far out a disc is a symbol rather than a size, and the readout must say so.
  await expect(page.locator('#system-scale')).toContainText('zoom 1×');
  await expect(page.locator('#system-scale')).toContainText(
    'discs are markers, not sizes'
  );
  await expect(page.locator('#panel')).toContainText(
    'no complete orbital elements'
  );
});

test('clicking ERIS in the roster hops into the Body', async ({ page }) => {
  await page.goto('/damocles/atlas');
  await expect(page.locator('#roster a')).toHaveCount(30);
  await page.locator('#roster a[data-body="eris"]').click();

  await expect(page).toHaveURL('/damocles/atlas?body=eris');
  await expect(page.locator('#breadcrumb-body')).toHaveText('ERIS');
  await expect(page.locator('#panel')).toContainText('-630,000');
  await expect(page.locator('#range-system')).toBeHidden();
  // The Body Range is a map of the surface, named to assistive technology rather than by a
  // heading written over it.
  await expect(page.locator('#range-body')).toHaveAttribute(
    'aria-label',
    /^ERIS\. Body Range\./
  );
  await expect(page.locator('#body-map')).toBeVisible();
  await expect(page.locator('#status')).toContainText('wrapping on both');

  await page.locator('#breadcrumb-system').click();
  await expect(page).toHaveURL('/damocles/atlas');
  await expect(page.locator('#range-system')).toBeVisible();
});

const markerOf = async (page: Page, id: string) => {
  const anchor = page.locator(`#roster a[data-body="${id}"]`);
  await expect(anchor).toHaveAttribute('data-x', /\d/);
  const box = (await page.locator('#range-system').boundingBox())!;
  return {
    x: box.x + Number(await anchor.getAttribute('data-x')),
    y: box.y + Number(await anchor.getAttribute('data-y'))
  };
};

test('a marker standing for several Bodies opens to its members', async ({
  page
}) => {
  await page.goto('/damocles/atlas');
  await expect(page.locator('#roster a')).toHaveCount(30);
  const eris = await markerOf(page, 'eris');
  await page.mouse.click(eris.x, eris.y);

  // Not a hop: there is no one Body `ERIS +5` could mean, so it opens to its six members.
  await expect(page).toHaveURL(/^[^?]*(\?(?!.*\bbody=).*)?$/);
  await expect(page.locator('#status')).toContainText('30 markers');
  for (const name of ['SOLON', 'VESTA', 'LUCAN']) {
    await expect(
      page.locator('.system-label').filter({ hasText: name })
    ).toHaveCount(1);
  }
  // Close in a disc is the Body at its derived radius, which the readout distinguishes.
  await expect(page.locator('#system-scale')).toContainText(
    'discs at derived radius'
  );

  // Now the members are unambiguous, so one of them hops.
  const solon = await markerOf(page, 'solon');
  await page.mouse.click(solon.x, solon.y);
  await expect(page).toHaveURL(/\bbody=solon\b/);
  await expect(page.locator('#breadcrumb-body')).toHaveText('SOLON');
});

test('the camera pans, zooms and returns to the fit', async ({ page }) => {
  await page.goto('/damocles/atlas');
  await expect(page.locator('#system-scale')).toContainText('zoom 1×');

  // A drag pans and is not a selection: it must not navigate into a Body.
  const box = (await page.locator('#range-system').boundingBox())!;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + 160, centre.y + 110, { steps: 12 });
  await page.mouse.up();
  await expect(page).not.toHaveURL(/\bbody=/);
  // The camera reaches the URL on an idle timer, as `replaceState` so Back is not buried.
  await expect(page).toHaveURL(/\bx=-?[\d.]+&z=-?[\d.]+&span=[\d.]+/);

  // Buttons, keys and a double press all zoom.
  await page.locator('#system-zoom-in').click();
  await expect(page.locator('#system-scale')).not.toContainText('zoom 1×');
  await page.locator('#system-fit').click();
  await expect(page.locator('#system-scale')).toContainText('zoom 1×');

  await page.mouse.dblclick(centre.x, centre.y);
  await expect(page.locator('#system-scale')).toContainText('zoom 2×');
  await page.mouse.dblclick(centre.x, centre.y);
  await expect(page.locator('#system-scale')).toContainText('zoom 4×');

  await page.locator('#range-system').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('0');
  await expect(page.locator('#system-scale')).toContainText('zoom 1×');
});

test('a deep-linked camera is restored rather than refitted', async ({
  page
}) => {
  await page.goto('/damocles/atlas?x=-630000&z=390000&span=20000');
  await expect(page.locator('#failure')).toBeHidden();
  // 20,000 units across the ERIS group: its members are separate Bodies at their own radii.
  await expect(page.locator('#status')).toContainText('30 markers');
  await expect(page.locator('#system-scale')).toContainText(
    'discs at derived radius'
  );
  await expect(page.locator('#system-scale')).not.toContainText('zoom 1×');
  await expect(
    page.locator('.system-label').filter({ hasText: 'ERIS' })
  ).toHaveCount(1);
});

test('zooming into the empty middle of the System says so', async ({
  page
}) => {
  // The recovered Bodies sit in scattered groups and nothing is at the System's centroid, so
  // an empty view is the truth rather than a failure, and the map must not look broken.
  await page.goto('/damocles/atlas?x=705800&z=1143200&span=20000');
  await expect(page.locator('#status')).toContainText(
    'No recovered Body is in view'
  );
  await page.locator('#system-fit').click();
  await expect(page.locator('#status')).toContainText('10 markers');
});

test('the Body Range pans across the wrap and zooms out to the System', async ({
  page
}) => {
  await page.goto('/damocles/atlas?body=eris');
  await expect(page.locator('#body-map')).toBeVisible();
  await expect(page.locator('#system-scale')).toContainText('Body Range');
  await expect(page.locator('#system-fit')).toHaveText('Fit Surface');

  // A drag records a camera in Surface Cells, and the surface has no edge to stop at: dragging
  // a long way west leaves the centre on the surface rather than pinned to a bound.
  const box = (await page.locator('#range-body').boundingBox())!;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  for (let step = 0; step < 6; step += 1) {
    await page.mouse.move(centre.x + 200 * (step + 1), centre.y, { steps: 6 });
  }
  await page.mouse.up();
  await expect(page).toHaveURL(/\bbody=eris\b.*\bx=[\d.]+/);
  const x = Number(new URL(page.url()).searchParams.get('x'));
  expect(x).toBeGreaterThanOrEqual(0);
  expect(x).toBeLessThan(4096);

  // Zooming in names the narrower bands.
  await page.locator('#range-body').click({ position: { x: 4, y: 4 } });
  for (let step = 0; step < 6; step += 1) {
    await page.locator('#system-zoom-in').click();
  }
  await expect(page.locator('#system-scale')).toContainText('Range');
  await expect(page.locator('#system-scale')).toContainText(
    'Surface Cells per pixel'
  );

  // A surface that wraps has no edge to reach, so zooming out past it is the way back up.
  await page.locator('#system-fit').click();
  await expect(page.locator('#system-scale')).toContainText('Body Range');
  await page.locator('#system-zoom-out').click();
  await expect(page).toHaveURL('/damocles/atlas');
  await expect(page.locator('#range-system')).toBeVisible();
  await expect(page.locator('#status')).toContainText('10 markers');
});

test('a Body draws its recovered coastlines, whole across the seam', async ({
  page
}) => {
  await page.goto('/damocles/atlas?body=eris');
  await expect(page.locator('#body-map')).toBeVisible();
  // The Catalogue is fetched only on entering a Body, so the Range says what it is waiting for
  // and then says what it found.
  await expect(page.locator('#status')).toContainText('5 recovered islands', {
    timeout: 20_000
  });
  await expect(page.locator('#failure')).toBeHidden();

  // Lucan's twelve records sit on a ring about the Body Coordinate origin, four of them across
  // the seam. Reading them without the wrap would strand those four at the far edges.
  await page.goto('/damocles/atlas?body=lucan');
  await expect(page.locator('#status')).toContainText('12 recovered islands', {
    timeout: 20_000
  });
});

test('a deep-linked Body camera is restored', async ({ page }) => {
  // 32 Surface Cells is two Structure Workspaces across, so about a thirtieth of a cell per
  // pixel: the Settlement Range.
  await page.goto('/damocles/atlas?body=eris&x=100&z=200&span=32');
  await expect(page.locator('#body-map')).toBeVisible();
  await expect(page.locator('#system-scale')).toContainText('Settlement Range');
  await expect(page.locator('#breadcrumb-body')).toHaveText('ERIS');

  // A tenth of that is the Street Range, where a footprint would be drawable.
  await page.goto('/damocles/atlas?body=eris&x=100&z=200&span=3');
  await expect(page.locator('#system-scale')).toContainText('Street Range');
});

test('a deep link opens the Body, and an unknown one falls back', async ({
  page
}) => {
  await page.goto('/damocles/atlas?body=damocles');
  await expect(page.locator('#range-body')).toHaveAttribute(
    'aria-label',
    /^DAMOCLES\./
  );
  await expect(page.locator('#panel')).toContainText('capture-time sample');
  await expect(page.locator('#roster a[aria-current="true"]')).toHaveCount(1);

  await page.goto('/damocles/atlas?body=void');
  await expect(page).toHaveURL('/damocles/atlas?body=void');
  await expect(page.locator('#range-system')).toBeVisible();
  await expect(page.locator('#breadcrumb-body')).toHaveCount(0);
});
