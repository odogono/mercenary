import { expect, test } from '@playwright/test';

import { watchErrors } from './damocles-play.ts';

/// Seed a real Session Resume at the end of the recovered clock; the reload exercises the
/// browser's restore, simulation, rendering and persistence paths.
const nearZero = async (
  page: import('@playwright/test').Page,
  pose: string
) => {
  await page.goto('/damocles');
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready', {
    timeout: 20_000
  });
  const encoded = await page.evaluate(async poseName => {
    const { damoclesTitle } = await import('../src/damocles/title.ts');
    const { DamoclesSession } = await import('../src/damocles/session.ts');
    const {
      DAMOCLES_SAVE_SCHEMA_VERSION,
      damoclesSaveIdentity,
      encodeDamoclesSave
    } = await import('../src/damocles/save.ts');
    const content = await damoclesTitle.load(async pathname => {
      const text = await (await fetch(pathname)).text();
      return { text, value: JSON.parse(text) };
    });
    let session = new DamoclesSession(content);
    if (poseName !== 'eris-spaceport-onfoot') {
      const outcome = session.switchToPose(poseName);
      if (outcome.kind !== 'switched') {
        throw new Error(outcome.reason);
      }
      await DamoclesSession.prepare(content, {
        ...session.captureResume(),
        structure: null
      });
      session = new DamoclesSession(content);
      const prepared = session.switchToPose(poseName);
      if (prepared.kind !== 'switched') {
        throw new Error(prepared.reason);
      }
    }
    const snapshot = {
      ...session.captureResume(),
      elapsed: content.doc.time.impactDeadlineSeconds - 2
    };
    return encodeDamoclesSave({
      identity: damoclesSaveIdentity(
        content.catalogue,
        content.presentationSha256
      ),
      savedAt: new Date().toISOString(),
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot,
      where: poseName
    });
  }, pose);
  await page.addInitScript(
    ({ encoded, key }) => localStorage.setItem(key, encoded),
    {
      encoded,
      key: 'mercenary.browser-shell.damocles.session-resume.v1'
    }
  );
  await page.reload();
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready', {
    timeout: 20_000
  });
};

test('the clock destroys ERIS and DAMOCLES while play continues on GAEA', async ({
  page
}) => {
  test.setTimeout(40_000);
  const errors = watchErrors(page);
  await nearZero(page, 'gaea-ur-city-4-2');
  const frame = page.locator('#frame');
  await expect(frame).toHaveAttribute('data-body', 'body-8');
  await expect
    .poll(async () => Number(await frame.getAttribute('data-elapsed')))
    .toBeGreaterThan(15_560);
  await expect(frame).toHaveAttribute('data-screen', 'clear');
  await expect(frame).not.toHaveAttribute('data-sky-bodies', /eris|damocles/);
  expect(errors).toEqual([]);
});

test('the clock kills a player on ERIS and names VOID', async ({ page }) => {
  test.setTimeout(40_000);
  const errors = watchErrors(page);
  await nearZero(page, 'eris-spaceport-onfoot');
  await expect(page.locator('#frame')).toHaveAttribute('data-body', 'body-11');
  await expect(page.locator('#frame')).toHaveAttribute('data-screen', 'dead', {
    timeout: 20_000
  });
  await expect(
    page.locator('#panel-damocles [data-field=locationName]')
  ).toHaveText('VOID');
  expect(errors).toEqual([]);
});
