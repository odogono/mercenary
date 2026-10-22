import { expect, test } from '@playwright/test';

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
