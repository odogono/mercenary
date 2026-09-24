import { expect, test, type Page } from '@playwright/test';

import { bootAt, watchErrors } from './damocles-play.ts';

/// Browser verification of riding a Damocles Lift (#475) in the Eris State Office, whose Floor
/// Table binds Floors 0, 1, 2 and 10 at a storey pitch of 150. The lift is region 4, one of the
/// two lift cars (X −890..−610, Z −95..100 local); the hall outside it is region 0. The ride is
/// an instant rebind until its presentation lands (#476).

const STATE_OFFICE = 'eris-surface-89';
const LIFT_CAR = { x: -750, z: 0 };
const HALL = { x: -300, z: 0 };

const frame = (page: Page) => page.locator('#frame');

const floorAndY = async (page: Page) =>
  frame(page).evaluate(node => ({
    floor: node.dataset['floor'],
    y: node.dataset['y']
  }));

test('in the lift car the Floor keys ride G, 2, B, 1 and G, and 3 to 9 do nothing', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await bootAt(page, LIFT_CAR, 512, { structure: STATE_OFFICE });
  await expect(frame(page)).toHaveAttribute(
    'data-structure-instance',
    STATE_OFFICE
  );
  await expect(frame(page)).toHaveAttribute('data-region', '4');
  await expect(frame(page)).toHaveAttribute('data-floor', '0');
  const start = await frame(page).evaluate(node => ({
    x: node.dataset['x'],
    z: node.dataset['z']
  }));

  for (const [key, floor, y] of [
    ['2', '2', '363'],
    ['b', '10', '1563'],
    ['1', '1', '213'],
    ['g', '0', '63']
  ] as const) {
    await page.keyboard.press(key);
    await expect(frame(page)).toHaveAttribute('data-floor', floor);
    await expect(frame(page)).toHaveAttribute('data-y', y);
    await expect(frame(page)).toHaveAttribute('data-region', '4');
    for (let unbound = 3; unbound <= 9; unbound += 1) {
      await page.keyboard.press(String(unbound));
    }
    expect(await floorAndY(page)).toEqual({ floor, y });
  }
  expect(
    await frame(page).evaluate(node => ({
      x: node.dataset['x'],
      z: node.dataset['z']
    }))
  ).toEqual(start);
  expect(errors).toEqual([]);
});

test('outside the lift car the Floor keys do nothing', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await bootAt(page, HALL, 512, { structure: STATE_OFFICE });
  await expect(frame(page)).toHaveAttribute('data-region', '0');
  for (const key of ['1', '2', '0', 'g']) {
    await page.keyboard.press(key);
  }
  expect(await floorAndY(page)).toEqual({ floor: '0', y: '63' });
  expect(errors).toEqual([]);
});
