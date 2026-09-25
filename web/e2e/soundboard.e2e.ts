import { expect, test, type Page } from '@playwright/test';

/// The sound board (#508): each title's sounds play on demand, and Stop everything silences
/// them. An AnalyserNode is spliced in wherever a node connects to its context's destination,
/// so the check listens to what the speakers are given.

const tap = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const taps: AnalyserNode[] = [];
    (window as unknown as { soundTaps: AnalyserNode[] }).soundTaps = taps;
    const connect = AudioNode.prototype.connect as (
      this: AudioNode,
      ...args: unknown[]
    ) => unknown;
    AudioNode.prototype.connect = function (
      this: AudioNode,
      ...args: unknown[]
    ) {
      if (args[0] === this.context.destination) {
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 1024;
        connect.call(this, analyser);
        taps.push(analyser);
      }
      return connect.apply(this, args);
    } as typeof AudioNode.prototype.connect;
  });
};

/// The loudest RMS any tapped output reaches over `seconds`.
const loudest = (page: Page, seconds: number): Promise<number> =>
  page.evaluate(async seconds => {
    const taps = (window as unknown as { soundTaps: AnalyserNode[] }).soundTaps;
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
  await tap(page);
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
  expect(await loudest(page, 0.5)).toBeLessThan(1e-4);
  expect(errors).toEqual([]);
  await expect(page.locator('#error')).toHaveText('');
});
