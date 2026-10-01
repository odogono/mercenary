import { expect, test } from '@playwright/test';

/// `/dion` boots its own Title (#647): Mercenary III's payload only, its own document,
/// its own storage, and a refusal for content that is not the pinned baseline's.

const DAMOCLES_CATALOGUE = '/payload/damocles/catalogue.json';

test('/dion boots the METIS prison opening from its own payload', async ({
  page
}, testInfo) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.goto('/dion');
  const screen = page.locator('#screen');
  await expect(screen).toHaveAttribute('data-state', 'ready');
  await expect(screen).toHaveAttribute('data-cell', String(0x62));
  await expect(screen).toHaveAttribute('data-region', '1');
  expect(Number(await screen.getAttribute('data-polygons'))).toBeGreaterThan(
    20
  );
  // The prison's occupants and the fixed drawn list reach the frame.
  expect((await screen.getAttribute('data-models'))!.split(' ')).toContain(
    '124'
  );
  await page.screenshot({ path: testInfo.outputPath('opening.png') });
  // Game time runs at fifty ticks a second, a frame every eleven.
  await expect
    .poll(async () => Number(await screen.getAttribute('data-tick')), {
      timeout: 5000
    })
    .toBeGreaterThan(55);
  const { frame, tick } = await screen.evaluate(element => ({
    frame: Number((element as HTMLElement).dataset['frame']),
    tick: Number((element as HTMLElement).dataset['tick'])
  }));
  expect(frame).toBe(Math.floor(tick / 11));
  // Only Mercenary III's documents were fetched.
  const payload = requests.filter(path => path.startsWith('/payload/'));
  expect(payload.length).toBeGreaterThan(0);
  expect(payload.every(path => path.startsWith('/payload/dion/'))).toBe(true);
  expect(requests).toContain('/dion/metis.json');
  expect(requests).not.toContain(DAMOCLES_CATALOGUE);
});

test('/dion opens the System Menu and keeps its Saves to itself', async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'mercenary.browser-shell.dion.save.v1.slot-1',
      JSON.stringify({
        identity: { destination: 'damocles', title: 'damocles' },
        schemaVersion: 26
      })
    );
  });
  await page.goto('/dion');
  await expect(page.locator('#screen')).toHaveAttribute('data-state', 'ready');
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-layer',
    'menu'
  );
  await expect(page.locator('#page-menu a[href="/catalogue"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'SAVE / LOAD' }).click();
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-layer',
    'saves'
  );
  await expect(page.locator('[data-slot-rows]')).toContainText(
    'UNREADABLE — A DAMOCLES RECORD, NOT MERCENARY III'
  );
});

test('/dion refuses a payload that is not the pinned Mercenary III baseline', async ({
  page
}) => {
  await page.route('**/payload/dion/world.json', async route => {
    const response = await route.fetch();
    const doc = await response.json();
    doc.source.programSha256 =
      '8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef';
    await route.fulfill({ json: doc });
  });
  await page.goto('/dion');
  await expect(page.locator('#failure')).toBeVisible();
  await expect(page.locator('#failure')).toContainText(
    'not the pinned Mercenary III baseline'
  );
  await expect(page.locator('#screen')).toBeHidden();
});

test('/dion refuses a payload document from another capture', async ({
  page
}) => {
  await page.route('**/payload/dion/panel.json', async route => {
    const response = await route.fetch();
    const doc = await response.json();
    doc.source.capture.loaded.ramSha256 = '0'.repeat(64);
    await route.fulfill({ json: doc });
  });
  await page.goto('/dion');
  await expect(page.locator('#failure')).toContainText(
    'different capture runs'
  );
});

test('/dion walks and turns on the normal controls, held in by the shut door', async ({
  page
}) => {
  await page.goto('/dion');
  const screen = page.locator('#screen');
  await expect(screen).toHaveAttribute('data-state', 'ready');
  const z = Number(await screen.getAttribute('data-z'));
  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () => Number(await screen.getAttribute('data-z')), {
      timeout: 5000
    })
    .toBeLessThan(z - 200);
  await page.keyboard.up('ArrowUp');
  const heading = Number(await screen.getAttribute('data-heading'));
  await page.keyboard.down('ArrowRight');
  await expect
    .poll(async () => Number(await screen.getAttribute('data-heading')), {
      timeout: 5000
    })
    .toBeGreaterThan(heading);
  await page.keyboard.up('ArrowRight');
  await expect(screen).toHaveAttribute('data-region', '1');
});

test('/dion activates and calls through keyboard controls, saves and reloads its own session', async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'mercenary.browser-shell.damocles.session-resume.v1',
      'damocles sentinel'
    );
    localStorage.setItem(
      'mercenary.browser-shell.session-resume.v1',
      'targ sentinel'
    );
  });
  await page.goto('/dion');
  const screen = page.locator('#screen');
  await expect(screen).toHaveAttribute('data-state', 'ready');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => Number(await screen.getAttribute('data-reveal')))
    .toBeGreaterThan(0);
  await expect(screen).toHaveAttribute('data-reveal', '0');
  await page.keyboard.press('*');
  await expect(screen).toHaveAttribute('data-call', 'true');
  await expect(page.locator('#status')).not.toContainText('Sound unavailable');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'SAVE / LOAD' }).click();
  await page.locator('[data-slot="1"] [data-action="save"]').click();
  const saved = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem('mercenary.browser-shell.dion.save.v1.slot-1')!
    )
  );
  expect(saved.identity.title).toBe('dion');
  expect(saved.snapshot.snapshot.taxi.call).toBe(true);
  await page.reload();
  await expect(screen).toHaveAttribute('data-state', 'ready');
  await expect(screen).toHaveAttribute('data-call', 'true');
  expect(
    await page.evaluate(() =>
      localStorage.getItem('mercenary.browser-shell.damocles.session-resume.v1')
    )
  ).toBe('damocles sentinel');
  expect(
    await page.evaluate(() =>
      localStorage.getItem('mercenary.browser-shell.session-resume.v1')
    )
  ).toBe('targ sentinel');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'SAVE / LOAD' }).click();
  await page.locator('[data-slot="1"] [data-action="load"]').click();
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-layer',
    'none'
  );
  await expect(screen).toHaveAttribute('data-call', 'true');
  await expect(page.locator('#failure')).toBeHidden();
});

test('/dion cooperatively hands the latest session to another tab and can reclaim it', async ({
  context,
  page
}) => {
  await page.goto('/dion');
  await expect(page.locator('#screen')).toHaveAttribute('data-state', 'ready');
  await page.keyboard.press('Enter');
  const second = await context.newPage();
  await second.goto('/dion');
  await expect(second.locator('#screen')).toHaveAttribute(
    'data-state',
    'ready'
  );
  await expect(second.getByRole('button', { name: 'TAKE OVER' })).toBeVisible();
  await second.getByRole('button', { name: 'TAKE OVER' }).click();
  await expect(second.getByRole('button', { name: 'TAKE OVER' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'TAKE OVER' })).toBeVisible();
  const oldTick = Number(
    await page.locator('#screen').getAttribute('data-tick')
  );
  expect(
    Number(await second.locator('#screen').getAttribute('data-tick'))
  ).toBeGreaterThanOrEqual(oldTick);
  await page.getByRole('button', { name: 'TAKE OVER' }).click();
  await expect(page.getByRole('button', { name: 'TAKE OVER' })).toBeHidden();
  await expect(second.getByRole('button', { name: 'TAKE OVER' })).toBeVisible();
});
