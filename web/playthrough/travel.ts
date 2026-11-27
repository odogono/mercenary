import { expect, type Page } from '@playwright/test';

import { flyTo, takeOff } from './flight.ts';
import { entrance, liftCar } from './planner.ts';
import { attribute, pressUntil } from './session.ts';
import {
  SteeringError,
  floorRegions,
  local,
  structureOrigin,
  walkTo,
  type Point
} from './steering.ts';

/// Getting about Damocles as a player does: by air to a building's entrance, in through its
/// door, up or down its lift, and back to the craft.

/// The Floor key a lift takes: G for Floor 0, B for Floor 10, the digit otherwise.
const floorKey = (floor: number): string =>
  floor === 0 ? 'g' : floor === 10 ? 'b' : String(floor);

/// Ride the structure's lift to `floor` from wherever the player stands on the current Floor.
export const rideTo = async (
  page: Page,
  instance: string,
  floor: number
): Promise<void> => {
  if (Number(await attribute(page, 'floor')) === floor) {
    return;
  }
  const regions = await floorRegions(
    page,
    instance,
    Number(await attribute(page, 'floor'))
  );
  const car = liftCar(regions);
  if (car === null) {
    throw new SteeringError(`${instance} has no lift car on this Floor`);
  }
  await walkTo(page, instance, car, 'the lift car', 40);
  await pressUntil(
    page,
    floorKey(floor),
    async () =>
      Number(await attribute(page, 'floor')) === floor ||
      (await attribute(page, 'ride-destination')) === String(floor),
    `ride to Floor ${floor}`
  );
  await expect(page.locator('#frame')).toHaveAttribute(
    'data-floor',
    String(floor),
    { timeout: 60_000 }
  );
};

/// A structure's entrance on its ground Floor, in world units, a little way outside the door.
export const entranceOf = async (
  page: Page,
  instance: string,
  distance = 600
): Promise<Point> => {
  const regions = await floorRegions(page, instance, 0);
  const outside = entrance(regions, distance);
  if (outside === null) {
    throw new SteeringError(`${instance} publishes no door to the outside`);
  }
  return local(await structureOrigin(page, instance), outside);
};

/// A structure-local point just outside its door, for walking out.
export const doorOutside = async (
  page: Page,
  instance: string
): Promise<Point> => {
  const outside = entrance(await floorRegions(page, instance, 0), 200);
  if (outside === null) {
    throw new SteeringError(`${instance} publishes no door to the outside`);
  }
  return outside;
};

/// Where the craft was left, so the player can walk back to it.
export interface Parked {
  readonly at: Point;
  readonly craft: string;
}

/// Aboard a craft, fly to a structure's entrance and land there. Resolves on foot beside it.
export const flyToEntrance = async (
  page: Page,
  instance: string,
  options: { readonly crossSeam?: boolean } = {}
): Promise<Parked> => {
  const craft = await attribute(page, 'occupancy');
  if (craft === '') {
    throw new SteeringError('not aboard a craft');
  }
  if (Number(await attribute(page, 'y')) < 5000) {
    await takeOff(page);
  }
  await flyTo(page, await entranceOf(page, instance), instance, options);
  // Landed at the door: the session must have bound the structure, or nothing there can be
  // entered, whatever the readouts say.
  await expect(
    page.locator('#frame'),
    `landed at ${instance}'s door, but the session binds no structure there`
  ).toHaveAttribute('data-structure-instance', instance, { timeout: 10_000 });
  return {
    at: {
      x: Number(await attribute(page, 'x')),
      z: Number(await attribute(page, 'z'))
    },
    craft
  };
};

/// Walk back to a parked craft and board it. From inside a structure, `from`, the walk first leaves
/// by its door through the region boxes, since a straight line to the craft can cross a wall.
export const reboard = async (
  page: Page,
  parked: Parked,
  from?: string
): Promise<void> => {
  if (from !== undefined) {
    await walkTo(
      page,
      from,
      await doorOutside(page, from),
      `out of ${from}`,
      60
    );
  }
  await walkTo(page, null, parked.at, 'the parked craft', 150);
  await pressUntil(
    page,
    'b',
    async () => (await attribute(page, 'occupancy')) === parked.craft,
    `board ${parked.craft}`
  );
};
