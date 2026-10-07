import { expect, test, type Page } from '@playwright/test';

import { DAMOCLES_RESUME_KEY, watchErrors } from './damocles-play.ts';

/// Browser verification of the NOVABOMB (#627): a player at the ERIS spaceport who has accepted
/// the first offer carries the SIDEBOARD, NOVA TRIGGER 1, open on the centre box, with the other
/// three detonators already switched on and the bomb placed on DAMOCLES, as the TOP SECRET FILE
/// tells the player to leave it. The Session Resume is seeded once and the reload runs the
/// browser's restore, the `+` key, the dispatcher, the sky and the panel.
const primed = async (page: Page): Promise<void> => {
  await page.goto('/damocles');
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready', {
    timeout: 20_000
  });
  const encoded = await page.evaluate(async () => {
    const { damoclesTitle } = await import('../src/damocles/title.ts');
    const { DamoclesSession, NOVABOMB } =
      await import('../src/damocles/session.ts');
    const {
      DAMOCLES_SAVE_SCHEMA_VERSION,
      damoclesSaveIdentity,
      encodeDamoclesSave
    } = await import('../src/damocles/save.ts');
    const content = await damoclesTitle.load(async pathname => {
      const text = await (await fetch(pathname)).text();
      return { text, value: JSON.parse(text) };
    });
    const saved = new DamoclesSession(content).captureResume();
    const sideboard = 84;
    const snapshot = {
      ...saved,
      carried: [`object-slot-${sideboard}`],
      headCommands: {
        ...saved.headCommands,
        box: { from: sideboard, fromItem: null, steps: 0, to: sideboard },
        open: { index: 0, item: 0, slot: sideboard }
      },
      residence: [
        ...saved.residence,
        {
          instance: `object-slot-${sideboard}`,
          residence: { kind: 'carried' as const, placementClass: 4 }
        },
        {
          instance: NOVABOMB,
          residence: {
            body: 'body-29',
            kind: 'surface' as const,
            placementClass: 1,
            position: { x: 0, y: 0, z: 0 }
          }
        }
      ],
      script: {
        ...saved.script,
        carried: [38],
        flags: 1,
        reward: 0x10,
        triggers: saved.script.triggers.map(trigger =>
          trigger.index === 4 ? { ...trigger, armed: false } : trigger
        )
      },
      switches: 0x70
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
    ({ encoded, key }) => localStorage.setItem(key, encoded),
    { encoded, key: DAMOCLES_RESUME_KEY }
  );
  await page.reload();
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready', {
    timeout: 20_000
  });
};

const cash = (page: Page) => page.locator('#panel-damocles [data-field=cash]');
const centreBox = (page: Page) =>
  page.locator('#panel-damocles [data-panel-control=centre]');

test('the fourth NOVA TRIGGER detonates the bomb on DAMOCLES and saves ERIS', async ({
  page
}, testInfo) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await primed(page);
  const frame = page.locator('#frame');
  await expect(frame).toHaveAttribute('data-document', '84 0 0');
  await expect(frame).toHaveAttribute('data-switches', '70');
  await expect(centreBox(page)).toHaveAttribute('data-panel', 'NOVA TRIGGER 1');
  await expect(centreBox(page)).toHaveAttribute('data-item', 'OFF');
  await expect(cash(page)).toHaveText('000,009,000.00');
  // `.`, the laptop's keypad `+`.
  await page.keyboard.press('.');
  await expect(frame).toHaveAttribute('data-switches', '78');
  await expect(centreBox(page)).toHaveAttribute('data-item', 'ON');
  await expect(frame).toHaveAttribute('data-destroyed-bodies', 'body-29');
  await page.screenshot({ path: testInfo.outputPath('novabomb-switched.png') });
  // `$12`: the State President after the 150-frame wait, then the promised 10 million.
  await expect(frame).toHaveAttribute(
    'data-damocles-row',
    /MESSAGE FROM THE STATE PRESIDENT/,
    { timeout: 15_000 }
  );
  await expect(cash(page)).toHaveText('010,009,000.00', { timeout: 30_000 });
  await expect(frame).not.toHaveAttribute('data-screen', /dead/);
  expect(errors).toEqual([]);
});
