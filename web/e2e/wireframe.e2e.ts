import { expect, test } from '@playwright/test';

test('an Authentic frame is unchanged by an Enhanced frame drawn in the same canvas', async ({
  page
}, testInfo) => {
  await page.goto('/e2e/wireframe-fixture.html');
  const result = page.locator('#result');
  await expect(result).toHaveAttribute('data-state', 'ready');
  const report = JSON.parse((await result.textContent())!) as Record<
    string,
    number
  >;
  await testInfo.attach('render-metrics', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json'
  });
  expect.soft(report['core']).toBe(255);
  expect.soft(report['enhancedGround']).toBe(255);
  expect.soft(report['authenticDifference']).toBe(0);
  expect.soft(report['webglError']).toBe(0);
});
