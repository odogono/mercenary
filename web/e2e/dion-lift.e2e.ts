import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { DION_STORAGE } from '../src/dion/save.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import { encodeTourcraftRecord } from '../src/dion/tourcraftSave.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';
import { IDLE } from '../src/gameCore/index.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});

// Stands in the hall of the METIS building in cell 4 (Floors 0 to 9, pitch 150) and walks
// through its doorway into the lift car, as the ROM probe does (#835).
class Seed extends TourcraftSession {
  enterLift() {
    const { world } = this.content;
    const entry = world.cells.find(item => item.cell === 0x04)!;
    const [gx, gz] = world.opening.groupOrigin;
    const eye = [
      (gx + entry.x) * 65_536 + entry.origin[0] - 160,
      63,
      (gz + entry.z) * 65_536 + entry.origin[1] - 700
    ] as const;
    this.state = {
      ...this.state,
      cell: 0x04,
      doors: new Map(),
      eye,
      heading: 0,
      region: this.regionAtEye(0x04, [...eye])
    };
    this.intent = { ...IDLE, walk: 1 };
    for (let frame = 0; frame < 40 && !this.inLift; frame += 1) {
      this.advance(11 / 50);
    }
    this.intent = IDLE;
    this.advance((8 * 11) / 50);
  }
}
const seed = new Seed(content);
seed.enterLift();
seed.drainSound();
const encoded = encodeTourcraftRecord(content, seed.captureResume(), 'METIS');

test('a lift key rides to its Floor, the label steps, and a reload keeps the Floor', async ({
  page
}) => {
  expect(seed.inLift).toBe(true);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(
    ({ encoded, key }) => {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, encoded);
      }
      let time = 0,
        next = 0;
      const callbacks = new Map<number, FrameRequestCallback>();
      window.requestAnimationFrame = callback => {
        callbacks.set(++next, callback);
        return next;
      };
      window.cancelAnimationFrame = id => {
        callbacks.delete(id);
      };
      window.dionClock = {
        step: milliseconds => {
          time += milliseconds;
          const pending = [...callbacks.values()];
          callbacks.clear();
          for (const callback of pending) {
            callback(time);
          }
        }
      };
    },
    { encoded, key: DION_STORAGE.resume }
  );
  await page.goto('/dion');
  const screen = page.locator('#screen');
  await expect(screen).toHaveAttribute('data-state', 'ready');
  await page.evaluate(() => window.dionClock.step(0));
  await expect(screen).toHaveAttribute('data-floor', '0');

  await page.keyboard.press('3');
  const labels: string[] = [];
  for (let frame = 0; frame < 30; frame += 1) {
    await page.evaluate(() => window.dionClock.step(220));
    const label = (await screen.getAttribute('data-floor-label'))!;
    if (labels.at(-1) !== label) {
      labels.push(label);
    }
  }
  expect(labels).toEqual(['0', '1', '2', '3']);
  await expect(screen).toHaveAttribute('data-floor', '3');
  await expect(screen).toHaveAttribute('data-y', String(3 * 150 + 63));
  expect(await screen.getAttribute('data-gaps')).not.toContain('$80');

  // B asks for Floor 10, which this building lacks: refused, and B does not board.
  await page.keyboard.press('b');
  await page.evaluate(() => window.dionClock.step(220));
  await expect(screen).toHaveAttribute('data-floor-label', '3');

  await page.reload();
  await expect(screen).toHaveAttribute('data-state', 'ready');
  await page.evaluate(() => window.dionClock.step(0));
  await expect(screen).toHaveAttribute('data-floor', '3');
  await expect(screen).toHaveAttribute('data-y', String(3 * 150 + 63));
  expect(errors).toEqual([]);
});
