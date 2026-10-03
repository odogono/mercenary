import { expect, test } from '@playwright/test';

import { watchErrors } from './damocles-play.ts';

/// Seven reproducible review images, plus the live-session controls exercised by
/// damocles-head-commands, authors-computer, craft, encounter and boarding suites.
test('captures deterministic recovered-panel states for ADR 0011 review', async ({
  page
}, testInfo) => {
  const errors = watchErrors(page);
  for (const state of [
    'on-foot',
    'aboard',
    'airborne',
    'document',
    'reveal',
    'computer',
    'space'
  ]) {
    await page.goto(`/e2e/damocles-panel-fixture.html?state=${state}`);
    const panel = page.locator('#panel');
    await expect(panel).toHaveAttribute('data-state', 'ready');
    const before = await panel.evaluate(node =>
      (node as HTMLCanvasElement).toDataURL()
    );
    await page.reload();
    await expect(panel).toHaveAttribute('data-state', 'ready');
    expect(
      await panel.evaluate(node => (node as HTMLCanvasElement).toDataURL())
    ).toBe(before);
    const path = testInfo.outputPath(`damocles-panel-${state}.png`);
    await panel.screenshot({ path });
    await testInfo.attach(`damocles-panel-${state}`, {
      contentType: 'image/png',
      path
    });
  }
  expect(errors).toEqual([]);
});
