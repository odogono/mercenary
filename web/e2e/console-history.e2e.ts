import { expect, test } from '@playwright/test';

for (const [title, path, ready] of [
  ['Targ', '/', '#game-surface'],
  ['Damocles', '/damocles', '#frame'],
  ['Dion', '/dion', '#screen']
] as const) {
  test(`${title} retains console commands and their output across a reload`, async ({
    page
  }) => {
    test.fixme(
      title === 'Dion' && Boolean(process.env['CI']),
      'a Benson message races the reload on a CI runner: #852'
    );
    await page.goto(path);
    await expect(page.locator(ready)).toHaveAttribute('data-state', 'ready');
    await page.keyboard.press('`');
    const input = page.locator('#console-input');
    const log = page.locator('#console-log');
    await input.fill('HELP');
    await input.press('Enter');
    await expect(log).toContainText('] HELP');
    const transcript = await log.locator('div').allTextContents();
    expect(transcript.length).toBeGreaterThan(3);

    await page.reload();
    await expect(page.locator(ready)).toHaveAttribute('data-state', 'ready');
    await page.keyboard.press('`');
    expect(await log.locator('div').allTextContents()).toEqual(transcript);
    await input.press('ArrowUp');
    await expect(input).toHaveValue('HELP');
    await input.press('ArrowDown');
    await expect(input).toHaveValue('');
  });
}
