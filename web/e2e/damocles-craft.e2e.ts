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

/// Beside EAGLE NINE S E on Eris with its key carried, then aboard. No short route carries the
/// Eagle's key here: it lies on an upper Floor of the State Office. The Save is edited to carry
/// it, with its pickup trigger fired, and the player stood beside the Eagle, which is the one
/// state these tests do not reach by play.
const boardEagle = async (page: Page): Promise<void> => {
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
};

test('EAGLE NINE S E takes off, reads its altitude, and a steep dive puts the player on foot', async ({
  page
}, testInfo) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await boardEagle(page);
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
  expect(flying.schemaVersion).toBe(14);
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

test('EAGLE NINE S E launches on Backspace, swings, climbs into space and turns there (#566)', async ({
  page
}, testInfo) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await boardEagle(page);
  // Off the ground at key 4 with the nose up.
  await page.keyboard.press('4');
  await page.keyboard.down('ArrowDown');
  await expect
    .poll(async () => attribute(page, 'y'), { timeout: 20_000 })
    .toBeGreaterThan(2000);
  await page.keyboard.up('ArrowDown');
  // Backspace stands in for the ST's Esc: the swing starts and the nose goes down.
  await page.keyboard.press('Backspace');
  await expect(frame(page)).toHaveAttribute('data-craft-swing', 'true');
  await expect
    .poll(async () => attribute(page, 'pitch'), { timeout: 10_000 })
    .toBeLessThan(-0.3);
  await shot(page, 'eagle-swing', testInfo);
  // Reverse thrust along the nose-down attitude climbs to the space entry. The craft flies on
  // from ERIS's centre at once, so where it stands by the time the page is read depends on the
  // browser's pace: the unit tests hold the entry's exact words.
  await expect(frame(page)).toHaveAttribute(
    'data-space-nearest',
    /^body-\d+$/,
    {
      timeout: 120_000
    }
  );
  await expect(frame(page)).toHaveAttribute('data-craft-swing', 'false');
  expect(await frame(page).getAttribute('data-space-position')).toMatch(
    /^-?\d+ -?\d+ -?\d+$/
  );
  // In space the frame draws the Bodies alone, and the panel reads the relativistic speed and
  // the range.
  await expect(field(page, 'speedLabel')).toHaveText(/^- \d{3} /, {
    timeout: 10_000
  });
  await expect(field(page, 'altitude')).not.toHaveText('000000');
  expect(Number(await frame(page).getAttribute('data-triangles'))).toBe(0);
  await shot(page, 'eagle-in-space', testInfo);
  const heading = await attribute(page, 'heading');
  await page.keyboard.down('ArrowRight');
  await expect
    .poll(async () => attribute(page, 'heading'), { timeout: 10_000 })
    .not.toBe(heading);
  await page.keyboard.up('ArrowRight');
  await shot(page, 'eagle-turning-in-space', testInfo);
  // `L` is refused: in space there is no ground contact.
  await page.keyboard.press('l');
  await expect(frame(page)).toHaveAttribute('data-occupancy', EAGLE);
  expect(errors).toEqual([]);
});

/// DION's space position, the centre of the Body, and LACHESIS's, which the crossing flies at.
const DION_CENTRE = '-300000 64 -72000';
const LACHESIS = { x: -311_200, z: -68_800 };

/// EAGLE NINE S E aboard on DION, set down over open sea east of Birmingham Island through its
/// Save, as `boardEagle` sets it down beside the Eagle on ERIS.
const boardEagleOnDion = async (page: Page): Promise<void> => {
  await boardEagle(page);
  expect(await run(page, 'save 3')).toContain('saved');
  const slot = damoclesSaveSlot(3);
  const record = JSON.parse(
    (await page.evaluate(k => localStorage.getItem(k), slot))!
  ) as SavedRecord & {
    snapshot: { pose: { body: string }; structure: unknown };
    where: string;
  };
  record.snapshot.pose.body = 'body-4';
  record.snapshot.pose.position = { x: 100 * 65_536, y: 63, z: 100 * 65_536 };
  record.snapshot.structure = null;
  record.where = 'DION 00-00';
  await page.evaluate(
    ([k, v]) => localStorage.setItem(k!, v!),
    [slot, JSON.stringify(record)]
  );
  expect(await run(page, 'load 3')).toContain('restored slot 3');
  await closeConsole(page);
  await ready(page);
  await expect(frame(page)).toHaveAttribute('data-body', 'body-4');
  await expect(frame(page)).toHaveAttribute('data-occupancy', EAGLE);
};

/// Presses the key `code` in the frame the space entry is first drawn, as the traced `return`
/// presses Space in the first space pass. A pass moves the craft a thousand units near a Body,
/// so a key Playwright sends after polling for the entry comes several passes too late.
const pressOnSpaceEntry = (page: Page, code: string): Promise<void> =>
  page.evaluate(key => {
    const canvas = document.querySelector<HTMLCanvasElement>('#frame')!;
    const observer = new MutationObserver(() => {
      if ((canvas.dataset['spaceNearest'] ?? '') === '') {
        return;
      }
      observer.disconnect();
      for (const type of ['keydown', 'keyup']) {
        window.dispatchEvent(
          new KeyboardEvent(type, { bubbles: true, code: key, key: ' ' })
        );
      }
    });
    observer.observe(canvas, {
      attributeFilter: ['data-space-nearest'],
      attributes: true
    });
  }, code);

/// Off the ground on key 4 with the nose up, then Backspace: the launch, the swing and the climb
/// to the space entry at the Body's centre. `onEntry` is a key pressed as space is entered.
const launchIntoSpace = async (
  page: Page,
  centre: string,
  onEntry?: string
): Promise<void> => {
  await page.keyboard.press('4');
  await page.keyboard.down('ArrowDown');
  await expect
    .poll(async () => attribute(page, 'y'), { timeout: 20_000 })
    .toBeGreaterThan(2000);
  await page.keyboard.up('ArrowDown');
  if (onEntry !== undefined) {
    await pressOnSpaceEntry(page, onEntry);
  }
  await page.keyboard.press('Backspace');
  await expect(frame(page)).toHaveAttribute(
    'data-space-nearest',
    /^body-\d+$/,
    { timeout: 120_000 }
  );
  // The first pass in space moves the craft at once, so only the entry's Body is certain.
  const [x, , z] = (await frame(page).getAttribute('data-space-position'))!
    .split(' ')
    .map(Number);
  const [cx, , cz] = centre.split(' ').map(Number);
  expect(Math.hypot(x! - cx!, z! - cz!)).toBeLessThan(5000);
};

test('EAGLE NINE S E lands back on DION, then crosses to LACHESIS, lands over it and flies down (#567)', async ({
  page
}, testInfo) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await boardEagleOnDion(page);
  // The throttle cut as space is entered: the craft stays in DION's arrival range, and when the
  // hold runs out the landing puts it back over DION, 25,165,824 up, still aboard.
  await launchIntoSpace(page, DION_CENTRE, 'Space');
  await expect(frame(page)).toHaveAttribute('data-space-nearest', '', {
    timeout: 60_000
  });
  await expect(frame(page)).toHaveAttribute('data-body', 'body-4');
  await expect(frame(page)).toHaveAttribute('data-occupancy', EAGLE);
  expect(await attribute(page, 'y')).toBeGreaterThan(25_000_000);
  await shot(page, 'eagle-landed-over-dion', testInfo);

  // Launched again from high over DION, it coasts clear on the launch throttle, then flies at
  // LACHESIS on key 9, steering its motion onto the Body until the arrival.
  await page.keyboard.press('Backspace');
  await expect(frame(page)).toHaveAttribute(
    'data-space-nearest',
    /^body-\d+$/,
    { timeout: 120_000 }
  );
  await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  await page.keyboard.press('9');
  const position = async () => {
    const text = (await frame(page).getAttribute('data-space-position')) ?? '';
    if (text === '') {
      return null;
    }
    const [x, , z] = text.split(' ').map(Number);
    return { x: x!, z: z! };
  };
  let before = await position();
  let held: string | null = null;
  const deadline = Date.now() + 120_000;
  for (;;) {
    await page.waitForTimeout(80);
    const at = await position();
    if (at === null || before === null || Date.now() > deadline) {
      break;
    }
    const moving = { x: at.x - before.x, z: at.z - before.z };
    before = at;
    if (moving.x === 0 && moving.z === 0) {
      continue;
    }
    const wanted = { x: LACHESIS.x - at.x, z: LACHESIS.z - at.z };
    const want =
      moving.x * wanted.z - moving.z * wanted.x > 0
        ? 'ArrowLeft'
        : 'ArrowRight';
    if (want !== held) {
      if (held !== null) {
        await page.keyboard.up(held);
      }
      await page.keyboard.down(want);
      held = want;
    }
  }
  if (held !== null) {
    await page.keyboard.up(held);
  }
  await expect(frame(page)).toHaveAttribute('data-space-nearest', '');
  await expect(frame(page)).toHaveAttribute('data-body', 'body-7');
  await expect(frame(page)).toHaveAttribute('data-occupancy', EAGLE);
  await expect(field(page, 'locationName')).toContainText('LACHESIS');
  await shot(page, 'eagle-landed-over-lachesis', testInfo);

  // Nose down under power to the surface. The point is at sea, where the landing handler keeps
  // the player aboard.
  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () => attribute(page, 'pitch'), { timeout: 10_000 })
    .toBeLessThan(-1);
  await page.keyboard.up('ArrowUp');
  await expect
    .poll(async () => attribute(page, 'y'), { timeout: 120_000 })
    .toBe(63);
  await expect(frame(page)).toHaveAttribute('data-body', 'body-7');
  await expect(frame(page)).toHaveAttribute('data-occupancy', EAGLE);
  await page.waitForTimeout(500);
  expect(
    Number(await frame(page).getAttribute('data-triangles'))
  ).toBeGreaterThan(0);
  await shot(page, 'eagle-down-on-lachesis', testInfo);
  expect(errors).toEqual([]);
});

test('EAGLE NINE S E saved in space, reloaded and loaded, flies on to its arrival over DION (#568)', async ({
  page
}, testInfo) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await boardEagleOnDion(page);
  // The throttle cut as space is entered, so the craft stays in DION's arrival range while the
  // hold counts down, and the Save is taken before it runs out.
  await launchIntoSpace(page, DION_CENTRE, 'Space');
  expect(await run(page, 'save 2')).toContain('saved');
  const saved = JSON.parse(
    (await page.evaluate(k => localStorage.getItem(k), damoclesSaveSlot(2)))!
  ) as SavedRecord & {
    snapshot: {
      craft: { space: { hold: number; x: number; z: number } | null };
      pose: { body: string };
    };
  };
  expect(saved.schemaVersion).toBe(14);
  expect(saved.snapshot.pose.body).toBe('body-4');
  const space = saved.snapshot.craft.space!;
  expect(space.hold).toBeGreaterThan(0);
  await page.reload();
  await ready(page);
  expect(await run(page, 'load 2')).toContain('restored slot 2');
  await closeConsole(page);
  // Resumed in space where the Save left it, not at DION's centre afresh.
  await expect(frame(page)).toHaveAttribute('data-occupancy', EAGLE);
  await expect(frame(page)).toHaveAttribute('data-space-nearest', 'body-4');
  const [x, , z] = (await frame(page).getAttribute('data-space-position'))!
    .split(' ')
    .map(Number);
  expect(Math.hypot(x! - space.x, z! - space.z)).toBeLessThan(5000);
  expect(Number(await frame(page).getAttribute('data-triangles'))).toBe(0);
  await shot(page, 'eagle-resumed-in-space', testInfo);
  // The hold runs out and the landing puts it back over DION, still aboard.
  await expect(frame(page)).toHaveAttribute('data-space-nearest', '', {
    timeout: 60_000
  });
  await expect(frame(page)).toHaveAttribute('data-body', 'body-4');
  await expect(frame(page)).toHaveAttribute('data-occupancy', EAGLE);
  expect(await attribute(page, 'y')).toBeGreaterThan(25_000_000);
  await shot(page, 'eagle-landed-after-resume', testInfo);
  expect(errors).toEqual([]);
});

/// A number of the 1,024 attitude units to a turn, in radians.
const turn = (units: number) => (units / 1024) * 2 * Math.PI;

/// Sets the craft down at `position` with the attitude words `pitch` and `yaw`, through a Save
/// edited aboard and loaded back, as `boardEagleOnDion` sets it down on DION.
const setCraftAt = async (
  page: Page,
  position: { x: number; y: number; z: number },
  words: { pitch: number; yaw: number }
): Promise<void> => {
  // Slot 3, which `boardEagleOnDion` filled, overwritten each time.
  const saved = await run(page, 'save 3');
  if (!saved.includes('saved')) {
    expect(await run(page, 'save 3 confirm')).toContain('saved');
  }
  const slot = damoclesSaveSlot(3);
  const record = JSON.parse(
    (await page.evaluate(k => localStorage.getItem(k), slot))!
  ) as SavedRecord & {
    snapshot: {
      craft: {
        contact: number;
        pitch: number;
        trig: { pitch: number; yaw: number };
        yaw: number;
      };
      pose: { pitch: number };
    };
  };
  record.snapshot.pose.position = position;
  record.snapshot.pose.heading = turn(words.yaw - 512);
  record.snapshot.pose.pitch = turn(512 - words.pitch);
  record.snapshot.craft = {
    ...record.snapshot.craft,
    contact: 0,
    pitch: words.pitch,
    trig: { pitch: words.pitch, yaw: words.yaw },
    yaw: words.yaw
  };
  await page.evaluate(
    ([k, v]) => localStorage.setItem(k!, v!),
    [slot, JSON.stringify(record)]
  );
  expect(await run(page, 'load 3')).toContain('restored slot 3');
  await closeConsole(page);
  await ready(page);
};

test('high over DION the islands reach the horizon, and the stars are drawn by night and in space (#578)', async ({
  page
}, testInfo) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await boardEagleOnDion(page);
  // The #573 run's stop 30: 5,745,950 up, nose down at pitch word 655, where the ST draws DION's
  // green islands on its `$055` ground. The island fills end at the far plane, 3,000,000, so
  // from here only their flat copy over the ground to the horizon is drawn.
  await setCraftAt(
    page,
    { x: 213_981_624, y: 5_745_950, z: 87_996_530 },
    { pitch: 655, yaw: 664 }
  );
  await expect(frame(page)).toHaveAttribute('data-body', 'body-4');
  expect(await attribute(page, 'y')).toBeGreaterThan(5_000_000);
  expect(await attribute(page, 'horizon-island-triangles')).toBeGreaterThan(0);
  // Nose down past pitch `$244` the flight starfield plots nothing.
  expect(await attribute(page, 'sky-stars')).toBe(0);
  await shot(page, 'high-over-dion-islands', testInfo);

  // Nose up at pitch 487, as the #573 frames over LACHESIS are: the stars are there unless it
  // is day on DION, which has an atmosphere.
  await setCraftAt(
    page,
    { x: 213_981_624, y: 5_745_950, z: 87_996_530 },
    { pitch: 487, yaw: 664 }
  );
  const daylight = (await frame(page).getAttribute('data-daylight')) === 'true';
  const stars = await attribute(page, 'sky-stars');
  expect(stars > 0).toBe(!daylight);
  await shot(page, 'high-over-dion-sky', testInfo);

  // Just under the space entry, then Backspace: in space `$05067C` plots the stars by day too.
  await setCraftAt(
    page,
    { x: 213_981_624, y: 32_000_000, z: 87_996_530 },
    { pitch: 487, yaw: 664 }
  );
  await page.keyboard.press('Backspace');
  await expect(frame(page)).toHaveAttribute(
    'data-space-nearest',
    /^body-\d+$/,
    { timeout: 120_000 }
  );
  await expect
    .poll(async () => attribute(page, 'sky-stars'), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await shot(page, 'space-stars', testInfo);
  expect(errors).toEqual([]);
});
