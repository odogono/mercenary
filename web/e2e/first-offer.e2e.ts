import { expect, test, type Page } from '@playwright/test';

const execute = async (page: Page, count = 1) => {
  for (let index = 0; index < count; index++) {
    await page
      .getByRole('button', { exact: true, name: 'Execute one step' })
      .click();
  }
};
const polling = async (page: Page) => {
  await execute(page, 3);
  await page.getByRole('button', { name: 'Complete message' }).click();
  await execute(page);
};
const combined = async (page: Page, key: string, ticks: string) => {
  await page.getByLabel('Response latch').selectOption(key);
  await page.getByLabel('Counter ticks to add').fill(ticks);
  await page
    .getByRole('button', { name: 'Apply inputs and execute one step' })
    .click();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/damocles/first-offer');
  await expect(
    page.getByRole('heading', { name: 'First-offer research demo' })
  ).toBeVisible();
});

for (const key of ['y', 'o', 'n', 'other', 'none']) {
  test(`${key} at the 500-tick boundary`, async ({ page }) => {
    await polling(page);
    await combined(page, key, '500');
    await execute(page, 3);
    await expect(page.locator('#step')).toHaveText(
      key === 'y' || key === 'o' ? 'accepted' : 'next-offer'
    );
    await expect(page.locator('#effects')).toContainText('handoff');
  });
}

test('499 loops; late Y at 500 loses to timeout', async ({ page }) => {
  await polling(page);
  await combined(page, 'other', '499');
  await execute(page, 3);
  await expect(page.locator('#step')).toHaveText('check-y');
  await execute(page);
  await combined(page, 'y', '1');
  await execute(page, 2);
  await expect(page.locator('#step')).toHaveText('next-offer');
  await expect(page.locator('#effects')).not.toContainText(
    'request-acknowledgement'
  );
});

for (const phase of ['pending', 'mid-wait']) {
  test(`restore ${phase} without duplicate effects; invalid restore is atomic`, async ({
    page
  }) => {
    await execute(page, 3);
    if (phase === 'mid-wait') {
      await page.getByRole('button', { name: 'Complete message' }).click();
      await execute(page);
      await combined(page, 'o', '250');
    }
    await page.getByRole('button', { name: 'Save snapshot' }).click();
    const saved = await page.getByLabel('Prototype snapshot JSON').inputValue();
    const state = await page.locator('#state').innerText();
    await page.getByRole('button', { name: 'Reset demo' }).click();
    await page.getByRole('button', { name: 'Restore snapshot' }).click();
    await expect(page.locator('#state')).toHaveText(state);
    await expect(page.locator('#effects')).toHaveText(
      'No effects since reset or restore.'
    );
    for (const invalid of [
      '{',
      saved.replace('"scriptRevision": 1', '"scriptRevision": 99')
    ]) {
      await page.getByLabel('Prototype snapshot JSON').fill(invalid);
      await page.getByRole('button', { name: 'Restore snapshot' }).click();
      await expect(page.getByRole('alert')).toContainText('Restore failed');
      await expect(page.locator('#state')).toHaveText(state);
    }
    if (phase === 'pending') {
      await execute(page);
      await expect(page.locator('#state')).toHaveText(state);
      await page.getByRole('button', { name: 'Complete message' }).click();
      await execute(page);
      await combined(page, 'o', '0');
    }
    await execute(page);
    await expect(page.locator('#step')).toHaveText('accepted');
    await expect(page.locator('#effects')).not.toContainText('request-message');
    const effects = await page.locator('#effects').innerText();
    await execute(page, 2);
    await expect(page.locator('#effects')).toHaveText(effects);
  });
}

test('keyboard controls, responsive layout, no browser errors or storage access', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    for (const method of [
      'getItem',
      'setItem',
      'removeItem',
      'clear'
    ] as const) {
      Storage.prototype[method] = () => {
        throw new Error('Demo accessed browser storage');
      };
    }
  });
  await page.reload();
  await page
    .getByRole('button', { exact: true, name: 'Execute one step' })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#step')).toHaveText('clear-key');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Complete message' })
  ).toBeFocused();
  await page.getByRole('button', { name: 'Save snapshot' }).click();
  await page.getByRole('button', { name: 'Restore snapshot' }).click();
  await page.getByRole('button', { name: 'Reset demo' }).click();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ height: 900, width });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('separate inputs never execute; 499 to 500 times out only at its check', async ({
  page
}) => {
  await polling(page);
  await page.getByLabel('Response latch').selectOption('other');
  await page.getByRole('button', { name: 'Set response only' }).click();
  await page.getByLabel('Counter ticks to add').fill('499');
  await page.getByRole('button', { name: 'Advance ticks only' }).click();
  await expect(page.locator('#step')).toHaveText('check-y');
  await expect(page.locator('#key')).toHaveText('other');
  await execute(page, 4);
  await expect(page.locator('#step')).toHaveText('check-y');
  await page.getByLabel('Counter ticks to add').fill('1');
  await page.getByRole('button', { name: 'Advance ticks only' }).click();
  await expect(page.locator('#counter')).toHaveText('500');
  await expect(page.locator('#step')).toHaveText('check-y');
  await execute(page, 4);
  await expect(page.locator('#step')).toHaveText('next-offer');
});

test('invalid combined ticks retain state and effects', async ({ page }) => {
  await polling(page);
  const state = await page.locator('#state').innerText();
  const effects = await page.locator('#effects').innerText();
  for (const ticks of ['', '-1', '1.5', '9007199254740992']) {
    await combined(page, 'y', ticks);
    await expect(page.getByRole('alert')).not.toBeEmpty();
    await expect(page.locator('#state')).toHaveText(state);
    await expect(page.locator('#effects')).toHaveText(effects);
  }
  await combined(page, 'y', '0');
  await expect(page.locator('#step')).toHaveText('accepted');
});
