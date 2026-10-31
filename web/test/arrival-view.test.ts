import { describe, expect, test } from 'bun:test';

import { REFERENCE_OPENING_POSITION } from '../src/gameCore/index.ts';
import type { SessionSnapshot } from '../src/session/index.ts';
import {
  ARRIVAL_TUNING,
  arrivalCruisePose,
  arrivalPose,
  descentViewSnapshot,
  fallAltitude,
  planetCoverage,
  profileFloor,
  profileRate,
  profileSecondsAt
} from '../src/shell/arrivalCamera.ts';
import {
  ARRIVAL_FIELD_SEED,
  ARRIVAL_FIELD_STARS,
  arrivalBlackoutPlan,
  arrivalFieldPlan
} from '../src/shell/arrivalField.ts';
import {
  ARRIVAL_NARRATION,
  PLANET_APPROACH_LINE
} from '../src/shell/arrivalNarration.ts';

const SIZE = { height: 800, width: 1280 } as const;

describe("the Arrival's camera", () => {
  test('follows the altimeter the recording shows', () => {
    // Read off the Atari ST recording at quarter-second steps before impact (#943).
    for (const [seconds, reading] of [
      [7, 92_127],
      [5, 24_435],
      [3.25, 8867],
      [1.25, 1811],
      [0, 0]
    ] as const) {
      expect(Math.abs(fallAltitude(seconds) - reading)).toBeLessThan(
        reading * 0.12 + 300
      );
    }
  });

  test('pins every beat of the commentary to the curve, the verdict at impact', () => {
    expect(profileSecondsAt('crashImminent')).toBe(11.5);
    const returning = profileSecondsAt('returningTo')!;
    const manual = profileSecondsAt('manualControl')!;
    expect(returning).toBeLessThan(11.5);
    expect(manual).toBeLessThan(returning);
    expect(profileSecondsAt('verdict')).toBe(0);
    expect(profileSecondsAt('statusReport')).toBeUndefined();
    // Each beat holds the fall at the next one's place, so a late line never lets it run ahead.
    expect(profileFloor(undefined)).toBe(11.5);
    expect(profileFloor('crashImminent')).toBe(returning);
    expect(profileFloor('returningTo')).toBe(manual);
    expect(profileFloor('manualControl')).toBe(0);
    expect(profileRate('crashImminent')).toBeCloseTo(11.5 / 17.4, 12);
  });

  test('grows Targ from a dot to more than the screen across the approach', () => {
    const { planetAppears, surface } = ARRIVAL_TUNING.profile;
    expect(planetCoverage(fallAltitude(planetAppears))).toBeLessThan(0.05);
    expect(planetCoverage(fallAltitude(surface))).toBeCloseTo(
      ARRIVAL_TUNING.planetAtSurface,
      9
    );
    // It creeps and then rushes: the second half of the approach does most of the growing.
    const middle = (planetAppears + surface) / 2;
    expect(planetCoverage(fallAltitude(middle))).toBeLessThan(0.25);
  });

  test('is level in space, and looks straight down while it falls', () => {
    const cruising = arrivalCruisePose(1_000_000);
    expect(cruising.pitch).toBe(0);
    expect(cruising.roll).toBe(0);
    expect(cruising.altitude).toBe(1_000_000);

    const falling = arrivalPose(5000, 0);
    expect(falling.pitch).toBeLessThan(-Math.PI / 2 + 0.01);
    expect(falling.pitch).toBeGreaterThan(-Math.PI / 2);
    expect(falling.heading).toBe(Math.PI);
    expect(falling.roll).toBe(0);
  });

  test('turns the ground clockwise at a steady rate, the compass holding', () => {
    const rate = ARRIVAL_TUNING.spinRadiansPerSecond;
    expect(arrivalPose(5000, 1).roll).toBeCloseTo(rate, 12);
    expect(arrivalPose(5000, 1).heading).toBe(Math.PI);
    for (const seconds of [3, 7.5, 40]) {
      expect(Math.abs(arrivalPose(5000, seconds).roll)).toBeLessThanOrEqual(
        Math.PI
      );
    }
  });

  test('replaces the Pose and nothing else in the Snapshot it draws', () => {
    const snapshot = {
      credits: 9000,
      elapsed: 12,
      location: { kind: 'surface' },
      player: {
        heading: 3,
        pitch: 0,
        position: { x: 1, y: 2, z: 3 },
        roll: 0,
        speed: 9,
        yawVelocity: 1
      }
    } as unknown as SessionSnapshot;
    const pose = arrivalPose(5000, 2);
    const seen = descentViewSnapshot(snapshot, pose);

    expect(seen.player.position).toEqual({
      x: REFERENCE_OPENING_POSITION.x,
      y:
        REFERENCE_OPENING_POSITION.y +
        5000 * ARRIVAL_TUNING.cameraHeightPerAltimeterUnit,
      z: REFERENCE_OPENING_POSITION.z
    });
    expect(seen.player.pitch).toBe(pose.pitch);
    expect(seen.player.heading).toBe(Math.PI);
    expect(seen.credits).toBe(9000);
    expect(seen.elapsed).toBe(12);
    expect(seen.location).toEqual({ kind: 'surface' });
  });

  test('lands on the spot the game itself opens on', () => {
    const landed = descentViewSnapshot(
      { player: {} } as unknown as SessionSnapshot,
      arrivalPose(0, 40)
    );

    expect(landed.player.position).toEqual(REFERENCE_OPENING_POSITION);
    expect(landed.player.heading).toBe(Math.PI);
  });
});

describe('the Arrival Field', () => {
  test('is the same field every time it is drawn', () => {
    expect(arrivalFieldPlan({ drift: 0.5, planet: 0 }, SIZE)).toEqual(
      arrivalFieldPlan({ drift: 0.5, planet: 0 }, SIZE)
    );
  });

  test('is its own field rather than one of the other three', () => {
    // 1985 is the Star Sphere's seed; sharing it would make two fields that must be able to
    // change independently move together.
    expect(ARRIVAL_FIELD_SEED).not.toBe(1985);
    expect(ARRIVAL_FIELD_STARS).not.toBe(21);
  });

  test('draws its stars on a dark sky, in their own inks, with no wireframe at all', () => {
    const plan = arrivalFieldPlan({ drift: 0, planet: 0 }, SIZE);
    const drawn = plan.batches.reduce(
      (count, batch) => count + batch.vertices.length / 2,
      0
    );

    // Recreated by eye from the release screenshot: a very dark navy rather than black, and
    // stars in more than one colour.
    expect(plan.clear).not.toEqual({ blue: 0, green: 0, red: 0 });
    expect(new Set(plan.batches.map(batch => batch.mode))).toEqual(
      new Set(['points'])
    );
    expect(plan.batches.length).toBeGreaterThan(1);
    expect(drawn).toBe(ARRIVAL_FIELD_STARS);
    expect(plan.points).toBe(ARRIVAL_FIELD_STARS);
    expect(plan.lines).toBe(0);
    expect(plan.batches.every(batch => batch.pointSize === 1)).toBeTrue();
  });

  test('keeps every star inside the frame as the field drifts', () => {
    for (const drift of [0, 0.25, 0.5, 0.75, 1]) {
      for (const stars of arrivalFieldPlan({ drift, planet: 0 }, SIZE)
        .batches) {
        for (const [index, value] of stars.vertices.entries()) {
          const bound = index % 2 === 0 ? SIZE.width : SIZE.height;
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(bound);
        }
      }
    }
  });

  test('grows the planet out of the middle of the field', () => {
    const small = arrivalFieldPlan({ drift: 1, planet: 0.1 }, SIZE);
    const large = arrivalFieldPlan({ drift: 1, planet: 1.5 }, SIZE);
    const spread = (plan: typeof small): number => {
      const disc = plan.batches.at(-1)!.vertices;
      let widest = 0;
      for (let index = 0; index < disc.length; index += 2) {
        widest = Math.max(widest, Math.abs(disc[index]! - SIZE.width / 2));
      }
      return widest;
    };

    expect(small.batches.at(-1)!.mode).toBe('triangles');
    expect(spread(large)).toBeGreaterThan(spread(small));
  });

  test('blacks the frame out completely at impact', () => {
    const plan = arrivalBlackoutPlan(SIZE);

    expect(plan.batches).toEqual([]);
    expect(plan.clear).toEqual({ blue: 0, green: 0, red: 0 });
    expect(plan.sky).toBeUndefined();
  });
});

describe('the Arrival Narration', () => {
  test('is the original opening, in order, up to the script’s own first word', () => {
    expect(ARRIVAL_NARRATION[0]!.text).toBe('NOVADRIVE COUNTDOWN');
    expect(ARRIVAL_NARRATION.at(-1)!.text).toBe('MAXIMUM REVERSE THRUST');
    expect(ARRIVAL_NARRATION).toHaveLength(17);
  });

  test('shows Targ once the Novadrive cannot be corrected', () => {
    expect(ARRIVAL_NARRATION[PLANET_APPROACH_LINE]!.text).toBe(
      'UNABLE TO CORRECT'
    );
  });
});
