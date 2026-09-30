import { expect, test, type Page } from '@playwright/test';

import {
  DOORWAY_LINE_LOCAL,
  FACING_DOORWAY,
  bootAt,
  inventory,
  spaceportWorld,
  walkUntil,
  watchErrors
} from './damocles-play.ts';

/// Browser verification of the gamepad Control Profile (#654, ADR 0059). The page's Gamepad API
/// is replaced by one standard-mapping pad whose buttons and sticks the test sets, so the pad is
/// read through the same poll a real one is.

interface FakePad {
  axes: number[];
  buttons: number[];
}

declare global {
  interface Window {
    __pad: FakePad;
  }
}

const installPad = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    window.__pad = { axes: [0, 0, 0, 0], buttons: [] };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [
        {
          axes: window.__pad.axes,
          buttons: Array.from({ length: 17 }, (_, index) => {
            const down = window.__pad.buttons.includes(index);
            return { pressed: down, value: down ? 1 : 0 };
          }),
          mapping: 'standard'
        }
      ]
    });
  });
};

const setPad = (page: Page, pad: FakePad): Promise<void> =>
  page.evaluate(next => {
    window.__pad = next;
  }, pad);

/// Hold `buttons` down long enough for a frame to poll them, then let go.
const tap = async (page: Page, ...buttons: number[]): Promise<void> => {
  await setPad(page, { axes: [0, 0, 0, 0], buttons });
  await page.waitForTimeout(100);
  await setPad(page, { axes: [0, 0, 0, 0], buttons: [] });
  await page.waitForTimeout(100);
};

const A = 0;
const X = 2;
const LB = 4;
const RB = 5;
const BACK = 8;
const START = 9;

const surface = (page: Page) => page.locator('#game-surface');
const frameZ = async (page: Page): Promise<number> =>
  Number(await page.locator('#frame').getAttribute('data-z'));

test('Targ: Back skips the Arrival, the left stick walks and Start opens the System Menu', async ({
  page
}) => {
  const errors = watchErrors(page);
  await installPad(page);
  // Hold the Arrival long enough to press a pad into it, and hurry the journey in front of it.
  await page.route('**/settings.json', async route => {
    const response = await route.fetch();
    const settings = (await response.json()) as {
      arrival: { holdSeconds: number };
      departure: { journeySeconds: number };
    };
    settings.arrival.holdSeconds = 6;
    settings.departure.journeySeconds = 0.2;
    await route.fulfill({ json: settings, response });
  });
  await page.goto('/');
  await expect(surface(page)).toHaveAttribute('data-state', 'ready');
  await expect(surface(page)).toHaveAttribute('data-departure', 'carousel');
  await page.keyboard.press('Enter');
  await expect(surface(page)).toHaveAttribute('data-arrival', 'titleCard');

  // During the Arrival only Back reaches play: A would board.
  await tap(page, A, BACK);
  await expect(surface(page)).toHaveAttribute('data-arrival', 'done');
  await expect(page.locator('#frame')).toHaveAttribute('data-z', '559104');

  await setPad(page, { axes: [0, -1, 0, 0], buttons: [] });
  await expect.poll(() => frameZ(page)).not.toBe(559_104);
  await setPad(page, { axes: [0, 0, 0, 0], buttons: [] });

  await tap(page, START);
  await expect(surface(page)).toHaveAttribute('data-layer', 'menu');
  expect(errors).toEqual([]);
});

test('Damocles: X takes, the left stick walks and the Controls Page lists the pad', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await installPad(page);
  await bootAt(page, DOORWAY_LINE_LOCAL, FACING_DOORWAY);

  await tap(page, X);
  await expect(inventory(page)).toHaveText('KEY- V.I.P. LIMO', {
    timeout: 5000
  });

  const before = await frameZ(page);
  await setPad(page, { axes: [0, -1, 0, 0], buttons: [] });
  await expect.poll(() => frameZ(page)).toBeLessThan(before);
  await setPad(page, { axes: [0, 0, 0, 0], buttons: [] });

  await tap(page, START);
  await expect(surface(page)).toHaveAttribute('data-layer', 'menu');
  await page.locator('#page-menu [data-goto=controls]').click();
  const always = page.locator('#page-controls [data-group=always]');
  await expect(
    always.locator('.controls-pad', { hasText: 'RT' })
  ).toBeVisible();
  await expect(always).toContainText('RT');
  await expect(always).toContainText('A ON FOOT');
  expect(errors).toEqual([]);
});

test('Damocles: RB and LB step the limo’s throttle a notch at a time, as they do the Dart’s', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await installPad(page);
  await bootAt(page, DOORWAY_LINE_LOCAL, FACING_DOORWAY);
  const origin = await spaceportWorld(page);
  await tap(page, X);
  await expect(inventory(page)).toHaveText('KEY- V.I.P. LIMO', {
    timeout: 5000
  });
  await walkUntil(
    page,
    'ArrowUp',
    async () => (await frameZ(page)) - origin.z < -3000
  );
  await tap(page, A);
  await expect(page.locator('#frame')).toHaveAttribute(
    'data-occupancy',
    'object-slot-5'
  );

  // Four notches up from the stop is key 4, which settles at 012 on the ground.
  for (let notch = 0; notch < 4; notch += 1) {
    await tap(page, RB);
  }
  const speed = page.locator('#panel-damocles [data-field=speedLabel]');
  await expect(speed).toHaveText('+ 000 000 012', { timeout: 20_000 });
  // And four down stop it.
  for (let notch = 0; notch < 4; notch += 1) {
    await tap(page, LB);
  }
  await expect(speed).toHaveText('+ 000 000 000', { timeout: 20_000 });
  expect(errors).toEqual([]);
});
