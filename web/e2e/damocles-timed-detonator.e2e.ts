import { expect, test, type Page } from '@playwright/test';

import { DAMOCLES_RESUME_KEY, watchErrors } from './damocles-play.ts';

/// Browser verification of the TIMED DETONATOR (#635): a player at the ERIS spaceport carries an
/// EXPLOSIVE at the head of the Carried Stack and the TIMED DETONATOR, open on the centre box.
/// Or the EXPLOSIVE lies armed at the player's feet, since the arrival spot refuses a Drop. The
/// Session Resume is seeded once. The reload then runs the keypad keys, the countdown, the blast
/// on the main-loop pass after it, and the death it causes.
const holding = async (page: Page, placed = false): Promise<void> => {
  await page.goto('/damocles');
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready', {
    timeout: 20_000
  });
  const encoded = await page.evaluate(async placed => {
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
    const saved = new DamoclesSession(content).captureResume();
    const held = placed
      ? ['object-slot-145']
      : ['object-slot-75', 'object-slot-145'];
    const { position } = saved.pose;
    const snapshot = {
      ...saved,
      carried: held,
      headCommands: {
        ...saved.headCommands,
        box: { from: 145, fromItem: null, steps: 0, to: 145 },
        open: { index: 0, item: 0, slot: 145 }
      },
      residence: [
        ...saved.residence.filter(
          item =>
            !held.includes(item.instance) && item.instance !== 'object-slot-75'
        ),
        ...held.map(instance => ({
          instance,
          residence: { kind: 'carried' as const, placementClass: 4 }
        })),
        ...(placed
          ? [
              {
                instance: 'object-slot-75',
                residence: {
                  body: saved.pose.body,
                  kind: 'surface' as const,
                  placementClass: 0,
                  position: { x: position.x, y: 0, z: position.z }
                }
              }
            ]
          : [])
      ],
      // Placed, the EXPLOSIVE is already armed at charge 1 with 5 s to go.
      timedDetonator: {
        armed: placed,
        charge: 1,
        deadline: placed ? Math.floor(saved.elapsed) + 5 : 0,
        door: null,
        fuse: placed ? 5 : 0,
        regionBlast: false,
        slot: placed ? 75 : null
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
      where: 'ERIS'
    });
  }, placed);
  await page.addInitScript(
    ({ encoded, key }) => localStorage.setItem(key, encoded),
    { encoded, key: DAMOCLES_RESUME_KEY }
  );
  await page.reload();
  await expect(page.locator('#frame')).toHaveAttribute('data-state', 'ready', {
    timeout: 20_000
  });
};

const centreBox = (page: Page) =>
  page.locator('#panel-damocles [data-panel-control=centre]');

/// Charge 1 and a 5 s fuse from the keypad, then `p` (keypad `*`) arms the head.
const arm = async (page: Page): Promise<void> => {
  const frame = page.locator('#frame');
  await expect(centreBox(page)).toHaveAttribute(
    'data-panel',
    'TIMED DETONATOR'
  );
  await page.keyboard.press('Numpad1');
  // `.`, the laptop's keypad `+`.
  await page.keyboard.press('.');
  await expect(centreBox(page)).toHaveAttribute('data-item', '1 0.05');
  await page.keyboard.press('p');
  await expect(frame).toHaveAttribute(
    'data-timed-detonator',
    /^armed 1 [1-5] 75$/
  );
};

test('an armed EXPLOSIVE at the player’s feet counts down, goes off and kills with string 35', async ({
  page
}, testInfo) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await holding(page, true);
  const frame = page.locator('#frame');
  await expect(frame).toHaveAttribute(
    'data-timed-detonator',
    /^armed 1 [1-5] 75$/
  );
  // `$786A` counts the seconds left on the panel.
  await expect(centreBox(page)).toHaveAttribute('data-item', /^1 0\.0[1-3]$/, {
    timeout: 10_000
  });
  await page.screenshot({ path: testInfo.outputPath('detonator-armed.png') });
  await expect(frame).toHaveAttribute(
    'data-removed-residents',
    /object-slot-75/,
    { timeout: 15_000 }
  );
  await expect(frame).toHaveAttribute('data-timed-detonator', 'safe 1 0 75');
  await expect(frame).toHaveAttribute('data-damocles-row', /TOO CLOSE/, {
    timeout: 10_000
  });
  await expect(frame).toHaveAttribute('data-screen', /dead/);
  await page.screenshot({ path: testInfo.outputPath('detonator-blast.png') });
  expect(errors).toEqual([]);
});

test('an EXPLOSIVE armed from the keypad and still carried blows the player up with string 34', async ({
  page
}) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await holding(page);
  const frame = page.locator('#frame');
  await arm(page);
  await expect(frame).toHaveAttribute('data-damocles-row', /OOPS/, {
    timeout: 20_000
  });
  await expect(frame).toHaveAttribute(
    'data-removed-residents',
    /object-slot-75/
  );
  await expect(frame).toHaveAttribute('data-screen', /dead/);
  expect(errors).toEqual([]);
});

/// #650: a charge 4 blast with `$7A5A` set removes the structure in its cell, and the frame stops
/// drawing it. The player stands in UR CITY's cell `$24` at gaea-ur-city-4-2, and the EXPLOSIVE
/// lies armed in the same cell, `$2000` off on X: out of the reach's `$400` box, so the player
/// lives to see it. `$7A5A` is as a Drop near the extent would leave it.
test('a blast with $7A5A set removes the structure in its cell and the frame stops drawing it', async ({
  page
}, testInfo) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
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
    // GAEA's Models are read before the Save is built, so that it binds UR CITY's structure.
    const first = new DamoclesSession(content);
    first.switchToPose('gaea-ur-city-4-2');
    await DamoclesSession.prepare(content, {
      ...first.captureResume(),
      structure: null
    });
    const session = new DamoclesSession(content);
    session.switchToPose('gaea-ur-city-4-2');
    const saved = session.captureResume();
    const { position } = saved.pose;
    // Towards the cell's centre, so the EXPLOSIVE stays in the player's cell.
    const within = position.x % 0x1_00_00;
    const x = position.x + (within < 0x80_00 ? 0x20_00 : -0x20_00);
    const snapshot = {
      ...saved,
      residence: [
        ...saved.residence.filter(item => item.instance !== 'object-slot-75'),
        {
          instance: 'object-slot-75',
          residence: {
            body: saved.pose.body,
            kind: 'surface' as const,
            placementClass: 0,
            position: { x, y: 0, z: position.z }
          }
        }
      ],
      timedDetonator: {
        armed: true,
        charge: 4,
        deadline: Math.floor(saved.elapsed) + 5,
        door: null,
        fuse: 5,
        regionBlast: true,
        slot: 75
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
  });
  await page.addInitScript(
    ({ encoded, key }) => localStorage.setItem(key, encoded),
    { encoded, key: DAMOCLES_RESUME_KEY }
  );
  await page.reload();
  const frame = page.locator('#frame');
  await expect(frame).toHaveAttribute('data-state', 'ready', {
    timeout: 20_000
  });
  await expect(frame).toHaveAttribute(
    'data-structure-instance',
    'gaea-ur-city-surface-24'
  );
  await expect(frame).toHaveAttribute('data-drawn', /gaea-ur-city-surface-24/);
  await page.screenshot({ path: testInfo.outputPath('structure-before.png') });
  await expect(frame).toHaveAttribute(
    'data-structure-damage',
    '07 24 0000 00 00',
    { timeout: 15_000 }
  );
  await expect(frame).toHaveAttribute('data-structure-instance', '');
  await expect(frame).not.toHaveAttribute(
    'data-drawn',
    /gaea-ur-city-surface-24/
  );
  await expect(frame).not.toHaveAttribute('data-screen', /dead/);
  // Past the flash, so the screenshot shows the ground the structure stood on.
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath('structure-after.png') });
  expect(errors).toEqual([]);
});
