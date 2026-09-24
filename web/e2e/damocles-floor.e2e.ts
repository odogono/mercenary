import { expect, test, type Page } from '@playwright/test';

import {
  DAMOCLES_RESUME_KEY,
  closeConsole,
  ready,
  run,
  watchErrors
} from './damocles-play.ts';

/// Browser verification of the player's Floor (#474) at the Eris State Office, whose Floor Table
/// binds Floors 0, 1, 2 and 10 at a storey pitch of 150. The console's `floor N` stands in for
/// the lift until it exists (#475); the page publishes the Floor as `data-floor`.

const STATE_OFFICE = 'eris-surface-89';

const frame = (page: Page) => page.locator('#frame');

const pose = async (page: Page) =>
  frame(page).evaluate(node => ({
    x: node.dataset['x'],
    y: node.dataset['y'],
    z: node.dataset['z']
  }));

test('floor N moves between the bound Floors, and a Save and a Session Resume keep it', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  // Clear any Session Resume on the first load only, so the reload below continues this one.
  await page.addInitScript(key => {
    if (sessionStorage.getItem('floor-e2e') === null) {
      sessionStorage.setItem('floor-e2e', 'started');
      localStorage.removeItem(key);
    }
  }, DAMOCLES_RESUME_KEY);
  await page.goto('/damocles');
  await ready(page);

  expect(await run(page, 'goto 9 8')).toContain('moved to cell 9-8');
  await expect(frame(page)).toHaveAttribute(
    'data-structure-instance',
    STATE_OFFICE
  );
  await expect(frame(page)).toHaveAttribute('data-floor', '0');
  const ground = await pose(page);

  expect(await run(page, 'floor 2')).toContain('moved to Floor 2');
  await expect(frame(page)).toHaveAttribute('data-floor', '2');
  await expect(frame(page)).toHaveAttribute('data-y', '363');
  const upstairs = await pose(page);
  expect({ x: upstairs.x, z: upstairs.z }).toEqual({
    x: ground.x,
    z: ground.z
  });

  expect(await run(page, 'floor 3')).toContain(
    'floor refused: STATE OFFICE binds no Floor 3'
  );
  await expect(frame(page)).toHaveAttribute('data-floor', '2');

  expect(await run(page, 'save 1 confirm')).toContain('saved slot 1');
  expect(await run(page, 'floor 10')).toContain('moved to Floor 10');
  await expect(frame(page)).toHaveAttribute('data-floor', '10');
  await expect(frame(page)).toHaveAttribute('data-y', '1563');

  expect(await run(page, 'load 1')).toContain('restored slot 1');
  await expect(frame(page)).toHaveAttribute('data-floor', '2');
  expect(await pose(page)).toEqual(upstairs);

  await closeConsole(page);
  await page.reload();
  await ready(page);
  await expect(frame(page)).toHaveAttribute('data-floor', '2');
  expect(await pose(page)).toEqual(upstairs);

  expect(await run(page, 'goto 3 4')).toContain('moved to cell 3-4');
  await expect(frame(page)).toHaveAttribute('data-floor', '0');
  expect(errors).toEqual([]);
});
