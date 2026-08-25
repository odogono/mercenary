import { expect, test, type Page } from '@playwright/test';

/// The Escape's terminal presentation, in a real browser.
///
/// The Ending is reached here by planting the phase into a Save and loading it
/// through the Shell Console, rather than by playing a whole legal route: the
/// routes themselves are proven in `test/escape.test.ts`, and what this owes is
/// that the browser draws the field, matures it on its own, and survives doing
/// so. The Shell Console is allowed to write play (ADR 0028), which is why the
/// session it produces is not a trace.

const RESUME_KEY = 'mercenary.browser-shell.session-resume.v1';
const SLOT_KEY = 'mercenary.browser-shell.save.v1.slot-1';

interface EndingState {
  readonly field: 'none' | 'running';
  readonly phase: number;
}

const command = async (page: Page, line: string): Promise<void> => {
  await page.locator('#console-input').type(line);
  await page.keyboard.press('Enter');
};

const endingState = async (page: Page): Promise<EndingState> =>
  await page.evaluate(key => {
    const stored = localStorage.getItem(key);
    if (stored === null) {
      throw new Error('the Session Resume is empty');
    }
    const save = JSON.parse(stored) as {
      snapshot: {
        benson: { host: { endingPhase: number } } | null;
        ending: unknown;
      };
    };
    return {
      field: save.snapshot.ending === null ? 'none' : 'running',
      phase: save.snapshot.benson?.host.endingPhase ?? 0
    };
  }, RESUME_KEY);

test('the Escape presents its field and matures itself', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const surface = page.locator('#game-surface');
  await expect(surface).toHaveAttribute('data-state', 'ready');

  await page.keyboard.press('Backquote');
  await command(page, 'save 1');
  await expect(page.locator('#console-log')).toContainText('saved slot 1');

  // The Ending, planted into the Save the console just wrote.
  await page.evaluate(key => {
    const save = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      snapshot: { benson: { host: { endingPhase: number } } };
    };
    save.snapshot.benson.host.endingPhase = 1;
    localStorage.setItem(key, JSON.stringify(save));
  }, SLOT_KEY);
  await command(page, 'load 1');
  await expect(page.locator('#console-log')).toContainText('restored slot 1');
  await page.keyboard.press('Backquote');

  // Early in the sequence the field is up but its first colour pair draws the
  // points in the colour behind them, so the screen is one flat colour.
  await page.waitForTimeout(1000);
  // The Session Resume is throttled, so what it holds here is the checkpoint the
  // load forced: the scripted phase, before the field had been created.
  expect((await endingState(page)).phase).toBe(1);
  const early = await page.locator('#frame').screenshot();

  // The colour sequence reaches its last pair on the decoded loop and writes the
  // mature phase itself. Nothing in the shell is counting; the field is.
  await page.waitForTimeout(2500);
  const matured = await endingState(page);
  expect(matured).toEqual({ field: 'running', phase: 255 });
  const late = await page.locator('#frame').screenshot();
  expect(late.equals(early)).toBe(false);

  // The loop does not return: it keeps presenting, and keeps the phase it has.
  await page.waitForTimeout(1000);
  expect(await endingState(page)).toEqual({ field: 'running', phase: 255 });
  expect(errors).toEqual([]);
});
