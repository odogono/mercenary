import { expect, type Page } from '@playwright/test';

import { catalogue } from './catalogue.ts';
import type { Target } from './ledger.ts';

/// Reading and pressing, in the player's terms. Nothing here writes play.

export const frame = (page: Page) => page.locator('#frame');

export const attribute = async (page: Page, name: string): Promise<string> =>
  (await frame(page).getAttribute(`data-${name}`)) ?? '';

export const field = (page: Page, name: string) =>
  page.locator(`#panel-damocles [data-field=${name}]`);

export const inventoryHead = async (page: Page): Promise<string> =>
  (
    (await page
      .locator('#panel-damocles [data-panel-control=inventory]')
      .textContent()) ?? ''
  ).trim();

export const row = (page: Page): Promise<string> =>
  attribute(page, 'damocles-row');

/// A message record from the Data Payload, trimmed as the published row is.
export const message = async (page: Page, id: string): Promise<string> => {
  const strings = (await (
    await page.request.get('/payload/damocles/strings.json')
  ).json()) as {
    readonly inlineMessages: readonly {
      readonly id: string;
      readonly text: string;
    }[];
  };
  const found = strings.inlineMessages.find(item => item.id === id);
  if (found === undefined) {
    throw new Error(`no message ${id} in the payload`);
  }
  return found.text.trim();
};

/// Wait until the Damocles Display has shown this record. Records scroll in and are held for a
/// few seconds, so the row is polled on the page's own frames rather than read once.
export const rowShows = async (
  page: Page,
  text: string,
  timeoutSeconds = 60
): Promise<void> => {
  const seen = await page.evaluate(
    ({ text, timeout }) =>
      new Promise<boolean>(resolve => {
        const node = document.querySelector<HTMLElement>('#frame')!;
        const deadline = performance.now() + timeout;
        const tick = () => {
          if ((node.dataset['damoclesRow'] ?? '') === text) {
            resolve(true);
          } else if (performance.now() > deadline) {
            resolve(false);
          } else {
            requestAnimationFrame(tick);
          }
        };
        tick();
      }),
    { text, timeout: timeoutSeconds * 1000 }
  );
  if (!seen) {
    throw new Error(
      `the Damocles Display never showed "${text}"; it reads "${await row(page)}"`
    );
  }
};

/// Press a key until a published value says the session took it. Take, drop and board are
/// refused while the inventory label scrolls, so a player presses again.
export const pressUntil = async (
  page: Page,
  key: string,
  done: () => Promise<boolean>,
  what: string,
  timeout = 10_000
): Promise<void> => {
  try {
    await expect
      .poll(
        async () => {
          if (await done()) {
            return true;
          }
          await page.keyboard.press(key);
          await page.waitForTimeout(150);
          return done();
        },
        { intervals: [200], timeout }
      )
      .toBe(true);
  } catch {
    throw new Error(
      `${what}: pressing ${key} never took; inventory "${await inventoryHead(page)}", row "${await row(page)}"`
    );
  }
};

/// Take objects until the one named is at the inventory's head, rotating past others taken on
/// the way, as a player would with the inventory keys.
export const takeUntilHead = async (
  page: Page,
  name: string
): Promise<void> => {
  await pressUntil(
    page,
    't',
    async () => (await inventoryHead(page)) === name,
    `take ${name}`,
    15_000
  ).catch(async error => {
    // Something else may have come to the head first: rotate through what is carried.
    for (let turn = 0; turn < 6; turn += 1) {
      if ((await inventoryHead(page)) === name) {
        return;
      }
      await page.keyboard.press('[');
      await page.waitForTimeout(500);
    }
    throw error;
  });
};

/// Where the player stands, against a step's target: the Body, the island's published area, the
/// Cell Readout, and the Floor.
export const at = async (
  page: Page,
  islandAreas: ReadonlyMap<string, string>
): Promise<Target & { readonly island: string }> => {
  const islandId = await attribute(page, 'island');
  return {
    body: ((await field(page, 'locationName').textContent()) ?? '').trim(),
    cell: ((await field(page, 'locationLabel').textContent()) ?? '').trim(),
    floor: Number(await attribute(page, 'floor')),
    island: islandAreas.get(islandId) ?? islandId
  };
};

/// Every island's id and the area its workspace publishes, for matching a solution's place
/// names against `data-island`.
export const islandAreas = async (
  page: Page
): Promise<ReadonlyMap<string, string>> =>
  new Map(
    (await catalogue(page)).islands.map(island => [
      island.id,
      island.areaName ?? ''
    ])
  );

/// Assert the player stands where the step's target says: the panel's Body name, the island's
/// area, the Cell Readout and the Floor.
export const expectAt = async (
  page: Page,
  areas: ReadonlyMap<string, string>,
  target: Target
): Promise<void> => {
  const here = await at(page, areas);
  const mismatches: string[] = [];
  if (here.body !== target.body) {
    mismatches.push(`body ${here.body}, not ${target.body}`);
  }
  if (target.island !== undefined && here.island !== target.island) {
    mismatches.push(`island ${here.island}, not ${target.island}`);
  }
  if (target.cell !== undefined && here.cell !== target.cell) {
    mismatches.push(`cell ${here.cell}, not ${target.cell}`);
  }
  if (target.floor !== undefined && here.floor !== target.floor) {
    mismatches.push(`floor ${here.floor}, not ${target.floor}`);
  }
  if (mismatches.length > 0) {
    throw new Error(`not at the target: ${mismatches.join('; ')}`);
  }
};
