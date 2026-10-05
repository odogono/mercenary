import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { DION_STORAGE } from '../src/dion/save.ts';
import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import { encodeTourcraftRecord } from '../src/dion/tourcraftSave.ts';
import { TourcraftSession } from '../src/dion/tourcraftSession.ts';

const content = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});
class Seed extends TourcraftSession {
  target(slot: number) {
    this.state = {
      ...this.state,
      candidate: { distance: 0, exponent: 0, slot },
      tourcraft: {
        ...this.state.tourcraft!,
        owners: {
          ...this.state.tourcraft!.owners,
          candidate: { regionFlags: 0x40_00 }
        }
      }
    };
  }
}
const seed = new Seed(content);
for (const [slot, action] of [
  [181, 'take'],
  [3, 'board']
] as const) {
  seed.target(slot);
  seed.press(action);
  seed.advance(11 / 50);
}
seed.drainSound();
const encoded = encodeTourcraftRecord(
  content,
  seed.captureResume(),
  'METIS · EAGLE'
);

// Synthetic admission is allowed by ADR 0075. The live shell then receives real keys.
test('EAGLE live throttle, pitch/yaw, airborne Leave and reload Resume', async ({
  page
}) => {
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
  await expect(screen).toHaveAttribute('data-playback', 'surface');
  await page.evaluate(() => window.dionClock.step(0));
  const heading = await screen.getAttribute('data-heading');
  await page.keyboard.press('0');
  await page.keyboard.down('ArrowDown');
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => {
    for (let i = 0; i < 12; i++) {
      window.dionClock.step(220);
    }
  });
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('ArrowRight');
  expect(await screen.getAttribute('data-heading')).not.toBe(heading);
  await page.keyboard.press('l');
  await page.evaluate(() => window.dionClock.step(220));
  await expect(screen).toHaveAttribute('data-playback', 'surface');
  await page.keyboard.press('Space');
  const before = await page.evaluate(
    key =>
      JSON.parse(localStorage.getItem(key)!).snapshot.snapshot.tourcraft.flight,
    DION_STORAGE.resume
  );
  expect(before.pilot).toBe('eagle');
  expect(before.craft.contact).toBe(0);
  expect(before.craft.y).toBeGreaterThan(63);
  await page.reload();
  await expect(screen).toHaveAttribute('data-state', 'ready');
  await expect(screen).toHaveAttribute('data-playback', 'surface');
  const after = await page.evaluate(
    key =>
      JSON.parse(localStorage.getItem(key)!).snapshot.snapshot.tourcraft.flight,
    DION_STORAGE.resume
  );
  expect(after).toEqual(before);
  expect(errors).toEqual([]);
});
