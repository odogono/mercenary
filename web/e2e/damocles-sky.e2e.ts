import { expect, test } from '@playwright/test';

import {
  DAMOCLES_RESUME_KEY,
  closeConsole,
  ready,
  run,
  watchErrors
} from './damocles-play.ts';

/// Browser verification for the sky Bodies (#530): on METIS at night, with the sky longitude
/// at one of #528's pinned values, ERIS is drawn and VESTA lies under the horizon.

/// `$042C6C = 768` at the METIS capture, whose longitude step is 631.
const METIS_TURN_AT_768 = (768 - 631) * 0x1_00_00;

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
  expect(errors).toEqual([]);
});
