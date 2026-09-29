import { expect, test, type Page } from '@playwright/test';

import {
  DAMOCLES_RESUME_KEY,
  inventory,
  watchErrors
} from './damocles-play.ts';

/// Browser verification of the BOOK's wishes (#625): a player on GAEA who has accepted the first
/// offer carries the BOOK, open at `page`, and the MAGIC CRYSTAL, as the note's live runs start
/// (docs/research/damocles-endgame.md). The Session Resume is seeded once and the reload runs
/// the browser's restore, the Read key, the simulation and the panel.
const withTheBook = async (page: Page, bookPage: number): Promise<void> => {
  await page.goto('/damocles');
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready', {
    timeout: 20_000
  });
  const encoded = await page.evaluate(async pageIndex => {
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
    const pose = 'gaea-ur-city-4-2';
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
    const carried = ['object-slot-131', 'object-slot-95'];
    const snapshot = {
      ...saved,
      carried,
      headCommands: {
        ...saved.headCommands,
        box: { from: 131, fromItem: null, steps: 0, to: 131 },
        open: { index: pageIndex, item: pageIndex, slot: 131 }
      },
      residence: [
        ...saved.residence,
        ...carried.map(instance => ({
          instance,
          residence: { kind: 'carried' as const, placementClass: 4 }
        }))
      ],
      script: {
        ...saved.script,
        carried: [38],
        flags: 1,
        reward: 0x10,
        triggers: saved.script.triggers.map(trigger =>
          trigger.index === 4 || trigger.index === 20
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
      snapshot,
      where: 'GAEA'
    });
  }, bookPage);
  await page.addInitScript(
    ({ encoded, key }) => localStorage.setItem(key, encoded),
    { encoded, key: DAMOCLES_RESUME_KEY }
  );
  await page.reload();
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready', {
    timeout: 20_000
  });
  await expect(page.locator('#frame')).toHaveAttribute(
    'data-document',
    `131 ${bookPage} ${bookPage}`
  );
};

const cash = (page: Page) => page.locator('#panel-damocles [data-field=cash]');

test('page 5 with the crystal saves both ERIS and DAMOCLES', async ({
  page
}, testInfo) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await withTheBook(page, 5);
  const frame = page.locator('#frame');
  await expect(cash(page)).toHaveText('000,009,000.00');
  await page.keyboard.press('p');
  // The page's two blocks present first, then the drift is armed and the grant scrolls in.
  await expect(frame).toHaveAttribute('data-drift', '-4660', {
    timeout: 15_000
  });
  await expect(frame).toHaveAttribute('data-damocles-row', /GRANT YOUR WISH/, {
    timeout: 10_000
  });
  await expect(inventory(page)).not.toHaveText('MAGIC CRYSTAL');
  await expect(frame).toHaveAttribute('data-destroyed-bodies', '');
  await page.screenshot({ path: testInfo.outputPath('wish-5-grant.png') });
  // Lloyds' special reward, after the grant, the wait and five lines.
  await expect(cash(page)).toHaveText('025,009,000.00', { timeout: 45_000 });
  expect(errors).toEqual([]);
});

test('page 3 with the crystal destroys DAMOCLES and saves ERIS', async ({
  page
}, testInfo) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await withTheBook(page, 3);
  const frame = page.locator('#frame');
  await page.keyboard.press('p');
  await expect(frame).toHaveAttribute('data-destroyed-bodies', 'body-29', {
    timeout: 15_000
  });
  await expect(frame).not.toHaveAttribute('data-sky-bodies', /damocles/);
  await expect(frame).toHaveAttribute('data-damocles-row', /GRANT YOUR WISH/, {
    timeout: 10_000
  });
  await page.screenshot({ path: testInfo.outputPath('wish-3-grant.png') });
  // The State President's reward tail pays the promised 10 million.
  await expect(cash(page)).toHaveText('010,009,000.00', { timeout: 45_000 });
  expect(errors).toEqual([]);
});
