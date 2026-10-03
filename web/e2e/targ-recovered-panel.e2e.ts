import { expect, test } from '@playwright/test';

import { watchErrors } from './damocles-play.ts';

/// Review recovered artwork and authored C64 adapters as separate stable states.
test('captures deterministic Targ panel states', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  for (const state of [
    'pristine',
    'arrival',
    'on-foot',
    'airborne',
    'reverse',
    'room'
  ]) {
    await page.goto(`/e2e/targ-panel-fixture.html?state=${state}`);
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
    const path = testInfo.outputPath(`targ-panel-${state}.png`);
    await panel.screenshot({ path });
    await testInfo.attach(`targ-panel-${state}`, {
      contentType: 'image/png',
      path
    });
  }
  expect(errors).toEqual([]);
});
