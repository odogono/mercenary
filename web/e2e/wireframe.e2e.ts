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
    // Distance fades the halo, including its spread, without changing the core.
    expect
      .soft(report['distanceNearHalo'])
      .toBeGreaterThan(report['distanceMidHalo']!);
    expect
      .soft(report['distanceMidHalo'])
      .toBeGreaterThanOrEqual(report['distanceFarHalo']!);
    expect.soft(report['distanceFarHalo']).toBe(0);
    expect.soft(report['distanceMidInnerHalo']).toBeGreaterThan(0);
    expect.soft(report['distanceNearOuterHalo']).toBeGreaterThan(0);
    expect.soft(report['distanceMidOuterHalo']).toBe(0);
    expect.soft(report['distanceFarOffDifference']).toBeLessThanOrEqual(1);
    expect.soft(report['distanceOffDifference']).toBe(0);
    expect.soft(report['distanceDefaultsDifference']).toBe(0);
    expect.soft(report['distanceRoadNearDifference']).toBe(0);
    expect.soft(report['distanceRoadFarDifference']).toBe(0);
    expect.soft(report['distanceRadialOffDifference']).toBeLessThanOrEqual(1);
    expect.soft(report['distanceCoreNear']).toBe(report['distanceCoreOff']);
    expect.soft(report['distanceCoreMid']).toBe(report['distanceCoreOff']);
    expect.soft(report['distanceCoreFar']).toBe(report['distanceCoreOff']);
    expect
      .soft(report['slantedNearHalo'])
      .toBeGreaterThan(report['slantedFarHalo']!);
    // Perspective correction puts the screen midpoint at z≈1935, still fully glowing;
    // linear screen-space interpolation would put it at z=15500 and extinguish it.
    expect.soft(report['slantedMidHalo']).toBe(report['distanceNearHalo']);
    expect.soft(report['webglError']).toBe(0);
    expect.soft(report['collapsedDepthDifference']).toBe(0);
    expect.soft(report['collapsedDepthHalo']).toBeGreaterThan(0);
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
