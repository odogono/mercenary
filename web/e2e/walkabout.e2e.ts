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

/// Choose a Display Composition before the shell reads its preferences.
///
/// The Benson Panel is the default, so the readouts and controls that live in the classic strip
/// are only present when a test asks for that composition.
const useComposition = async (
  page: Page,
  composition: 'panel' | 'strip'
): Promise<void> => {
  await page.addInitScript(composition => {
    window.localStorage.setItem(
      'mercenary.browser-shell.preferences.v1',
      JSON.stringify({ composition, panelRendition: 'targ' })
    );
  }, composition);
};

/// Step past the Arrival, the way a player who has seen it does.
///
/// Every fresh session now opens with the authored Arrival (ADR 0032). The opening itself is
/// proven in `arrival.e2e.ts`; the tests here are about the game it hands over to, so they skip
/// it and assert against the moment it lands on — which is the moment these tests always started
/// from. A restored or resumed session has no Arrival to skip and says so.
const skipArrival = async (page: Page): Promise<void> => {
  const surface = page.locator('#game-surface');
  await expect(surface).toHaveAttribute('data-state', 'ready');
  if ((await surface.getAttribute('data-arrival')) === 'done') {
    return;
  }
  await page.keyboard.press('Space');
  await expect(surface).toHaveAttribute('data-arrival', 'done');
};

/// Open a System Menu page the way a player does.
const openPage = async (
  page: Page,
  goto: 'saves' | 'settings'
): Promise<void> => {
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-layer',
    'menu'
  );
  await page.locator(`button[data-goto="${goto}"]`).click();
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-layer',
    goto
  );
};

const slotButton = (page: Page, slot: number, action: string) =>
  page.locator(`.slot-row[data-slot="${slot}"] [data-action="${action}"]`);

const slotDetail = (page: Page, slot: number) =>
  page.locator(`.slot-row[data-slot="${slot}"] .slot-detail`);

test('the Benson Panel is the default composition and tracks the session', async ({
  page
}, testInfo) => {
  await page.goto('/');
  await skipArrival(page);
  const surface = page.locator('#game-surface');
  await expect(surface).toHaveAttribute('data-composition', 'panel');
  await expect(surface).toHaveAttribute('data-rendition', 'targ');

  const panel = page.locator('#benson-panel');
  await expect(panel).toBeVisible();
  // The panel replaces the debug strip rather than sitting beside it.
  await expect(page.locator('#status-row')).toBeHidden();

  const field = (name: string) =>
    panel.locator(`#panel-targ [data-field="${name}"]`);
  await expect(field('locationLabel')).toHaveText(/^\d{2}-\d{2}$/);
  await expect(field('altitude')).toHaveText(/^\d{5}$/);
  await expect(field('speed')).toHaveText(/^[+-]\d{4}$/);
  await expect(panel).toContainText('BENSON G9-ST');

  // Walking changes the grid reference the panel shows, so it is reading the live session.
  const opening = await field('locationLabel').textContent();
  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () => page.locator('#frame').getAttribute('data-z'))
    .not.toBe(null);
  await page.keyboard.up('ArrowUp');
  expect(opening).not.toBeNull();

  await testInfo.attach('benson-panel-targ', {
    body: await panel.screenshot(),
    contentType: 'image/png'
  });

  await page.evaluate(() => {
    window.localStorage.setItem(
      'mercenary.browser-shell.preferences.v1',
      JSON.stringify({ composition: 'panel', panelRendition: 'damocles' })
    );
  });
  await page.reload();
  await expect(surface).toHaveAttribute('data-rendition', 'damocles');
  await expect(page.locator('#panel-damocles')).toBeVisible();
  await expect(page.locator('#panel-targ')).toBeHidden();
  await expect(page.locator('#inventory-window')).toHaveText('EMPTY');
  await testInfo.attach('benson-panel-damocles', {
    body: await page.locator('#benson-panel').screenshot(),
    contentType: 'image/png'
  });
});

test('every Benson surface renders the same fixed 23-cell display', async ({
  page
}) => {
  await page.goto('/');
  await skipArrival(page);
  await expect(page.locator('#message')).toHaveAttribute('data-source', 'game');

  // Pause on one recovered display frame so the live scroll cannot advance
  // between reading the three independently rendered surfaces.
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-layer',
    'menu'
  );
  const displays = await page.evaluate(() => [
    document.querySelector('#message')!.textContent,
    document.querySelector('#panel-message')!.textContent,
    document.querySelector('#damocles-message')!.textContent
  ]);
  expect(displays[0]).toBe(displays[1]);
  expect(displays[0]).toBe(displays[2]);
  expect([...displays[0]!]).toHaveLength(23);
  await expect(page.locator('#panel-message > .benson-cell')).toHaveCount(23);
  await expect(page.locator('#damocles-message > .benson-cell')).toHaveCount(
    23
  );
});

test('the Benson display keeps every glyph inside its message aperture', async ({
  page
}) => {
  await page.goto('/');
  await skipArrival(page);
  const display = page.locator('#panel-message');
  await expect(display).toBeVisible();
  const ink = await display.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const glyphs = range.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return {
      boxBottom: box.bottom,
      boxLeft: box.left,
      boxRight: box.right,
      boxTop: box.top,
      glyphBottom: glyphs.bottom,
      glyphLeft: glyphs.left,
      glyphRight: glyphs.right,
      glyphTop: glyphs.top
    };
  });
  expect(ink.glyphTop).toBeGreaterThanOrEqual(ink.boxTop);
  expect(ink.glyphBottom).toBeLessThanOrEqual(ink.boxBottom);
  expect(ink.glyphLeft).toBeGreaterThanOrEqual(ink.boxLeft);
  expect(ink.glyphRight).toBeLessThanOrEqual(ink.boxRight);
});

test('the Benson display enters new characters at the right edge', async ({
  page
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    const view = window as Window & { bensonDisplayFrames?: string[] };
    const display = document.querySelector('#panel-message')!;
    view.bensonDisplayFrames = [];
    new MutationObserver(() => {
      view.bensonDisplayFrames!.push(display.textContent ?? '');
    }).observe(display, {
      characterData: true,
      childList: true,
      subtree: true
    });
  });
  await skipArrival(page);
  const display = page.locator('#panel-message');
  await expect(display).toBeVisible();
  await expect(display).toContainText('STATUS REPORT', { timeout: 1000 });

  const frames = await page.evaluate(
    () =>
      (window as Window & { bensonDisplayFrames?: string[] })
        .bensonDisplayFrames ?? []
  );
  const buffers = [...new Set(frames.filter(frame => frame.length === 23))];
  expect(
    buffers.some(buffer => {
      const entered = buffer.trim();
      return (
        entered.length > 0 &&
        entered.length < 'STATUS REPORT'.length &&
        buffer === entered.padStart(23)
      );
    }),
    JSON.stringify(buffers)
  ).toBe(true);
  expect(
    buffers.some((before, index) => {
      const after = buffers[index + 1];
      return (
        after !== undefined &&
        Array.from({ length: 22 }, (_, skipped) => skipped + 1).some(
          skipped => after.slice(0, 23 - skipped) === before.slice(skipped)
        )
      );
    }),
    JSON.stringify(buffers)
  ).toBe(true);
});

test('neither rendition overflows the frame it is drawn in', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-state',
    'ready'
  );

  // Both renditions are authored to one height, and the frame above them is sized for that
  // height alone — so anything hanging below the panel is invisible to the player.
  for (const rendition of ['targ', 'damocles'] as const) {
    await openPage(page, 'settings');
    await page
      .locator(`[data-setting="rendition"] button[value="${rendition}"]`)
      .click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('#game-surface')).toHaveAttribute(
      'data-rendition',
      rendition
    );

    const spill = await page.evaluate(() => {
      const panel = document.querySelector('#benson-panel')!;
      const floor = panel.getBoundingClientRect().bottom;
      const below = [...panel.querySelectorAll('*')].filter(
        element => element.getBoundingClientRect().bottom > floor + 0.5
      );
      return {
        below: below.map(element => element.id || element.className),
        pageOverflows:
          document.documentElement.scrollHeight > window.innerHeight
      };
    });
    expect(spill.below, `${rendition} spills below the panel`).toEqual([]);
    expect(spill.pageOverflows, `${rendition} overflows the page`).toBe(false);
  }
});

test('the panel scales to every supported width without overflowing', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-state',
    'ready'
  );
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ height: 900, width });
    await expect(page.locator('#benson-panel')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow, `no horizontal overflow at ${width}px`).toBe(false);
  }
});

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
  // The pinned frame is the world the Arrival hands over to, not the Arrival's own field. This
  // test freezes the frame loop, so the skip is pressed here and the single frame it goes on to
  // draw is the first frame of the game itself.
  await page.keyboard.press('Space');
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
    '98337982b60f95eba8f3389907a1e238cf9bac7050e70554b58dec9ca7771991'
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

  // These readouts and controls belong to the classic strip, which is now a setting.
  await useComposition(page, 'strip');
  await page.goto('/');
  await skipArrival(page);
  const surface = page.locator('#game-surface');
  const canvas = page.locator('#frame');
  await expect(canvas).toHaveAttribute('width', '1280');
  await expect(canvas).toHaveAttribute('height', '800');
  await expect(page.locator('#credits')).toContainText('CREDITS');
  await expect(page.locator('#status')).toContainText('ON FOOT');
  await expect(page.locator('#comms')).toHaveAttribute('aria-live', 'off');
  await expect(page.locator('#comms')).not.toHaveAttribute('role', 'status');
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

  // The typeface is chosen on the settings page now that the status row is only a readout.
  await openPage(page, 'settings');
  const typefaceChoice = page.locator(
    '[data-setting="typeface"] button[value="damocles"]'
  );
  await typefaceChoice.click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-font-face',
    'damocles'
  );
  expect(
    await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  ).toContain('Damocles Interface');
  await testInfo.attach('damocles-browser-shell-type', {
    body: await page.locator('#page-settings').screenshot(),
    contentType: 'image/png'
  });
  await expect(typefaceChoice).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-layer',
    'none'
  );

  await page.reload();
  await expect(surface).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('html')).toHaveAttribute(
    'data-font-face',
    'damocles'
  );
  await openPage(page, 'settings');
  await expect(
    page.locator('[data-setting="typeface"] button[value="damocles"]')
  ).toHaveAttribute('aria-pressed', 'true');
  await page
    .locator('[data-setting="typeface"] button[value="damocles"]')
    .focus();
  // A focused chrome control must never produce Movement Intent.
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
  // Leave the chrome the way a player does, and the world resumes.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'none');

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

  // The Save chooser is the widest chrome the shell has, so it is the one to measure.
  await openPage(page, 'saves');
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ height: 900, width });
    const layout = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#frame')!;
      const bounds = canvas.getBoundingClientRect();
      const rowBounds = document
        .querySelector('.slot-row')!
        .getBoundingClientRect();
      return {
        canvasRatio: bounds.width / bounds.height,
        documentWidth: document.documentElement.scrollWidth,
        rowLeft: rowBounds.left,
        rowRight: rowBounds.right,
        viewportWidth: innerWidth
      };
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.rowLeft).toBeGreaterThanOrEqual(0);
    expect(layout.rowRight).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.canvasRatio).toBeCloseTo(1280 / 800, 5);
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  expect(errors).toEqual([]);
});

test('Session Resume survives reload and New Game preserves Saves', async ({
  page
}) => {
  await useComposition(page, 'strip');
  await page.goto('/');
  await skipArrival(page);
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

  await openPage(page, 'saves');
  await slotButton(page, 1, 'save').click();
  await expect(slotDetail(page, 1)).toContainText('SURFACE');

  await page.reload();
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-state',
    'ready'
  );
  expect(await position()).toEqual(saved);

  await openPage(page, 'saves');
  await expect(slotDetail(page, 1)).toContainText('SURFACE');
  await slotButton(page, 1, 'load').click();
  // Restoring is a new moment to play, so the chrome steps out of the way by itself.
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-layer',
    'none'
  );
  expect(await position()).toEqual(saved);

  await page.keyboard.press('Escape');
  const newGame = page.locator('#new-game');
  await newGame.click();
  await expect(newGame).toHaveText('CONFIRM NEW GAME');
  await newGame.click();
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-layer',
    'none'
  );
  expect(await position()).toEqual(opening);

  // Overwriting and clearing each cost two presses.
  await openPage(page, 'saves');
  await slotButton(page, 1, 'save').click();
  await expect(slotButton(page, 1, 'save')).toHaveText('CONFIRM');
  await slotButton(page, 1, 'save').click();
  await expect(slotButton(page, 1, 'save')).toHaveText('SAVE');

  await slotButton(page, 1, 'delete').click();
  await expect(slotButton(page, 1, 'delete')).toHaveText('CONFIRM');
  await slotButton(page, 1, 'delete').click();
  await expect(slotDetail(page, 1)).toHaveText('EMPTY');
  // Nothing to load or clear from an empty slot.
  await expect(slotButton(page, 1, 'load')).toBeDisabled();
  await expect(slotButton(page, 1, 'delete')).toBeDisabled();
});

test('an incompatible Save is not offered for loading', async ({ page }) => {
  await page.goto('/');
  await skipArrival(page);
  await openPage(page, 'saves');
  await slotButton(page, 2, 'save').click();

  await page.evaluate(() => {
    const key = 'mercenary.browser-shell.save.v1.slot-2';
    const encoded = window.localStorage.getItem(key);
    if (encoded === null) {
      throw new Error('slot 2 was not saved');
    }
    const save = JSON.parse(encoded) as {
      environment: { payload: { decoderVersion: number } };
    };
    save.environment.payload.decoderVersion -= 1;
    window.localStorage.setItem(key, JSON.stringify(save));
    window.dispatchEvent(new StorageEvent('storage', { key }));
  });

  await expect(slotDetail(page, 2)).toContainText('UNREADABLE');
  await expect(slotDetail(page, 2)).not.toContainText('SURFACE');
  await expect(slotButton(page, 2, 'load')).toBeDisabled();
  await expect(slotButton(page, 2, 'delete')).toBeEnabled();
});

test('an abnormal page termination loses less than one checkpoint interval', async ({
  context,
  page
}) => {
  await useComposition(page, 'strip');
  // Suppress the lifecycle signals the shell normally flushes, modelling a renderer loss that
  // leaves only the most recent periodic checkpoint behind.
  await page.addInitScript(() => {
    document.addEventListener(
      'visibilitychange',
      event => event.stopImmediatePropagation(),
      true
    );
    window.addEventListener(
      'pagehide',
      event => event.stopImmediatePropagation(),
      true
    );
  });
  await page.goto('/');
  await skipArrival(page);

  const resume = async (): Promise<string | null> =>
    await page.evaluate(() =>
      localStorage.getItem('mercenary.browser-shell.session-resume.v1')
    );
  await page.keyboard.down('ArrowUp');
  await expect.poll(resume).not.toBeNull();
  const first = JSON.parse((await resume())!) as { savedAt: string };
  await expect
    .poll(async () => {
      const encoded = await resume();
      return encoded === null
        ? first.savedAt
        : (JSON.parse(encoded) as { savedAt: string }).savedAt;
    })
    .not.toBe(first.savedAt);
  const beforeCrash = (await resume())!;
  const checkpoint = JSON.parse(beforeCrash) as {
    savedAt: string;
    snapshot: unknown;
  };
  expect(Date.now() - Date.parse(checkpoint.savedAt)).toBeLessThanOrEqual(1100);

  await page.keyboard.up('ArrowUp');
  await page.close({ runBeforeUnload: false });

  // Hold the replacement page before its first simulation step so the recovered state can be
  // captured exactly through the player-facing Save path.
  await context.addInitScript(() => {
    window.requestAnimationFrame = () => 1;
  });
  const recovered = await context.newPage();
  await recovered.goto('/');
  await expect(recovered.locator('#game-surface')).toHaveAttribute(
    'data-state',
    'ready'
  );
  await expect(recovered.locator('#game-surface')).toHaveAttribute(
    'data-layer',
    'none'
  );
  await recovered.keyboard.press('Backquote');
  await recovered.locator('#console-input').fill('save 3');
  await recovered.keyboard.press('Enter');
  await expect(recovered.locator('#console-log')).toContainText('saved slot 3');
  const restored = await recovered.evaluate(() => {
    const encoded = localStorage.getItem(
      'mercenary.browser-shell.save.v1.slot-3'
    );
    if (encoded === null) {
      throw new Error('the restored session could not be captured');
    }
    return JSON.parse(encoded) as { snapshot: unknown };
  });
  expect(restored.snapshot).toEqual(checkpoint.snapshot);
});

test('one page owns the Session Resume and a second page can take over', async ({
  context,
  page
}) => {
  await useComposition(page, 'strip');
  await page.goto('/');
  await skipArrival(page);
  const firstSurface = page.locator('#game-surface');
  const firstCanvas = page.locator('#frame');

  const openingZ = await firstCanvas.getAttribute('data-z');
  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () => firstCanvas.getAttribute('data-z'))
    .not.toBe(openingZ);
  await page.keyboard.up('ArrowUp');
  const latest = {
    x: await firstCanvas.getAttribute('data-x'),
    z: await firstCanvas.getAttribute('data-z')
  };

  const second = await context.newPage();
  await second.goto('/');
  const secondSurface = second.locator('#game-surface');
  await expect(secondSurface).toHaveAttribute('data-state', 'ready');
  await expect(secondSurface).toHaveAttribute('data-layer', 'ownership');
  await expect(second.locator('#page-ownership .chrome-title')).toHaveText(
    'SESSION ACTIVE IN ANOTHER TAB'
  );

  await second.locator('#take-over').click();
  await expect(secondSurface).toHaveAttribute('data-layer', 'none');
  await expect(firstSurface).toHaveAttribute('data-layer', 'ownership');
  await expect(page.locator('#page-ownership .chrome-title')).toHaveText(
    'SESSION OPENED ELSEWHERE'
  );
  expect({
    x: await second.locator('#frame').getAttribute('data-x'),
    z: await second.locator('#frame').getAttribute('data-z')
  }).toEqual(latest);

  const displaced = await firstCanvas.getAttribute('data-z');
  await page.waitForTimeout(150);
  expect(await firstCanvas.getAttribute('data-z')).toBe(displaced);

  const secondCanvas = second.locator('#frame');
  const takenOverAt = await secondCanvas.getAttribute('data-z');
  await second.keyboard.down('ArrowUp');
  await expect
    .poll(async () => secondCanvas.getAttribute('data-z'))
    .not.toBe(takenOverAt);
  await second.keyboard.up('ArrowUp');
  // Opening the menu flushes the new owner's position and then pauses further writes.
  await second.keyboard.press('Escape');
  await expect(secondSurface).toHaveAttribute('data-layer', 'menu');
  const ownerRecord = await second.evaluate(() =>
    localStorage.getItem('mercenary.browser-shell.session-resume.v1')
  );
  expect(ownerRecord).not.toBeNull();

  // Provoke every stale path on the displaced page. Ownership fencing must keep the durable
  // record byte-identical to the new owner's flush.
  await page.keyboard.press('ArrowUp');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true
    });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
  });
  await page.waitForTimeout(150);
  expect(
    await second.evaluate(() =>
      localStorage.getItem('mercenary.browser-shell.session-resume.v1')
    )
  ).toBe(ownerRecord);
});

test('invalid Session Resume starts fresh and repeats its refusal in the menu', async ({
  page
}) => {
  await useComposition(page, 'strip');
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'mercenary.browser-shell.session-resume.v1',
      'not a Session Resume'
    );
  });
  await page.goto('/');
  // The Arrival holds the message line while it presents, so the standing refusal is read after
  // it rather than under it — which is what opening the menu below asks for.
  await skipArrival(page);
  await expect(page.locator('#frame')).toHaveAttribute('data-x', '559104');
  const replacement = await page.evaluate(() =>
    window.localStorage.getItem('mercenary.browser-shell.session-resume.v1')
  );
  expect(replacement).not.toBe('not a Session Resume');
  expect(() => JSON.parse(replacement!)).not.toThrow();

  // A Benson Message may preempt the initial warning; opening the menu repeats the standing
  // refusal without mistaking that same message occurrence for a new one.
  await page.keyboard.press('Escape');
  await expect(page.locator('#message')).toContainText('COULD NOT RESUME');
});

test('completed Benson Messages enter the in-memory console transcript', async ({
  page
}) => {
  await useComposition(page, 'strip');
  await page.goto('/');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-state',
    'ready'
  );
  await expect(page.locator('#message')).not.toHaveText('—');

  await page.keyboard.press('Space');
  await page.keyboard.press('Backquote');
  await expect(page.locator('#console-log')).toContainText('BENSON · ');
  await expect(page.locator('#console-log')).not.toContainText(
    'SESSION RESUMED'
  );
});

test('the Shell Console runs commands over a running world', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await skipArrival(page);
  const surface = page.locator('#game-surface');
  const canvas = page.locator('#frame');
  await expect(surface).toHaveAttribute('data-console', 'closed');

  await page.keyboard.press('Backquote');
  await expect(surface).toHaveAttribute('data-console', 'open');
  const log = page.locator('#console-log');
  await expect(log).toContainText('type help');
  // A log announces itself, unlike the game's deliberately silent message line.
  await expect(log).toHaveAttribute('aria-live', 'polite');

  const input = page.locator('#console-input');
  await input.type('goto 03 11');
  await page.keyboard.press('Enter');
  await expect(log).toContainText('moved to cell 03-11');
  // The command reached the session, and the panel followed it.
  await expect(canvas).toHaveAttribute('data-x', /^229/);
  await expect(
    page.locator('#panel-targ [data-field="locationLabel"]')
  ).toHaveText('03-11');

  // Refusals name what was wrong rather than doing something adjacent.
  await input.type('goto room 0');
  await page.keyboard.press('Enter');
  await expect(log).toContainText('is not a Room');
  await input.type('goto 99 99');
  await page.keyboard.press('Enter');
  await expect(log).toContainText('must be from 0 through 15');

  // Backquote toggles: the same key that opened the console closes it, without typing a glyph,
  // even though the console's own input holds focus.
  await page.keyboard.press('Backquote');
  await expect(surface).toHaveAttribute('data-console', 'closed');
  await page.keyboard.press('Backquote');
  await expect(surface).toHaveAttribute('data-console', 'open');

  // Opening releases held keys like any other layer, so nothing keeps walking underneath.
  await page.keyboard.press('Backquote');
  await expect(surface).toHaveAttribute('data-console', 'closed');
  const walking = await canvas.getAttribute('data-z');
  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () => canvas.getAttribute('data-z'))
    .not.toBe(walking);
  await page.keyboard.up('ArrowUp');
  // Held, this time across the opening itself.
  await page.keyboard.down('ArrowUp');
  const held = await canvas.getAttribute('data-z');
  await expect.poll(async () => canvas.getAttribute('data-z')).not.toBe(held);
  await page.keyboard.press('Backquote');
  await expect(surface).toHaveAttribute('data-console', 'open');
  await page.waitForTimeout(300);
  const stopped = await canvas.getAttribute('data-z');
  await page.waitForTimeout(150);
  expect(await canvas.getAttribute('data-z')).toBe(stopped);

  // The held key is genuinely gone: closing again, the same key walks from a standstill.
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-console', 'closed');
  const released = await canvas.getAttribute('data-z');
  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () => canvas.getAttribute('data-z'))
    .not.toBe(released);
  await page.keyboard.up('ArrowUp');

  expect(errors).toEqual([]);
});

test('console history recalls without moving the player', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('#frame');
  await expect(page.locator('#game-surface')).toHaveAttribute(
    'data-state',
    'ready'
  );

  await page.keyboard.press('Backquote');
  const input = page.locator('#console-input');
  await input.type('where');
  await page.keyboard.press('Enter');

  const before = {
    x: await canvas.getAttribute('data-x'),
    z: await canvas.getAttribute('data-z')
  };

  // Both halves of the rule at once: the arrows mean something here, and they still mean nothing
  // to the player. The console is the first focused control to give them a meaning of their own.
  await page.keyboard.press('ArrowUp');
  await expect(input).toHaveValue('where');
  await page.keyboard.press('ArrowDown');
  await expect(input).toHaveValue('');
  await waitForFrames(page, 8);
  expect({
    x: await canvas.getAttribute('data-x'),
    z: await canvas.getAttribute('data-z')
  }).toEqual(before);

  // Browser chords still belong to the browser, even with the console focused. dispatchEvent
  // answers false only when a handler cancelled the event, so `true` here means pass-through.
  const chordsPassed = await page.evaluate(() =>
    ['altKey', 'ctrlKey', 'metaKey'].map(modifier =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          code: 'KeyR',
          [modifier]: true
        })
      )
    )
  );
  expect(chordsPassed).toEqual([true, true, true]);
});

test('the System Menu pauses the session it covers', async ({ page }) => {
  await page.goto('/');
  await skipArrival(page);
  const surface = page.locator('#game-surface');
  const canvas = page.locator('#frame');

  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'menu');
  const held = await canvas.getAttribute('data-z');
  // Arrows belong to the menu while it is open, so the player cannot walk behind it.
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);
  expect(await canvas.getAttribute('data-z')).toBe(held);

  await page.keyboard.press('Escape');
  await expect(surface).toHaveAttribute('data-layer', 'none');
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => canvas.getAttribute('data-z')).not.toBe(held);
  await page.keyboard.up('ArrowUp');
});

test('the settings page changes the composition it names', async ({ page }) => {
  await page.goto('/');
  const surface = page.locator('#game-surface');
  await expect(surface).toHaveAttribute('data-state', 'ready');
  await expect(surface).toHaveAttribute('data-composition', 'panel');

  await openPage(page, 'settings');
  await page
    .locator('[data-setting="composition"] button[value="strip"]')
    .click();
  await expect(surface).toHaveAttribute('data-composition', 'strip');
  await page
    .locator('[data-setting="rendition"] button[value="damocles"]')
    .click();
  await expect(surface).toHaveAttribute('data-rendition', 'damocles');

  // The choice outlives the page it was made on.
  await page.reload();
  await expect(surface).toHaveAttribute('data-state', 'ready');
  await expect(surface).toHaveAttribute('data-composition', 'strip');
  await expect(surface).toHaveAttribute('data-rendition', 'damocles');
});

test('the settings page changes Structure Reach live and persists it', async ({
  page
}) => {
  await page.goto('/');
  const surface = page.locator('#game-surface');
  const canvas = page.locator('#frame');
  await expect(surface).toHaveAttribute('data-state', 'ready');
  await page.keyboard.press('Space');
  const cellLines = Number(await canvas.getAttribute('data-lines'));

  await openPage(page, 'settings');
  const all = page.locator('[data-setting="structures"] button[value="all"]');
  await all.click();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-lines')))
    .toBe(2427);
  expect(Number(await canvas.getAttribute('data-lines'))).toBeGreaterThan(
    cellLines
  );

  await page.reload();
  await expect(surface).toHaveAttribute('data-state', 'ready');
  await page.keyboard.press('Space');
  await openPage(page, 'settings');
  await expect(
    page.locator('[data-setting="structures"] button[value="all"]')
  ).toHaveAttribute('aria-pressed', 'true');
});
