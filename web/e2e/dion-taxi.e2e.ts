import { expect, test } from '@playwright/test';

for (const spaceport of [false, true]) {
  test(`METIS ${spaceport ? 'spaceport' : 'solicitor'} deterministic visual journey`, async ({
    page
  }, testInfo) => {
    test.fixme(!spaceport, 'fails on main: #852');
    await page.goto('/e2e/dion-fixture.html');
    await expect(page.locator('#screen')).toHaveAttribute(
      'data-state',
      'ready'
    );
    const images: number[][] = [];
    for (const name of [
      'opening',
      'reveal',
      'boarding',
      'selection',
      'travel',
      'turn',
      'arrival',
      'exit',
      'night'
    ]) {
      const state = await page.evaluate(
        ([name, spaceport]) =>
          window.dionFixture.checkpoint(name as string, spaceport as boolean),
        [name, spaceport]
      );
      if (name === 'arrival' || name === 'exit') {
        expect(state.snapshot.eye).toEqual(
          spaceport
            ? [0x09_e1_80_00, 63, 0x04_2a_80_80]
            : [0x09_df_80_80, 63, 0x04_30_80_00]
        );
        expect(state.snapshot.taxi.passenger).toBe(name === 'arrival');
      }
      images.push(await page.evaluate(() => window.dionFixture.pixels()));
      await page
        .locator('#screen')
        .screenshot({ path: testInfo.outputPath(`${name}.png`) });
    }
    // Every checkpoint is rebuilt identically from a second fresh run.
    for (const [index, name] of [
      'opening',
      'reveal',
      'boarding',
      'selection',
      'travel',
      'turn',
      'arrival',
      'exit',
      'night'
    ].entries()) {
      await page.evaluate(
        ([name, spaceport]) =>
          window.dionFixture.checkpoint(name as string, spaceport as boolean),
        [name, spaceport]
      );
      expect(await page.evaluate(() => window.dionFixture.pixels())).toEqual(
        images[index]
      );
    }
  });
}
test('all 33 Save and Session Resume controls preserve uninterrupted browser futures', async ({
  page
}) => {
  test.setTimeout(120_000);
  await page.goto('/e2e/dion-fixture.html');
  await expect(page.locator('#screen')).toHaveAttribute('data-state', 'ready');
  const verified = await page.evaluate(() =>
    window.dionFixture.verifyPersistence()
  );
  expect(verified.controls).toBe(33);
  expect(verified.comparisons).toBeGreaterThan(40_000);
});
