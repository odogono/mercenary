import { expect, test } from '@playwright/test';

import {
  APPROACH_LOCAL,
  FACING_EAST,
  WALK_FROM_LOCAL,
  bootAt,
  closeConsole,
  damoclesSaveSlot,
  displayRow,
  inventory,
  rowReaches,
  run,
  watchErrors
} from './damocles-play.ts';

/// Browser verification for the body-aware Damocles contract (#320).
///
/// The unit suites assert the rules; this asserts that a real browser session obeys them through
/// the ordinary controls and the development console, in one continuous session, with no page
/// errors. Everything here is driven by keys and console lines, never by reaching into the
/// session. The shared route and helpers live in `damocles-play.ts`.

const SAVE_SLOT_1 = damoclesSaveSlot(1);

test('the limo key is taken by walking up to it and pressing take', async ({
  page
}, testInfo) => {
  const errors = watchErrors(page);
  await bootAt(page, WALK_FROM_LOCAL, FACING_EAST);
  const frame = page.locator('#frame');
  await expect(frame).toHaveAttribute('data-structure-instance', /./);
  await expect(inventory(page)).toHaveText('EMPTY');
  const beforeTriangles = Number(await frame.getAttribute('data-triangles'));

  // Out of reach to begin with: the take control does nothing until the player walks up.
  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText('EMPTY');

  // Walk the last stretch with the ordinary control, then take with the ordinary control.
  const startX = Number(await frame.getAttribute('data-x'));
  await page.keyboard.down('ArrowUp');
  await expect
    .poll(async () =>
      Math.abs(Number(await frame.getAttribute('data-x')) - startX)
    )
    .toBeGreaterThan(300);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('t');

  // The inventory window scrolls the label in over 16 frames, so poll rather than read once.
  await expect(inventory(page)).toHaveText('KEY- V.I.P. LIMO', {
    timeout: 5000
  });
  // Taking it removes it from the drawn world.
  expect(Number(await frame.getAttribute('data-triangles'))).toBeLessThan(
    beforeTriangles
  );

  // Trigger 2's response presents its three inline records on the Damocles Display, in order.
  await rowReaches(page, 'PROCEED BY CAR');
  await testInfo.attach('taken', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });
  await rowReaches(page, 'STATE PRESIDENTS OFFICE');
  await rowReaches(page, 'FIRST ROAD JUNCTION');
  // Then the response's own clearing line, and the row is left blank.
  await expect.poll(async () => displayRow(page), { timeout: 30_000 }).toBe('');

  expect(errors).toEqual([]);
});

test('the key drops where it is put and is taken again', async ({ page }) => {
  const errors = watchErrors(page);
  await bootAt(page, APPROACH_LOCAL);
  const frame = page.locator('#frame');
  const drawn = Number(await frame.getAttribute('data-triangles'));
  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText('KEY- V.I.P. LIMO');
  await page.keyboard.press('d');
  await expect(inventory(page)).toHaveText('EMPTY');
  // Dropped in front of the player, so it is drawn again -- at a different place, which is why
  // the triangle count returns rather than the position.
  await expect
    .poll(async () => Number(await frame.getAttribute('data-triangles')))
    .toBe(drawn);
  // The drop sets the label scroll counter, and both handlers refuse until it settles.
  await expect
    .poll(
      async () => {
        await page.keyboard.press('t');
        return inventory(page).textContent();
      },
      { timeout: 5000 }
    )
    .toBe('KEY- V.I.P. LIMO');
  expect(errors).toEqual([]);
});

test('the console body switch moves Body, Pose and cell together', async ({
  page
}) => {
  const errors = watchErrors(page);
  await bootAt(page, APPROACH_LOCAL);
  const frame = page.locator('#frame');
  await expect(frame).toHaveAttribute('data-cell', '7-8');

  expect(await run(page, 'switch vesta-parliament-4-6')).toContain(
    'switched to vesta-parliament-4-6'
  );
  await closeConsole(page);
  await expect(frame).toHaveAttribute('data-cell', '4-6');
  expect(await run(page, 'where')).toContain('VESTA 04-06');
  await closeConsole(page);
  // The panel's location readout names the Body too, not the presentation document's.
  await expect(
    page.locator('#panel-damocles [data-field=locationName]')
  ).toHaveText('VESTA');

  // Gaea has two admitted Poses since #390 recovered the transporter's workspace, so the switch
  // names the Pose rather than the Body.
  expect(await run(page, 'switch gaea-ur-city-4-2')).toContain(
    'switched to gaea-ur-city-4-2'
  );
  await closeConsole(page);
  await expect(frame).toHaveAttribute('data-cell', '4-2');

  expect(errors).toEqual([]);
});

/// The absolute counterpart to the relative assertions above (#379).
///
/// Everything else here compares a triangle count either side of a take, a drop or a switch,
/// and all of it passed while the browser drew empty sky on every Body but Eris: the planner
/// was handed the presentation document's Eris surface whatever Body the Session stood on. Only
/// the geometry of the Body stood on catches that, so this reads it absolutely. The counts are
/// the ones `damocles-body-switch.test.ts` pins at each admitted arrival Pose.
test('a switched Body draws its own workspace', async ({ page }) => {
  const errors = watchErrors(page);
  await bootAt(page, APPROACH_LOCAL);
  const frame = page.locator('#frame');
  // Eris's own workspace, with the unresolved models its Catalogue records carry.
  await expect(frame).toHaveAttribute('data-unresolved', '19');

  expect(await run(page, 'switch dion-2-3')).toContain('switched');
  await closeConsole(page);
  await expect(frame).toHaveAttribute('data-cell', '2-3');
  // Dion's workspace: its own draw, its own unresolved count, its own sea and its own three
  // islands. Eris's surface at this Pose would draw no ground at all, every Eris placement
  // being millions of units away, and would paint Eris's coasts on Dion's water (#394).
  await expect(frame).toHaveAttribute('data-triangles', '422');
  await expect(frame).toHaveAttribute('data-unresolved', '46');

  expect(await run(page, 'switch gaea-ur-city-4-2')).toContain('switched');
  await closeConsole(page);
  await expect(frame).toHaveAttribute('data-triangles', '521');
  await expect(frame).toHaveAttribute('data-unresolved', '0');

  expect(errors).toEqual([]);
});

test('a declined switch leaves live play exactly as it was', async ({
  page
}) => {
  const errors = watchErrors(page);
  await bootAt(page, APPROACH_LOCAL);
  const frame = page.locator('#frame');
  const before = {
    cell: await frame.getAttribute('data-cell'),
    heading: await frame.getAttribute('data-heading'),
    x: await frame.getAttribute('data-x'),
    z: await frame.getAttribute('data-z')
  };

  // A Body with more than one admitted Pose, a Pose with no recovered origin, and a name that
  // is neither. Each declines with a reason that names the problem. MIDAS stands in for the
  // missing origin now that #390 recovered Gaea's transporter workspace.
  expect(await run(page, 'switch eris')).toContain(
    'eris-spaceport-onfoot, eris-transporter-11-8'
  );
  expect(await run(page, 'switch midas')).toContain(
    'midas has no recovered workspace origin'
  );
  expect(await run(page, 'switch tharsis')).toContain(
    "no Body or Pose named 'tharsis'"
  );
  await closeConsole(page);

  expect({
    cell: await frame.getAttribute('data-cell'),
    heading: await frame.getAttribute('data-heading'),
    x: await frame.getAttribute('data-x'),
    z: await frame.getAttribute('data-z')
  }).toEqual(before);
  expect(errors).toEqual([]);
});

test('a carried object and a dropped one survive a round trip between Bodies', async ({
  page
}) => {
  const errors = watchErrors(page);
  await bootAt(page, APPROACH_LOCAL);
  const frame = page.locator('#frame');

  // Take on Eris.
  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText('KEY- V.I.P. LIMO');

  // Carry it to Vesta and drop it there.
  expect(await run(page, 'switch vesta-parliament-4-6')).toContain('switched');
  await closeConsole(page);
  await expect(inventory(page)).toHaveText('KEY- V.I.P. LIMO');
  const vestaDrawn = Number(await frame.getAttribute('data-triangles'));
  await page.keyboard.press('d');
  await expect(inventory(page)).toHaveText('EMPTY');
  const vestaWithKey = Number(await frame.getAttribute('data-triangles'));
  expect(vestaWithKey).toBeGreaterThan(vestaDrawn);

  // Go away and come back: it is still where it was left, and Eris has not gained a copy.
  expect(await run(page, 'switch dion-2-3')).toContain('switched');
  await closeConsole(page);
  expect(await run(page, 'switch vesta-parliament-4-6')).toContain('switched');
  await closeConsole(page);
  await expect(frame).toHaveAttribute('data-triangles', String(vestaWithKey));
  await expect(inventory(page)).toHaveText('EMPTY');
  expect(errors).toEqual([]);
});

test('a Save taken on one Body restores onto it from another', async ({
  page
}) => {
  const errors = watchErrors(page);
  await bootAt(page, APPROACH_LOCAL);
  const frame = page.locator('#frame');

  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText('KEY- V.I.P. LIMO');
  expect(await run(page, 'save 1')).toContain('saved slot 1');

  // Leave: another Body, and the key dropped there.
  expect(await run(page, 'switch vesta-parliament-4-6')).toContain('switched');
  await closeConsole(page);
  await page.keyboard.press('d');
  await expect(inventory(page)).toHaveText('EMPTY');

  expect(await run(page, 'load 1')).toContain('restored slot 1');
  await closeConsole(page);
  await expect(frame).toHaveAttribute('data-cell', '7-8');
  // The restore rebuilds the surface in the constructor rather than through a switch, so the
  // Body it lands on is read absolutely here as well (#379).
  await expect(frame).toHaveAttribute('data-unresolved', '19');
  await expect(inventory(page)).toHaveText('KEY- V.I.P. LIMO');
  expect(await run(page, 'where')).toContain('ERIS 07-08');
  expect(errors).toEqual([]);
});

test('an incompatible Save record is refused and live play is untouched', async ({
  page
}) => {
  const errors = watchErrors(page);
  await bootAt(page, APPROACH_LOCAL);
  const frame = page.locator('#frame');
  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText('KEY- V.I.P. LIMO');
  expect(await run(page, 'save 1')).toContain('saved slot 1');
  await closeConsole(page);

  // Corrupt the stored record's Body to one the Catalogue knows but no arrival Pose anchors.
  await page.evaluate(key => {
    const raw = window.localStorage.getItem(key)!;
    window.localStorage.setItem(key, raw.replace('body-11', 'body-1'));
  }, SAVE_SLOT_1);

  const before = await frame.getAttribute('data-x');
  const refusal = await run(page, 'load 1');
  expect(refusal).toContain('load refused');
  await closeConsole(page);
  // Live play carries on: same place, same Carried Stack.
  expect(await frame.getAttribute('data-x')).toBe(before);
  await expect(inventory(page)).toHaveText('KEY- V.I.P. LIMO');
  expect(errors).toEqual([]);
});

test('the body switch survives a narrow viewport and the Targ rendition', async ({
  page
}) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ height: 720, width: 420 });
  await bootAt(page, APPROACH_LOCAL);
  await expect(page.locator('#panel-damocles')).toBeVisible();
  expect(await run(page, 'panel targ')).toBeTruthy();
  await closeConsole(page);
  expect(await run(page, 'switch dion-2-3')).toContain('switched');
  await closeConsole(page);
  await expect(page.locator('#frame')).toHaveAttribute('data-cell', '2-3');
  expect(errors).toEqual([]);
});
