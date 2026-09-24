import { expect, test, type Page } from '@playwright/test';

import { bearingFromYaw } from '../src/damocles/world.ts';
import {
  APPROACH_LOCAL,
  DAMOCLES_RESUME_KEY,
  DOORWAY_LINE_LOCAL,
  FACING_DOORWAY,
  bootAt,
  closeConsole,
  damoclesSaveSlot,
  displayRow,
  inventory,
  messageText,
  pressUntilInventory,
  ready,
  responseParks,
  run,
  spaceportWorld,
  stepIntoDoorway,
  walkUntil,
  watchErrors
} from './damocles-play.ts';

/// Browser verification of Damocles boarding and leaving (#418), against the contract in
/// `docs/design/damocles-boarding-admission.md`.
///
/// The deterministic suites are the authority. This pass confirms that ordinary browser play
/// boards, refuses and leaves as they say, that the renderer never draws an occupied craft or a
/// second copy of a left one, and that Occupancy survives every Save and Session Resume. It is
/// driven by the Control Profile's keys (`B` boards, `L` leaves) and the development console,
/// and every test asserts the page raised no errors.
///
/// Where a place is reached by moving the start rather than by walking, that is the idiom the
/// Damocles suite already uses (`bootAt`); where a state is reached by editing a Save, the test
/// says so, because no ordinary route reaches it.

const LIMO = 'object-slot-5';
const LIMO_KEY_LABEL = 'KEY- V.I.P. LIMO';
const DART = 'object-slot-1';
const INTERSTELLARSHIP = 'object-slot-7';
const EAGLE = 'object-slot-3';
const CHEVY = 'object-slot-2';
const CHEVY_KEY = 'object-slot-180';

/// Where the limo stands, local to the Capital Spaceport, and where a walk north from the
/// doorway line brings it into board reach. It is in the spaceport's region 4, which carries
/// region flag bit 14, so the region test admits it.
const LIMO_LOCAL = { x: 1714, z: -3241 };
const BESIDE_LIMO_LOCAL = { x: LIMO_LOCAL.x + 150, z: LIMO_LOCAL.z };
const BESIDE_INTERSTELLARSHIP_LOCAL = { x: -3109 + 150, z: -6635 };

const frame = (page: Page) => page.locator('#frame');

const attribute = async (page: Page, name: string): Promise<string> =>
  (await frame(page).getAttribute(`data-${name}`)) ?? '';

const occupancy = (page: Page) => attribute(page, 'occupancy');

const pose = async (page: Page) => ({
  heading: Number(await attribute(page, 'heading')),
  x: Number(await attribute(page, 'x')),
  y: Number(await attribute(page, 'y')),
  z: Number(await attribute(page, 'z'))
});

/// How many times the frame drew `instance`: once while it stands anywhere, never while it is
/// occupied, and never twice.
const drawnCount = async (page: Page, instance: string): Promise<number> =>
  (await attribute(page, 'drawn')).split(' ').filter(id => id === instance)
    .length;

interface Catalogue {
  readonly instances: readonly {
    readonly id: string;
    readonly location: {
      readonly heading: number | null;
      readonly position: readonly number[];
    } | null;
  }[];
}

/// A placed instance's world position and angle byte, read from the Catalogue the page was served.
const placedInstance = async (page: Page, id: string) => {
  const catalogue = (await (
    await page.request.get('/payload/damocles/catalogue.json')
  ).json()) as Catalogue;
  const location = catalogue.instances.find(item => item.id === id)!.location!;
  return {
    heading: location.heading ?? 0,
    x: location.position[0]! * 65_536,
    y: location.position[1]! * 65_536,
    z: location.position[2]! * 65_536
  };
};

const orientation = async (page: Page) =>
  (
    (await (await page.request.get('/damocles/eris.json')).json()) as {
      orientation: Parameters<typeof bearingFromYaw>[1];
    }
  ).orientation;

/// Boot on the doorway line with the limo's key in reach, take it, and walk north through the
/// doorway until the limo is in board reach. Every step is an ordinary control.
const walkToLimoWithKey = async (
  page: Page,
  options: { readonly keepResume?: boolean; readonly park?: boolean } = {}
): Promise<void> => {
  await bootAt(page, DOORWAY_LINE_LOCAL, FACING_DOORWAY, options);
  const origin = await spaceportWorld(page);
  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText(LIMO_KEY_LABEL, { timeout: 5000 });
  if (options.park === true) {
    await responseParks(page, await messageText(page, 'script2-inline-3'));
  }
  await walkUntil(
    page,
    'ArrowUp',
    async () => Number(await attribute(page, 'z')) - origin.z < -3000
  );
};

const expectRowReaches = async (page: Page, text: string): Promise<void> => {
  await expect
    .poll(async () => displayRow(page), { timeout: 10_000 })
    .toBe(text);
};

interface SavedRecord {
  schemaVersion: number;
  snapshot: {
    carried: string[];
    occupancy?: { instance?: string; kind: string };
    pose: { position: { x: number; y: number; z: number } };
    residence: {
      instance: string;
      residence: { kind: string; placementClass: number };
    }[];
  };
}

const savedRecord = async (page: Page, slot: 1 | 2 | 3): Promise<SavedRecord> =>
  JSON.parse(
    (await page.evaluate(
      key => window.localStorage.getItem(key),
      damoclesSaveSlot(slot)
    ))!
  ) as SavedRecord;

const writeRecord = async (
  page: Page,
  slot: 1 | 2 | 3,
  record: SavedRecord
): Promise<void> => {
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key!, value!),
    [damoclesSaveSlot(slot), JSON.stringify(record)]
  );
};

test('a keyed craft without its Vehicle Key refuses with VEHICLE KEY REQUIRED', async ({
  page
}) => {
  const errors = watchErrors(page);
  await bootAt(page, BESIDE_LIMO_LOCAL);
  expect(await drawnCount(page, LIMO)).toBe(1);

  await page.keyboard.press('b');
  await expectRowReaches(page, 'VEHICLE KEY REQUIRED');
  expect(await occupancy(page)).toBe('');
  expect(await drawnCount(page, LIMO)).toBe(1);
  expect(errors).toEqual([]);
});

test('the limo boards by its key, seats the view on it, and leaves it drawn once', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await walkToLimoWithKey(page);
  const limo = await placedInstance(page, LIMO);
  const onFoot = await pose(page);
  expect(await drawnCount(page, LIMO)).toBe(1);

  await page.keyboard.press('b');
  await expect(frame(page)).toHaveAttribute('data-occupancy', LIMO);
  // The eye is the limo's resident position plus 63 -- the on-foot height -- and the camera
  // takes the angle byte as yaw, byte x 4, with no model bias ($054390).
  const aboard = await pose(page);
  expect(aboard.x).toBeCloseTo(limo.x, 3);
  expect(aboard.z).toBeCloseTo(limo.z, 3);
  expect(aboard.y).toBe(limo.y + 63);
  expect(aboard.y).toBe(onFoot.y);
  expect(aboard.heading).toBeCloseTo(
    bearingFromYaw(limo.heading * 4, await orientation(page)),
    9
  );
  // Occupied, it is drawn nowhere: not at its Catalogue placement, not anywhere else.
  expect(await drawnCount(page, LIMO)).toBe(0);
  await testInfo.attach('aboard the limo', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });

  // Nothing moves aboard.
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1000);
  await page.keyboard.up('ArrowUp');
  expect(await pose(page)).toEqual(aboard);
  // The Vehicle Key is not consumed by boarding.
  await expect(inventory(page)).toHaveText(LIMO_KEY_LABEL);
  // Boarding again while aboard is refused: test 5 of the gate. The pickup's response is still
  // running on the Damocles Display, so this reads the refusal from Occupancy and the Pose.
  await page.keyboard.press('b');
  await page.waitForTimeout(500);
  expect(await occupancy(page)).toBe(LIMO);
  expect(await pose(page)).toEqual(aboard);

  await page.keyboard.press('l');
  await expect(frame(page)).toHaveAttribute('data-occupancy', '');
  // Left where it was boarded, since nothing moved aboard, and drawn exactly once.
  expect(await drawnCount(page, LIMO)).toBe(1);
  expect(await pose(page)).toEqual(aboard);

  // On foot again: walking moves the player, and the limo stays drawn once. Backing away
  // leaves it in view where it was left.
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(3000);
  await page.keyboard.up('ArrowDown');
  await testInfo.attach('backed away from the left limo', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });
  expect((await pose(page)).z).not.toBe(aboard.z);
  expect(await drawnCount(page, LIMO)).toBe(1);
  expect(errors).toEqual([]);
});

test('the Vehicle Key is a carried requirement: dropping it refuses the board again', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  // The refusal only presents on a parked script, so the pickup's response runs out first.
  await bootAt(page, DOORWAY_LINE_LOCAL, FACING_DOORWAY);
  const origin = await spaceportWorld(page);
  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText(LIMO_KEY_LABEL, { timeout: 5000 });
  await responseParks(page, await messageText(page, 'script2-inline-3'));
  await pressUntilInventory(page, 'd', 'EMPTY');

  await walkUntil(
    page,
    'ArrowUp',
    async () => Number(await attribute(page, 'z')) - origin.z < -3000
  );
  await page.keyboard.press('b');
  await expectRowReaches(page, 'VEHICLE KEY REQUIRED');
  expect(await occupancy(page)).toBe('');

  // Walk back to where the key was left, take it again, and return: now the limo boards.
  await walkUntil(
    page,
    'ArrowDown',
    async () => Number(await attribute(page, 'z')) - origin.z > 650
  );
  await pressUntilInventory(page, 't', LIMO_KEY_LABEL);
  await walkUntil(
    page,
    'ArrowUp',
    async () => Number(await attribute(page, 'z')) - origin.z < -3000
  );
  await page.keyboard.press('b');
  await expect(frame(page)).toHaveAttribute('data-occupancy', LIMO);
  expect(errors).toEqual([]);
});

test("another craft's Vehicle Key does not admit it", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const eagle = await placedInstance(page, EAGLE);
  await bootAt(page, APPROACH_LOCAL);
  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText(LIMO_KEY_LABEL, { timeout: 5000 });
  await responseParks(page, await messageText(page, 'script2-inline-3'));

  // EAGLE NINE S E stands in Eris cell 9-9, 1375 units from its centre: turn to face it with
  // short taps and walk into board reach.
  expect(await run(page, 'goto 9 9')).toContain('moved to cell 9-9');
  await closeConsole(page);
  const offset = async () => {
    const here = await pose(page);
    return { heading: here.heading, x: eagle.x - here.x, z: eagle.z - here.z };
  };
  for (let tap = 0; tap < 400; tap += 1) {
    const { heading, x, z } = await offset();
    const error = Math.atan2(
      Math.sin(Math.atan2(x, z) - heading),
      Math.cos(Math.atan2(x, z) - heading)
    );
    if (Math.abs(error) < 0.08) {
      break;
    }
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(30);
    await page.keyboard.up('ArrowRight');
  }
  await walkUntil(page, 'ArrowUp', async () => {
    const { x, z } = await offset();
    return Math.hypot(x, z) < 800;
  });
  expect(await drawnCount(page, EAGLE)).toBe(1);

  await page.keyboard.press('b');
  await expectRowReaches(page, 'VEHICLE KEY REQUIRED');
  expect(await occupancy(page)).toBe('');
  await expect(inventory(page)).toHaveText(LIMO_KEY_LABEL);
  expect(errors).toEqual([]);
});

test('INTERSTELLARSHIP refuses with its own message, not the key message', async ({
  page
}) => {
  const errors = watchErrors(page);
  await bootAt(page, BESIDE_INTERSTELLARSHIP_LOCAL);
  expect(await drawnCount(page, INTERSTELLARSHIP)).toBe(1);

  await page.keyboard.press('b');
  await expectRowReaches(page, 'SHIP NOT REFITTED FOR FURTHER FLIGHT');
  expect(await occupancy(page)).toBe('');
  expect(errors).toEqual([]);
});

test('an object past the boardable bound refuses silently', async ({
  page
}) => {
  const errors = watchErrors(page);
  // The limo's key, slot 183, is the nearest drawn object here and sits in the spaceport's
  // region 9, which carries bit 14: the region test admits the board and the slot bound at 23
  // refuses it. No SETTEE is placed anywhere in the Catalogue, so this is the bound's refusal
  // in play; a SETTEE's own is unexercised.
  await bootAt(page, APPROACH_LOCAL);
  await expect(frame(page)).toHaveAttribute('data-region', '9');

  await page.keyboard.press('b');
  await page.waitForTimeout(1000);
  expect(await occupancy(page)).toBe('');
  expect(await displayRow(page)).toBe('');
  await expect(inventory(page)).toHaveText('EMPTY');
  expect(errors).toEqual([]);
});

test('in the spaceport doorway region, beside a dropped key, B does nothing', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await bootAt(page, DOORWAY_LINE_LOCAL, FACING_DOORWAY);
  const origin = await spaceportWorld(page);
  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText(LIMO_KEY_LABEL, { timeout: 5000 });
  await responseParks(page, await messageText(page, 'script2-inline-3'));

  // Drop the key at the far edge of region 0, then step into region 1, the doorway, which is
  // forty units deep and does not carry bit 14.
  await walkUntil(
    page,
    'ArrowUp',
    async () => Number(await attribute(page, 'z')) - origin.z < -640
  );
  await expect(frame(page)).toHaveAttribute('data-region', '0');
  await pressUntilInventory(page, 'd', 'EMPTY');
  await stepIntoDoorway(page);

  // Nothing presents and nothing changes. The key is slot 183, past the bound at 23, so the
  // slot test would refuse it too: this cannot tell the region test's refusal from the bound's.
  const here = await pose(page);
  await page.keyboard.press('b');
  await page.waitForTimeout(1000);
  expect(await occupancy(page)).toBe('');
  expect(await displayRow(page)).toBe('');
  expect(await pose(page)).toEqual(here);
  expect(errors).toEqual([]);
});

test('DART II boards unkeyed and leaves', async ({ page }) => {
  const errors = watchErrors(page);
  const origin = await spaceportWorld(page);
  const dart = await placedInstance(page, DART);
  // DART II stands far out on Eris, 2500 cells from the spaceport, so the start is moved
  // beside it rather than walked to.
  await bootAt(page, { x: dart.x + 150 - origin.x, z: dart.z - origin.z });
  await expect.poll(async () => drawnCount(page, DART)).toBe(1);
  await expect(inventory(page)).toHaveText('EMPTY');

  await page.keyboard.press('b');
  await expect(frame(page)).toHaveAttribute('data-occupancy', DART);
  expect(await drawnCount(page, DART)).toBe(0);
  await page.keyboard.press('l');
  await expect(frame(page)).toHaveAttribute('data-occupancy', '');
  expect(await drawnCount(page, DART)).toBe(1);
  expect(errors).toEqual([]);
});

test('on Gaea, reached by the Body switch, 99 CHEVY refuses without its key and boards with it', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const chevy = await placedInstance(page, CHEVY);
  // Gaea's UR City arrival is moved beside 99 CHEVY, which is the start-moving idiom applied to
  // the arrival Pose the authored switch lands on. The switch itself is the ordinary one.
  await page.route('**/payload/damocles/arrival-poses.json', async route => {
    const document_ = await (await route.fetch()).json();
    const arrival = document_.poses.find(
      (item: { id: string }) => item.id === 'gaea-ur-city-4-2'
    );
    arrival.position = { x: chevy.x + 150, y: 63, z: chevy.z };
    await route.fulfill({ json: document_ });
  });
  await bootAt(page, APPROACH_LOCAL);
  expect(await run(page, 'switch gaea-ur-city-4-2')).toContain(
    'switched to gaea-ur-city-4-2'
  );
  await closeConsole(page);
  await expect(
    page.locator('#panel-damocles [data-field=locationName]')
  ).toHaveText('GAEA');
  await expect.poll(async () => drawnCount(page, CHEVY)).toBe(1);

  await page.keyboard.press('b');
  await expectRowReaches(page, 'VEHICLE KEY REQUIRED');
  expect(await occupancy(page)).toBe('');

  // Its key is recovered inside an Eris structure on level 1, and floor-aware binding is
  // unrecovered (#355), so no ordinary route carries it here. The carried key is written into a
  // Save instead, and the board and leave that follow are ordinary.
  expect(await run(page, 'save 1 confirm')).toContain('saved slot 1');
  const record = await savedRecord(page, 1);
  record.snapshot.carried = [CHEVY_KEY];
  record.snapshot.residence.push({
    instance: CHEVY_KEY,
    residence: { kind: 'carried', placementClass: 4 }
  });
  await writeRecord(page, 1, record);
  expect(await run(page, 'load 1')).toContain('restored slot 1');
  await closeConsole(page);
  await expect(inventory(page)).toHaveText('KEY - 99 CHEVY');

  await page.keyboard.press('b');
  await expect(frame(page)).toHaveAttribute('data-occupancy', CHEVY);
  expect(await drawnCount(page, CHEVY)).toBe(0);
  await page.keyboard.press('l');
  await expect(frame(page)).toHaveAttribute('data-occupancy', '');
  expect(await drawnCount(page, CHEVY)).toBe(1);
  expect(errors).toEqual([]);
});

test('Saves restore on foot before boarding, aboard, and on foot after leaving', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await walkToLimoWithKey(page);
  const before = await pose(page);

  expect(await run(page, 'save 1 confirm')).toContain('saved slot 1');
  await closeConsole(page);
  await page.keyboard.press('b');
  await expect(frame(page)).toHaveAttribute('data-occupancy', LIMO);
  const aboard = await pose(page);
  expect(await run(page, 'save 2 confirm')).toContain('saved slot 2');
  await closeConsole(page);
  await page.keyboard.press('l');
  await expect(frame(page)).toHaveAttribute('data-occupancy', '');
  expect(await run(page, 'save 3 confirm')).toContain('saved slot 3');

  // The aboard record says so in its own terms: Occupancy names the limo, and its Object
  // Residence is occupied rather than placed.
  const stored = await savedRecord(page, 2);
  expect(stored.schemaVersion).toBe(9);
  expect(stored.snapshot.occupancy).toEqual({ instance: LIMO, kind: 'aboard' });
  expect(
    stored.snapshot.residence.find(item => item.instance === LIMO)?.residence
      .kind
  ).toBe('occupied');

  // Before boarding: on foot where the Save was taken, the limo drawn once, and it boards.
  expect(await run(page, 'load 1')).toContain('restored slot 1');
  await closeConsole(page);
  await expect(frame(page)).toHaveAttribute('data-occupancy', '');
  expect(await pose(page)).toEqual(before);
  expect(await drawnCount(page, LIMO)).toBe(1);
  await page.keyboard.press('b');
  await expect(frame(page)).toHaveAttribute('data-occupancy', LIMO);

  // Aboard: the same craft, the same seated view, and the limo drawn nowhere.
  expect(await run(page, 'load 2')).toContain('restored slot 2');
  await closeConsole(page);
  await expect(frame(page)).toHaveAttribute('data-occupancy', LIMO);
  expect(await pose(page)).toEqual(aboard);
  expect(await drawnCount(page, LIMO)).toBe(0);
  // A restored Occupancy leaves like a live one, and leaves one limo behind.
  await page.keyboard.press('l');
  await expect(frame(page)).toHaveAttribute('data-occupancy', '');
  expect(await drawnCount(page, LIMO)).toBe(1);

  // After leaving: on foot, the limo resident where it was left and drawn once.
  expect(await run(page, 'load 3')).toContain('restored slot 3');
  await closeConsole(page);
  await expect(frame(page)).toHaveAttribute('data-occupancy', '');
  expect(await drawnCount(page, LIMO)).toBe(1);
  const left = await savedRecord(page, 3);
  expect(left.snapshot.occupancy).toEqual({ kind: 'onFoot' });
  expect(
    left.snapshot.residence.find(item => item.instance === LIMO)?.residence.kind
  ).toMatch(/^(surface|structure)$/);
  expect(errors).toEqual([]);
});

test('a schema 5 record is refused whole and changes neither the session nor the Save', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await walkToLimoWithKey(page);
  await page.keyboard.press('b');
  await expect(frame(page)).toHaveAttribute('data-occupancy', LIMO);
  expect(await run(page, 'save 1 confirm')).toContain('saved slot 1');

  // The same record in schema 5's shape: no Occupancy, and the craft back among the placed.
  const record = await savedRecord(page, 1);
  record.schemaVersion = 5;
  delete record.snapshot.occupancy;
  record.snapshot.residence = record.snapshot.residence.filter(
    item => item.instance !== LIMO
  );
  await writeRecord(page, 1, record);
  const stored = await page.evaluate(
    key => window.localStorage.getItem(key),
    damoclesSaveSlot(1)
  );

  await closeConsole(page);
  await page.keyboard.press('l');
  await expect(frame(page)).toHaveAttribute('data-occupancy', '');
  const live = await pose(page);
  expect(await run(page, 'load 1')).toContain('load refused');
  await closeConsole(page);
  // Refused whole: the live session is on foot where it was, and the stored record is as written.
  expect(await occupancy(page)).toBe('');
  expect(await pose(page)).toEqual(live);
  expect(await drawnCount(page, LIMO)).toBe(1);
  expect(
    await page.evaluate(
      key => window.localStorage.getItem(key),
      damoclesSaveSlot(1)
    )
  ).toBe(stored);
  expect(errors).toEqual([]);
});

test('a Session Resume restores on foot before boarding, aboard, and on foot after leaving', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await walkToLimoWithKey(page, { keepResume: true });
  const before = await pose(page);

  await page.reload();
  await ready(page);
  await expect(frame(page)).toHaveAttribute('data-occupancy', '');
  expect(await pose(page)).toEqual(before);
  await expect(inventory(page)).toHaveText(LIMO_KEY_LABEL);
  expect(await drawnCount(page, LIMO)).toBe(1);

  await page.keyboard.press('b');
  await expect(frame(page)).toHaveAttribute('data-occupancy', LIMO);
  const aboard = await pose(page);
  await page.reload();
  await ready(page);
  await expect(frame(page)).toHaveAttribute('data-occupancy', LIMO);
  expect(await pose(page)).toEqual(aboard);
  expect(await drawnCount(page, LIMO)).toBe(0);
  const resumed = JSON.parse(
    (await page.evaluate(
      key => window.localStorage.getItem(key),
      DAMOCLES_RESUME_KEY
    ))!
  ) as SavedRecord;
  expect(resumed.snapshot.occupancy).toEqual({
    instance: LIMO,
    kind: 'aboard'
  });

  await page.keyboard.press('l');
  await expect(frame(page)).toHaveAttribute('data-occupancy', '');
  await page.reload();
  await ready(page);
  await expect(frame(page)).toHaveAttribute('data-occupancy', '');
  expect(await pose(page)).toEqual(aboard);
  expect(await drawnCount(page, LIMO)).toBe(1);
  expect(errors).toEqual([]);
});
