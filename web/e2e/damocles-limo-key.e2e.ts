import { expect, test, type Page } from '@playwright/test';

import { pauseClock } from './clock.ts';
import {
  APPROACH_LOCAL,
  DOORWAY_LINE_LOCAL,
  FACING_DOORWAY,
  FACING_EAST,
  WALK_FROM_LOCAL,
  bootAt,
  closeConsole,
  damoclesSaveSlot,
  displayRow,
  held,
  holdUntilFrame,
  inventory,
  messageText,
  pressUntilInventory,
  ready,
  responseParks,
  run,
  scrollPixels,
  soundCues,
  spaceportWorld,
  stepIntoDoorway,
  walkUntil,
  watchErrors
} from './damocles-play.ts';

/// Browser verification of the limo-key interaction (#301), against the contract in
/// `docs/design/damocles-limo-key-interaction.md`.
///
/// The deterministic suites are the authority; this pass confirms that ordinary browser play
/// produces the same observable sequence. Everything here is driven by the Control Profile's
/// own keys and by the development console, and every test asserts the page raised no errors.
///
/// The response runs for 1000 frames at 50 Hz — twenty seconds — so several of these tests are
/// long by design rather than by accident, and each says so with its own timeout.

const KEY_LABEL = 'KEY- V.I.P. LIMO';

const BLANK_ROW = ' '.repeat(48);

/// The row a record occupies: 48 six-pixel cells, character `k` in cell `k`.
const effectiveRow = (text: string): string => text.slice(0, 48).padEnd(48);

/// The row the recovered reveal arithmetic shows when a record has travelled `pixels` into the
/// display over its predecessor. Eight pixels a frame through a six-pixel pitch leaves the
/// window's edge inside a character for two frames in every three.
const revealedRow = (beneath: string, text: string, pixels: number): string =>
  (effectiveRow(beneath) + effectiveRow(text))
    .slice(Math.floor(pixels / 6), Math.floor(pixels / 6) + 48)
    .padEnd(48)
    .trim();

const frame = (page: Page) => page.locator('#frame');

const region = async (page: Page): Promise<string> =>
  (await frame(page).getAttribute('data-region')) ?? '';

const localZ = async (page: Page, origin: { readonly z: number }) =>
  Number(await frame(page).getAttribute('data-z')) - origin.z;

const triangles = async (page: Page): Promise<number> =>
  Number(await frame(page).getAttribute('data-triangles'));

interface SavedRecord {
  snapshot: {
    script: {
      display: { cells?: string; kind: string };
      execution: { step: number } | null;
      message: { id: string } | null;
    };
    scrollCounter: number;
  };
}

const savedRecord = async (page: Page, slot: 1 | 2 | 3): Promise<SavedRecord> =>
  JSON.parse(
    (await page.evaluate(
      key => window.localStorage.getItem(key),
      damoclesSaveSlot(slot)
    ))!
  ) as SavedRecord;

const rewriteRecord = async (
  page: Page,
  slot: 1 | 2 | 3,
  edit: (record: SavedRecord) => void
): Promise<void> => {
  const record = await savedRecord(page, slot);
  edit(record);
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key!, value!),
    [damoclesSaveSlot(slot), JSON.stringify(record)]
  );
};

test('the supported pickup runs the response once and parks', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await bootAt(page, WALK_FROM_LOCAL, FACING_EAST);
  const [first, second, third] = await Promise.all([
    messageText(page, 'script2-inline-1'),
    messageText(page, 'script2-inline-2'),
    messageText(page, 'script2-inline-3')
  ]);
  await expect(inventory(page)).toHaveText('EMPTY');
  expect(await soundCues(page)).toBe('');

  // Walk the last stretch and take with the ordinary controls.
  const startX = Number(await frame(page).getAttribute('data-x'));
  await holdUntilFrame(page, 'ArrowUp', {
    attribute: 'x',
    comparison: 'above',
    value: startX + 300
  });
  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText(KEY_LABEL, { timeout: 5000 });
  // One take, one Sound Cue request.
  expect(await soundCues(page)).toBe('take:1');

  // The first record arrives and is then held whole.
  await expect
    .poll(async () => displayRow(page), { timeout: 10_000 })
    .toBe(held(first));
  expect(await scrollPixels(page)).toBe(0);
  await testInfo.attach('first message held', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });

  await expect
    .poll(async () => displayRow(page), { timeout: 10_000 })
    .toBe(held(second));
  await expect
    .poll(async () => displayRow(page), { timeout: 10_000 })
    .toBe(held(third));

  // The third record is held through the 200-frame wait as well as its own 200 frames, so a row
  // that still reads it 4.4 seconds later held it across the null message gate.
  await page.waitForTimeout(4400);
  expect(await displayRow(page)).toBe(held(third));

  // The response's own clearing line leaves the row blank, and that is where it parks.
  await expect.poll(async () => displayRow(page), { timeout: 15_000 }).toBe('');
  await page.waitForTimeout(3000);
  expect(await displayRow(page)).toBe('');

  // Taking again without a drop changes nothing and asks for nothing.
  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText(KEY_LABEL);
  expect(await soundCues(page)).toBe('take:1');
  expect(errors).toEqual([]);
});

test('a record arrives over its predecessor at eight pixels a frame', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await pauseClock(page);
  await bootAt(page, APPROACH_LOCAL);
  const first = await messageText(page, 'script2-inline-1');

  await page.keyboard.press('t');
  await page.clock.runFor(400);
  await expect(inventory(page)).toHaveText(KEY_LABEL);

  // Stop part way through the first 36-frame arrival, rather than racing a browser round
  // trip against it. Row and pixel count must describe the same frame.
  const partial = await frame(page).evaluate(node => ({
    pixels: Number(node.dataset['damoclesScroll']),
    row: node.dataset['damoclesRow'] ?? ''
  }));
  expect(partial.pixels).toBeGreaterThan(0);
  expect(partial.pixels % 8).toBe(0);
  expect(partial.pixels).toBeLessThan(288);
  expect(partial.row).toBe(revealedRow(BLANK_ROW, first, partial.pixels));
  expect(errors).toEqual([]);
});

test('a drop and a re-pick during the response neither restart nor duplicate it', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await bootAt(page, APPROACH_LOCAL);
  const [first, third] = await Promise.all([
    messageText(page, 'script2-inline-1'),
    messageText(page, 'script2-inline-3')
  ]);

  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText(KEY_LABEL);
  await expect
    .poll(async () => displayRow(page), { timeout: 10_000 })
    .toBe(held(first));

  // Put it down while the response is still running, then pick it up again.
  await pressUntilInventory(page, 'd', 'EMPTY');
  expect(await soundCues(page)).toBe('drop:1 take:1');
  await pressUntilInventory(page, 't', KEY_LABEL);
  expect(await soundCues(page)).toBe('drop:1 take:2');

  // The response carries on to its own end regardless, and nothing starts a second one.
  await responseParks(page, third);
  await page.waitForTimeout(5000);
  expect(await displayRow(page)).toBe('');
  expect(await soundCues(page)).toBe('drop:1 take:2');
  expect(errors).toEqual([]);
});

test('a Save round-trips the response at each of its phases', async ({
  page
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await pauseClock(page);
  await bootAt(page, APPROACH_LOCAL);
  const third = await messageText(page, 'script2-inline-3');

  await page.keyboard.press('t');
  await page.clock.runFor(400);
  await expect(inventory(page)).toHaveText(KEY_LABEL);

  // A Save taken while a record is part way into the row.
  expect(await run(page, 'save 1')).toContain('saved slot 1');
  const scrolling = await savedRecord(page, 1);
  expect(scrolling.snapshot.script.display.kind).toBe('scrolling');
  expect(scrolling.snapshot.script.message).not.toBeNull();
  expect(await run(page, 'load 1')).toContain('restored slot 1');
  await closeConsole(page);
  // Restoring emits nothing of its own.
  expect(await soundCues(page)).toBe('take:1');
  // The restored session finishes the response it was in the middle of.
  // Each record lasts 200 frames (four seconds). Nine seconds into the response the third
  // is held; four seconds later its message gate is clear and its row remains through the wait.
  await page.clock.runFor(8600);
  expect(await displayRow(page)).toBe(held(third));
  await page.clock.runFor(4000);
  expect(await run(page, 'save 2')).toContain('saved slot 2');
  const waiting = await savedRecord(page, 2);
  expect(waiting.snapshot.script.message).toBeNull();
  expect(waiting.snapshot.script.execution).not.toBeNull();
  // The row the record carries is the third record, held, even though the message gate is null:
  // the display outlives the message that put it there. Asserting it on the stored record rather
  // than on the live row is what makes this a claim about the Save rather than about how long
  // the restore took.
  expect(waiting.snapshot.script.display.kind).toBe('held');
  expect(waiting.snapshot.script.display.cells?.trim()).toBe(held(third));
  expect(await run(page, 'load 2')).toContain('restored slot 2');
  await closeConsole(page);
  await page.clock.runFor(8000);
  expect(await displayRow(page)).toBe('');
  await page.clock.runFor(3000);
  expect(await displayRow(page)).toBe('');

  // And one after the response has parked: the row stays blank and nothing runs again.
  expect(await run(page, 'save 3 confirm')).toContain('saved slot 3');
  expect(await run(page, 'load 3')).toContain('restored slot 3');
  await closeConsole(page);
  await expect(inventory(page)).toHaveText(KEY_LABEL);
  await page.clock.runFor(4000);
  expect(await displayRow(page)).toBe('');
  expect(await soundCues(page)).toBe('take:1');
  expect(errors).toEqual([]);
});

test('a Save taken before the pickup restores a world the key can be taken from again', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await bootAt(page, APPROACH_LOCAL);
  const first = await messageText(page, 'script2-inline-1');
  const drawn = await triangles(page);

  expect(await run(page, 'save 1 confirm')).toContain('saved slot 1');
  await closeConsole(page);
  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText(KEY_LABEL);
  await expect
    .poll(async () => displayRow(page), { timeout: 10_000 })
    .toBe(held(first));

  expect(await run(page, 'load 1')).toContain('restored slot 1');
  await closeConsole(page);
  // The key is back in the world, uncarried, and the response it launched went with it.
  await expect(inventory(page)).toHaveText('EMPTY');
  expect(await triangles(page)).toBe(drawn);
  expect(await displayRow(page)).toBe('');

  // Taking it again runs the response once more, from its first record.
  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText(KEY_LABEL);
  await expect
    .poll(async () => displayRow(page), { timeout: 10_000 })
    .toBe(held(first));
  expect(errors).toEqual([]);
});

test('a key left inside the spaceport survives leaving its region, a Save and a return', async ({
  page
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await bootAt(page, DOORWAY_LINE_LOCAL, FACING_DOORWAY);
  const origin = await spaceportWorld(page);
  const third = await messageText(page, 'script2-inline-3');
  await expect(frame(page)).toHaveAttribute('data-region', '0');

  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText(KEY_LABEL);
  await responseParks(page, third);

  // Put it down where the player stands, inside the key's own region. It is drawn again, and it
  // is selectable from where it was left.
  await pressUntilInventory(page, 'd', 'EMPTY');
  const dropped = await localZ(page, origin);
  const withKey = await triangles(page);
  expect(await run(page, 'get')).toContain(`took ${KEY_LABEL}`);
  await closeConsole(page);
  await pressUntilInventory(page, 'd', 'EMPTY');

  // Walk out through the doorway into the next region. The key stays where it was left; it is
  // simply no longer near enough, or exposed, to be taken.
  await holdUntilFrame(page, 'ArrowUp', {
    attribute: 'region',
    comparison: 'equal',
    value: 2
  });
  expect(await run(page, 'get')).toContain('nothing is in reach');
  await closeConsole(page);

  // Save and restore from out here: the residence survives the round trip.
  expect(await run(page, 'save 1 confirm')).toContain('saved slot 1');
  expect(await run(page, 'load 1')).toContain('restored slot 1');
  await closeConsole(page);
  await expect(inventory(page)).toHaveText('EMPTY');
  await expect(frame(page)).toHaveAttribute('data-region', '2');

  // Walk back to where it was left and pick it up again: one take Sound Cue, no second
  // response, and no duplicate of the key at its original Catalogue placement.
  await holdUntilFrame(page, 'ArrowDown', {
    attribute: 'z',
    comparison: 'above',
    value: origin.z + dropped - 100
  });
  expect(await triangles(page)).toBe(withKey);
  await pressUntilInventory(page, 't', KEY_LABEL);
  // Two takes by key and one through the console, and a drop for each of the first two. The
  // doorway's door moved twice on the walk out and back, each time a start and a stop. The walk
  // out met the door shut, and the eye held at it until the latch opened thudded once (#521).
  expect(await soundCues(page)).toBe(
    'door-start:2 door-stop:2 drop:2 take:3 thud:1'
  );
  await page.waitForTimeout(3000);
  expect(await displayRow(page)).toBe('');

  // A Save taken from a cell that binds no structure still carries the residence of a key left
  // inside one, and restores.
  await pressUntilInventory(page, 'd', 'EMPTY');
  expect(await run(page, 'goto 6 8')).toContain('moved to cell 6-8');
  await expect(frame(page)).toHaveAttribute('data-structure-instance', '');
  expect(await run(page, 'save 2 confirm')).toContain('saved slot 2');
  expect(await run(page, 'load 2')).toContain('restored slot 2');
  await closeConsole(page);
  await expect(inventory(page)).toHaveText('EMPTY');
  await expect(frame(page)).toHaveAttribute('data-cell', '6-8');
  expect(errors).toEqual([]);
});

test('a drop in the doorway region after the response has parked is refused', async ({
  page
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await bootAt(page, DOORWAY_LINE_LOCAL, FACING_DOORWAY);
  const origin = await spaceportWorld(page);
  const third = await messageText(page, 'script2-inline-3');

  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText(KEY_LABEL);
  await responseParks(page, third);

  // Walk to the doorway. The last stretch is taken in short steps: the doorway region is forty
  // units deep, which a walk at full speed crosses in six frames.
  await walkUntil(
    page,
    'ArrowUp',
    async () => (await localZ(page, origin)) < -700
  );
  await stepIntoDoorway(page);

  // The drop is refused, the key stays carried, and the parked host presents the refusal.
  const cues = await soundCues(page);
  await page.keyboard.press('d');
  await expect(inventory(page)).toHaveText(KEY_LABEL);
  await expect
    .poll(async () => displayRow(page), { timeout: 10_000 })
    .toBe('NO ROOM');
  expect(await soundCues(page)).toBe(cues);
  expect(errors).toEqual([]);
});

test('a Session Resume continues the response across a reload', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await bootAt(page, APPROACH_LOCAL, 512, { keepResume: true });
  const [first, third] = await Promise.all([
    messageText(page, 'script2-inline-1'),
    messageText(page, 'script2-inline-3')
  ]);

  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText(KEY_LABEL);
  await expect
    .poll(async () => displayRow(page), { timeout: 10_000 })
    .toBe(held(first));

  await page.reload();
  await ready(page);
  // The reload continues the session rather than starting one: the key is still carried, and
  // the restore itself asks for no Sound Cue.
  await expect(inventory(page)).toHaveText(KEY_LABEL);
  expect(await soundCues(page)).toBe('');
  // The response continues from where it was, and ends once.
  await responseParks(page, third);
  await page.waitForTimeout(4000);
  expect(await displayRow(page)).toBe('');
  expect(errors).toEqual([]);
});

test('an unreachable stored response is refused and live play carries on', async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await pauseClock(page);
  await bootAt(page, APPROACH_LOCAL);

  await page.keyboard.press('t');
  await page.clock.runFor(13_000);
  await expect(inventory(page)).toHaveText(KEY_LABEL);
  expect(await run(page, 'save 1')).toContain('saved slot 1');
  const waiting = await savedRecord(page, 1);
  expect(waiting.snapshot.script.message).toBeNull();
  expect(waiting.snapshot.script.execution).not.toBeNull();
  await closeConsole(page);

  // Two records the codec must refuse whole: an execution stopped where the interpreter never
  // stops, and a scroll counter outside the range the label window counts in.
  await rewriteRecord(page, 1, record => {
    record.snapshot.script.execution!.step = 0;
  });
  expect(await run(page, 'load 1')).toContain('load refused');
  await closeConsole(page);
  await expect(inventory(page)).toHaveText(KEY_LABEL);

  expect(await run(page, 'save 2 confirm')).toContain('saved slot 2');
  await rewriteRecord(page, 2, record => {
    record.snapshot.scrollCounter = 99;
  });
  expect(await run(page, 'load 2')).toContain('load refused');
  await closeConsole(page);

  // Both refusals left the session they declined to replace exactly where it was: still
  // carrying the key, and still running the one response, which ends on its own.
  await expect(inventory(page)).toHaveText(KEY_LABEL);
  await page.clock.runFor(8000);
  expect(await displayRow(page)).toBe('');
  await page.clock.resume();
  // Play is live rather than merely intact: the label gate between a drop and the next take
  // only clears as frames advance.
  await pressUntilInventory(page, 'd', 'EMPTY');
  await pressUntilInventory(page, 't', KEY_LABEL);
  expect(errors).toEqual([]);
});

test('the pickup keys work on a narrow viewport', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ height: 720, width: 420 });
  await bootAt(page, WALK_FROM_LOCAL, FACING_EAST);
  await expect(page.locator('#panel-damocles')).toBeVisible();

  // Walk up to the key, take it and put it down again, all on the ordinary keys.
  const startX = Number(await frame(page).getAttribute('data-x'));
  await holdUntilFrame(page, 'ArrowUp', {
    attribute: 'x',
    comparison: 'above',
    value: startX + 300
  });
  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText(KEY_LABEL, { timeout: 5000 });
  await pressUntilInventory(page, 'd', 'EMPTY');
  expect(await soundCues(page)).toBe('drop:1 take:1');
  expect(errors).toEqual([]);
});

test('Damocles play leaves Targ records untouched', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const targ: Record<string, string> = {
    'mercenary.browser-shell.save.v1.slot-1': 'targ-slot-1',
    'mercenary.browser-shell.session-resume.v1': 'targ-resume'
  };
  await page.addInitScript(seed => {
    for (const [key, value] of Object.entries(seed)) {
      localStorage.setItem(key, value);
    }
  }, targ);
  await bootAt(page, APPROACH_LOCAL);

  await page.keyboard.press('t');
  await expect(inventory(page)).toHaveText(KEY_LABEL);
  expect(await run(page, 'save 1 confirm')).toContain('saved slot 1');
  expect(await run(page, 'load 1')).toContain('restored slot 1');
  await closeConsole(page);
  await pressUntilInventory(page, 'd', 'EMPTY');

  expect(
    await page.evaluate(
      keys => keys.map(key => window.localStorage.getItem(key)),
      Object.keys(targ)
    )
  ).toEqual(Object.values(targ));
  expect(errors).toEqual([]);
});
