import { describe, expect, test } from 'bun:test';

import { REFERENCE_OPENING_POSITION } from '../src/gameCore/index.ts';
import type { SessionSnapshot } from '../src/session/index.ts';
import {
  ARRIVAL_TUNING,
  altitudeAt,
  arrivalCruisePose,
  arrivalPose,
  chasedAltitude,
  descentViewSnapshot
} from '../src/shell/arrivalCamera.ts';
import {
  ARRIVAL_FIELD_SEED,
  ARRIVAL_FIELD_STARS,
  arrivalBlackoutPlan,
  arrivalFieldPlan
} from '../src/shell/arrivalField.ts';
import {
  ARRIVAL_NARRATION,
  DESCENT_LINE,
  PLANET_APPROACH_LINE
} from '../src/shell/arrivalNarration.ts';

const SIZE = { height: 800, width: 1280 } as const;

describe("the Arrival's camera", () => {
  test('anchors each beat of the commentary to a height', () => {
    expect(altitudeAt('crashImminent')).toBe(13_000);
    expect(altitudeAt('returningTo')).toBe(6500);
    expect(altitudeAt('manualControl')).toBe(3250);
    expect(altitudeAt('verdict')).toBe(0);
    expect(altitudeAt('statusReport')).toBeUndefined();
  });

  test('closes on the next anchor without ever passing it', () => {
    let altitude: number = ARRIVAL_TUNING.entryAltitude;
    for (let step = 0; step < 3600; step += 1) {
      const next = chasedAltitude(altitude, undefined, 1 / 60);
      expect(next).toBeLessThanOrEqual(altitude);
      expect(next).toBeGreaterThanOrEqual(
        ARRIVAL_TUNING.altitudes.crashImminent
      );
      altitude = next;
    }
    // A segment that runs long keeps closing rather than stopping short of its anchor.
    expect(altitude).toBeCloseTo(ARRIVAL_TUNING.altitudes.crashImminent, 5);
  });

  test('plunges nose-down and squares up with the ground', () => {
    expect(arrivalPose(ARRIVAL_TUNING.entryAltitude, 0).pitch).toBe(
      ARRIVAL_TUNING.plungePitch
    );
    expect(arrivalPose(ARRIVAL_TUNING.levelAltitude, 0).pitch).toBe(
      ARRIVAL_TUNING.plungePitch
    );
    // The dive stays inside the range the decoded projection draws a horizon for, or the fall
    // would be a plunge through an empty sky.
    expect(Math.abs(ARRIVAL_TUNING.plungePitch)).toBeLessThan(Math.PI / 4);
    expect(arrivalPose(0, 30).pitch).toBe(0);
    expect(arrivalPose(0, 30).roll).toBe(0);
    expect(arrivalPose(0, 30).heading).toBe(0);
  });

  test('is level while the ship is still under way', () => {
    // The original's ELEVATION drum reads zero through the whole space segment: the ship is
    // cruising, not falling.
    const cruising = arrivalCruisePose(82_000);

    expect(cruising.pitch).toBe(0);
    expect(cruising.roll).toBe(0);
    expect(cruising.altitude).toBe(82_000);
  });

  test('tumbles in the middle of the fall and nowhere else', () => {
    // Still in space, still on the ground; the roll belongs to the fall between them.
    expect(arrivalPose(ARRIVAL_TUNING.entryAltitude, 4).roll).toBe(0);
    const falling = Math.abs(arrivalPose(20_000, 4).roll);
    expect(falling).toBeGreaterThan(0);
    expect(falling).toBeLessThanOrEqual(ARRIVAL_TUNING.rollAmplitude);
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
      y: REFERENCE_OPENING_POSITION.y + 5000,
      z: REFERENCE_OPENING_POSITION.z
    });
    expect(seen.player.pitch).toBe(pose.pitch);
    expect(seen.player.heading).toBe(0);
    expect(seen.credits).toBe(9000);
    expect(seen.elapsed).toBe(12);
    expect(seen.location).toEqual({ kind: 'surface' });
  });

  test('arrives at the pose the game itself opens on', () => {
    const landed = descentViewSnapshot(
      { player: {} } as unknown as SessionSnapshot,
      arrivalPose(0, 40)
    );

    expect(landed.player.position).toEqual(REFERENCE_OPENING_POSITION);
    expect(landed.player.heading).toBe(0);
    expect(landed.player.pitch).toBe(0);
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

  test('turns the view over to Targ after the Novadrive comes off', () => {
    expect(ARRIVAL_NARRATION[PLANET_APPROACH_LINE]!.text).toBe(
      'DISENGAGING NOVADRIVE'
    );
    expect(ARRIVAL_NARRATION[DESCENT_LINE]!.text).toBe('UNABLE TO CORRECT');
    expect(DESCENT_LINE).toBeGreaterThan(PLANET_APPROACH_LINE);
  });
});
