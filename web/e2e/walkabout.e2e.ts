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

test('Authentic preserves the pinned initial canvas pixels', async ({
  page
}, testInfo) => {
  await page.route('**/settings.json', async route => {
    const response = await route.fetch();
    const settings = (await response.json()) as {
      presentation: { preset: string };
    };
    settings.presentation.preset = 'authentic';
    await route.fulfill({ json: settings, response });
  });
  await page.addInitScript(() => {
    let pending: FrameRequestCallback | undefined;
    window.requestAnimationFrame = callback => {
      pending = callback;
      return 1;
    };
    Object.defineProperty(window, '__drawFrozenInitialFrame', {
      value: (): void => pending?.(0)
    });
  });

  await page.goto('/');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-state',
    'ready'
  );
  await testInfo.attach('authentic-initial-frame', {
    body: await page.locator('#frame').screenshot(),
    contentType: 'image/png'
  });
  const digest = await page.evaluate(async () => {
    const draw = (
      window as unknown as Window & { __drawFrozenInitialFrame: () => void }
    ).__drawFrozenInitialFrame;
    draw();
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
    // WebGL reads bottom-up; canonical raw RGBA follows the canvas' top-down row order.
    const rgba = new Uint8Array(pixels.length);
    const rowBytes = canvas.width * 4;
    for (let row = 0; row < canvas.height; row += 1) {
      rgba.set(
        pixels.subarray(
          (canvas.height - row - 1) * rowBytes,
          (canvas.height - row) * rowBytes
        ),
        row * rowBytes
      );
    }
    const hash = await crypto.subtle.digest('SHA-256', rgba);
    return [...new Uint8Array(hash)]
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  });

  expect(digest).toBe(
    '44288778d13180746a53bbe1d5bf06553ce02caab3fa7a997dad378f53d0cda0'
  );
});

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
  const typeface = page.locator('#typeface');
  await expect(typeface).toBeEnabled();
  await expect(typeface).toHaveValue('mercenary');
  expect(
    await page.evaluate(() => document.fonts.check('16px "Mercenary Pixel"'))
  ).toBe(true);
  expect(
    await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  ).toContain('Mercenary Pixel');

  await testInfo.attach('mercenary-browser-shell-type', {
    body: await page.locator('#status-row').screenshot(),
    contentType: 'image/png'
  });
  await typeface.selectOption('damocles');
  await expect(page.locator('html')).toHaveAttribute(
    'data-font-face',
    'damocles'
  );
  expect(
    await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  ).toContain('Damocles Interface');
  await testInfo.attach('damocles-browser-shell-type', {
    body: await page.locator('#status-row').screenshot(),
    contentType: 'image/png'
  });

  await page.reload();
  await expect(surface).toHaveAttribute('data-state', 'ready');
  await expect(typeface).toHaveValue('damocles');
  await typeface.focus();
  const selectorPosition = {
    x: await canvas.getAttribute('data-x'),
    z: await canvas.getAttribute('data-z')
  };
  await page.keyboard.press('ArrowUp');
  await waitForFrames(page, 8);
  expect({
    x: await canvas.getAttribute('data-x'),
    z: await canvas.getAttribute('data-z')
  }).toEqual(selectorPosition);
  await typeface.evaluate(element => element.blur());

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
  expect(colours).toContain('16,24,32');
  expect(colours).toContain('184,200,216');

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
      const saveBounds = document
        .querySelector('#save-controls')!
        .getBoundingClientRect();
      return {
        canvasRatio: bounds.width / bounds.height,
        documentWidth: document.documentElement.scrollWidth,
        saveLeft: saveBounds.left,
        saveRight: saveBounds.right,
        viewportWidth: innerWidth
      };
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.saveLeft).toBeGreaterThanOrEqual(0);
    expect(layout.saveRight).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.canvasRatio).toBeCloseTo(1280 / 800, 5);
  }

  expect(errors).toEqual([]);
});

test('a Save restores the same playable moment after a full reload', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-state',
    'ready'
  );
  const canvas = page.locator('#frame');
  const position = async (): Promise<{
    x: string | null;
    z: string | null;
  }> => ({
    x: await canvas.getAttribute('data-x'),
    z: await canvas.getAttribute('data-z')
  });
  const opening = await position();

  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await position()).z).not.toBe(opening.z);
  await page.keyboard.up('ArrowUp');
  const saved = await position();

  await page.locator('#save-session').click();
  await expect(page.locator('#message')).toContainText('SAVED SLOT 1');
  await expect(page.locator('#save-slot')).toHaveValue('1');

  await page.reload();
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-state',
    'ready'
  );
  expect(await position()).toEqual(opening);
  await expect(page.locator('#save-slot option:checked')).toContainText(
    'SURFACE'
  );

  await page.locator('#load-session').click();
  await expect(page.locator('#message')).toContainText('LOADED SLOT 1');
  expect(await position()).toEqual(saved);

  await page.locator('#save-session').click();
  await expect(page.locator('#save-session')).toHaveText('CONFIRM SAVE');
  await page.locator('#save-session').click();
  await expect(page.locator('#message')).toContainText('SAVED SLOT 1');

  await page.locator('#delete-save').click();
  await expect(page.locator('#delete-save')).toHaveText('CONFIRM DELETE');
  await page.locator('#delete-save').click();
  await expect(page.locator('#message')).toContainText('DELETED SLOT 1');
  await expect(page.locator('#save-slot option:checked')).toContainText(
    'EMPTY'
  );
});
