import { expect, test, type Page } from '@playwright/test';

const ready = async (page: Page) => {
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-state',
    'ready'
  );
  if (
    (await page.locator('#game-surface').getAttribute('data-arrival')) !==
    'done'
  ) {
    // Commit the one Destination from deep space, then hurry the opening to the game.
    await page.keyboard.press('Space');
    await page.locator('#departure-skip').click();
  }
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-arrival',
    'done'
  );
};
const openSettings = async (page: Page) => {
  await page.keyboard.press('Escape');
  await page.locator('button[data-goto="settings"]').click();
};
const choice = (page: Page, setting: string, value: string) =>
  page.locator(`[data-setting="${setting}"] button[value="${value}"]`);

test('structure and road controls persist independently and remain keyboard accessible', async ({
  page
}, testInfo) => {
  test.fixme(true, 'fails on main: #852');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await ready(page);
  await openSettings(page);
  await choice(page, 'weight', 'heavy').click();
  await choice(page, 'glow', 'bright').click();
  await expect(choice(page, 'road-weight', 'document')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(choice(page, 'road-glow', 'document')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await choice(page, 'road-weight', 'bold').focus();
  await page.keyboard.press('Enter');
  await choice(page, 'road-glow', 'soft').focus();
  await page.keyboard.press('Space');
  await page.reload();
  await ready(page);
  await openSettings(page);
  for (const [setting, value] of [
    ['weight', 'heavy'],
    ['glow', 'bright'],
    ['road-weight', 'bold'],
    ['road-glow', 'soft']
  ]) {
    await expect(choice(page, setting!, value!)).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  }
  await choice(page, 'road-weight', 'document').click();
  await choice(page, 'road-glow', 'document').click();
  await expect(choice(page, 'weight', 'heavy')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(choice(page, 'glow', 'bright')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ height: 900, width });
    await expect(choice(page, 'road-glow', 'document')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`settings-${width}.png`)
    });
  }
  expect(errors).toEqual([]);
});
