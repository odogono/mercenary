import type { Page } from '@playwright/test';

import { SURFACE_UNITS, SteeringError, type Point } from './steering.ts';

/// Flying a Damocles craft to a point on the Body and setting it down there, by the throttle
/// digits, the stick and Space, from what `#frame` publishes.
///
/// What the steering relies on was measured, not assumed: aboard, a throttle digit sets the
/// speed at once and each digit roughly doubles it (9 cruises at about 2.6 million units a
/// second); Space stops the craft where it is and it hovers; Down raises the nose and Up lowers
/// it, and the pitch holds when released; Right banks right, and the bank turns the heading
/// while it lasts; any touch of the ground is a landing that puts the player on foot.

export interface FlightOptions {
  /// Take bearings the short way round the wrapping surface, as a player would (the default),
  /// or never cross the seam, keeping to the unwrapped coordinates the Catalogue places
  /// Instances at.
  readonly crossSeam?: boolean;
  /// Height to cruise at, in world units. The craft is faster the higher it flies, and reaches
  /// its top speed only above about 2.6 million (measured).
  readonly cruise?: number;
  /// How close above the point counts as arrived before the descent.
  readonly radius?: number;
  readonly timeoutSeconds?: number;
}

/// Fly from wherever the craft is, aboard, to `to`, and land there. Resolves on foot.
export const flyTo = async (
  page: Page,
  to: Point,
  name: string,
  options: FlightOptions = {}
): Promise<void> => {
  const outcome = await page.evaluate(
    async ({ name, options, surface, to }) => {
      const frame = document.querySelector<HTMLElement>('#frame')!;
      const read = () => ({
        aboard: (frame.dataset['occupancy'] ?? '') !== '',
        heading: Number(frame.dataset['heading']),
        pitch: Number(frame.dataset['pitch']),
        roll: Number(frame.dataset['roll']),
        x: Number(frame.dataset['x']),
        y: Number(frame.dataset['y']),
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
      const tap = (code: string) => {
        key(code, true);
        key(code, false);
      };
      const releaseAll = () => {
        for (const code of held) {
          key(code, false);
        }
      };
      // eslint-disable-next-line unicorn/consistent-function-scoping -- runs in the page, which sees no outer scope
      const nextFrame = () =>
        new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      // eslint-disable-next-line unicorn/consistent-function-scoping -- runs in the page, which sees no outer scope
      const wrapAngle = (angle: number) =>
        Math.atan2(Math.sin(angle), Math.cos(angle));
      const wrapUnits = (delta: number) =>
        options.crossSeam === false
          ? delta
          : ((((delta + surface / 2) % surface) + surface) % surface) -
            surface / 2;
      // eslint-disable-next-line unicorn/consistent-function-scoping -- runs in the page, which sees no outer scope
      const clamp = (value: number, limit: number) =>
        Math.max(-limit, Math.min(limit, value));
      // Hold one of a pair of keys to bring a value to a target, or neither once within reach.
      const towards = (
        value: number,
        target: number,
        tolerance: number,
        raise: string,
        lower: string
      ) => {
        key(raise, value < target - tolerance);
        key(lower, value > target + tolerance);
      };

      const cruise = options.cruise ?? 3_000_000;
      const radius = options.radius ?? 2000;
      const deadline =
        performance.now() + (options.timeoutSeconds ?? 300) * 1000;
      let setting = -1;
      let sampledAt = 0;
      const trace: string[] = [];
      let phase: 'cruise' | 'descend' | 'nose-down' = 'cruise';
      const throttle = (digit: number) => {
        if (digit !== setting) {
          tap(digit === 0 ? 'Space' : `Digit${digit}`);
          setting = digit;
        }
      };
      if (!read().aboard) {
        return { error: 'not aboard a craft' };
      }
      for (;;) {
        await nextFrame();
        const now = read();
        if (!now.aboard) {
          releaseAll();
          return {
            landed: {
              off: Math.hypot(wrapUnits(to.x - now.x), wrapUnits(to.z - now.z)),
              x: now.x,
              z: now.z
            }
          };
        }
        if (performance.now() > deadline) {
          releaseAll();
          return {
            at: now,
            error: `timed out flying to ${name} in phase ${phase}; last: ${trace.slice(-8).join(' | ')}`
          };
        }
        const dx = wrapUnits(to.x - now.x);
        const dz = wrapUnits(to.z - now.z);
        const distance = Math.hypot(dx, dz);
        if (phase === 'cruise') {
          if (distance < radius) {
            throttle(0);
            key('ArrowLeft', false);
            key('ArrowRight', false);
            phase = 'nose-down';
            continue;
          }
          // Low on the approach, so the vertical descent has little height to drift over.
          const height = distance < 1_500_000 ? 40_000 : cruise;
          // Level to climb or sink towards the height, gentler as it closes.
          towards(
            now.pitch,
            clamp((height - now.y) / 200_000, 0.5),
            0.03,
            'ArrowDown',
            'ArrowUp'
          );
          // Bank to turn: the turn rate follows the bank, so the bank is asked of the error.
          const error = wrapAngle(Math.atan2(dx, dz) - now.heading);
          towards(
            now.roll,
            clamp(error * 0.2, 0.12),
            0.01,
            'ArrowRight',
            'ArrowLeft'
          );
          // Slower as it closes, and slow while turning hard, so it does not circle the point.
          // Slower as it closes, and slow while the heading is well off: the turn rate follows the
          // bank, not the speed, so a fast craft turns on a circle wider than the distance left.
          const off = Math.abs(error);
          const bySpeed =
            distance > 6_000_000
              ? 9
              : distance > 1_500_000
                ? 7
                : distance > 300_000
                  ? 5
                  : distance > 60_000
                    ? 3
                    : 2;
          throttle(off > 1 ? 2 : off > 0.3 ? Math.min(bySpeed, 4) : bySpeed);
          if (performance.now() - sampledAt > 2000) {
            sampledAt = performance.now();
            trace.push(
              `${Math.round(distance / 1000)}k e${error.toFixed(2)} r${now.roll.toFixed(2)} p${now.pitch.toFixed(2)} y${Math.round(now.y / 1000)}k t${setting}`
            );
          }
        } else if (phase === 'nose-down') {
          key('ArrowRight', false);
          key('ArrowLeft', false);
          key('ArrowUp', now.pitch > -1.53);
          if (now.pitch <= -1.53) {
            key('ArrowUp', false);
            phase = 'descend';
          }
        } else {
          throttle(now.y > 5000 ? 6 : 3);
          if (performance.now() - sampledAt > 2000) {
            sampledAt = performance.now();
            trace.push(`descend y${Math.round(now.y)} t${setting}`);
          }
        }
      }
    },
    { name, options, surface: SURFACE_UNITS, to }
  );
  if ('error' in outcome) {
    throw new SteeringError(
      `${outcome.error}${outcome.at === undefined ? '' : ` at ${Math.round(outcome.at.x)}, ${Math.round(outcome.at.y)}, ${Math.round(outcome.at.z)}`}`
    );
  }
  // A touchdown anywhere is a landing, so one short of the point is the steering's failure, not
  // an arrival: what is checked next would be checked in the wrong place.
  const tolerance = (options.radius ?? 2000) + 6000;
  if (outcome.landed.off > tolerance) {
    throw new SteeringError(
      `touched down ${Math.round(outcome.landed.off)} short of ${name}, beyond the ${tolerance} the landing allows`
    );
  }
};

/// Climb off the ground aboard: throttle up and raise the nose until airborne.
export const takeOff = async (page: Page): Promise<void> => {
  await page.keyboard.press('9');
  await page.keyboard.down('ArrowDown');
  try {
    await page.waitForFunction(
      () =>
        Number(document.querySelector<HTMLElement>('#frame')!.dataset['y']) >
        5000,
      undefined,
      { timeout: 30_000 }
    );
  } catch {
    throw new SteeringError('the craft did not leave the ground');
  } finally {
    await page.keyboard.up('ArrowDown');
  }
};
