import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/// The Departure, in a real browser.
///
/// What this owes, beyond the unit tests: that boot lands in deep space with no game under way,
/// that Enter and Space commit and the journey then joins the unchanged Arrival at its title
/// card, that the Skip control alone hurries the journey and lands on the same game, that a
/// Session Resume bypasses deep space and a New Game returns to it, and that reduced motion is
/// honoured (ADR 0040).

const RESUME_KEY = 'mercenary.browser-shell.session-resume.v1';

const surfaceOf = (page: Page) => page.locator('#game-surface');

const panelField = (page: Page, name: string) =>
  page.locator(`#panel-targ [data-field="${name}"]`);

interface Tuning {
  readonly holdSeconds?: number;
  readonly journeySeconds?: number;
  readonly reducedMotionJourneySeconds?: number;
}

/// Retune the opening so a test can catch it in a state it would otherwise fly past, or hurry
/// through one it is not about.
const tune = async (page: Page, tuning: Tuning): Promise<void> => {
  await page.route('**/settings.json', async route => {
    const response = await route.fetch();
    const settings = (await response.json()) as {
      arrival: { holdSeconds: number };
      departure: {
        journeySeconds: number;
        reducedMotionJourneySeconds: number;
      };
    };
    if (tuning.holdSeconds !== undefined) {
      settings.arrival.holdSeconds = tuning.holdSeconds;
    }
    if (tuning.journeySeconds !== undefined) {
      settings.departure.journeySeconds = tuning.journeySeconds;
    }
    if (tuning.reducedMotionJourneySeconds !== undefined) {
      settings.departure.reducedMotionJourneySeconds =
        tuning.reducedMotionJourneySeconds;
    }
    await route.fulfill({ json: settings, response });
  });
};

const ready = async (page: Page): Promise<void> => {
  await expect(surfaceOf(page)).toHaveAttribute('data-state', 'ready');
};

const inDeepSpace = async (page: Page): Promise<void> => {
  await ready(page);
  await expect(surfaceOf(page)).toHaveAttribute('data-departure', 'carousel');
};

const resumeStored = async (page: Page): Promise<boolean> =>
  await page.evaluate(key => localStorage.getItem(key) !== null, RESUME_KEY);

test('boot lands in deep space with Targ offered and no game under way', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await inDeepSpace(page);
  const surface = surfaceOf(page);

  // The one Destination, and only a Commit to go with it.
  const departure = page.locator('#departure');
  await expect(departure).toBeVisible();
  await expect(departure.locator('.departure-name')).toHaveText('TARG');
  await expect(departure.locator('.departure-destination')).toHaveCount(1);
  await expect(page.locator('#departure-commit')).toBeVisible();
  await expect(page.locator('#departure-skip')).toBeHidden();

  // The Benson Panel is present throughout, unmeasured, with nothing in its window.
  await expect(panelField(page, 'altitude')).toHaveText('*****');
  await expect(panelField(page, 'locationLabel')).toHaveText('**-**');
  await expect(panelField(page, 'speed')).toHaveText('*****');
  await expect(panelField(page, 'message')).toHaveText('');
  // Deep space is drawn as points alone.
  await expect(page.locator('#frame')).toHaveAttribute('data-lines', '0');
  // The title card is the Arrival's first beat, and the Arrival has not begun.
  await expect(surface).toHaveAttribute('data-arrival', 'titleCard');

  // Nothing moves the player, and nothing is recorded: a reload comes back here.
  const before = await page.locator('#frame').getAttribute('data-x');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('KeyB');
  await page.waitForTimeout(300);
  expect(await page.locator('#frame').getAttribute('data-x')).toBe(before);
  expect(await resumeStored(page)).toBe(false);
  await page.reload();
  await inDeepSpace(page);

  expect(errors).toEqual([]);
});

test('committing flies to Targ and joins the Arrival at its title card', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await tune(page, { holdSeconds: 6, journeySeconds: 2 });
  await page.goto('/');
  await inDeepSpace(page);
  const surface = surfaceOf(page);

  await page.keyboard.press('Enter');
  await expect(page.locator('#departure')).toBeHidden();
  await expect(page.locator('#departure-skip')).toBeVisible();

  const seen: string[] = [];
  await expect
    .poll(
      async () => {
        const phase = await surface.getAttribute('data-departure');
        if (phase !== null && seen.at(-1) !== phase) {
          seen.push(phase);
        }
        return seen.at(-1);
      },
      { intervals: [20], timeout: 15_000 }
    )
    .toBe('done');
  expect(seen).toEqual(['interstellar', 'flyby', 'convergence', 'done']);

  // The join: the Arrival begins with its own first beat, on the same field.
  await expect(page.locator('#departure-skip')).toBeHidden();
  await expect(surface).toHaveAttribute('data-arrival', 'titleCard');
  await expect(panelField(page, 'message')).toHaveText('M E R C E N A R Y');
  await expect(panelField(page, 'altitude')).toHaveText('*****');
  await expect(page.locator('#frame')).toHaveAttribute('data-lines', '0');
  await expect(surface).toHaveAttribute('data-arrival', 'space', {
    timeout: 20_000
  });

  expect(errors).toEqual([]);
});

test('Space commits from deep space and does nothing during the journey', async ({
  page
}) => {
  await tune(page, { journeySeconds: 30 });
  await page.goto('/');
  await inDeepSpace(page);
  const surface = surfaceOf(page);

  await page.keyboard.press('Space');
  await expect(surface).toHaveAttribute('data-departure', 'interstellar');

  // The journey is hurried by its Skip control alone: the key that skips the Arrival is inert.
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  await expect(surface).toHaveAttribute('data-departure', 'interstellar');
  await expect(surface).toHaveAttribute('data-arrival', 'titleCard');
});

test('Skip during the journey lands on the game itself', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await tune(page, { journeySeconds: 30 });
  await page.goto('/');
  await inDeepSpace(page);
  const surface = surfaceOf(page);

  await page.locator('#departure-commit').click();
  await expect(surface).toHaveAttribute('data-departure', 'interstellar');
  await page.locator('#departure-skip').click();

  // Straight through the journey and the Arrival to the crash site, at the Pose the game has
  // always opened on, with the opening report beginning.
  await expect(surface).toHaveAttribute('data-departure', 'done');
  await expect(surface).toHaveAttribute('data-arrival', 'done');
  await expect(page.locator('#departure-skip')).toBeHidden();
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

test('a Session Resume bypasses deep space and a New Game returns to it', async ({
  page
}) => {
  await tune(page, { journeySeconds: 30 });
  await page.goto('/');
  await inDeepSpace(page);
  const surface = surfaceOf(page);
  await page.keyboard.press('Enter');
  await page.locator('#departure-skip').click();
  await expect(surface).toHaveAttribute('data-arrival', 'done');

  // A resumed session is a game already under way: its Destination is chosen.
  await expect.poll(async () => await resumeStored(page)).toBe(true);
  await page.reload();
  await ready(page);
  await expect(surface).toHaveAttribute('data-departure', 'done');
  await expect(surface).toHaveAttribute('data-arrival', 'done');
  await expect(page.locator('#departure')).toBeHidden();

  // A New Game is not: it asks where to fly again.
  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'menu');
  const newGame = page.locator('#new-game');
  await newGame.click();
  await expect(newGame).toHaveText('CONFIRM NEW GAME');
  await newGame.click();
  await expect(surface).toHaveAttribute('data-layer', 'none');
  await inDeepSpace(page);
  await expect(page.locator('#departure')).toBeVisible();
});

test('the System Menu is reachable from deep space and a Save loaded there bypasses the opening', async ({
  page
}) => {
  await tune(page, { journeySeconds: 30 });
  await page.goto('/');
  await inDeepSpace(page);
  const surface = surfaceOf(page);
  await page.keyboard.press('Enter');
  await page.locator('#departure-skip').click();
  await expect(surface).toHaveAttribute('data-arrival', 'done');
  await page.keyboard.press('Backquote');
  await page.locator('#console-input').type('save 1');
  await page.keyboard.press('Enter');
  await expect(page.locator('#console-log')).toContainText('saved slot 1');
  await page.keyboard.press('Backquote');

  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'menu');
  const newGame = page.locator('#new-game');
  await newGame.click();
  await newGame.click();
  await inDeepSpace(page);

  // The menu opens over deep space, and loading the Save from it is a game already under way.
  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'menu');
  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'none');
  await inDeepSpace(page);
  await page.keyboard.press('Backquote');
  await page.locator('#console-input').type('load 1');
  await page.keyboard.press('Enter');
  await expect(surface).toHaveAttribute('data-departure', 'done');
  await expect(surface).toHaveAttribute('data-arrival', 'done');
});

test('reduced motion selects the shorter journey', async ({ page }) => {
  await tune(page, { journeySeconds: 60, reducedMotionJourneySeconds: 1 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await inDeepSpace(page);
  const surface = surfaceOf(page);
  await expect(surface).toHaveAttribute('data-departure-motion', 'reduced');

  await page.keyboard.press('Enter');
  await expect(surface).toHaveAttribute('data-departure', 'done', {
    timeout: 5000
  });
  await expect(surface).toHaveAttribute('data-arrival', 'titleCard');
});

test('regenerates the Departure review frames', async ({ page }) => {
  test.skip(process.env['UPDATE_REFERENCE_FRAMES'] !== '1');
  // A slowed journey, watched whole, takes longer than a default test allows.
  test.setTimeout(120_000);
  await page.setViewportSize({ height: 1000, width: 1280 });
  await tune(page, { holdSeconds: 60, journeySeconds: 40 });
  await page.goto('/');
  await inDeepSpace(page);
  const surface = surfaceOf(page);
  const capture = async (name: string): Promise<void> => {
    await surface.screenshot({
      path: resolve(`../docs/frames/departure-${name}.png`)
    });
  };

  await capture('carousel');
  await page.keyboard.press('Enter');
  await expect(surface).toHaveAttribute('data-departure', 'flyby', {
    timeout: 20_000
  });
  // Halfway through the flyby, where the roster is largest.
  await page.waitForTimeout(8000);
  await capture('flyby');
  await expect(surface).toHaveAttribute('data-departure', 'done', {
    timeout: 40_000
  });
  await expect(surface).toHaveAttribute('data-arrival', 'titleCard');
  await capture('join');
});
