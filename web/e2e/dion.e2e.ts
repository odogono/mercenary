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
  // Only Mercenary III's documents were fetched, beside the System Menu's shared typeface.
  const payload = requests.filter(
    path => path.startsWith('/payload/') && !path.startsWith('/payload/fonts/')
  );
  expect(payload.length).toBeGreaterThan(0);
  expect(payload.every(path => path.startsWith('/payload/dion/'))).toBe(true);
  expect(requests).toContain('/payload/dion/tourcraft/manifest.json');
  expect(requests).not.toContain(DAMOCLES_CATALOGUE);
});

test('/dion shares the System Menu settings page and Controls Page, under its Title Logo', async ({
  page
}) => {
  test.fixme(Boolean(process.env['CI']), 'too slow on a CI runner: #852');
  await page.addInitScript(() => {
    // Another Title's choices are not Mercenary III's (ADR 0063).
    localStorage.setItem(
      'mercenary.browser-shell.preferences.v1',
      JSON.stringify({ audioMuted: true, extendedControls: true })
    );
  });
  await page.goto('/dion');
  await expect(page.locator('#screen')).toHaveAttribute('data-state', 'ready');
  await page.keyboard.press('Escape');
  // The recovered centre-box logo heads every page.
  const logo = page.locator('#page-menu .chrome-logo img');
  await expect(logo).toHaveAttribute('alt', 'MERCENARY III');
  expect(
    await logo.evaluate((image: HTMLImageElement) => [
      image.naturalWidth,
      image.naturalHeight
    ])
  ).toEqual([64, 32]);
  await expect(page.locator('.chrome-logo img')).toHaveCount(5);

  await page.getByRole('button', { exact: true, name: 'SETTINGS' }).click();
  const settings = page.locator('#page-settings');
  expect(
    await settings.locator('.setting-row > .chrome-label').allTextContents()
  ).toEqual([
    'PRESENTATION',
    'SHADOWS',
    'SHADOW DEPTH',
    'AMBIENT LIGHT',
    'EXTENDED CONTROLS',
    'AUDIO'
  ]);
  // Unset is Enhanced, as it is for Damocles (ADR 0077).
  await expect(
    settings.locator('[data-setting="presentation"] button[value="enhanced"]')
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    settings.locator('[data-setting="presentation"] button')
  ).toHaveCount(2);
  await expect(
    settings.locator('[data-setting="extended"] button[value="off"]')
  ).toHaveAttribute('aria-pressed', 'true');
  const mute = page.locator('#audio-mute');
  await expect(mute).toHaveText('SOUND ON');
  await mute.click();
  await settings
    .locator('[data-setting="extended"] button[value="on"]')
    .click();
  await expect(mute).toHaveText('SOUND OFF');
  expect(
    await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem('mercenary.browser-shell.dion.preferences.v1')!
      )
    )
  ).toMatchObject({ audioMuted: true, extendedControls: true });

  await page.reload();
  await expect(page.locator('#screen')).toHaveAttribute('data-state', 'ready');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { exact: true, name: 'SETTINGS' }).click();
  await expect(mute).toHaveText('SOUND OFF');
  await expect(
    settings.locator('[data-setting="extended"] button[value="on"]')
  ).toHaveAttribute('aria-pressed', 'true');

  // Damocles's Bindings, with the Extensions listed now Extended Controls is on (ADR 0064).
  await page.locator('#page-settings [data-goto="menu"]').click();
  await page.getByRole('button', { exact: true, name: 'CONTROLS' }).click();
  const controls = page.locator('#page-controls');
  await expect(controls.locator('.controls-group-title')).toHaveText([
    'SHELL',
    'POINTER',
    'ALWAYS',
    'ON FOOT',
    'IN A LIFT',
    'ABOARD'
  ]);
  for (const action of ['OPEN', 'READ', 'BOARD', 'LEAVE CRAFT', 'STRAFE']) {
    await expect(
      controls.locator('.controls-rows dd', {
        hasText: new RegExp(`^${action}`)
      })
    ).not.toHaveCount(0);
  }
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
  await page.route('**/payload/dion/tourcraft/manifest.json', async route => {
    const response = await route.fetch();
    const doc = await response.json();
    doc.programSha256 =
      '8d512ac60792eeae7b18afdc724ff27ac6028a1e08f7647e62842bea08e9a2ef';
    await route.fulfill({ json: doc });
  });
  await page.goto('/dion');
  await expect(page.locator('#failure')).toBeVisible();
  await expect(page.locator('#failure')).toContainText(
    'programSha256: disagrees with its admitted binding'
  );
  await expect(page.locator('#screen')).toBeHidden();
});

test('/dion refuses a payload document from another capture', async ({
  page
}) => {
  await page.route('**/payload/dion/tourcraft/manifest.json', async route => {
    const response = await route.fetch();
    const doc = await response.json();
    doc.sources['gameplay-opening'].ramSha256 = '0'.repeat(64);
    await route.fulfill({ json: doc });
  });
  await page.goto('/dion');
  await expect(page.locator('#failure')).toContainText(
    'disagrees with its admitted binding'
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
  await expect(screen).toHaveAttribute('data-reveal', '0');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => Number(await screen.getAttribute('data-reveal')))
    .toBeGreaterThan(0);
  await expect(screen).toHaveAttribute('data-reveal', '0');
  await page.keyboard.press('NumpadMultiply');
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
  await expect(page.locator('#screen')).toHaveAttribute('data-reveal', '0');
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
