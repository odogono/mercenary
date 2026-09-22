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
  await expect(page.locator('#range-system')).toBeVisible();
  // Back at the System Range on the window the surface was showing, not refitted to the whole
  // System: the hop matches the picture in both directions (#437), so a reader keeps their place.
  await expect(page).toHaveURL(/\bx=-63\d{4}/);
  await expect(page).not.toHaveURL(/\bbody=/);
  await expect(page.locator('#status')).toContainText(
    'recovered islands drawn on ERIS'
  );
  // And Fit System is still the way back to the whole System.
  await page.locator('#system-fit').click();
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

test('zooming into a Body reveals its islands and hands over continuously', async ({
  page
}) => {
  // The Catalogue is 40 MiB, so the System Range must not fetch it until a surface is worth
  // drawing (#435).
  const fetches: string[] = [];
  page.on('request', request => {
    if (request.url().includes('catalogue.json')) {
      fetches.push(request.url());
    }
  });
  await page.goto('/damocles/atlas');
  await expect(page.locator('#status')).toContainText('10 markers');
  expect(fetches).toHaveLength(0);

  // Far enough in for Eris's islands to be drawn on its own disc, at the authored scale.
  await page.goto('/damocles/atlas?x=-630000&z=390000&span=3000');
  await expect(page.locator('#system-scale')).toContainText(
    'ERIS surface at an authored scale',
    { timeout: 20_000 }
  );
  await expect(page.locator('#status')).toContainText(
    'recovered islands drawn on ERIS at an authored scale'
  );
  // The one authored quantity in the Atlas, so the panel states it rather than assuming it.
  await expect(page.locator('#panel')).toContainText(
    'The scale placing them on the disc is authored'
  );
  expect(fetches).toHaveLength(1);
  // Still the System Range: no hop has happened.
  await expect(page).not.toHaveURL(/\bbody=/);

  // Zooming on hands over, on the same window, with no click anywhere. It waits until the frame
  // is wholly inside the authored surface, so it takes a few steps from here rather than one.
  const box = (await page.locator('#range-system').boundingBox())!;
  const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  for (let step = 0; step < 10; step += 1) {
    if (/\bbody=/.test(page.url())) {
      break;
    }
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(140);
  }
  await expect(page).toHaveURL(/\bbody=eris\b/, { timeout: 10_000 });
  await expect(page.locator('#system-scale')).toContainText('Body Range');
  // The hand-over lands on the Body Range's own fit, which is what makes the islands stay put.
  // Well inside one surface, because the hand-over waits for the whole frame to be: the frame's
  // diagonal fits within a surface, so no island can have two images in view.
  const handed = new URL(page.url()).searchParams;
  const reach =
    (Number(handed.get('span')) / 2) * Math.hypot(1, box.height / box.width);
  expect(2 * reach).toBeLessThan(4096);
});

test('draws each island once on a disc, and centres a ring about the origin', async ({
  page
}) => {
  // Reported: looking at Eris showed two copies of SNOW ISLAND and two of KEY WEST. A disc is a
  // sphere seen from outside and you cannot see the same island twice on one, so wrapped copies
  // belong to the Body Range's flat torus and not here.
  await page.goto('/damocles/atlas?x=-630000&z=390000&span=1600');
  await expect(page.locator('#status')).toContainText(
    '5 recovered islands drawn on ERIS',
    { timeout: 20_000 }
  );

  // Reported: Lucan's ring of twelve appeared as four broken arcs in the four corners, because
  // it rings the coordinate origin and the surface was centred on cell 2048. It is now centred
  // on the ring's own wrap-aware centre, cell 6, so it draws as one ring.
  await page.goto('/damocles/atlas?x=-635600&z=383600&span=200');
  await expect(page.locator('#status')).toContainText(
    '12 recovered islands drawn on LUCAN',
    { timeout: 20_000 }
  );
  // Zooming on still hands over, so the shifted centre has not broken the transition.
  const box = (await page.locator('#range-system').boundingBox())!;
  const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  for (let step = 0; step < 10; step += 1) {
    if (/\bbody=/.test(page.url())) {
      break;
    }
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(140);
  }
  await expect(page).toHaveURL(/\bbody=lucan\b/);
});

test('a small Body hands over too, not just the large ones', async ({
  page
}) => {
  // The regression this covers: the hand-over is keyed to a Body's own size, and the recovered
  // sizes span 500-fold, so a single zoom ceiling suited to the largest stranded the other 22.
  // VESTA, whose derived radius is 360 units against ERIS's 1,200, stopped dead at the ceiling.
  await page.goto('/damocles/atlas?x=-630000&z=392400&span=900');
  await expect(page.locator('#system-scale')).toContainText(
    'VESTA surface at an authored scale',
    { timeout: 20_000 }
  );
  const box = (await page.locator('#range-system').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let step = 0; step < 8; step += 1) {
    if (/\bbody=/.test(page.url())) {
      break;
    }
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(120);
  }
  await expect(page).toHaveURL(/\bbody=vesta\b/);
  await expect(page.locator('#system-scale')).toContainText('Body Range');
});

test('hands over without a pop on an island at the surface edge', async ({
  page
}) => {
  // Reported: zooming into an island on the rim popped. BARE ISLAND sits at Surface Cell
  // x 3052..3136, near Eris's eastern edge, which is the worst case for it.
  await page.goto('/damocles/atlas?x=-629567&z=389366&span=420');
  await expect(page.locator('#system-scale')).toContainText(
    'ERIS surface at an authored scale',
    { timeout: 20_000 }
  );
  // Deep inside the Body, so the System Range must not claim the System is empty here.
  await expect(page.locator('#status')).not.toContainText(
    'No recovered Body is in view'
  );
  await expect(page.locator('#status')).toContainText('drawn on ERIS');

  const box = (await page.locator('#range-system').boundingBox())!;
  const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  for (let step = 0; step < 10; step += 1) {
    if (/\bbody=/.test(page.url())) {
      break;
    }
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(140);
  }
  await expect(page).toHaveURL(/\bbody=eris\b/);
  // Handed over wholly inside the surface, so the rim and the wrap copies were never in frame:
  // the island stays where it was rather than the far side of the surface arriving at once.
  const at = new URL(page.url()).searchParams;
  const reach =
    (Number(at.get('span')) / 2) * Math.hypot(1, box.height / box.width);
  // The frame's diagonal fits inside one surface, so the rim and the wrap copies were never in
  // frame: the island stays where it was rather than the far side arriving all at once.
  expect(2 * reach).toBeLessThan(4096);
});

test('zooms out onto the Body from either side of the coordinate seam', async ({
  page
}) => {
  // Reported: zooming out of a Body sometimes jumped the position slightly. A Body camera takes
  // its centre modulo the surface, so a reader who has crossed the seam sits on the far side of
  // the anchor in raw numbers; the conversion out took the raw difference and landed a whole
  // surface away, on the opposite side of the disc. ERIS's surface is centred on cell 3472, so
  // cell 900 is across the seam from it and cell 3472 is not.
  for (const cell of [3472, 900]) {
    await page.goto(`/damocles/atlas?body=eris&x=${cell}&z=437&span=3000`);
    await expect(page.locator('#system-scale')).toContainText('Range');
    for (let step = 0; step < 8; step += 1) {
      if (!/\bbody=/.test(page.url())) {
        break;
      }
      await page.locator('#system-zoom-out').click();
      await page.waitForTimeout(160);
    }
    await expect(page.locator('#range-system')).toBeVisible();
    const at = new URL(page.url()).searchParams;
    // Landed on ERIS, whose derived radius is 1,200 units and whose authored surface is 849
    // units from centre to edge. Before the fix, cell 900 landed 1,024 units out.
    expect(
      Math.hypot(Number(at.get('x')) + 630_000, Number(at.get('z')) - 390_000)
    ).toBeLessThanOrEqual(849);
  }
});

test('zooming out of a grouped Body returns to that Body, not its group', async ({
  page
}) => {
  // The regression this covers: a marker's position is that of whichever Body it is named for,
  // and at a whole-System camera VESTA's marker is the six-Body ERIS group. Going out through
  // the marker sent a reader zooming out of VESTA to ERIS, 2,400 units away.
  await page.goto('/damocles/atlas?body=vesta');
  await expect(page.locator('#system-scale')).toContainText('Body Range');
  await page.locator('#system-zoom-out').click();
  await expect(page.locator('#range-system')).toBeVisible();
  await expect(page).toHaveURL(/\bx=/);
  const at = new URL(page.url()).searchParams;
  // Back on VESTA. Not exactly its centre, because the camera returns to the point the reader
  // was looking at and a Body's surface is drawn centred on its islands rather than on cell
  // 2048; but its own derived radius is 360 units, so being within that is being on VESTA.
  expect(
    Math.hypot(Number(at.get('x')) + 630_000, Number(at.get('z')) - 392_400)
  ).toBeLessThan(360);
  // And nowhere near ERIS, 2,400 units away, which is what the bug did.
  expect(
    Math.hypot(Number(at.get('x')) + 630_000, Number(at.get('z')) - 390_000)
  ).toBeGreaterThan(1000);
  await expect(page.locator('#system-scale')).toContainText(
    'VESTA surface at an authored scale'
  );
});

test('reads out the centre point in every system that can name it', async ({
  page
}) => {
  // Overlaid inside the map, so it cannot change the frame the ResizeObserver measures.
  await page.goto('/damocles/atlas');
  await expect(page.locator('#system-centre')).toContainText('System');
  await expect(page.locator('#system-centre')).not.toContainText(
    'Body Coordinate'
  );

  // On a disc the Body Coordinate is reachable, through the authored scale, and says so.
  await page.goto('/damocles/atlas?x=-630000&z=390000&span=1600');
  await expect(page.locator('#system-centre')).toContainText(
    'Body Coordinate',
    { timeout: 20_000 }
  );
  await expect(page.locator('#system-centre')).toContainText('ERIS');
  await expect(page.locator('#system-centre .centre-authored')).toHaveCount(1);

  // Inside a Body it is direct, and there is no System row: nothing recovered gives one.
  await page.goto('/damocles/atlas?body=eris&x=71&z=136&span=120');
  await expect(page.locator('#body-centre')).toContainText(
    'ERIS · 71 / 136 cells',
    { timeout: 20_000 }
  );
  // CAPITAL CITY's origin is cell 64 / 128.
  await expect(page.locator('#body-centre')).toContainText(
    'CAPITAL CITY · 7 / 8'
  );
  await expect(page.locator('#body-centre')).not.toContainText('System');
  await expect(page.locator('#body-centre .centre-authored')).toHaveCount(0);

  // Open sea names no island.
  await page.goto('/damocles/atlas?body=eris&x=2048&z=2048&span=400');
  await expect(page.locator('#body-centre')).toContainText('2048 / 2048', {
    timeout: 20_000
  });
  await expect(page.locator('#body-centre')).not.toContainText(
    'Island-Local Cell'
  );
});

test('picking an island fills the panel and survives the link', async ({
  page
}) => {
  // Framed on Eris's CAPITAL CITY, whose recovered extent is x 38..104, z 112..160.
  await page.goto('/damocles/atlas?body=eris&x=71&z=136&span=180');
  await expect(page.locator('#status')).toContainText('5 recovered islands', {
    timeout: 20_000
  });
  const box = (await page.locator('#range-body').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page).toHaveURL(/\bisland=island-eris-/);
  await expect(page.locator('#panel')).toContainText('CAPITAL CITY');
  await expect(page.locator('#panel')).toContainText('Origin X/Z');
  // An island carries no name of its own, and the panel must say so rather than heading the
  // area name as one.
  await expect(page.locator('#panel')).toContainText(
    'carries no name of its own'
  );
  // The Catalogue has no island view, so the hand-off reaches the Body and says as much.
  await expect(page.locator('#island-catalogue-link')).toHaveAttribute(
    'href',
    '/damocles/catalogue?body=body-11'
  );
  await expect(page.locator('#panel')).toContainText(
    'holds no island record view'
  );

  // The selection is in the URL, so reloading it restores the same panel.
  const picked = page.url();
  await page.goto(picked);
  await expect(page.locator('#panel')).toContainText('CAPITAL CITY', {
    timeout: 20_000
  });

  // Picking the sea clears it without leaving the Body.
  await page.mouse.click(box.x + 12, box.y + 12);
  await expect(page).not.toHaveURL(/\bisland=/);
  await expect(page).toHaveURL(/\bbody=eris\b/);
  await expect(page.locator('#panel')).not.toContainText('Origin X/Z');
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
