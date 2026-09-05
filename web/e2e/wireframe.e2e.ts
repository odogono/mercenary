import { expect, test } from '@playwright/test';

for (const scale of [1, 2]) {
  test(`enhanced line ends and joins preserve coverage at ${scale}x`, async ({
    page
  }, testInfo) => {
    await page.goto(`/e2e/wireframe-fixture.html?scale=${scale}`);
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
    await page
      .locator('#frame')
      .screenshot({ path: testInfo.outputPath('heavy-bright.png') });
    expect.soft(report['webglError']).toBe(0);
    expect.soft(report['authenticDifference']).toBe(0);
    expect.soft(report['roadDefaultDifference']).toBe(0);
    expect.soft(report['roadGlowDifference']).toBe(0);
    expect.soft(report['darkDuplicateDifference']).toBeLessThanOrEqual(1);
    expect.soft(report['darkHalo']).toBeGreaterThan(100);
    expect.soft(report['darkHalo']).toBeLessThan(255);
    expect.soft(report['resizeCore']).toBeGreaterThan(200);
    expect.soft(report['restoreDifference']).toBe(0);
    expect.soft(report['core']).toBeGreaterThan(240);
    // The core must end at the segment; the outer cap contains only its halo.
    expect.soft(report['endpointHalo']).toBeLessThan(160);
    // Coverage is a union of segments, including acute joins and crossings.
    expect.soft(report['duplicateDifference']).toBeLessThanOrEqual(1);
    expect.soft(report['crossingExcess']).toBeLessThanOrEqual(1);
    expect.soft(report['joinExcess']).toBeLessThanOrEqual(1);
    expect.soft(report['degenerateCentre']).toBeGreaterThan(200);
  });
}
