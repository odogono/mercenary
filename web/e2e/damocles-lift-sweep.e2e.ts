import { expect, test, type Page } from '@playwright/test';

import {
  DAMOCLES_RESUME_KEY,
  bootAt,
  closeConsole,
  ready,
  run,
  structureWorld,
  walkUntil,
  watchErrors
} from './damocles-play.ts';

/// Browser verification of the whole Damocles Lift (#478): every bound Floor ridden to with the
/// lift's own keys, the label stepping as recovered, the unbound Floors refused, the player
/// walking out onto each Floor's structure, and a Save and a Session Resume on a Floor above G.
///
/// Recovered order and refusals: docs/research/damocles-lift-control.md. The label steps along
/// B, G, 1, …, 9, one Floor per step, so a ride from B to G is one step and a ride from 2 to B
/// passes 1 and G. A key for a Floor the Floor Table leaves zero, or for the Floor the label
/// shows, is refused silently.

const frame = (page: Page) => page.locator('#frame');

const read = async (page: Page) =>
  frame(page).evaluate(node => ({
    floor: node.dataset['floor'],
    region: node.dataset['region'],
    structure: node.dataset['structureInstance'],
    x: node.dataset['x'],
    y: node.dataset['y'],
    z: node.dataset['z']
  }));

/// Record every label the page publishes from here on, so a ride's steps can be read back.
const watchLabels = async (page: Page): Promise<void> => {
  await frame(page).evaluate(node => {
    const seen: string[] = [];
    (window as unknown as { liftLabels: string[] }).liftLabels = seen;
    new MutationObserver(() => {
      const label = node.dataset['floorLabel']!;
      if (seen.at(-1) !== label) {
        seen.push(label);
      }
    }).observe(node, { attributes: true });
  });
};

/// Press one lift key and wait for the arrival. Returns the labels shown on the way, from the
/// Floor left to the Floor reached.
const ride = async (
  page: Page,
  key: string,
  floor: number,
  y: number
): Promise<string[]> => {
  const from = (await frame(page).getAttribute('data-floor-label'))!;
  await page.evaluate(start => {
    const labels = (window as unknown as { liftLabels: string[] }).liftLabels;
    labels.splice(0, labels.length, start);
  }, from);
  await page.keyboard.press(key);
  await expect(frame(page)).toHaveAttribute(
    'data-ride-destination',
    String(floor)
  );
  await expect(frame(page)).toHaveAttribute('data-floor', String(floor), {
    timeout: 15_000
  });
  await expect(frame(page)).toHaveAttribute('data-ride-destination', '');
  await expect(frame(page)).toHaveAttribute('data-y', String(y));
  return page.evaluate(() => [
    ...(window as unknown as { liftLabels: string[] }).liftLabels
  ]);
};

/// Press every key in `keys` and check that none starts a ride or moves the player.
const refused = async (page: Page, keys: readonly string[]): Promise<void> => {
  const before = await read(page);
  for (const key of keys) {
    await page.keyboard.press(key);
    await expect(frame(page)).toHaveAttribute('data-ride-destination', '');
  }
  expect(await read(page)).toEqual(before);
};

/// Walk forward out of the car until the player stands in `hall`, check the Floor, the height
/// and the structure held, and walk back into the car.
const walkOutAndBack = async (
  page: Page,
  car: string,
  hall: string
): Promise<void> => {
  const inside = await read(page);
  const region = async () => frame(page).getAttribute('data-region');
  await walkUntil(page, 'ArrowUp', async () => (await region()) === hall);
  const outside = await read(page);
  expect(outside).toMatchObject({
    floor: inside.floor,
    structure: inside.structure,
    y: inside.y
  });
  expect(outside.x !== inside.x || outside.z !== inside.z).toBe(true);
  await walkUntil(page, 'ArrowDown', async () => (await region()) === car);
  expect(await read(page)).toMatchObject({
    floor: inside.floor,
    region: car
  });
};

/// The Eris State Office (cell 9,8): Floor Table 0, 1, 2 and 10, storey 150. The car is region 4
/// (X −890..−610, Z −95..100 local), its door on the east side; facing east walks out into the
/// hall. Each Floor's hall is its own structure's region: 0 on Floors 0 and 10, 8 on 1 and 2.
const STATE_OFFICE = 'eris-surface-89';
const STATE_OFFICE_CAR = { x: -750, z: 0 };
const FACING_EAST = 768;
const STATE_OFFICE_FLOORS = [
  { floor: 1, hall: '8', key: '1', labels: ['0', '1'], y: 213 },
  { floor: 2, hall: '8', key: '2', labels: ['1', '2'], y: 363 },
  { floor: 10, hall: '0', key: 'b', labels: ['2', '1', '0', '10'], y: 1563 },
  { floor: 0, hall: '0', key: 'g', labels: ['10', '0'], y: 63 }
] as const;

test('the State Office lift rides G, 1, 2, B and back to G, and each Floor can be walked out onto', async ({
  page
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await bootAt(page, STATE_OFFICE_CAR, FACING_EAST, {
    structure: STATE_OFFICE
  });
  await expect(frame(page)).toHaveAttribute(
    'data-structure-instance',
    STATE_OFFICE
  );
  await expect(frame(page)).toHaveAttribute('data-region', '4');
  await expect(frame(page)).toHaveAttribute('data-floor-label', '0');
  await watchLabels(page);

  // On G: G asks for the Floor the label shows, and 3 to 9 for Floors the table leaves zero.
  // The ST's Esc also asks for G, but the Browser Shell keeps Escape for the System Menu.
  await refused(page, ['g', '3', '4', '5', '6', '7', '8', '9']);
  await walkOutAndBack(page, '4', '0');

  for (const { floor, hall, key, labels, y } of STATE_OFFICE_FLOORS) {
    expect(await ride(page, key, floor, y)).toEqual(labels);
    await expect(frame(page)).toHaveAttribute('data-region', '4');
    await expect(frame(page)).toHaveAttribute(
      'data-floor-label',
      String(floor)
    );
    await refused(page, [key, '3', '4', '5', '6', '7', '8', '9']);
    await walkOutAndBack(page, '4', hall);
  }
  expect(errors).toEqual([]);
});

test('a Save and a Session Resume made on Floor 2 of the State Office keep the Floor, and the lift still rides', async ({
  page
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  // Clear any Session Resume on the first load only, so the reload continues this session.
  await page.addInitScript(key => {
    if (sessionStorage.getItem('lift-sweep-e2e') === null) {
      sessionStorage.setItem('lift-sweep-e2e', 'started');
      localStorage.removeItem(key);
    }
  }, DAMOCLES_RESUME_KEY);
  await bootAt(page, STATE_OFFICE_CAR, FACING_EAST, {
    keepResume: true,
    structure: STATE_OFFICE
  });
  await expect(frame(page)).toHaveAttribute('data-region', '4');
  await watchLabels(page);
  expect(await ride(page, '2', 2, 363)).toEqual(['0', '1', '2']);
  const upstairs = await read(page);

  expect(await run(page, 'save 1 confirm')).toContain('saved slot 1');
  await closeConsole(page);
  expect(await ride(page, 'b', 10, 1563)).toEqual(['2', '1', '0', '10']);
  expect(await run(page, 'load 1')).toContain('restored slot 1');
  await closeConsole(page);
  await expect(frame(page)).toHaveAttribute('data-floor', '2');
  expect(await read(page)).toEqual(upstairs);

  await page.reload();
  await ready(page);
  await expect(frame(page)).toHaveAttribute('data-floor', '2');
  await expect(frame(page)).toHaveAttribute('data-floor-label', '2');
  expect(await read(page)).toEqual(upstairs);

  await watchLabels(page);
  expect(await ride(page, 'g', 0, 63)).toEqual(['2', '1', '0']);
  expect(errors).toEqual([]);
});

/// The Vesta Parliament (cell 4,6), where the Vesta transporter capture stands: Floor Table 0,
/// 1, 2, 3 and 10, storey 317. Its west lift car is region 15 on Floor 0 and region 0 on every
/// other Floor (X −2070..−1530, Z −570..0 local), with its doorway on the +Z side. Facing the
/// door walks out into each Floor's hall: region 17 on Floor 0 and region 4 on every other.
///
/// The capture stands on Floor 10 in a corridor; #471's `vesta-teleport` moved it into the car,
/// and this test moves the arrival Pose there the same way. The switch lands on the Floor the
/// capture publishes (`$7AA4`, #505), never one read off the Pose's height (#474).
const VESTA = 'vesta-surface-64';
const VESTA_CAR = { x: -1800, z: -285 };
/// The arrival Pose's yaw word, 1024 a turn, that faces +Z and the car's doorway.
const VESTA_FACING_DOOR = 512;
const VESTA_HALLS: Readonly<Record<number, string>> = {
  0: '17',
  1: '4',
  10: '4',
  2: '4',
  3: '4'
};

test('the Vesta lift wraps from B to G in one step and rides every bound Floor', async ({
  page
}) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  const origin = await structureWorld(page, VESTA);
  await page.addInitScript(
    key => localStorage.removeItem(key),
    DAMOCLES_RESUME_KEY
  );
  await page.route('**/payload/damocles/arrival-poses.json', async route => {
    const document_ = await (await route.fetch()).json();
    const pose = document_.poses.find(
      (item: { readonly id: string }) => item.id === 'vesta-transporter'
    );
    pose.position.x = origin.x + VESTA_CAR.x;
    pose.position.z = origin.z + VESTA_CAR.z;
    pose.yaw = VESTA_FACING_DOOR;
    await route.fulfill({ json: document_ });
  });
  await page.goto('/damocles');
  await ready(page);
  expect(await run(page, 'switch vesta-transporter')).toContain(
    'switched to vesta-transporter'
  );
  await expect(frame(page)).toHaveAttribute('data-structure-instance', VESTA);
  await expect(frame(page)).toHaveAttribute('data-floor', '10');
  await expect(frame(page)).toHaveAttribute('data-floor-label', '10');
  await closeConsole(page);
  await expect(frame(page)).toHaveAttribute('data-y', '3233');
  await expect(frame(page)).toHaveAttribute('data-region', '0');
  await watchLabels(page);

  await refused(page, ['b', '0', '4', '5', '6', '7', '8', '9']);
  await walkOutAndBack(page, '0', VESTA_HALLS[10]!);

  for (const { car, floor, key, labels, y } of [
    { car: '15', floor: 0, key: 'g', labels: ['10', '0'], y: 63 },
    { car: '0', floor: 3, key: '3', labels: ['0', '1', '2', '3'], y: 1014 },
    { car: '0', floor: 1, key: '1', labels: ['3', '2', '1'], y: 380 },
    { car: '0', floor: 10, key: 'b', labels: ['1', '0', '10'], y: 3233 },
    { car: '0', floor: 2, key: '2', labels: ['10', '0', '1', '2'], y: 697 },
    { car: '0', floor: 10, key: '0', labels: ['2', '1', '0', '10'], y: 3233 },
    { car: '15', floor: 0, key: 'g', labels: ['10', '0'], y: 63 }
  ] as const) {
    expect(await ride(page, key, floor, y)).toEqual(labels);
    await expect(frame(page)).toHaveAttribute('data-region', car);
    await expect(frame(page)).toHaveAttribute('data-structure-instance', VESTA);
    await refused(page, ['4', '5', '6', '7', '8', '9']);
    await walkOutAndBack(page, car, VESTA_HALLS[floor]!);
  }
  expect(errors).toEqual([]);
});

/// The Eris transporter capture at cell 11,8 stands on Floor 10 of its structure, storey 110,
/// and the switch lands it there at its own height (#505).
test('the Eris transporter Pose lands on Floor 10', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(
    key => localStorage.removeItem(key),
    DAMOCLES_RESUME_KEY
  );
  await page.goto('/damocles');
  await ready(page);
  expect(await run(page, 'switch eris-transporter-11-8')).toContain(
    'switched to eris-transporter-11-8'
  );
  await closeConsole(page);
  await expect(frame(page)).toHaveAttribute(
    'data-structure-instance',
    'eris-surface-8b'
  );
  await expect(frame(page)).toHaveAttribute('data-floor', '10');
  await expect(frame(page)).toHaveAttribute('data-y', '1163');
  expect(errors).toEqual([]);
});
