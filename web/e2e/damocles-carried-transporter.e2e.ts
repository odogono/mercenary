import { expect, test } from '@playwright/test';

import { DAMOCLES_RESUME_KEY, watchErrors } from './damocles-play.ts';

/// Browser verification of a carried Transporter's digit (#1017): a player standing in Eris
/// slot 69's cube carries Transporter slot 66, as an ANTIGRAV take leaves it. Its digit takes
/// them into VOID, into its own cube on the carried column, and a digit there takes them out.
test('a carried Transporter’s digit hops into VOID and a digit hops out', async ({
  page
}, testInfo) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await page.goto('/damocles');
  const frame = page.locator('#frame');
  await expect(frame).toHaveAttribute('data-state', 'ready', {
    timeout: 20_000
  });
  const encoded = await page.evaluate(async () => {
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
    const session = new DamoclesSession(content);
    if (session.switchToPose('eris-transporter-11-8').kind !== 'switched') {
      throw new Error('no eris-transporter-11-8');
    }
    const saved = session.captureResume();
    // Slot 69, the Floor 10 Transporter at Capital City 11-08, as the session draws it.
    const slot69 = { x: 4_945_724, y: 1100, z: 8_944_934 };
    const instance = content.catalogue.instances.find(
      item => item.id === 'object-slot-66'
    )!;
    const snapshot = {
      ...saved,
      carried: ['object-slot-66', ...saved.carried],
      pose: {
        ...saved.pose,
        position: { x: slot69.x, y: slot69.y + 63, z: slot69.z }
      },
      residence: [
        ...saved.residence.filter(item => item.instance !== instance.id),
        {
          instance: instance.id,
          residence: {
            kind: 'carried' as const,
            placementClass: instance.placementClass ?? 0
          }
        }
      ]
    };
    return encodeDamoclesSave({
      identity: damoclesSaveIdentity(
        content.catalogue,
        content.presentationSha256
      ),
      savedAt: new Date().toISOString(),
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      snapshot,
      where: 'ERIS'
    });
  });
  await page.addInitScript(
    // Once: a later reload must restore what the session itself last resumed.
    ({ encoded, key }) => {
      if (sessionStorage.getItem('seeded') === null) {
        localStorage.setItem(key, encoded);
        sessionStorage.setItem('seeded', '1');
      }
    },
    { encoded, key: DAMOCLES_RESUME_KEY }
  );
  await page.reload();
  await expect(frame).toHaveAttribute('data-state', 'ready', {
    timeout: 20_000
  });
  await expect(frame).toHaveAttribute('data-cell', '11-8');
  const location = page.locator('#panel-damocles [data-field=locationName]');
  await expect(location).toHaveText('VOID');

  await page.keyboard.press('2');
  await expect(frame).toHaveAttribute('data-cell', '0-1', { timeout: 5000 });
  await expect(frame).toHaveAttribute('data-x', '33237');
  await expect(frame).toHaveAttribute('data-z', '99100');
  await expect(location).toHaveText('VOID');
  await page.screenshot({ path: testInfo.outputPath('in-void.png') });

  // Reloaded in VOID, the player is still in the carried cube, and its digits still work.
  await page.reload();
  await expect(frame).toHaveAttribute('data-state', 'ready', {
    timeout: 20_000
  });
  await expect(frame).toHaveAttribute('data-cell', '0-1');
  await expect(frame).toHaveAttribute('data-x', '33237');

  // Eris slot 65, as live.
  await page.keyboard.press('1');
  await expect(frame).not.toHaveAttribute('data-cell', '0-1', {
    timeout: 5000
  });
  await expect(frame).not.toHaveAttribute('data-x', '33237');
  expect(errors).toEqual([]);
});
