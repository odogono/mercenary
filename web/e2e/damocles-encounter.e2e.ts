import { expect, test, type Page } from '@playwright/test';

import {
  DOORWAY_LINE_LOCAL,
  FACING_DOORWAY,
  bootAt,
  closeConsole,
  damoclesSaveSlot,
  inventory,
  ready,
  rowReaches,
  run,
  soundCues,
  spaceportWorld,
  walkUntil,
  watchErrors
} from './damocles-play.ts';

/// Browser verification of the TOLOSA encounter (#581, ADR 0055).
///
/// The Golden Trace tests are the authority: they hold the pool to every traced pass. This pass
/// confirms that held F fires a shot the view draws, and that a zap takes the browser through the
/// noise, the fade and VOID to the death message. A zap is reached by loading a Save that puts
/// the ship's shot on the camera, as the #581 death run pokes it. Screenshots are attached for a
/// reviewer's eye.

const LIMO = 'object-slot-5';
const LIMO_KEY_LABEL = 'KEY- V.I.P. LIMO';
const ERIS_SELECTOR = 0x2c;

const frame = (page: Page) => page.locator('#frame');
const attribute = async (page: Page, name: string): Promise<number> =>
  Number(await frame(page).getAttribute(`data-${name}`));
const field = (page: Page, name: string) =>
  page.locator(`#panel-damocles [data-field=${name}]`);

const shot = async (
  page: Page,
  name: string,
  testInfo: { attach: (name: string, options: object) => Promise<void> }
): Promise<void> => {
  await testInfo.attach(name, {
    body: await page.screenshot(),
    contentType: 'image/png'
  });
};

const aboardLimo = async (page: Page): Promise<void> => {
  await bootAt(page, DOORWAY_LINE_LOCAL, FACING_DOORWAY);
  const origin = await spaceportWorld(page);
  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText(LIMO_KEY_LABEL, { timeout: 5000 });
  await walkUntil(
    page,
    'ArrowUp',
    async () => (await attribute(page, 'z')) - origin.z < -3000
  );
  await page.keyboard.press('b');
  await expect(frame(page)).toHaveAttribute('data-occupancy', LIMO);
};

test('held F fires a shot the view draws', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await aboardLimo(page);
  await page.keyboard.down('f');
  await expect
    .poll(async () => (await frame(page).getAttribute('data-drawn')) ?? '', {
      timeout: 10_000
    })
    .toContain('object-slot-8');
  await shot(page, 'limo-firing', testInfo);
  await page.keyboard.up('f');
  expect(await soundCues(page)).toContain('shot:');
  expect(errors).toEqual([]);
});

interface SavedRecord {
  schemaVersion: number;
  snapshot: {
    encounter: unknown;
    pose: { position: { x: number; y: number; z: number } };
    script: { encounter: number; flags: number };
  };
}

test('a zap runs the noise, the fade and VOID to the death message', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await aboardLimo(page);
  expect(await run(page, 'save 1')).toContain('saved');
  const slot = damoclesSaveSlot(1);
  const record = JSON.parse(
    (await page.evaluate(k => localStorage.getItem(k), slot))!
  ) as SavedRecord;
  expect(record.schemaVersion).toBe(16);
  const { x, y, z } = record.snapshot.pose.position;
  const camera = [x >>> 0, y >>> 0, z >>> 0];
  const idle = {
    body: 0,
    counter: 0,
    position: [0, 0, 0],
    velocity: [0, 0, 0]
  };
  // The gate TOLOSA's landing arms, the ship parked inside its window and its shot on the camera.
  record.snapshot.script = {
    ...record.snapshot.script,
    encounter: 1,
    flags: 2
  };
  record.snapshot.encounter = {
    dead: false,
    pool: {
      ship: {
        body: ERIS_SELECTOR,
        counter: 0x7f_ff,
        position: [camera[0]! + 0x1_00, camera[1], camera[2]],
        velocity: [0, 0, 0]
      },
      shipShot: {
        body: ERIS_SELECTOR,
        counter: 0x10,
        position: camera,
        velocity: [0, 0, 0]
      },
      shot: idle
    }
  };
  await page.evaluate(
    ([k, v]) => localStorage.setItem(k!, v!),
    [slot, JSON.stringify(record)]
  );
  expect(await run(page, 'load 1')).toContain('restored slot 1');
  await closeConsole(page);
  await ready(page);

  await expect(frame(page)).toHaveAttribute('data-screen', 'noise', {
    timeout: 5000
  });
  await expect(page.locator('#frame-noise')).toBeVisible();
  await shot(page, 'zap-noise', testInfo);
  await expect(frame(page)).toHaveAttribute('data-screen', /fade-[1-7]/, {
    timeout: 10_000
  });
  await expect(page.locator('#frame-noise')).toBeHidden();
  await shot(page, 'zap-fading', testInfo);
  await expect(frame(page)).toHaveAttribute('data-screen', 'dead', {
    timeout: 10_000
  });
  await expect(field(page, 'locationName')).toHaveText('VOID');
  await rowReaches(page, "YOU'RE A BIT DEAD");
  await shot(page, 'dead', testInfo);
  expect(await soundCues(page)).toContain('zap:');
  // Nothing moves the dead player.
  const before = await attribute(page, 'x');
  await page.keyboard.press('4');
  await page.waitForTimeout(500);
  expect(await attribute(page, 'x')).toBe(before);
  expect(errors).toEqual([]);
});
