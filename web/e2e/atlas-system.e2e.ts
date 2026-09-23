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
  // The System Range fetches nothing of the Catalogue until a surface is worth drawing (#435),
  // and a Body's surface fetches the shared document and no Model file (ADR 0048).
  const fetches: string[] = [];
  const models: string[] = [];
  page.on('request', request => {
    if (request.url().includes('catalogue.json')) {
      fetches.push(request.url());
    }
    if (request.url().includes('/payload/damocles/models/')) {
      models.push(request.url());
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
  expect(fetches).toHaveLength(1);
  expect(models).toEqual([]);
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
    '/catalogue?body=body-11'
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

test('names Settlements from the Body Range and Places from the Settlement Range', async ({
  page
}) => {
  await page.goto('/damocles/atlas?body=eris');
  await expect(page.locator('#status')).toContainText('5 Settlement names', {
    timeout: 20_000
  });
  // A Settlement is the one thing on a Body worth naming at the widest view, so all five of
  // Eris's named records are written. CAPITAL CITY appears twice: the widest view of a surface
  // is wider than the surface, so the camera sees two wrap images of it side by side.
  const capital = page.locator('#body-labels a[data-kind="settlement"]', {
    hasText: 'CAPITAL CITY'
  });
  await expect(capital.first()).toBeVisible();
  await expect(capital).toHaveCount(2);
  // The eleven Places share CAPITAL CITY's sixteen cells, so at this band they would be eleven
  // names on one pixel. The status line says where to find them rather than leaving a reader to
  // conclude there are none.
  await expect(page.locator('#body-labels a[data-kind="place"]')).toHaveCount(
    0
  );
  await expect(page.locator('#status')).toContainText(
    '11 Damocles Places, from the Settlement Range'
  );

  // Zoomed into CAPITAL CITY's own workspace the Places appear, and the Settlement name stays:
  // these are bands and not a hierarchy.
  await page.goto('/damocles/atlas?body=eris&x=72&z=136&span=24');
  await expect(page.locator('#system-scale')).toContainText('Settlement Range');
  await expect(
    page.locator('#body-labels a[data-kind="place"]', {
      hasText: 'STATE OFFICE'
    })
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.locator('#body-labels a[data-kind="settlement"]')
  ).toContainText('CAPITAL CITY');
});

test('picking a Damocles Place fills the panel and reaches the Catalogue', async ({
  page
}) => {
  await page.goto('/damocles/atlas?body=eris&x=72&z=136&span=24');
  const name = page.locator('#body-labels a', { hasText: 'STATE OFFICE' });
  await expect(name).toBeVisible({ timeout: 20_000 });
  await name.click();

  // A name is a link, so the press reaches it rather than picking the island under it.
  await expect(page).toHaveURL(/\bplace=place-/);
  await expect(page).not.toHaveURL(/\bisland=/);
  await expect(page.locator('#panel')).toContainText('Place · STATE OFFICE');
  // Its position is its Instances' and the panel says so.
  await expect(page.locator('#panel')).toContainText('Mean cell');
  await expect(page.locator('#panel')).toContainText(
    'not a position the Place holds'
  );

  // The selection survives the link, the way an island's does.
  const picked = page.url();
  await page.goto(picked);
  await expect(page.locator('#panel')).toContainText('STATE OFFICE', {
    timeout: 20_000
  });

  // And the hand-off reaches the Instance itself, not merely its Body.
  const link = page.locator('#panel a.panel-instance').first();
  const href = await link.getAttribute('href');
  expect(href).toBe('/catalogue?body=body-11&instance=eris-surface-89');
  await page.goto(href!);
  await expect(page.locator('#details')).toContainText('STATE OFFICE', {
    timeout: 30_000
  });
});

test('picking a Settlement name picks the island that publishes it', async ({
  page
}) => {
  await page.goto('/damocles/atlas?body=eris&x=72&z=136&span=180');
  const name = page.locator('#body-labels a', { hasText: 'CAPITAL CITY' });
  await expect(name).toBeVisible({ timeout: 20_000 });
  await name.click();
  // A Settlement is carried by an island record, so the name reaches the record the Catalogue
  // can actually show rather than a Settlement entry that does not exist.
  await expect(page).toHaveURL(/\bisland=island-eris-/);
  await expect(page.locator('#panel')).toContainText(
    'carries no name of its own'
  );
});

/// How much of the Body Range's canvas is drawn in the road colour. The network is canvas
/// geometry rather than DOM, so the only honest check that it is on screen is the pixels.
///
/// Near `#d8b25a`, the token `draw.ts` strokes a run in, rather than exactly it: the line is a
/// fixed two pixels (#459), and a frame a half pixel off whole resamples every pixel of it into
/// a blend with the ground or piece under it. The tolerance still separates it from the land,
/// from the grey of a piece and from the dimmer gold of a gap square.
const roadPixels = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.getElementById('body-map') as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let found = 0;
    for (let at = 0; at < data.length; at += 4) {
      if (
        Math.abs(data[at]! - 0xd8) <= 48 &&
        Math.abs(data[at + 1]! - 0xb2) <= 48 &&
        Math.abs(data[at + 2]! - 0x5a) <= 48
      ) {
        found += 1;
      }
    }
    return found;
  });

/// How much of it is drawn in the dashed square marking a Structure Workspace whose roads were
/// never captured. Near `#9c7d3c` rather than exactly it: a dashed two-pixel line lands on no
/// whole pixel, so every pixel of it is a blend with the ground under it. The tolerance still
/// separates it from both the land colours it is drawn over and the brighter gold of a run.
const gapSquarePixels = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.getElementById('body-map') as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let found = 0;
    for (let at = 0; at < data.length; at += 4) {
      if (
        Math.abs(data[at]! - 0x9c) <= 40 &&
        Math.abs(data[at + 1]! - 0x7d) <= 40 &&
        Math.abs(data[at + 2]! - 0x3c) <= 40
      ) {
        found += 1;
      }
    }
    return found;
  });

/// How much of the canvas is drawn in `#cccccc`, the face colour of Capital City's road
/// pieces. Nothing else on the Atlas uses it: Eris's land is a green and the grid a blue.
const piecePixels = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.getElementById('body-map') as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let found = 0;
    for (let at = 0; at < data.length; at += 4) {
      if (data[at] === 0xcc && data[at + 1] === 0xcc && data[at + 2] === 0xcc) {
        found += 1;
      }
    }
    return found;
  });

/// How many css pixels thick the road line is where it crosses one column of the canvas, within
/// a few pixels of the middle row the view is centred on, in the tolerance `roadPixels` uses.
const roadThickness = (page: Page, column: number) =>
  page.evaluate(column => {
    const canvas = document.getElementById('body-map') as HTMLCanvasElement;
    const ratio = canvas.width / canvas.getBoundingClientRect().width;
    const reach = Math.round(10 * ratio);
    const top = Math.round(canvas.height / 2) - reach;
    const { data } = canvas
      .getContext('2d')!
      .getImageData(Math.round(column * canvas.width), top, 1, 2 * reach);
    let found = 0;
    for (let at = 0; at < data.length; at += 4) {
      if (
        Math.abs(data[at]! - 0xd8) <= 48 &&
        Math.abs(data[at + 1]! - 0xb2) <= 48 &&
        Math.abs(data[at + 2]! - 0x5a) <= 48
      ) {
        found += 1;
      }
    }
    return found / ratio;
  }, column);

test('the Settlement Range draws a Settlement\u2019s recovered road network', async ({
  page
}) => {
  // The game draws a whole Settlement's roads from the air, so the layer arrives at the band
  // sized for a Structure Workspace rather than waiting for the Street Range.
  await page.goto('/damocles/atlas?body=eris&x=72&z=136&span=20');
  await expect(page.locator('#system-scale')).toContainText('Settlement Range');
  await expect(page.locator('#status')).toContainText(
    'CAPITAL CITY: 37 road runs',
    { timeout: 20_000 }
  );
  expect(await roadPixels(page)).toBeGreaterThan(0);
  await expect(page.locator('#panel')).toContainText('37 runs');
  await expect(page.locator('#road-recovery')).toHaveAttribute(
    'data-recovery',
    'recovered'
  );
  // The Drawn Records wait until a road is as wide as the line, and the status line says
  // where to find them.
  await expect(page.locator('#status')).toContainText(
    '88 Road Pieces, from 0.003 Surface Cells per pixel'
  );
  expect(await piecePixels(page)).toBe(0);

  // At the Street Range Capital City's captured Drawn Records take the lines' place: they are
  // the road, and the gold would only hide the game's own marking down its middle (#459).
  await page.goto('/damocles/atlas?body=eris&x=72&z=136&span=2');
  await expect(page.locator('#system-scale')).toContainText('Street Range');
  await expect(page.locator('#status')).toContainText('88 Road Pieces drawn', {
    timeout: 20_000
  });
  expect(await roadPixels(page)).toBe(0);

  // Outward of the Settlement Range the network would be a smudge a few pixels wide, so it is
  // not drawn — and the status line still says it is there and where to go to see it. The count
  // is the Body's own here, all five of ERIS's groups, because no one group is in front of the
  // reader at this band (#448).
  await page.goto('/damocles/atlas?body=eris&x=72&z=136&span=900');
  await expect(page.locator('#system-scale')).toContainText('Coastal Range');
  await expect(page.locator('#status')).toContainText(
    '88 road runs, from the Settlement Range',
    { timeout: 20_000 }
  );
  expect(await roadPixels(page)).toBe(0);
});

/// Capital City's cell (3, 3), a straight on the x run from (1, 3) to (4, 3): its centre line
/// runs across the middle of the map.
const STRAIGHT_VIEW = 'body=eris&x=67.5&z=131.5';
/// KEY WEST's cell (4, 7), a straight on the x run from (0, 7) to (7, 7). The network is
/// image-derived, so it keeps its centre line at the Street Range.
const IMAGE_STRAIGHT_VIEW = 'body=eris&x=2564.5&z=3591.5';

test('a road line keeps its width at every zoom', async ({ page }) => {
  // Reported: the line was a fifth of a cell and grew with the zoom, past twenty pixels at the
  // Street Range. It is a fixed stroke now, like every other on the map (#459).
  const widths: number[] = [];
  for (const [view, span, runs] of [
    [STRAIGHT_VIEW, 40, '37 road runs'],
    [STRAIGHT_VIEW, 14, '37 road runs'],
    [IMAGE_STRAIGHT_VIEW, 1, '17 road runs'],
    [IMAGE_STRAIGHT_VIEW, 0.25, '17 road runs']
  ] as const) {
    await page.goto(`/damocles/atlas?${view}&span=${span}`);
    await expect(page.locator('#status')).toContainText(runs, {
      timeout: 20_000
    });
    // Just off the centre column, inside the run at every span and clear of the vertical run
    // at the next cell's centre.
    widths.push(await roadThickness(page, 0.52));
  }
  for (const width of widths) {
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(3);
  }
});

test('the Street Range draws each captured road cell\u2019s Drawn Record', async ({
  page
}) => {
  await page.goto(`/damocles/atlas?${STRAIGHT_VIEW}&span=0.25`);
  await expect(page.locator('#system-scale')).toContainText('Street Range');
  // Capital City's 88 cells were captured; Eris's other four networks were expanded from their
  // authored streams, and their 125 cells have a Selected Piece and no Drawn Record (#460).
  await expect(page.locator('#status')).toContainText(
    '88 Road Pieces drawn, 125 road cells with no Drawn Record recovered',
    { timeout: 20_000 }
  );
  expect(await piecePixels(page)).toBeGreaterThan(0);
  // The pieces are the road here, so no centre line is drawn over them.
  expect(await roadPixels(page)).toBe(0);
  await expect(page.locator('#panel')).toContainText('Drawn Record');
  await expect(page.locator('#panel')).toContainText('#460');

  // Where the Street Range opens a road is under a pixel wide, so the gold line holds until
  // 0.003 Surface Cells per pixel rather than swapping for a shimmer at the band edge.
  await page.goto(`/damocles/atlas?${STRAIGHT_VIEW}&span=5`);
  await expect(page.locator('#system-scale')).toContainText('Street Range');
  await expect(page.locator('#status')).toContainText(
    '88 Road Pieces, from 0.003 Surface Cells per pixel',
    { timeout: 20_000 }
  );
  expect(await roadPixels(page)).toBeGreaterThan(0);

  // KEY WEST's network is image-derived: its runs stay drawn and no piece is invented for them.
  await page.goto(`/damocles/atlas?${IMAGE_STRAIGHT_VIEW}&span=1`);
  await expect(page.locator('#system-scale')).toContainText('Street Range');
  await expect(page.locator('#status')).toContainText('KEY WEST', {
    timeout: 20_000
  });
  await expect(page.locator('#status')).toContainText('88 Road Pieces drawn');
  expect(await piecePixels(page)).toBe(0);
  expect(await roadPixels(page)).toBeGreaterThan(0);
});

/// Serves the Catalogue with these road networks taken out, the way a regenerated payload that
/// lost a group would arrive.
///
/// Every binding island record carries a network since #448, so the shipped payload reaches no
/// road gap at all. The gap path is kept regardless — the payload is derived from captures and
/// the image and can regress — and this is how its notices and its dashed square stay covered
/// in the browser rather than only in principle (#450).
const withoutNetworks = (page: Page, ...ids: readonly string[]) =>
  page.route('**/payload/damocles/catalogue.json', async route => {
    const response = await route.fetch();
    const payload = (await response.json()) as {
      roadNetworks: { id: string }[];
    };
    payload.roadNetworks = payload.roadNetworks.filter(
      network => !ids.includes(network.id)
    );
    await route.fulfill({ json: payload, response });
  });

test('a Settlement’s roads are stated for the group in view, not the Body', async ({
  page
}) => {
  // Reported: KEY WEST drew no network and said nothing about it. ERIS has five Structure
  // Workspaces, so what the reader is owed is the group they are looking at. All five are
  // recovered now, KEY WEST from its authored stream (#448).
  await page.goto('/damocles/atlas?body=eris&x=2568&z=3592&span=20');
  await expect(page.locator('#system-scale')).toContainText('Settlement Range');
  await expect(page.locator('#status')).toContainText(
    'KEY WEST: 17 road runs',
    {
      timeout: 20_000
    }
  );
  await expect(page.locator('#status')).toContainText(
    '5 of 5 Structure Workspaces captured on this Body'
  );
  await expect(page.locator('#road-recovery')).toHaveAttribute(
    'data-recovery',
    'recovered'
  );
  expect(await roadPixels(page)).toBeGreaterThan(0);
});

test('a Settlement whose network the payload lost says so where it stands', async ({
  page
}) => {
  await withoutNetworks(page, 'roads-eris-key-west');
  await page.goto('/damocles/atlas?body=eris&x=2568&z=3592&span=20');
  await expect(page.locator('#system-scale')).toContainText('Settlement Range');
  await expect(page.locator('#status')).toContainText(
    'KEY WEST: Road network not yet recovered for this Settlement',
    { timeout: 30_000 }
  );
  // How the Body stands overall, so the reader knows the layer exists and where it does not.
  await expect(page.locator('#status')).toContainText(
    '4 of 5 Structure Workspaces captured on this Body'
  );
  await expect(page.locator('#road-recovery')).toHaveAttribute(
    'data-recovery',
    'gap'
  );
  await expect(page.locator('#panel')).toContainText('not yet recovered');
  await expect(page.locator('#panel')).toContainText('#441');
  // The group's own 16 cells are recovered, so the hole is marked out where it is rather than
  // left as blank ground that looks the same as bare ground.
  expect(await gapSquarePixels(page)).toBeGreaterThan(0);
  // CAPITAL CITY is drawn on the same Body, so this is not the Body-wide wording.
  await expect(page.locator('#panel')).not.toContainText(
    'not yet recovered for this Body'
  );
});

test('a Body whose one workspace holds no road says so for the Body', async ({
  page
}) => {
  // THE MIDAS PROJECT is MIDAS's only workspace, and its authored stream holds no run: a
  // recovered "no roads", the reading SOLON BASE gets, and not a gap.
  await page.goto('/damocles/atlas?body=midas&x=2048&z=2048&span=20');
  await expect(page.locator('#system-scale')).toContainText('Settlement Range');
  // Open sea at this camera: no group is in frame, so the Body's own standing is what is said.
  await expect(page.locator('#status')).toContainText(
    '1 of 1 Structure Workspace captured on this Body',
    { timeout: 20_000 }
  );
  expect(await roadPixels(page)).toBe(0);
  await page.goto('/damocles/atlas?body=midas&x=1737&z=946&span=20');
  await expect(page.locator('#status')).toContainText(
    'THE MIDAS PROJECT: recovered with no road at all',
    { timeout: 20_000 }
  );
  await expect(page.locator('#status')).not.toContainText('not yet recovered');
  await expect(page.locator('#road-recovery')).toHaveAttribute(
    'data-recovery',
    'none'
  );
});

test('a Body whose only network the payload lost states the gap for the Body', async ({
  page
}) => {
  await withoutNetworks(page, 'roads-midas-the-midas-project');
  await page.goto('/damocles/atlas?body=midas&x=2048&z=2048&span=20');
  await expect(page.locator('#system-scale')).toContainText('Settlement Range');
  await expect(page.locator('#status')).toContainText(
    '0 of 1 Structure Workspace captured on this Body',
    { timeout: 30_000 }
  );

  // Over the group itself, the Body-wide wording, because nothing here has a network at all.
  await page.goto('/damocles/atlas?body=midas&x=1737&z=946&span=20');
  await expect(page.locator('#status')).toContainText(
    'THE MIDAS PROJECT: Road network not yet recovered for this Body',
    { timeout: 30_000 }
  );
  await expect(page.locator('#panel')).toContainText('#206');
  expect(await gapSquarePixels(page)).toBeGreaterThan(0);

  // Outward of the bands that draw roads the notice goes: it would be about a layer the reader
  // could not have seen at that camera either way.
  await page.goto('/damocles/atlas?body=midas&x=1737&z=946&span=900');
  await expect(page.locator('#system-scale')).toContainText('Coastal Range');
  await expect(page.locator('#status')).not.toContainText('not yet recovered');
  await expect(page.locator('#road-recovery')).toHaveCount(0);
});

test('a Body binding no Structure Workspace has nothing for roads to belong to', async ({
  page
}) => {
  // Seven of the 30 bind none on any island record. Calling that a road gap would dress a Body
  // with no recovered Settlement as one whose roads are merely unread.
  await page.goto('/damocles/atlas?body=triton&x=2048&z=2048&span=20');
  await expect(page.locator('#status')).toContainText(
    'No Structure Workspace is recovered on this Body',
    { timeout: 20_000 }
  );
  await expect(page.locator('#status')).not.toContainText('not yet recovered');
});

test('a Settlement recovered with no road at all is not reported as a gap', async ({
  page
}) => {
  // SOLON BASE is one structure and no run: the record was read and holds nothing, which is a
  // reading rather than a hole in what has been recovered.
  await page.goto('/damocles/atlas?body=solon&x=3982&z=1404&span=20');
  await expect(page.locator('#system-scale')).toContainText('Settlement Range');
  await expect(page.locator('#status')).toContainText(
    'SOLON BASE: recovered with no road at all',
    { timeout: 20_000 }
  );
  await expect(page.locator('#status')).not.toContainText('not yet recovered');
  await expect(page.locator('#road-recovery')).toHaveAttribute(
    'data-recovery',
    'none'
  );
  await expect(page.locator('#panel')).toContainText('read and holds no run');
  // A reading is not a hole, so no dashed square is drawn over it.
  expect(await gapSquarePixels(page)).toBe(0);
});

/// How much of the Body Range's canvas is drawn as a derived footprint. The rectangles are
/// canvas geometry rather than DOM, so the only honest check that they are on screen is the
/// pixels.
///
/// The edge exactly, and not the fill. A footprint sits in the middle of its Surface Cell, which
/// is exactly where that cell's road run is drawn, so its fill is a blend with recovered gold
/// rather than with the land — and a blend cannot be checked for without knowing what it was
/// drawn over. `draw.ts` strokes the edge two pixels wide precisely so an axis-aligned one
/// always covers a whole pixel in its own `#8fb9d1`.
const footprintPixels = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.getElementById('body-map') as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let found = 0;
    for (let at = 0; at < data.length; at += 4) {
      if (data[at] === 0x8f && data[at + 1] === 0xb9 && data[at + 2] === 0xd1) {
        found += 1;
      }
    }
    return found;
  });

/// Centred on a point inside Capital Spaceport's own footprint, so a press in the middle of the
/// map lands on it. Its rectangle runs x 71.499 to 71.512 and z 136.512 to 136.543 in Surface
/// Cells, which is 0.013 by 0.031 of a cell — the largest on Eris, and still a fraction of the
/// cell it stands in.
const SPACEPORT_VIEW = 'body=eris&x=71.5056&z=136.5272';

test('the Street Range draws a derived footprint for each placed structure', async ({
  page
}) => {
  await page.goto(`/damocles/atlas?${SPACEPORT_VIEW}&span=1`);
  await expect(page.locator('#system-scale')).toContainText('Street Range');
  await expect(page.locator('#status')).toContainText('57 derived footprints', {
    timeout: 20_000
  });
  // 20 of Eris's 77 placed structures recovered neither an exterior nor a plan, and nothing is
  // invented to stand in for one.
  await expect(page.locator('#status')).toContainText(
    '20 recovered no outline and are not drawn'
  );
  expect(await footprintPixels(page)).toBeGreaterThan(0);
  // The road stays under them, as Capital City's Drawn Records: the bands are not a hierarchy.
  expect(await piecePixels(page)).toBeGreaterThan(0);

  // Outward of the Street Range a footprint is a pixel or less, so the layer waits — and the
  // status line still says it is there and where to go to see it.
  await page.goto(`/damocles/atlas?${SPACEPORT_VIEW}&span=20`);
  await expect(page.locator('#system-scale')).toContainText('Settlement Range');
  await expect(page.locator('#status')).toContainText(
    '57 derived footprints, from the Street Range',
    { timeout: 20_000 }
  );
  expect(await footprintPixels(page)).toBe(0);
  await expect(page.locator('#footprint-derived')).toHaveCount(0);
});

test('tapping a footprint reaches its Catalogue entry', async ({ page }) => {
  await page.goto(`/damocles/atlas?${SPACEPORT_VIEW}&span=1`);
  await expect(page.locator('#status')).toContainText('57 derived footprints', {
    timeout: 20_000
  });
  const box = (await page.locator('#range-body').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page).toHaveURL(/\binstance=eris-surface-87\b/);
  await expect(page.locator('#panel')).toContainText('CAPITAL SPACEPORT');
  // The one Model carrying an exterior Mesh, so this is the one footprint on the map that did
  // not fall back to the plan.
  await expect(page.locator('#footprint-derived')).toHaveAttribute(
    'data-source',
    'exterior'
  );
  await expect(page.locator('#panel')).toContainText(
    'derived from recovered geometry'
  );
  await expect(page.locator('#panel')).toContainText('drawn as modelled');
  await expect(page.locator('#panel')).toContainText(
    '577 of the 579 footprints'
  );

  // And the hand-off reaches the Instance itself, not merely its Body.
  const href = await page
    .locator('#footprint-catalogue-link')
    .getAttribute('href');
  expect(href).toBe('/catalogue?body=body-11&instance=eris-surface-87');
  await page.goto(href!);
  await expect(page.locator('#details')).toContainText('CAPITAL SPACEPORT', {
    timeout: 30_000
  });
});

test('a footprint measured from the plan says which mesh it came from', async ({
  page
}) => {
  // Eris surface cell 4,2 is the ordinary case: 577 of the 579 footprints on the map are the
  // Structure Workspace plan, because two Models in 1,241 carry an exterior Mesh. Unnamed, so
  // no Damocles Place label stands over it — a name takes its own pointer events.
  await page.goto('/damocles/atlas?body=eris&x=68.5355&z=130.5046&span=1');
  await expect(page.locator('#status')).toContainText('57 derived footprints', {
    timeout: 20_000
  });
  const box = (await page.locator('#range-body').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page).toHaveURL(/\binstance=eris-surface-24\b/);
  await expect(page.locator('#footprint-derived')).toHaveAttribute(
    'data-source',
    'plan'
  );
  await expect(page.locator('#panel')).toContainText('plan Mesh (fallback)');

  // Pressing bare ground clears the selection rather than leaving the panel on a rectangle the
  // reader has moved away from.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + 60);
  await expect(page).not.toHaveURL(/\binstance=/);
});
