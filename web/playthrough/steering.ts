import type { Page } from '@playwright/test';

import { instance as catalogueInstance } from './catalogue.ts';
import { entrance, planRoute, type RegionBox } from './planner.ts';

/// Steering a Damocles session by the player's own controls, from what the page publishes.
///
/// Every helper here presses keys and reads `#frame`; none reaches into the session. The loops
/// run in the page, on its own frames, because a browser round trip per correction would carry a
/// held key well past the point it should have been released.

/// A failure the harness itself caused, as opposed to one the session caused: the steering could
/// not get there, which says nothing yet about whether a player could. The ledger classes it as a
/// harness gap.
/// A Body's surface wraps at 4,096 cells of 65,536 units (`SURFACE_CELLS`, `world.ts`), and the
/// published position does not wrap, so every difference is taken the short way round.
export const SURFACE_UNITS = 4096 * 65_536;

export const wrapSurface = (delta: number): number =>
  ((((delta + SURFACE_UNITS / 2) % SURFACE_UNITS) + SURFACE_UNITS) %
    SURFACE_UNITS) -
  SURFACE_UNITS / 2;

export class SteeringError extends Error {
  override name = 'SteeringError';
}

export interface Point {
  readonly x: number;
  readonly z: number;
}

/// Where a structure's local offsets are measured from, in Body Coordinates scaled to the
/// session's world units.
export const structureOrigin = async (
  page: Page,
  instance: string
): Promise<Point> => {
  const position = (await catalogueInstance(page, instance))?.location
    ?.position;
  if (position === undefined) {
    throw new SteeringError(`no recovered location for ${instance}`);
  }
  return { x: position[0]! * 65_536, z: position[2]! * 65_536 };
};

export const local = (origin: Point, offset: Point): Point => ({
  x: origin.x + offset.x,
  z: origin.z + offset.z
});

export interface Leg {
  /// What the leg is for, so a stuck report names it.
  readonly name: string;
  /// How close counts as arrived.
  readonly radius: number;
  /// Where to stop, in world units.
  readonly to: Point;
}

export interface SteerOptions {
  /// `walk` holds Up to move and turns with Left and Right. `drive` sets the throttle with a digit,
  /// slower as the leg closes, turns on the stick, and shuts the throttle on arrival.
  readonly mode: 'drive' | 'walk';
  /// A leg that has not closed this much distance in `stallSeconds` has stalled.
  readonly progress?: number;
  readonly stallSeconds?: number;
  /// The highest throttle digit the drive may use.
  readonly throttle?: number;
  readonly timeoutSeconds?: number;
  /// End the moment the published Body changes, releasing every key: a Transporter's hop, after
  /// which the legs' points are on another Body. Reaching the last leg without it is an error.
  untilBodyChanges?: boolean;
}

/// Steer through each leg in turn. The published heading is the bearing of forward travel,
/// `atan2(dx, dz)`, and Right increases it (`web/src/onFoot/index.ts`, `walk`).
export const steer = async (
  page: Page,
  legs: readonly Leg[],
  options: SteerOptions
): Promise<void> => {
  const outcome = await page.evaluate(
    async ({ legs, options, surface }) => {
      const frame = document.querySelector<HTMLElement>('#frame')!;
      const read = () => ({
        heading: Number(frame.dataset['heading']),
        x: Number(frame.dataset['x']),
        z: Number(frame.dataset['z'])
      });
      const held = new Set<string>();
      const key = (code: string, down: boolean) => {
        if (down === held.has(code)) {
          return;
        }
        if (down) {
          held.add(code);
        } else {
          held.delete(code);
        }
        const name = code.startsWith('Digit') ? code.slice(5) : code;
        window.dispatchEvent(
          new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: name })
        );
      };
      const releaseAll = () => {
        for (const code of held) {
          key(code, false);
        }
      };
      // eslint-disable-next-line unicorn/consistent-function-scoping -- runs in the page, which sees no outer scope
      const nextFrame = () =>
        new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const wrapUnits = (delta: number) =>
        ((((delta + surface / 2) % surface) + surface) % surface) - surface / 2;
      // eslint-disable-next-line unicorn/consistent-function-scoping -- runs in the page, which sees no outer scope
      const wrap = (angle: number) =>
        Math.atan2(Math.sin(angle), Math.cos(angle));

      const progress = options.progress ?? 60;
      const stallMs = (options.stallSeconds ?? 6) * 1000;
      const deadline =
        performance.now() + (options.timeoutSeconds ?? 240) * 1000;
      const driving = options.mode === 'drive';
      const top = options.throttle ?? 9;
      const startBody = frame.dataset['body'];

      let setting = 0;
      let turning: 'left' | 'right' | null = null;
      for (const leg of legs) {
        let best = Infinity;
        let bestAt = performance.now();
        for (;;) {
          await nextFrame();
          if (options.untilBodyChanges && frame.dataset['body'] !== startBody) {
            releaseAll();
            return { at: read() };
          }
          const now = read();
          const dx = wrapUnits(leg.to.x - now.x);
          const dz = wrapUnits(leg.to.z - now.z);
          const distance = Math.hypot(dx, dz);
          if (distance <= leg.radius) {
            break;
          }
          if (performance.now() > deadline) {
            releaseAll();
            return {
              at: now,
              error: `timed out on leg "${leg.name}" ${Math.round(distance)} short`
            };
          }
          if (distance < best - progress) {
            best = distance;
            bestAt = performance.now();
          } else if (performance.now() - bestAt > stallMs) {
            releaseAll();
            if (driving) {
              key('Space', true);
              key('Space', false);
            }
            return {
              at: now,
              error: `stalled on leg "${leg.name}" ${Math.round(distance)} short`
            };
          }

          const want = Math.atan2(dx, dz);
          const error = wrap(want - now.heading);
          // Near a half turn the sign of the error flips with every frame's noise; once a turn has
          // a direction, it keeps it until the error is clearly on one side.
          const turnRight: boolean =
            turning !== null && Math.abs(error) > 2.6
              ? turning === 'right'
              : error > 0;
          const tolerance = Math.max(
            0.04,
            Math.atan2(leg.radius / 2, distance)
          );
          if (Math.abs(error) > tolerance) {
            turning = turnRight ? 'right' : 'left';
            key(turnRight ? 'ArrowRight' : 'ArrowLeft', true);
            key(turnRight ? 'ArrowLeft' : 'ArrowRight', false);
          } else {
            turning = null;
            key('ArrowRight', false);
            key('ArrowLeft', false);
          }
          // Close in, only a tight heading moves forward, or a walk would circle the point.
          const aligned =
            Math.abs(error) <
            Math.max(0.12, Math.min(0.5, Math.atan2(leg.radius * 2, distance)));
          if (!aligned) {
            // Turning where it stands makes no progress, and is not a stall.
            bestAt = performance.now();
          }
          if (driving) {
            // Far out, the top setting; closing in, slower, so the glide after the throttle shuts
            // does not carry the craft past; badly misaligned, stopped to turn where it stands.
            const wanted = !aligned
              ? 0
              : Math.min(
                  top,
                  distance > 8000
                    ? 9
                    : distance > 2500
                      ? 5
                      : distance > 800
                        ? 3
                        : 1
                );
            if (wanted !== setting) {
              const code = wanted === 0 ? 'Space' : `Digit${wanted}`;
              key(code, true);
              key(code, false);
              setting = wanted;
            }
          } else {
            key('ArrowUp', aligned);
          }
        }
        releaseAll();
      }
      if (driving) {
        key('Space', true);
        key('Space', false);
      }
      releaseAll();
      if (options.untilBodyChanges) {
        return { at: read(), error: 'reached the last leg on the same Body' };
      }
      return { at: read() };
    },
    { legs, options, surface: SURFACE_UNITS }
  );
  if ('error' in outcome && outcome.error !== undefined) {
    throw new SteeringError(
      `${outcome.error}${outcome.at === undefined ? '' : ` at ${Math.round(outcome.at.x)}, ${Math.round(outcome.at.z)}`}`
    );
  }
};

export interface StructureModel {
  readonly levelBinding?: {
    readonly floors: readonly {
      readonly drawnStructureId?: string;
      readonly level: number;
      readonly structureId: string;
    }[];
  };
  readonly storeyHeight?: number;
  readonly structureSelection?: { readonly regions: readonly RegionBox[] };
}

export const model = async (page: Page, id: string): Promise<StructureModel> =>
  (
    (await (
      await page.request.get(`/payload/damocles/models/${id}.json`)
    ).json()) as { readonly model: StructureModel }
  ).model;

/// The region boxes of a structure on the Floor the player stands on: a structure with a Floor
/// Table binds a separate structure per Floor.
export const floorRegions = async (
  page: Page,
  instance: string,
  floor: number
): Promise<readonly RegionBox[]> => {
  const own = (await catalogueInstance(page, instance))?.model;
  if (own === undefined) {
    throw new SteeringError(`no instance ${instance}`);
  }
  const record = await model(page, own);
  // As the session binds a Floor (`session.ts`, `floorPlacement`; `world.ts`, `floorModelId`):
  // Floor 0 is the instance's own model, and any other Floor the model its Floor Table names,
  // in the instance's frame where the extractor publishes one.
  const bound =
    floor === 0
      ? undefined
      : record.levelBinding?.floors.find(item => item.level === floor);
  if (floor !== 0 && bound === undefined) {
    throw new SteeringError(`${instance} binds no Floor ${floor}`);
  }
  const regions = (
    bound === undefined
      ? record
      : await model(page, bound.drawnStructureId ?? bound.structureId)
  ).structureSelection?.regions;
  if (regions === undefined) {
    throw new SteeringError(
      `${instance} publishes no regions for Floor ${floor}`
    );
  }
  return regions;
};

/// Walk to a point. With a structure, the point is structure-local and the route comes from the
/// structure's region boxes on the current Floor; from outside every region (a landing out on
/// the island) the walk first goes straight to the structure's door. Without one, the point is a
/// world point and the walk goes straight there.
export const walkTo = async (
  page: Page,
  instance: string | null,
  target: Point,
  name: string,
  radius = 40
): Promise<void> => {
  if (instance === null) {
    await steer(page, [{ name, radius, to: target }], { mode: 'walk' });
    return;
  }
  const origin = await structureOrigin(page, instance);
  const here = async () => {
    const at = await page.locator('#frame').evaluate(node => ({
      floor: Number(node.dataset['floor']),
      x: Number(node.dataset['x']),
      z: Number(node.dataset['z'])
    }));
    return {
      ...at,
      x: wrapSurface(at.x - origin.x),
      z: wrapSurface(at.z - origin.z)
    };
  };
  let start = await here();
  const regions = await floorRegions(page, instance, start.floor);
  let route = planRoute(regions, start, target);
  if (route === null) {
    const door = entrance(regions, 300);
    if (door !== null) {
      await steer(
        page,
        [{ name: `${name}, the door`, radius: 80, to: local(origin, door) }],
        { mode: 'walk' }
      );
      start = await here();
      route = planRoute(regions, start, target);
    }
  }
  if (route === null) {
    throw new SteeringError(
      `no route through ${instance}'s regions on Floor ${start.floor} to ${name}`
    );
  }
  await steer(
    page,
    route.map((point, index) => ({
      name:
        index === route.length - 1 ? name : `${name}, waypoint ${index + 1}`,
      radius: index === route.length - 1 ? radius : 25,
      to: local(origin, point)
    })),
    { mode: 'walk' }
  );
};
