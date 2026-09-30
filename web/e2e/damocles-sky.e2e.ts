import { expect, test } from '@playwright/test';

import {
  DAMOCLES_RESUME_KEY,
  closeConsole,
  ready,
  run,
  watchErrors
} from './damocles-play.ts';

/// Browser verification that a fresh game starts by day, and for the sky Bodies (#530): on METIS at night, with the sky longitude
/// at one of #528's pinned values, ERIS is drawn and VESTA lies under the horizon. And for the
/// comet (#538): at #528's pinned impact clock it is in METIS's sky, and a Session Resume keeps
/// it there.

/// `$042C6C = 768` at the METIS capture, whose longitude step is 631.
const METIS_TURN_AT_768 = (768 - 631) * 0x1_00_00;
/// `$042C6C = 96`, where the comet is in METIS's sky through the middle of the countdown.
const METIS_TURN_AT_96 = ((96 - 631) & 0x3_ff) * 0x1_00_00;
/// Session seconds that read #528's MIDAS clock, `-6639` and 13/32, on a 15,560-second
/// deadline at 20 VBLs a second and 50 a Session second.
const ELAPSED_AT_PINNED_CLOCK = ((15_560 - 6639 + 13.5 / 32) * 20) / 50;

test('a fresh game starts on ERIS by day, under the day sky', async ({
  page
}, testInfo) => {
  const errors = watchErrors(page);
  await page.addInitScript(
    key => localStorage.removeItem(key),
    DAMOCLES_RESUME_KEY
  );
  await page.goto('/damocles');
  await ready(page);
  await expect(page.locator('#frame')).toHaveAttribute('data-daylight', 'true');
  await testInfo.attach('eris-start', {
    body: await page.screenshot({
      path: testInfo.outputPath('eris-start.png')
    }),
    contentType: 'image/png'
  });
  expect(errors).toEqual([]);
});

test('METIS at night draws ERIS in the sky and leaves VESTA under the horizon', async ({
  page
}, testInfo) => {
  const errors = watchErrors(page);
  await page.addInitScript(
    key => localStorage.removeItem(key),
    DAMOCLES_RESUME_KEY
  );
  await page.route('**/payload/damocles/arrival-poses.json', async route => {
    const document_ = await (await route.fetch()).json();
    for (const pose of document_.poses) {
      if (pose.id === 'metis-transporter') {
        pose.bodyTurn = METIS_TURN_AT_768;
      }
    }
    await route.fulfill({ json: document_ });
  });
  await page.goto('/damocles');
  await ready(page);
  expect(await run(page, 'switch metis-transporter')).toContain('switched');
  await closeConsole(page);
  const frame = page.locator('#frame');
  await expect(frame).toHaveAttribute('data-daylight', 'false');
  await expect(frame).toHaveAttribute('data-sky-bodies', /\beris\b/);
  expect(await frame.getAttribute('data-sky-bodies')).not.toMatch(/\bvesta\b/);
  await testInfo.attach('metis-768', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });
  expect(await run(page, 'set extended on')).toContain('extended controls on');
  await closeConsole(page);
  await page.keyboard.down('PageUp');
  try {
    await expect
      .poll(async () => Number(await frame.getAttribute('data-pitch')), {
        intervals: [20]
      })
      .toBeGreaterThan(0.2);
  } finally {
    await page.keyboard.up('PageUp');
  }
  // ERIS has moved below the centre row, but its crescent is still above the tilted horizon.
  await expect(frame).toHaveAttribute('data-sky-bodies', /\beris\b/);
  await testInfo.attach('metis-free-look', {
    body: await page.screenshot({
      path: testInfo.outputPath('metis-free-look.png')
    }),
    contentType: 'image/png'
  });
  expect(errors).toEqual([]);
});

test('the comet is in the METIS sky at the pinned impact clock, and a Session Resume keeps it', async ({
  page
}, testInfo) => {
  const errors = watchErrors(page);
  // Clear any Session Resume on the first load. On the reload, before the page reads the
  // record the first load left, move its clock and sky to the pinned values: a Session Resume
  // is plain JSON, and the page writes its own on the way out, so it cannot be edited sooner.
  await page.addInitScript(
    ({ elapsed, key, turn }) => {
      if (sessionStorage.getItem('comet-e2e') === null) {
        sessionStorage.setItem('comet-e2e', 'started');
        localStorage.removeItem(key);
        return;
      }
      const stored = localStorage.getItem(key);
      if (
        sessionStorage.getItem('comet-e2e') === 'started' &&
        stored !== null
      ) {
        sessionStorage.setItem('comet-e2e', 'patched');
        const record = JSON.parse(stored);
        record.snapshot.elapsed = elapsed;
        record.snapshot.bodyTurn = turn;
        // A quarter turn right of the capture's heading faces the comet, low in the east.
        record.snapshot.pose.heading += Math.PI / 2;
        localStorage.setItem(key, JSON.stringify(record));
      }
    },
    {
      elapsed: ELAPSED_AT_PINNED_CLOCK,
      key: DAMOCLES_RESUME_KEY,
      turn: METIS_TURN_AT_96
    }
  );
  await page.goto('/damocles');
  await ready(page);
  expect(await run(page, 'switch metis-transporter')).toContain('switched');
  await closeConsole(page);
  await page.reload();
  await ready(page);
  const frame = page.locator('#frame');
  await expect(frame).toHaveAttribute('data-body', 'body-15');
  await expect(frame).toHaveAttribute('data-sky-bodies', /\bdamocles\b/);
  expect(
    Number(await frame.getAttribute('data-elapsed'))
  ).toBeGreaterThanOrEqual(ELAPSED_AT_PINNED_CLOCK);
  await testInfo.attach('metis-comet', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });
  expect(errors).toEqual([]);
});
