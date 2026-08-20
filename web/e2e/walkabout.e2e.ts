import { expect, test, type Page } from '@playwright/test';

const waitForFrames = async (page: Page, count: number): Promise<void> => {
  await page.evaluate(
    count =>
      new Promise<void>(resolve => {
        let remaining = count;
        const next = (): void => {
          remaining -= 1;
          if (remaining === 0) {
            resolve();
          } else {
            requestAnimationFrame(next);
          }
        };
        requestAnimationFrame(next);
      }),
    count
  );
};

test('the live opening loop renders, walks and releases held input', async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  const surface = page.locator('#game-surface');
  const canvas = page.locator('#frame');
  await expect(surface).toHaveAttribute('data-state', 'ready');
  await expect(canvas).toHaveAttribute('width', '1280');
  await expect(canvas).toHaveAttribute('height', '800');
  await expect(page.locator('#credits')).toContainText('CREDITS');
  await expect(page.locator('#status')).toContainText('ON FOOT');
  await expect(page.locator('#comms')).toHaveAttribute('aria-live', 'off');
  await expect(page.locator('#comms')).not.toHaveAttribute('role', 'status');

  const colours = await page.evaluate(
    () =>
      new Promise<string[]>(resolve => {
        requestAnimationFrame(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('#frame')!;
          const gl = canvas.getContext('webgl2')!;
          const pixels = new Uint8Array(canvas.width * canvas.height * 4);
          gl.readPixels(
            0,
            0,
            canvas.width,
            canvas.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels
          );
          const found = new Set<string>();
          for (let index = 0; index < pixels.length; index += 4) {
            found.add(
              `${String(pixels[index])},${String(pixels[index + 1])},${String(pixels[index + 2])}`
            );
          }
          resolve([...found]);
        });
      })
  );
  expect(colours).toContain('96,160,224');
  expect(colours).toContain('0,128,0');
  expect(colours).toContain('255,255,255');

  await testInfo.attach('m4.6-opening-view', {
    body: await canvas.screenshot(),
    contentType: 'image/png'
  });

  const position = async (): Promise<{ x: number; z: number }> => ({
    x: Number(await canvas.getAttribute('data-x')),
    z: Number(await canvas.getAttribute('data-z'))
  });
  const before = await position();
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await position()).z).not.toBe(before.z);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const released = await position();
  await waitForFrames(page, 8);
  expect(await position()).toEqual(released);
  await page.keyboard.up('ArrowUp');

  const beforeHidden = await position();
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await position()).z).not.toBe(beforeHidden.z);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenReleased = await position();
  await waitForFrames(page, 8);
  expect(await position()).toEqual(hiddenReleased);
  await page.keyboard.up('ArrowUp');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false
    });
  });

  const chordsPassed = await page.evaluate(() => {
    const events: KeyboardEvent[] = [];
    for (const modifier of ['metaKey', 'ctrlKey', 'altKey'] as const) {
      events.push(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          code: 'KeyB',
          [modifier]: true
        }),
        new KeyboardEvent('keyup', {
          bubbles: true,
          cancelable: true,
          code: 'KeyB'
        })
      );
    }
    return events.map(event => window.dispatchEvent(event));
  });
  expect(chordsPassed).toEqual([true, true, true, true, true, true]);

  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ height: 900, width });
    const layout = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#frame')!;
      const bounds = canvas.getBoundingClientRect();
      return {
        canvasRatio: bounds.width / bounds.height,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth
      };
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.canvasRatio).toBeCloseTo(1280 / 800, 5);
  }

  expect(errors).toEqual([]);
});
