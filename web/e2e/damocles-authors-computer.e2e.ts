import { expect, test, type Page } from '@playwright/test';

import { DAMOCLES_RESUME_KEY, watchErrors } from './damocles-play.ts';

/// Browser verification of the AUTHORS COMPUTER (#628): a player at DION's transporter who has
/// accepted the first offer sits on the AUTHOR'S CHAIR carrying the computer, as the #626
/// `computer` run starts (docs/research/damocles-endgame.md). The Session Resume is seeded once;
/// the reload runs the restore, the keypad, the dispatcher and the panel.
const seated = async (page: Page): Promise<void> => {
  await page.goto('/damocles');
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready', {
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
    const pose = 'dion-transporter';
    let session = new DamoclesSession(content);
    if (session.switchToPose(pose).kind !== 'switched') {
      throw new Error(`no ${pose}`);
    }
    await DamoclesSession.prepare(content, {
      ...session.captureResume(),
      structure: null
    });
    session = new DamoclesSession(content);
    if (session.switchToPose(pose).kind !== 'switched') {
      throw new Error(`no ${pose}`);
    }
    const saved = session.captureResume();
    // Seated, the Pose moves to the chair, so the structure is bound afresh from there.
    const { structure: _, ...rest } = saved;
    const snapshot = {
      ...rest,
      carried: ['object-slot-101'],
      occupancy: { instance: 'object-slot-14', kind: 'aboard' as const },
      residence: [
        ...saved.residence,
        {
          instance: 'object-slot-101',
          residence: { kind: 'carried' as const, placementClass: 4 }
        },
        {
          instance: 'object-slot-14',
          residence: { kind: 'occupied' as const, placementClass: 4 }
        }
      ],
      script: {
        ...saved.script,
        carried: [38],
        flags: 1,
        reward: 0x10,
        triggers: saved.script.triggers.map(trigger =>
          trigger.index === 4 || trigger.index === 11
            ? { ...trigger, armed: false }
            : trigger
        )
      }
    };
    return encodeDamoclesSave({
      identity: damoclesSaveIdentity(
        content.catalogue,
        content.presentationSha256
      ),
      savedAt: new Date().toISOString(),
      schemaVersion: DAMOCLES_SAVE_SCHEMA_VERSION,
      // A session seats the player and writes the craft words a record aboard carries.
      snapshot: new DamoclesSession(
        content,
        snapshot as unknown as typeof saved
      ).captureResume(),
      where: 'DION'
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

const centreBox = (page: Page) => page.locator('#damocles-centre-canvas');

test('the computer recolours the panel and destroys DAMOCLES from option 4', async ({
  page
}, testInfo) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await seated(page);
  const frame = page.locator('#frame');
  await expect(frame).toHaveAttribute('data-occupancy', /object-slot-14/);
  await page.keyboard.press('Enter');
  await expect(frame).toHaveAttribute('data-document', '101 0 0');
  await expect(centreBox(page)).toHaveAttribute(
    'data-panel',
    'AUTHORS COMPUTER'
  );
  await expect(frame).toHaveAttribute('data-damocles-row', /WARNING/, {
    timeout: 10_000
  });
  await expect(frame).toHaveAttribute('data-centre-box-steps', '0', {
    timeout: 5000
  });
  await expect(centreBox(page)).toHaveAttribute('data-item', '327');
  // Parameter 1, five steps up: the panel's palette takes `$033`.
  await page.keyboard.press('Numpad1');
  await expect(frame).toHaveAttribute('data-computer', '1 139');
  for (let step = 0; step < 5; step += 1) {
    await page.keyboard.press('.');
  }
  await expect(frame).toHaveAttribute('data-panel-mask', '33');
  await page.screenshot({
    path: testInfo.outputPath('computer-panel-mask.png')
  });
  // Parameter 4, stepped down to 0 and back past it to 29 would take 29 presses; the pointer's
  // parameter field steps the parameter too.
  await page.keyboard.press('Numpad4');
  await expect(frame).toHaveAttribute('data-computer', '4 0');
  for (let step = 0; step < 29; step += 1) {
    await page.keyboard.press('.');
  }
  await expect(frame).toHaveAttribute('data-computer', '4 29');
  await expect(centreBox(page)).toHaveAttribute('data-item', '029');
  await page.keyboard.press('p');
  await expect(frame).toHaveAttribute('data-destroyed-bodies', 'body-29');
  // `$12` queues behind the warning, then the State President pays.
  await expect(frame).toHaveAttribute(
    'data-damocles-row',
    /MESSAGE FROM THE STATE PRESIDENT/,
    { timeout: 30_000 }
  );
  await page.screenshot({
    path: testInfo.outputPath('computer-destroyed.png')
  });
  expect(errors).toEqual([]);
});
