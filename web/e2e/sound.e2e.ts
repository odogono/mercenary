import { expect, test } from '@playwright/test';

test('audio unlock is trusted-gesture-only and master controls survive reload', async ({
  page
}) => {
  await page.addInitScript(() => {
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor() {
        super();
        document.documentElement.dataset['audioCreated'] = 'true';
        const addModule = this.audioWorklet.addModule.bind(this.audioWorklet);
        this.audioWorklet.addModule = async (...args) => {
          try {
            await addModule(...args);
            document.documentElement.dataset['audioModule'] = 'ready';
          } catch (error) {
            document.documentElement.dataset['audioModule'] = String(error);
            throw error;
          }
        };
      }
    };
  });
  await page.goto('/');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-state',
    'ready'
  );
  await page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }))
  );
  await expect(page.locator('html')).not.toHaveAttribute('data-audio-created');
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute(
    'data-audio-module',
    'ready'
  );
  await page.keyboard.press('Escape');
  await page.locator('button[data-goto="settings"]').click();
  const mute = page.locator('#audio-mute');
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await mute.click();
  const volume = page.locator('#audio-volume');
  await volume.focus();
  await volume.press('End');
  await volume.press('ArrowLeft');
  await expect(volume).toHaveValue('99');
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-state',
    'ready'
  );
  await page.keyboard.press('Escape');
  await page.locator('button[data-goto="settings"]').click();
  await expect(volume).toHaveValue('99');
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
});

test('unavailable browser audio leaves the Gameplay Session usable', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(window, 'AudioContext', { value: undefined })
  );
  await page.goto('/');
  const surface = page.locator('#game-surface');
  await expect(surface).toHaveAttribute('data-state', 'ready');
  await page.keyboard.press('Space');
  await page.locator('#departure-skip').click();
  await expect(surface).toHaveAttribute('data-arrival', 'done');
  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'menu');
  await page.locator('button[data-goto="settings"]').click();
  await expect(page.locator('#audio-mute')).toBeEnabled();
  expect(errors).toEqual([]);
});
