import { expect, test } from '@playwright/test';

for (const presentation of ['authentic', 'enhanced']) {
  test(`${presentation}: gamepad Free Look, recenter and Extended Controls off`, async ({
    page
  }) => {
    await page.addInitScript(preset => {
      localStorage.setItem(
        'mercenary.browser-shell.dion.preferences.v1',
        JSON.stringify({
          extendedControls: true,
          presentationPreset: preset
        })
      );
      const pad = {
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({
          pressed: false,
          value: 0
        })),
        mapping: 'standard'
      };
      Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
      Object.assign(window, { dionPad: pad });
    }, presentation);
    await page.goto('/dion');
    const screen = page.locator('#screen');
    await expect(screen).toHaveAttribute('data-state', 'ready');
    await expect(screen).toHaveAttribute('data-reveal', '0');
    const level = await screen.getAttribute('data-pitch');
    const hold = (direction: number, recenter = false) =>
      page.evaluate(
        ({ direction, recenter }) => {
          const pad = (
            window as unknown as {
              dionPad: {
                axes: number[];
                buttons: { pressed: boolean; value: number }[];
              };
            }
          ).dionPad;
          pad.axes[3] = direction;
          pad.buttons[11] = { pressed: recenter, value: recenter ? 1 : 0 };
        },
        { direction, recenter }
      );
    await hold(-1);
    await expect
      .poll(async () => Number(await screen.getAttribute('data-pitch')))
      .toBeLessThan(Number(level));
    await hold(0, true);
    await expect(screen).toHaveAttribute('data-pitch', level!);
    await hold(1);
    await expect
      .poll(async () => Number(await screen.getAttribute('data-pitch')))
      .toBeGreaterThan(Number(level));
    await hold(0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { exact: true, name: 'SETTINGS' }).click();
    await page.locator('[data-setting="extended"] button[value="off"]').click();
    await page.locator('#page-settings [data-goto="menu"]').click();
    await page.keyboard.press('Escape');
    await expect(screen).toHaveAttribute('data-pitch', level!);
    await hold(-1);
    const tick = Number(await screen.getAttribute('data-tick'));
    await expect
      .poll(async () => Number(await screen.getAttribute('data-tick')))
      .toBeGreaterThan(tick + 11);
    await expect(screen).toHaveAttribute('data-pitch', level!);
  });
}
