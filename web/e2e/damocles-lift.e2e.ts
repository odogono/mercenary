import { expect, test, type Page } from '@playwright/test';

import { bootAt, watchErrors } from './damocles-play.ts';

/// Browser verification of riding a Damocles Lift (#475) in the Eris State Office, whose Floor
/// Table binds Floors 0, 1, 2 and 10 at a storey pitch of 150. The lift is region 4, one of the
/// two lift cars (X −890..−610, Z −95..100 local); the hall outside it is region 0. The ride is
/// played as #472 recovered it (#476): the door shuts, the label steps one Floor every 25 VBLs,
/// and the arrival follows one period after the label shows the destination.

const STATE_OFFICE = 'eris-surface-89';
const LIFT_CAR = { x: -750, z: 0 };
const HALL = { x: -300, z: 0 };
/// In the hall, just outside the lift door's Proximity Box (X −890..−450), facing west into the
/// car through its doorway, region 2.
const BEFORE_THE_DOOR = { x: -440, z: 0 };
const FACING_WEST = 256;

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

test('walked in through the door, 1 rides: the label steps, and the arrival is 25 VBLs later, with the door tones either side', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await bootAt(page, BEFORE_THE_DOOR, FACING_WEST, { structure: STATE_OFFICE });
  await expect(frame(page)).toHaveAttribute('data-region', '0');
  await page.keyboard.down('ArrowUp');
  await expect(frame(page)).toHaveAttribute('data-region', '4', {
    timeout: 20_000
  });
  await page.keyboard.up('ArrowUp');
  // The door opened for the walk in, and stands open around the player.
  await expect(frame(page)).toHaveAttribute(
    'data-damocles-cues',
    'door-start:1 door-stop:1'
  );

  // Session time at each change of the label, the Floor and the cues, read as the page
  // publishes them.
  await frame(page).evaluate(node => {
    const seen: [string, string, string, number][] = [];
    (window as unknown as { liftSeen: typeof seen }).liftSeen = seen;
    new MutationObserver(() => {
      const last = seen.at(-1);
      const label = node.dataset['floorLabel']!;
      const floor = node.dataset['floor']!;
      const cues = node.dataset['damoclesCues']!;
      if (
        last === undefined ||
        last[0] !== label ||
        last[1] !== floor ||
        last[2] !== cues
      ) {
        seen.push([label, floor, cues, Number(node.dataset['elapsed'])]);
      }
    }).observe(node, { attributes: true });
  });
  await page.keyboard.press('1');
  await expect(frame(page)).toHaveAttribute('data-ride-destination', '1');
  await expect(frame(page)).toHaveAttribute('data-floor', '1', {
    timeout: 10_000
  });
  await expect(frame(page)).toHaveAttribute('data-ride-destination', '');
  await expect(frame(page)).toHaveAttribute('data-y', '213');
  // The new Floor's door opens around the player as the old one shut: a start and a stop each.
  await expect(frame(page)).toHaveAttribute(
    'data-damocles-cues',
    'door-start:3 door-stop:3 take:1',
    { timeout: 10_000 }
  );
  const seen = await page.evaluate(
    () =>
      (window as unknown as { liftSeen: [string, string, string, number][] })
        .liftSeen
  );
  const at = (found: (typeof seen)[number] | undefined): number => {
    expect(found).toBeDefined();
    return found![3];
  };
  const stepped = at(
    seen.find(([label, floor]) => label === '1' && floor === '0')
  );
  const arrived = at(
    seen.find(([label, floor]) => label === '1' && floor === '1')
  );
  // 25 VBLs at 50 Hz, give or take the frames the page publishes between.
  expect(arrived - stepped).toBeCloseTo(0.5, 1);
  // The door shut before the label stepped, nothing sounded while it stepped, and the arrival's
  // request came before the new door's tone.
  const shut = at(seen.find(([, , cues]) => cues.includes('door-stop:2')));
  const take = at(seen.find(([, , cues]) => cues.includes('take:1')));
  const opening = at(seen.find(([, , cues]) => cues.includes('door-start:3')));
  expect(shut).toBeLessThan(stepped);
  expect(take).toBe(arrived);
  expect(opening).toBeGreaterThanOrEqual(take);
  expect(errors).toEqual([]);
});
