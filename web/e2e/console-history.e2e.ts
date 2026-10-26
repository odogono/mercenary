import { expect, test } from '@playwright/test';

import { CONSOLE_HISTORY_LIMIT } from '../src/shell/consoleHistory.ts';
import { APPROACH_LOCAL, bootAt, run } from './damocles-play.ts';

test('Damocles console commands complete after the transcript reaches its limit', async ({
  page
}) => {
  await page.addInitScript(limit => {
    localStorage.setItem(
      'mercenary.browser-shell.damocles.console-history.v1',
      JSON.stringify({
        commands: [],
        scrollback: Array.from({ length: limit }, (_, i) => `old line ${i}`)
      })
    );
  }, CONSOLE_HISTORY_LIMIT);
  await bootAt(page, APPROACH_LOCAL);
  expect(await run(page, 'where')).toContain('ERIS 07-08');
  expect(await run(page, 'save 1')).toContain('saved slot 1');
  expect(await run(page, 'save 1 confirm')).toContain('saved slot 1');
  await expect(page.locator('#console-log > *')).toHaveCount(
    CONSOLE_HISTORY_LIMIT
  );
});

for (const [title, path, ready] of [
  ['Targ', '/', '#game-surface'],
  ['Damocles', '/damocles', '#frame'],
  ['Dion', '/dion', '#screen']
] as const) {
  test(`${title} retains console commands and their output across a reload`, async ({
    page
  }) => {
    await page.goto(path);
    await expect(page.locator(ready)).toHaveAttribute('data-state', 'ready');
    await page.keyboard.press('`');
    const input = page.locator('#console-input');
    const log = page.locator('#console-log');
    // Benson lines are retained too, but one can complete between capture and reload;
    // compare only the command lines so that timing cannot fail the test.
    const commandTranscript = async () =>
      (await log.locator('div').allTextContents()).filter(
        line => !line.startsWith('BENSON · ')
      );
    await input.fill('HELP');
    await input.press('Enter');
    await expect(log).toContainText('] HELP');
    const transcript = await commandTranscript();
    expect(transcript.length).toBeGreaterThan(3);

    await page.reload();
    await expect(page.locator(ready)).toHaveAttribute('data-state', 'ready');
    await page.keyboard.press('`');
    expect(await commandTranscript()).toEqual(transcript);
    await input.press('ArrowUp');
    await expect(input).toHaveValue('HELP');
    await input.press('ArrowDown');
    await expect(input).toHaveValue('');
  });
}
