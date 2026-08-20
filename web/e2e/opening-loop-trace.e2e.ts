import { expect, test } from '@playwright/test';

test('Chromium replays the recorded opening loop bit-for-bit and renders its milestones', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/__e2e__/opening-loop');
  const surface = page.locator('#trace-surface');
  await expect(surface).toHaveAttribute('data-state', 'complete', {
    timeout: 30_000
  });
  await expect(surface).toHaveAttribute(
    'data-milestones',
    'initial,airborne,touchdown,room-1'
  );
  await expect(surface).toHaveAttribute('data-credits', '4000');
  await expect(surface).toHaveAttribute('data-grid', '09:06');
  await expect(surface).toHaveAttribute('data-location', 'room-1');
  await expect(surface).toHaveAttribute('data-occupancy', 'on-foot');
  await expect(page.locator('#status')).toHaveText(
    '6,291 records replayed bit-for-bit'
  );

  const colours = await page.locator('#frame').evaluate(canvas => {
    const frame = canvas as HTMLCanvasElement;
    frame.dispatchEvent(new Event('trace-redraw'));
    const gl = frame.getContext('webgl2')!;
    const pixels = new Uint8Array(frame.width * frame.height * 4);
    gl.readPixels(
      0,
      0,
      frame.width,
      frame.height,
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
    return [...found];
  });
  expect(colours).toContain('171,60,101');
  expect(colours).toContain('234,121,163');
  expect(colours).toContain('255,255,255');
  expect(errors).toEqual([]);
});
