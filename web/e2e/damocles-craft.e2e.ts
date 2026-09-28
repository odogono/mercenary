import { expect, test, type Page } from '@playwright/test';

import {
  DOORWAY_LINE_LOCAL,
  FACING_DOORWAY,
  bootAt,
  closeConsole,
  damoclesSaveSlot,
  inventory,
  ready,
  run,
  soundCues,
  spaceportWorld,
  walkUntil,
  watchErrors
} from './damocles-play.ts';

/// Browser verification of the Damocles craft Mover (#556, ADR 0051).
///
/// The replay tests are the authority: they hold the Mover to every traced pass word for word.
/// This pass confirms that ordinary browser play drives and flies on the throttle keys and the
/// stick, that a Building detail box bounces a craft, and that the panel's speed field and
/// altitude window read the craft. Screenshots are attached for a reviewer's eye.

const LIMO = 'object-slot-5';
const LIMO_KEY_LABEL = 'KEY- V.I.P. LIMO';
const EAGLE = 'object-slot-3';
const EAGLE_KEY = 'object-slot-181';
/// The Damocles Script trigger that taking the Eagle's key fires (`scripts.ts`), which a Save
/// that carries the key must show as fired.
const EAGLE_KEY_TRIGGER = 5;

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

test('the limo drives on the throttle keys, bumps off the spaceport and glides back', async ({
  page
}, testInfo) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
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
  const seat = { x: await attribute(page, 'x'), z: await attribute(page, 'z') };

  // Key 4: the limo settles at 33.6 a pass on the ground, which prints as 012.
  await page.keyboard.press('4');
  await expect(field(page, 'speedLabel')).toHaveText('+ 000 000 012', {
    timeout: 20_000
  });
  await shot(page, 'limo-driving', testInfo);
  expect(
    Math.hypot(
      (await attribute(page, 'x')) - seat.x,
      (await attribute(page, 'z')) - seat.z
    )
  ).toBeGreaterThan(100);

  // It meets the spaceport's first support box and bounces once, then glides back with the
  // speed's mantissa negative: `- 000 000 000`.
  await expect
    .poll(async () => soundCues(page), { timeout: 60_000 })
    .toContain('bump:1');
  await expect(field(page, 'speedLabel')).toHaveText('- 000 000 000', {
    timeout: 20_000
  });
  await shot(page, 'limo-bounced', testInfo);

  // The stick turns it where it stands, and leaving drops it facing as it was driven.
  const heading = await attribute(page, 'heading');
  await page.keyboard.down('ArrowRight');
  await expect
    .poll(async () => attribute(page, 'heading'), { timeout: 10_000 })
    .not.toBe(heading);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('l');
  await expect(frame(page)).toHaveAttribute('data-occupancy', '');
  await expect(field(page, 'speedLabel')).toHaveText('+ 000 000 000');
  expect(await soundCues(page)).toContain('bump:1');
  expect(errors).toEqual([]);
});

interface SavedRecord {
  schemaVersion: number;
  snapshot: {
    carried: string[];
    craft: { contact: number } | null;
    occupancy: { instance?: string; kind: string };
    pose: { heading: number; position: { x: number; y: number; z: number } };
    residence: {
      instance: string;
      residence: { kind: string; placementClass: number };
    }[];
    script: { triggers: { armed: boolean; index: number }[] };
  };
}

test('EAGLE NINE S E takes off, reads its altitude, and a steep dive puts the player on foot', async ({
  page
}, testInfo) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const catalogue = (await (
    await page.request.get('/payload/damocles/catalogue.json')
  ).json()) as {
    instances: {
      id: string;
      location: { position: number[] } | null;
      placementClass: number;
    }[];
  };
  const eagle = catalogue.instances.find(item => item.id === EAGLE)!;
  const key = catalogue.instances.find(item => item.id === EAGLE_KEY)!;
  // No short route carries the Eagle's key here: it lies on an upper Floor of the State
  // Office. The Save is edited to carry it, with its pickup trigger fired, and the player
  // stood beside the Eagle, which is the one state this test does not reach by play.
  await bootAt(page, { x: 0, z: 0 });
  expect(await run(page, 'goto 9 9')).toContain('moved to cell 9-9');
  expect(await run(page, 'save 1')).toContain('saved');
  const slot = damoclesSaveSlot(1);
  const record = JSON.parse(
    (await page.evaluate(k => localStorage.getItem(k), slot))!
  ) as SavedRecord;
  record.snapshot.carried = [EAGLE_KEY];
  record.snapshot.residence = [
    ...record.snapshot.residence.filter(item => item.instance !== EAGLE_KEY),
    {
      instance: EAGLE_KEY,
      residence: { kind: 'carried', placementClass: key.placementClass }
    }
  ];
  record.snapshot.script.triggers = record.snapshot.script.triggers.map(
    trigger =>
      trigger.index === EAGLE_KEY_TRIGGER
        ? { ...trigger, armed: false }
        : trigger
  );
  record.snapshot.pose.position = {
    x: eagle.location!.position[0]! * 65_536 + 150,
    y: 63,
    z: eagle.location!.position[2]! * 65_536
  };
  await page.evaluate(
    ([k, v]) => localStorage.setItem(k!, v!),
    [slot, JSON.stringify(record)]
  );
  expect(await run(page, 'load 1')).toContain('restored slot 1');
  await closeConsole(page);
  await ready(page);

  await page.keyboard.press('b');
  await expect(frame(page)).toHaveAttribute('data-occupancy', EAGLE);
  // Key 4 taxis at 50 a pass: `+ 000 000 018`.
  await page.keyboard.press('4');
  await expect(field(page, 'speedLabel')).toHaveText('+ 000 000 018', {
    timeout: 20_000
  });
  // Nose up: off the ground, climbing, the altitude window counting.
  await page.keyboard.down('ArrowDown');
  await expect
    .poll(async () => attribute(page, 'y'), { timeout: 20_000 })
    .toBeGreaterThan(2000);
  await page.keyboard.up('ArrowDown');
  await expect(field(page, 'altitude')).not.toHaveText('000000');
  await shot(page, 'eagle-climbing', testInfo);
  // Level off with the stick's up bit, then a right turn banks it: roll four times the turn
  // rate, the horizon's right end lifting.
  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () => attribute(page, 'pitch'), { timeout: 10_000 })
    .toBeLessThan(0.15);
  await page.keyboard.up('ArrowUp');
  await shot(page, 'eagle-level', testInfo);

  // Saved in flight and loaded after a reload, it flies on from the same craft words (#557).
  expect(await run(page, 'save 2')).toContain('saved');
  const flying = JSON.parse(
    (await page.evaluate(k => localStorage.getItem(k), damoclesSaveSlot(2)))!
  ) as SavedRecord;
  expect(flying.schemaVersion).toBe(12);
  expect(flying.snapshot.occupancy).toEqual({
    instance: EAGLE,
    kind: 'aboard'
  });
  expect(flying.snapshot.craft).toMatchObject({ contact: 0 });
  await page.reload();
  await ready(page);
  expect(await run(page, 'load 2')).toContain('restored slot 2');
  await closeConsole(page);
  await expect(frame(page)).toHaveAttribute('data-occupancy', EAGLE);
  expect(await attribute(page, 'y')).toBeGreaterThan(1000);
  await expect(field(page, 'altitude')).not.toHaveText('000000');
  const resumed = {
    x: await attribute(page, 'x'),
    z: await attribute(page, 'z')
  };
  await expect
    .poll(
      async () =>
        Math.hypot(
          (await attribute(page, 'x')) - resumed.x,
          (await attribute(page, 'z')) - resumed.z
        ),
      { timeout: 10_000 }
    )
    .toBeGreaterThan(200);
  await shot(page, 'eagle-resumed', testInfo);
  const level = await attribute(page, 'heading');
  await page.keyboard.down('ArrowRight');
  await expect
    .poll(async () => attribute(page, 'roll'), { timeout: 10_000 })
    .toBeGreaterThan(0.2);
  await shot(page, 'eagle-banking-right', testInfo);
  await page.keyboard.up('ArrowRight');
  expect(await attribute(page, 'heading')).not.toBe(level);
  // `L` is refused in the air.
  await page.keyboard.press('l');
  await expect(frame(page)).toHaveAttribute('data-occupancy', EAGLE);

  // Nose well down: the pass that crosses 64 goes to the landing handler, which stops the
  // craft and runs the leave path on land.
  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () => attribute(page, 'pitch'), { timeout: 10_000 })
    .toBeLessThan(-Math.PI / 3);
  await page.keyboard.up('ArrowUp');
  await expect(frame(page)).toHaveAttribute('data-occupancy', '', {
    timeout: 60_000
  });
  expect(await soundCues(page)).toContain('blast:1');
  await shot(page, 'eagle-crashed', testInfo);
  expect(errors).toEqual([]);
});
