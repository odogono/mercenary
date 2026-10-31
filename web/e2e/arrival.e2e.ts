import { expect, test, type Page } from '@playwright/test';

/// The Arrival, in a real browser.
///
/// What this owes, beyond the unit tests: that the opening actually presents — field, title card,
/// narration, descent and cut — that it holds the player's keys while it does, that the skip key
/// lands on the same game, and that reloading, a New Game and a Save load each begin it or
/// bypass it as they should (ADR 0032).
///
/// The Departure precedes it (ADR 0040): every fresh opening here first commits the one
/// Destination from deep space, with the journey hurried by the settings so these tests stay
/// about the Arrival. The Departure's own E2E is `departure.e2e.ts`.

const RESUME_KEY = 'mercenary.browser-shell.session-resume.v1';

const surfaceOf = (page: Page) => page.locator('#game-surface');

const panelField = (page: Page, name: string) =>
  page.locator(`#panel-targ [data-field="${name}"]`);

/// Slow the Arrival right down, so a test can catch it in a state it would otherwise fly past,
/// and hurry the Departure's journey in front of it.
const slowArrival = async (page: Page, holdSeconds: number): Promise<void> => {
  await page.route('**/settings.json', async route => {
    const response = await route.fetch();
    const settings = (await response.json()) as {
      arrival: { holdSeconds: number };
      departure: { journeySeconds: number };
    };
    settings.arrival.holdSeconds = holdSeconds;
    settings.departure.journeySeconds = 0.2;
    await route.fulfill({ json: settings, response });
  });
};

const arrived = async (page: Page): Promise<void> => {
  await expect(surfaceOf(page)).toHaveAttribute('data-state', 'ready');
};

/// Commit the one Destination from deep space, so the Arrival can begin.
const depart = async (page: Page): Promise<void> => {
  await expect(surfaceOf(page)).toHaveAttribute('data-departure', 'carousel');
  await page.keyboard.press('Enter');
  await expect(surfaceOf(page)).toHaveAttribute('data-departure', 'done');
};

test('the Arrival presents the opening and lands on the game', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await slowArrival(page, 6);
  await page.goto('/');
  const surface = surfaceOf(page);
  await arrived(page);
  await depart(page);

  // The title card, over the Arrival Field, with the readouts still asterisks.
  await expect(surface).toHaveAttribute('data-arrival', 'titleCard');
  await expect(panelField(page, 'message')).toHaveText('M E R C E N A R Y');
  await expect(panelField(page, 'altitude')).toHaveText('*****');
  await expect(panelField(page, 'locationLabel')).toHaveText('**-**');
  await expect(panelField(page, 'speed')).toHaveText('*****');
  // The field draws points and no wireframe at all.
  await expect(page.locator('#frame')).toHaveAttribute('data-lines', '0');

  // Then Benson starts talking, and the ship is on its way.
  await expect(surface).toHaveAttribute('data-arrival', 'space');
  await expect(panelField(page, 'message')).toContainText('NOVADRIVE', {
    timeout: 20_000
  });
  await expect(
    panelField(page, 'message').locator(':scope > .benson-cell')
  ).toHaveCount(23);

  // The player cannot fly the wreck they are about to become.
  const before = await page.locator('#frame').getAttribute('data-x');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('KeyB');
  expect(await page.locator('#frame').getAttribute('data-x')).toBe(before);

  // Skipping lands on the game itself: the crash site, at the Pose the game has always opened
  // on, with the opening report beginning.
  await page.keyboard.press('Space');
  await expect(surface).toHaveAttribute('data-arrival', 'done');
  await expect(panelField(page, 'locationLabel')).toHaveText('08-08');
  await expect(panelField(page, 'altitude')).toHaveText('00000');
  await expect(page.locator('#frame')).toHaveAttribute('data-x', '559104');
  await expect(page.locator('#frame')).toHaveAttribute('data-z', '559104');
  await expect(panelField(page, 'message')).not.toHaveText('');

  // And the keys are the player's again.
  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () =>
      Number(await page.locator('#frame').getAttribute('data-z'))
    )
    .not.toBe(559_104);
  await page.keyboard.up('ArrowUp');

  expect(errors).toEqual([]);
});

test('the Arrival reaches Targ, the ground and the cut on its own', async ({
  page
}) => {
  // Watching a whole opening, even a hurried one, takes longer than a default test allows.
  test.setTimeout(180_000);
  // Watched rather than skipped, at a pace a test can sit through: every state in order.
  await slowArrival(page, 0.05);
  await page.goto('/');
  const surface = surfaceOf(page);
  await arrived(page);
  await depart(page);

  const seen: string[] = [];
  await expect
    .poll(
      async () => {
        const phase = await surface.getAttribute('data-arrival');
        if (phase !== null && seen.at(-1) !== phase) {
          seen.push(phase);
        }
        return seen.at(-1);
      },
      { intervals: [50], timeout: 90_000 }
    )
    .toBe('done');

  expect(seen).toEqual([
    'titleCard',
    'space',
    'planetApproach',
    'descent',
    'blackout',
    'groundVerdict',
    'done'
  ]);
});

test('the descent draws Targ itself and counts the fall down', async ({
  page
}) => {
  // The readouts stay asterisks until the height fits the altimeter, well into the script.
  test.setTimeout(120_000);
  await slowArrival(page, 0.05);
  await page.goto('/');
  const surface = surfaceOf(page);
  await arrived(page);
  await depart(page);

  await expect(surface).toHaveAttribute('data-arrival', 'descent', {
    timeout: 60_000
  });
  // The world renderer, not the field: the city is being drawn.
  await expect
    .poll(async () =>
      Number(await page.locator('#frame').getAttribute('data-lines'))
    )
    .toBeGreaterThan(0);
  // Live readouts once the height fits the altimeter, and an altimeter that only ever falls.
  await expect(panelField(page, 'locationLabel')).toHaveText('08-08', {
    timeout: 60_000
  });
  await expect(panelField(page, 'speed')).toHaveText('+0000');
  const first = Number(await panelField(page, 'altitude').innerText());
  expect(first).toBeGreaterThan(1000);
  await expect
    .poll(async () => Number(await panelField(page, 'altitude').innerText()))
    .toBeLessThan(first);
});

test('the System Menu freezes the Arrival it covers', async ({ page }) => {
  await slowArrival(page, 6);
  await page.goto('/');
  const surface = surfaceOf(page);
  await arrived(page);
  await depart(page);
  await expect(surface).toHaveAttribute('data-arrival', 'space', {
    timeout: 20_000
  });

  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'menu');
  const held = await panelField(page, 'message').innerText();
  await page.waitForTimeout(1200);

  expect(await panelField(page, 'message').innerText()).toBe(held);

  // And it carries on from where it was rather than starting again.
  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'none');
  await expect(surface).not.toHaveAttribute('data-arrival', 'titleCard');
});

test('a reload during the Arrival begins the opening again', async ({
  page
}) => {
  await slowArrival(page, 6);
  await page.goto('/');
  await arrived(page);
  await depart(page);
  await expect(surfaceOf(page)).toHaveAttribute('data-arrival', 'space', {
    timeout: 20_000
  });

  await page.reload();
  await arrived(page);

  // Nothing is checkpointed while the field is up, so the opening starts over — from deep space,
  // since no Session Resume was recorded — rather than resuming halfway through a sequence the
  // Session Resume never recorded.
  await depart(page);
  await expect(surfaceOf(page)).toHaveAttribute('data-arrival', 'titleCard');
});

test('a New Game plays the Arrival again and a resumed game does not', async ({
  page
}) => {
  await slowArrival(page, 0.05);
  await page.goto('/');
  const surface = surfaceOf(page);
  await arrived(page);
  await depart(page);
  await page.keyboard.press('Space');
  await expect(surface).toHaveAttribute('data-arrival', 'done');

  // A resumed session is a game already under way.
  await expect
    .poll(
      async () =>
        await page.evaluate(
          key => localStorage.getItem(key) !== null,
          RESUME_KEY
        )
    )
    .toBe(true);
  await page.reload();
  await arrived(page);
  await expect(surface).toHaveAttribute('data-arrival', 'done');

  // A New Game is not.
  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'menu');
  const newGame = page.locator('#new-game');
  await newGame.click();
  await expect(newGame).toHaveText('CONFIRM NEW GAME');
  await newGame.click();
  await depart(page);
  await expect(surface).toHaveAttribute('data-arrival', 'titleCard');
});

test('a loaded Save bypasses the Arrival', async ({ page }) => {
  await slowArrival(page, 0.05);
  await page.goto('/');
  const surface = surfaceOf(page);
  await arrived(page);
  await depart(page);
  await page.keyboard.press('Space');
  await expect(surface).toHaveAttribute('data-arrival', 'done');

  await page.keyboard.press('Backquote');
  await page.locator('#console-input').type('save 1');
  await page.keyboard.press('Enter');
  await expect(page.locator('#console-log')).toContainText('saved slot 1');
  await page.locator('#console-input').type('load 1');
  await page.keyboard.press('Enter');

  await expect(surface).toHaveAttribute('data-arrival', 'done');
});
