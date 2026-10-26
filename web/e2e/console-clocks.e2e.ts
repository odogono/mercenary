import { expect, test } from '@playwright/test';

import { pauseClock } from './clock.ts';

for (const [title, path, ready, command, response, key] of [
  [
    'Damocles',
    '/damocles',
    '#frame',
    'impact +1:02:03',
    'impact 01-02-03 since impact',
    'mercenary.browser-shell.damocles.session-resume.v1'
  ],
  [
    'Dion',
    '/dion',
    '#screen',
    'clock 9-01-02',
    'clock 09:01:02',
    'mercenary.browser-shell.dion.session-resume.v1'
  ]
] as const) {
  test(`${title} console sets its clocks, checkpoints while paused and closes before the menu`, async ({
    page
  }) => {
    // Reload resumes play. Hold browser time so the readback checks the saved clock exactly.
    await pauseClock(page);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(path);
    await expect(page.locator(ready)).toHaveAttribute('data-state', 'ready');
    await page.keyboard.press('Escape');
    await page.keyboard.press('`');
    const input = page.getByRole('textbox', { name: 'console command' });
    await expect(input).toBeFocused();
    await input.fill('time 12:00:00');
    await input.press('Enter');
    await expect(page.locator('#console-log')).toContainText('time 12:00:00');
    await input.fill(command);
    await input.press('Enter');
    await expect(page.locator('#console-log')).toContainText(response);
    if (title === 'Damocles') {
      await input.fill('rate 0.25');
      await input.press('Enter');
      await expect(page.locator('#console-log div').last()).toHaveText(
        'rate 0.25x'
      );
    }
    const stored = await page.evaluate(key => localStorage.getItem(key), key);
    expect(stored).not.toBeNull();
    await page.keyboard.press('Escape');
    await expect(page.locator('#game-surface')).toHaveAttribute(
      'data-console',
      'closed'
    );
    await expect(page.locator('#game-surface')).toHaveAttribute(
      'data-layer',
      'menu'
    );
    await page.reload();
    await expect(page.locator(ready)).toHaveAttribute('data-state', 'ready');
    await page.keyboard.press('Escape');
    await page.keyboard.press('`');
    await input.fill(title === 'Dion' ? 'clock' : 'impact');
    await input.press('Enter');
    await expect(page.locator('#console-log div').last()).toHaveText(response);
    if (title === 'Damocles') {
      await input.fill('rate');
      await input.press('Enter');
      await expect(page.locator('#console-log div').last()).toHaveText(
        'rate 0.25x'
      );
    }
    await input.fill('time');
    await input.press('Enter');
    await expect(page.locator('#console-log div').last()).toHaveText(
      /time 12:00:\d{2}/
    );
    expect(errors).toEqual([]);
  });
}
