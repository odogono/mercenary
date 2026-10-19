import { expect, test, type Page } from '@playwright/test';

/// A console-assisted recovered Escape, in a real browser.
///
/// The Shell Console removes only the journey between objects: taking the
/// Novadrive, boarding both craft, riding the Room-5 lift and answering the
/// launch prompt all remain ordinary play. That makes this a smoke test of the
/// complete browser path into the Ending, not a legal-route proof: `goto`
/// bypasses the locked-Room journey, makes the session ineligible for a trace,
/// and is admitted for exactly that development use by ADR 0028. The legal
/// predicate and its refusal arms remain proven in `test/escape.test.ts`.

const RESUME_KEY = 'mercenary.browser-shell.session-resume.v1';
const SCRIPT_RUNNING = 0x40;

interface SessionState {
  readonly carried: readonly number[];
  readonly craft: number | null;
  readonly credits: number;
  readonly field: 'none' | 'running';
  readonly phase: number;
  readonly room: number | null;
  readonly scriptRunning: boolean;
}

const sessionState = async (page: Page): Promise<SessionState> =>
  await page.evaluate(
    ({ key, scriptRunning }) => {
      const stored = localStorage.getItem(key);
      if (stored === null) {
        throw new Error('the Session Resume is empty');
      }
      const save = JSON.parse(stored) as {
        snapshot: {
          benson: {
            host: {
              decimals: readonly number[];
              endingPhase: number;
              engineFlags: number;
            };
          } | null;
          carriedStack: readonly number[];
          ending: unknown;
          game: { craft: number | null; room: number | null };
        };
      };
      const host = save.snapshot.benson?.host;
      return {
        carried: save.snapshot.carriedStack,
        craft: save.snapshot.game.craft,
        credits: host?.decimals[8] ?? 0,
        field: save.snapshot.ending === null ? 'none' : 'running',
        phase: host?.endingPhase ?? 0,
        room: save.snapshot.game.room,
        scriptRunning:
          host === undefined ? false : (host.engineFlags & scriptRunning) !== 0
      };
    },
    { key: RESUME_KEY, scriptRunning: SCRIPT_RUNNING }
  );

const command = async (
  page: Page,
  line: string,
  result: string
): Promise<void> => {
  await page.keyboard.press('Backquote');
  await page.locator('#console-input').fill(line);
  await page.keyboard.press('Enter');
  await expect(page.locator('#console-log')).toContainText(result);
  await page.keyboard.press('Backquote');
};

const nextFrame = async (page: Page): Promise<void> => {
  await page.evaluate(
    () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  );
};

test('E rides the Colony Craft lift down and back up through the Browser Shell', async ({
  page
}) => {
  await page.goto('/');
  const surface = page.locator('#game-surface');
  await expect(surface).toHaveAttribute('data-state', 'ready');
  await page.keyboard.press('Space');
  await page.locator('#departure-skip').click();
  await expect(surface).toHaveAttribute('data-arrival', 'done');

  await command(page, 'goto room 8', 'teleported to ROOM 08');
  await expect.poll(async () => (await sessionState(page)).room).toBe(8);

  await page.keyboard.press('KeyE');
  await expect
    .poll(async () => (await sessionState(page)).room, { timeout: 10_000 })
    .toBeNull();
  await expect(
    page.locator('#panel-targ [data-field="locationLabel"]')
  ).toHaveText('08-08');
  await expect(page.locator('#panel-targ [data-field="altitude"]')).toHaveText(
    '16639'
  );

  await page.keyboard.press('KeyE');
  await expect
    .poll(async () => (await sessionState(page)).room, { timeout: 10_000 })
    .toBe(8);
});

test('the console-assisted recovered route reaches and matures the Escape', async ({
  page
}) => {
  // Leaving the surface brings the Dart's job offer, which plays out before
  // the Escape's first line: Benson Script 7 used to cut it off.
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const surface = page.locator('#game-surface');
  const frame = page.locator('#frame');
  await expect(surface).toHaveAttribute('data-state', 'ready');

  // The Departure and the Arrival have their own E2E. This route begins at the
  // fresh game's crash site, then completes the opening transaction through
  // ordinary input.
  await page.keyboard.press('Space');
  await page.locator('#departure-skip').click();
  await expect(surface).toHaveAttribute('data-arrival', 'done');
  // Skipping while this question scrolls would erase it before the full text is visible.
  await expect(
    page.locator('#panel-targ [data-field="message"]')
  ).toContainText('DO YOU WANT TO BUY?', { timeout: 60_000 });
  await expect
    .poll(
      async () => {
        await page.keyboard.press('KeyY');
        return (await sessionState(page)).credits;
      },
      { intervals: [100], timeout: 10_000 }
    )
    .toBe(4000);
  // The purchase branch has two reports and a blank terminator before its
  // craft poll. Four ordinary skips are deliberately harmless if the poll is
  // already running, and keep Space's aboard meaning out of this sequence.
  for (let message = 0; message < 4; message += 1) {
    await page.keyboard.press('Space');
    await nextFrame(page);
  }

  // Script 00 must see the bought Dart boarded before another Benson Script
  // can start. The console saves the walk to it; B and L remain real actions.
  await command(page, 'goto object 1', 'moved to object 01 on SURFACE');
  await page.keyboard.press('KeyB');
  await expect.poll(async () => (await sessionState(page)).craft).toBe(1);
  await expect
    .poll(async () => (await sessionState(page)).scriptRunning, {
      timeout: 10_000
    })
    .toBe(false);
  await page.keyboard.press('KeyL');
  await expect.poll(async () => (await sessionState(page)).craft).toBeNull();

  // Travel is abbreviated; acquiring the recovered route's authorization is
  // not. The normal Take action still owns capacity, weight, flags and scripts.
  await command(page, 'goto object 25', 'moved to object 25 in ROOM 137');
  await page.keyboard.press('KeyT');
  await expect
    .poll(async () => (await sessionState(page)).carried)
    .toContain(25);

  await command(page, 'goto object 7', 'moved to object 07 in ROOM 05');
  await page.keyboard.press('KeyB');
  await expect
    .poll(async () => {
      const state = await sessionState(page);
      return { craft: state.craft, room: state.room };
    })
    .toEqual({ craft: 7, room: 5 });

  // E takes the real occupancy-preserving lift. A surface `goto` here would
  // skip the recovered route's most important integration boundary.
  await page.keyboard.press('KeyE');
  await expect
    .poll(
      async () => {
        const state = await sessionState(page);
        return { craft: state.craft, room: state.room };
      },
      { timeout: 10_000 }
    )
    .toEqual({ craft: 7, room: null });

  const message = page.locator('#panel-targ [data-field="message"]');
  await expect(message).toContainText('PRESS Y TO LAUNCH', {
    timeout: 30_000
  });
  await expect
    .poll(
      async () => {
        await page.keyboard.press('KeyY');
        return (await sessionState(page)).phase;
      },
      { intervals: [100], timeout: 20_000 }
    )
    .toBe(1);

  // The field is created by the Gameplay Session after the script's write.
  // Its first colour pair is flat; later pairs visibly evolve the same field.
  await expect(frame).toHaveAttribute('data-points', '21');
  const early = await frame.screenshot();
  await expect
    .poll(async () => await sessionState(page), {
      intervals: [100],
      timeout: 10_000
    })
    .toMatchObject({ field: 'running', phase: 255 });
  const late = await frame.screenshot();
  expect(late.equals(early)).toBe(false);
  expect(errors).toEqual([]);
});
