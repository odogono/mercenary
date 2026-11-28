import { expect, type Page } from '@playwright/test';

import { instance } from './catalogue.ts';
import type { Chapter } from './ledger.ts';
import {
  attribute,
  inventoryHead,
  pressUntil,
  row,
  takeUntilHead
} from './session.ts';
import { walkTo, type Point } from './steering.ts';
import { doorOutside, rideTo, type Parked } from './travel.ts';

/// Handling objects as a player does: finding a resident, rotating the Carried Stack, switching a
/// NOVA TRIGGER on from the centre box and dropping it.

/// A resident's recovered placement inside its parent, structure-local.
export const placement = async (page: Page, slot: number): Promise<Point> => {
  const position = (await instance(page, `object-slot-${slot}`))?.placement
    ?.position;
  if (position === undefined) {
    throw new Error(`object-slot-${slot} has no recovered placement`);
  }
  return { x: position[0]!, z: position[2]! };
};

const centreBox = (page: Page) =>
  page.locator('#panel-damocles [data-panel-control=centre]');

/// The four detonators' bits of `$7872`: a switch row's index halved is its bit
/// (`headCommands.ts`, `SWITCH_ROWS`, `switchBit`).
const TRIGGER_BITS = { 1: 0x08, 2: 0x10, 3: 0x20, 4: 0x40 } as const;

/// Open the head on the centre box, check it is the named NOVA TRIGGER, and switch it on: its own
/// bit of `$7872` must be set.
export const switchOn = async (
  page: Page,
  trigger: 1 | 2 | 3 | 4
): Promise<void> => {
  await page.keyboard.press('Enter');
  await expect(centreBox(page)).toHaveAttribute(
    'data-panel',
    `NOVA TRIGGER ${trigger}`,
    { timeout: 10_000 }
  );
  // The centre box ignores the Head Commands while it is still opening.
  await expect(page.locator('#frame')).toHaveAttribute(
    'data-centre-box-steps',
    '0',
    { timeout: 10_000 }
  );
  // `.` is the laptop's keypad `+`: on.
  await pressUntil(
    page,
    '.',
    async () => (await centreBox(page).getAttribute('data-item')) === 'ON',
    'switch it on'
  );
  await expect
    .poll(
      async () =>
        Number.parseInt(await attribute(page, 'switches'), 16) &
        TRIGGER_BITS[trigger]
    )
    .toBe(TRIGGER_BITS[trigger]);
  await page.keyboard.press('Enter');
};

/// Rotate the Carried Stack until its head starts with `name`, as a player would with `[`.
export const rotateTo = async (page: Page, name: string): Promise<void> => {
  await pressUntil(
    page,
    '[',
    async () => (await inventoryHead(page)).startsWith(name),
    `rotate ${name} to the head`
  );
};

/// Drop the head where the player stands; on NO ROOM, carry it outside the structure and drop it
/// there, as a player would, noting the refusal.
export const dropHere = async (
  page: Page,
  chapter: Chapter,
  instance: string,
  name: string
): Promise<void> => {
  const dropped = async () => (await inventoryHead(page)) !== name;
  try {
    await pressUntil(page, 'd', dropped, `drop ${name}`, 4000);
    return;
  } catch {
    const refusal = await row(page);
    // The frame publishes the region's index; a region's number is one more.
    const region = Number(await attribute(page, 'region')) + 1;
    chapter.note(
      `Dropping ${name} inside ${instance} (region ${region}) is refused${refusal === '' ? '' : ` with "${refusal}"`}; dropped outside instead.`
    );
  }
  await walkTo(page, instance, await doorOutside(page, instance), 'outside');
  await pressUntil(page, 'd', dropped, `drop ${name} outside`);
};

const EAGLE = 'object-slot-3';

/// Out of `from` by its door, drop the carried EAGLE NINE S E there and board it.
export const boardFromCarried = async (
  page: Page,
  from: string
): Promise<void> => {
  await rideTo(page, from, 0);
  await walkTo(page, from, await doorOutside(page, from), 'outside', 60);
  await rotateTo(page, 'EAGLE NINE S E');
  await pressUntil(
    page,
    'd',
    async () => (await inventoryHead(page)) !== 'EAGLE NINE S E',
    'drop the Eagle'
  );
  await pressUntil(
    page,
    'b',
    async () => (await attribute(page, 'occupancy')) === EAGLE,
    'board the Eagle'
  );
};

/// Beside the parked Eagle, take it again: the ANTIGRAV makes a craft takeable
/// (docs/research/damocles-carry-capacity.md).
export const takeTheEagle = async (
  page: Page,
  parked: Parked
): Promise<void> => {
  await walkTo(page, null, parked.at, 'beside the Eagle', 150);
  await takeUntilHead(page, 'EAGLE NINE S E');
};
