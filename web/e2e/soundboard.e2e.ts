import { expect, test, type Page } from '@playwright/test';

import { tapDestination, type SoundTapScope } from './sound-tap.ts';

/// The sound board (#508): each title's sounds play on demand, and Stop everything silences
/// them. The check listens at the destination tap, to what the speakers are given.

/// The loudest RMS any tapped output reaches over `seconds`.
const loudest = (page: Page, seconds: number): Promise<number> =>
  page.evaluate(async seconds => {
    const taps = (window as unknown as SoundTapScope).soundTaps;
    const samples = new Float32Array(1024);
    let peak = 0;
    const until = performance.now() + seconds * 1000;
    while (performance.now() < until) {
      for (const analyser of taps) {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          sum += sample * sample;
        }
        peak = Math.max(peak, Math.sqrt(sum / samples.length));
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return peak;
  }, seconds);

test('the sound board plays a Targ and a Damocles sound, and stops them', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await tapDestination(page);
  await page.goto('/sounds');
  const card = (title: RegExp) =>
    page.locator('article.sound').filter({ has: page.getByText(title) });
  await card(/^Fire/).getByRole('button', { name: 'Play' }).click();
  await expect(page.locator('#status')).toHaveText('Audio running.');
  expect(await loudest(page, 0.5)).toBeGreaterThan(1e-3);

  await card(/^Door tone/)
    .getByRole('button', { name: 'Play' })
    .click();
  expect(await loudest(page, 0.5)).toBeGreaterThan(1e-3);
  await page.getByRole('button', { name: 'Stop everything' }).click();
  await page.waitForTimeout(300);

  // #514: a programme no session asks for yet, and the tune from the Data Payload.
  await card(/^Transporter · /)
    .getByRole('button', { name: 'Play' })
    .click();
  expect(await loudest(page, 0.5)).toBeGreaterThan(1e-3);
  await card(/^GHETTOBLASTER/)
    .getByRole('button', { name: 'Play' })
    .click();
  expect(await loudest(page, 1)).toBeGreaterThan(1e-3);
  await page.getByRole('button', { name: 'Stop everything' }).click();
  await page.waitForTimeout(300);
  expect(await loudest(page, 0.5)).toBeLessThan(1e-4);
  expect(errors).toEqual([]);
  await expect(page.locator('#error')).toHaveText('');
});

test('Mercenary III sounds play through the board and obey mute, volume and stop controls', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await tapDestination(page);
  await page.goto('/sounds');
  await expect(
    page.getByRole('heading', { name: 'Mercenary III · YM2149' })
  ).toBeVisible();
  const board = page.locator('#dion');
  const card = (title: RegExp) =>
    board
      .locator('article.sound')
      .filter({ has: page.getByRole('heading', { name: title }) });
  for (const title of [
    /^Key click/,
    /^Prison door moving/,
    /^Prison door stop/,
    /^Taxi set-down/,
    /^Lift-off/,
    /^Leave/
  ]) {
    await card(title).getByRole('button', { name: 'Play' }).click();
    expect(await loudest(page, 0.25)).toBeGreaterThan(1e-3);
    await board
      .getByRole('button', { exact: true, name: 'Stop Mercenary III' })
      .click();
  }
  const engine = card(/^Taxi engine/);
  await engine.getByRole('button', { name: 'Start' }).click();
  expect(await loudest(page, 0.3)).toBeGreaterThan(1e-3);
  await page.getByLabel('Taxi speed class').fill('7');
  await expect(page.getByLabel('Taxi speed class')).toHaveValue('7');
  await page.getByLabel('Mute', { exact: true }).check();
  await page.waitForTimeout(100);
  expect(await loudest(page, 0.3)).toBeLessThan(1e-4);
  await page.getByLabel('Mute', { exact: true }).uncheck();
  expect(await loudest(page, 0.3)).toBeGreaterThan(1e-3);
  await page.getByLabel('Volume', { exact: true }).fill('0');
  await page.waitForTimeout(100);
  expect(await loudest(page, 0.3)).toBeLessThan(1e-4);
  await page.getByLabel('Volume', { exact: true }).fill('60');
  await board.getByRole('button', { name: 'Cut channels' }).click();
  expect(await loudest(page, 0.3)).toBeGreaterThan(1e-3);
  await page.getByRole('button', { name: 'Stop everything' }).click();
  await page.waitForTimeout(100);
  expect(await loudest(page, 0.3)).toBeLessThan(1e-4);
  await page.getByLabel('Mercenary III message text').fill('A'.repeat(48));
  await card(/^Message tone/)
    .getByRole('button', { name: 'Type' })
    .click();
  expect(await loudest(page, 0.3)).toBeGreaterThan(1e-3);
  await page.getByRole('button', { name: 'Stop everything' }).click();
  await page.waitForTimeout(100);
  expect(await loudest(page, 0.3)).toBeLessThan(1e-4);
  expect(errors).toEqual([]);
  await expect(page.locator('#error')).toHaveText('');
});
