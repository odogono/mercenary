import { expect, test } from '@playwright/test';

/// Mercenary III's panel takes the pointer as Damocles's does (#599): the shared controls lie
/// over the head's name, the centre box and the run lamp, in either presentation.

for (const presentation of ['authentic', 'enhanced'] as const) {
  test(`the ${presentation} panel opens the head, pages it and toggles running`, async ({
    page
  }) => {
    await page.addInitScript(
      preset =>
        localStorage.setItem(
          'mercenary.browser-shell.dion.presentation.v1',
          JSON.stringify(preset)
        ),
      presentation
    );
    await page.goto('/dion');
    await expect(page.locator('#screen')).toHaveAttribute(
      'data-presentation',
      presentation
    );
    const screen = page.locator('#screen');
    await expect(screen).toHaveAttribute('data-state', 'ready');
    // The opening's logo reveal refuses the keypad, and the pointer with it.
    await expect(screen).toHaveAttribute('data-reveal', '0');

    const head = page.locator('[data-panel-control=inventory]');
    const centre = page.locator('[data-panel-control=centre]');
    await expect(head).toHaveText('TAXICARD');
    await expect(head).toHaveAttribute('data-opens', 'true');
    await expect(centre).toBeHidden();
    await head.click();
    await expect(centre).toBeVisible();
    await expect(centre).toHaveAttribute('data-open', 'true');
    // A press on the card's text is its *, which calls a taxi.
    await expect(screen).toHaveAttribute('data-reveal', '0');
    const box = (await centre.boundingBox())!;
    await centre.click({
      position: { x: box.width / 2, y: box.height * 0.4 }
    });
    await expect(screen).toHaveAttribute('data-call', 'true');

    const run = page.locator('[data-panel-control=run]');
    await expect(run).toHaveAttribute('aria-pressed', 'false');
    await run.click();
    await expect(run).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('KeyR');
    await expect(run).toHaveAttribute('aria-pressed', 'false');
  });
}
