import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { SaveSnapshot } from '../src/session/save.ts';
import {
  defaultSettings,
  type DepartureSettings,
  type Settings
} from '../src/settings/index.ts';
import { ArrivalDirector } from '../src/shell/arrival.ts';
import { arrivalFieldPlan } from '../src/shell/arrivalField.ts';
import { OPENING_MILESTONES } from '../src/shell/arrivalScript.ts';
import {
  DESTINATIONS,
  DepartureDirector,
  TARG_DESTINATION,
  departureBodiesFrom,
  departureMotionFor,
  snapResponse,
  type DepartureBody,
  type DepartureMotion,
  type Destination
} from '../src/shell/departure.ts';
import { createWalkabout, requiredSettings } from '../src/shell/session.ts';
import { createTargOrrery, skyStateAt } from '../src/sky/index.ts';
import { comparable } from './fixtures/save.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

const bundle = await loadPayload();
const settingsText = await Bun.file(
  join(repositoryRoot, 'settings.json')
).text();
const settings = requiredSettings(settingsText);
const milestones = OPENING_MILESTONES;

const STEP = 1 / 60;
const SIZE = { height: 800, width: 1280 } as const;
const VIEWPORTS = [
  { height: 200, width: 320 },
  { height: 480, width: 768 },
  { height: 640, width: 1024 },
  SIZE,
  { height: 900, width: 1440 }
] as const;

const sky = skyStateAt(createTargOrrery(settings.presentation.sky), 0);
const bodies = departureBodiesFrom(sky);

/// Abstract entries for exercising the carousel's motion. They are the tests' alone: the app
/// offers exactly the Destinations that exist.
const THREE: readonly Destination[] = [
  { name: 'A', place: 'A', slug: 'a' },
  { name: 'B', place: 'B', slug: 'b' },
  { name: 'C', place: 'c', slug: 'c' }
];

const director = (
  options: {
    readonly bodies?: readonly DepartureBody[];
    readonly destinations?: readonly Destination[];
    readonly entry?: 'carousel' | 'done';
    readonly motion?: DepartureMotion;
    readonly settings?: DepartureSettings;
  } = {}
): DepartureDirector =>
  new DepartureDirector({
    bodies: options.bodies ?? bodies,
    destinations: options.destinations ?? DESTINATIONS,
    entry: options.entry ?? 'carousel',
    motion: options.motion ?? 'full',
    settings: options.settings ?? settings.departure
  });

/// How many discs — roster bodies — one frame of the Departure draws.
const discs = (live: DepartureDirector): number =>
  live.framePlan(SIZE).batches.filter(drawn => drawn.mode === 'triangles')
    .length;

/// Run a committed journey to its end, reporting the phases it passed through.
const journeyed = (live: DepartureDirector): readonly string[] => {
  const phases: string[] = [];
  live.commit();
  for (let step = 0; step < 10_000 && live.isActive(); step += 1) {
    const phase = live.current().kind;
    if (phases.at(-1) !== phase) {
      phases.push(phase);
    }
    live.step(STEP);
  }
  return phases;
};

describe('the Departure', () => {
  test('offers Targ, and only Targ', () => {
    expect(DESTINATIONS).toEqual([TARG_DESTINATION]);
    expect(TARG_DESTINATION.slug).toBe('targ');
  });

  test('begins at the carousel with nothing under way', () => {
    const live = director();

    expect(live.current().kind).toBe('carousel');
    expect(live.isActive()).toBeTrue();
    expect(live.atCarousel()).toBeTrue();
    expect(live.inJourney()).toBeFalse();
    expect(live.selected()).toEqual(TARG_DESTINATION);
    expect(live.journeyProgress()).toBe(0);
  });

  test('has nowhere to turn with one Destination', () => {
    const live = director();
    live.select(1);
    live.select(-1);
    live.step(1);

    expect(live.carouselPosition()).toBe(0);
    expect(live.selected()).toEqual(TARG_DESTINATION);
  });

  test('is already over for a game already under way', () => {
    const live = director({ entry: 'done' });

    expect(live.isActive()).toBeFalse();
    expect(live.framePlan(SIZE)).toEqual(
      arrivalFieldPlan({ drift: 0, planet: 0 }, SIZE)
    );
  });

  test('divides the journey into interstellar run, flyby and convergence', () => {
    const live = director();

    expect(journeyed(live)).toEqual(['interstellar', 'flyby', 'convergence']);
    expect(live.current().kind).toBe('done');
  });

  test('divides the journey 30/40/30', () => {
    const live = director();
    live.commit();
    live.step(2.99);
    expect(live.current().kind).toBe('interstellar');
    live.step(0.02);
    expect(live.current().kind).toBe('flyby');
    live.step(3.98);
    expect(live.current().kind).toBe('flyby');
    live.step(0.02);
    expect(live.current().kind).toBe('convergence');
    live.step(2.98);
    expect(live.current().kind).toBe('convergence');
    live.step(0.02);
    expect(live.current().kind).toBe('done');
  });

  test('takes the journey duration from the settings', () => {
    const brisk = director({
      settings: { ...settings.departure, journeySeconds: 2 }
    });
    brisk.commit();
    brisk.step(2);

    expect(brisk.isActive()).toBeFalse();
  });

  test('runs the shorter reduced-motion journey with the same division', () => {
    expect(departureMotionFor(true)).toBe('reduced');
    expect(departureMotionFor(false)).toBe('full');
    const live = director({ motion: 'reduced' });

    expect(journeyed(live)).toEqual(['interstellar', 'flyby', 'convergence']);
    const timed = director({ motion: 'reduced' });
    timed.commit();
    timed.step(settings.departure.reducedMotionJourneySeconds);
    expect(timed.isActive()).toBeFalse();
  });

  test('converges on the exact planet-free Arrival Field at every viewport size', () => {
    // The handover invariant: the Departure's final frame is the Arrival's first, as a plan and
    // not as a resemblance. Clear colour, batches, colours, every star vertex, counts and size.
    for (const motion of ['full', 'reduced'] as const) {
      const live = director({ motion });
      journeyed(live);
      for (const size of VIEWPORTS) {
        expect(live.framePlan(size)).toEqual(
          arrivalFieldPlan({ drift: 0, planet: 0 }, size)
        );
      }
    }
  });

  test('does not move a star when the Destination is committed', () => {
    const live = director();
    const resting = live.framePlan(SIZE);
    live.commit();
    const leaving = live.framePlan(SIZE);
    const starsOf = (plan: typeof resting) =>
      plan.batches.filter(drawn => drawn.mode === 'points');

    expect(starsOf(leaving)).toEqual(starsOf(resting));
  });

  test('draws the field drifting to rest, never jumping', () => {
    const live = director();
    live.commit();
    let previous = live.framePlan(SIZE);
    while (live.isActive()) {
      live.step(STEP);
      const next = live.framePlan(SIZE);
      const before = previous.batches.find(drawn => drawn.mode === 'points')!;
      const after = next.batches.find(drawn => drawn.mode === 'points')!;
      for (let index = 0; index < before.vertices.length; index += 2) {
        // Wrapped stars re-enter from the far edge; every other star moves a few pixels at most.
        const across = Math.abs(
          after.vertices[index]! - before.vertices[index]!
        );
        expect(Math.min(across, SIZE.width - across)).toBeLessThan(8);
      }
      previous = next;
    }
  });

  test("shows Targ's sun and two moons, and nothing else", () => {
    expect(bodies).toHaveLength(3);
    expect(bodies.map(body => body.colour)).toEqual([
      sky.sun.litColour,
      sky.moons[0].litColour,
      sky.moons[1].litColour
    ]);
    expect(Math.max(...bodies.map(body => body.relativeSize))).toBe(1);
    for (const body of bodies) {
      expect(body.relativeSize).toBeGreaterThan(0);
    }
  });

  test('lays the roster out behind the carousel and sweeps it past during the flyby', () => {
    const live = director();
    expect(discs(live)).toBe(3);
    live.commit();
    live.step(1.5);
    expect(live.current().kind).toBe('interstellar');
    expect(discs(live)).toBe(0);
    live.step(3.5);
    expect(live.current().kind).toBe('flyby');
    expect(discs(live)).toBe(3);
    live.step(3.5);
    expect(live.current().kind).toBe('convergence');
    expect(discs(live)).toBe(0);
  });

  test('cannot be hurried from the carousel', () => {
    const live = director();
    live.skipJourney();

    expect(live.current().kind).toBe('carousel');
    expect(live.isActive()).toBeTrue();
  });

  test('is hurried to the join once the journey is under way', () => {
    const live = director();
    live.commit();
    live.step(1);
    live.skipJourney();

    expect(live.isActive()).toBeFalse();
    expect(live.journeyProgress()).toBe(1);
    expect(live.framePlan(SIZE)).toEqual(
      arrivalFieldPlan({ drift: 0, planet: 0 }, SIZE)
    );
  });

  test('refuses an empty roster of Destinations', () => {
    expect(() => director({ destinations: [] })).toThrow();
  });
});

describe('a fuller carousel', () => {
  test('settles on the next entry with a critically damped snap, without overshoot', () => {
    const live = director({ destinations: THREE });
    live.select(1);
    let previous = 0;
    let seconds = 0;
    while (live.carouselPosition() < 1) {
      live.step(STEP);
      seconds += STEP;
      const position = live.carouselPosition();
      expect(position).toBeGreaterThanOrEqual(previous);
      expect(position).toBeLessThanOrEqual(1);
      previous = position;
    }

    expect(live.carouselPosition()).toBe(1);
    expect(seconds).toBeGreaterThan(settings.departure.snapSeconds - 2 * STEP);
    expect(seconds).toBeLessThan(settings.departure.snapSeconds + 2 * STEP);
    expect(live.selected()).toEqual(THREE[1]!);
  });

  test('has a response that starts at rest and reaches the target exactly', () => {
    expect(snapResponse(0)).toBe(0);
    expect(snapResponse(1)).toBe(1);
    expect(snapResponse(2)).toBe(1);
    // Critically damped: no initial jerk, most of the travel in the first half.
    expect(snapResponse(0.05)).toBeLessThan(0.1);
    expect(snapResponse(0.5)).toBeGreaterThan(0.6);
  });

  test('wraps either way', () => {
    const live = director({ destinations: THREE });
    live.select(-1);
    expect(live.selected()).toEqual(THREE[2]!);
    live.select(1);
    live.select(1);
    live.select(1);
    live.select(1);
    expect(live.selected()).toEqual(THREE[0]!);
  });

  test('retargets immediately when turned mid-snap, from where it is', () => {
    const live = director({ destinations: THREE });
    live.select(1);
    live.step(0.08);
    const moving = live.carouselPosition();
    expect(moving).toBeGreaterThan(0);
    live.select(-1);

    expect(live.carouselPosition()).toBe(moving);
    expect(live.selected()).toEqual(THREE[0]!);
    live.step(1);
    expect(live.carouselPosition()).toBe(0);
  });

  test('finishes the snap before a committed journey leaves', () => {
    const live = director({ destinations: THREE });
    live.select(1);
    live.commit();
    expect(live.current().kind).toBe('carousel');
    live.step(settings.departure.snapSeconds);

    expect(live.current().kind).toBe('interstellar');
    expect(live.selected()).toEqual(THREE[1]!);
  });
});

describe('the Departure composed with the Arrival', () => {
  interface Harness {
    readonly advances: () => number;
    readonly arrival: ArrivalDirector;
    readonly departure: DepartureDirector;
    readonly snapshot: () => SaveSnapshot;
  }

  const harness = (from: Settings = settings): Harness => {
    const walkabout = createWalkabout(bundle, from);
    const session = walkabout.session;
    let advances = 0;
    const arrival = new ArrivalDirector({
      bridge: {
        advance: seconds => {
          advances += 1;
          session.advance(seconds);
        },
        playingMessage: () => session.benson?.activeMessageText
      },
      entry: { kind: 'fresh' },
      milestones,
      pacing: {
        charactersPerSecond:
          from.arrival.charactersPerSecond * from.arrival.timeScale,
        holdSeconds: from.arrival.holdSeconds,
        timeScale: from.arrival.timeScale,
        titleCardSeconds: from.arrival.titleCardSeconds
      }
    });
    return {
      advances: () => advances,
      arrival,
      departure: director({ settings: from.departure }),
      snapshot: () => session.captureSaveSnapshot()
    };
  };

  /// The frame loop's own order: the Departure has every step until it is done, then the Arrival.
  const watched = (live: Harness): void => {
    for (let step = 0; step < 40_000 && live.departure.isActive(); step += 1) {
      live.departure.step(STEP);
    }
    for (let step = 0; step < 40_000 && live.arrival.isActive(); step += 1) {
      live.arrival.step(STEP);
    }
  };

  test('gives the session no time at all before the Arrival begins', () => {
    const live = harness();
    const before = live.snapshot();
    live.departure.commit();
    for (let step = 0; step < 40_000 && live.departure.isActive(); step += 1) {
      live.departure.step(STEP);
    }

    expect(live.advances()).toBe(0);
    expect(comparable(live.snapshot())).toEqual(comparable(before));
    expect(live.arrival.current().kind).toBe('titleCard');
  });

  test('hurried from the journey reaches a game byte-identical to the one watching reaches', () => {
    // The whole claim behind the Skip control, extended from ADR 0032 by composition: the
    // Departure gives the session nothing either way, and the Arrival gives it the same run.
    const watchedRun = harness();
    watchedRun.departure.commit();
    watched(watchedRun);

    const hurried = harness();
    hurried.departure.commit();
    hurried.departure.step(1.5);
    hurried.departure.skipJourney();
    hurried.arrival.skipToJoin();

    expect(hurried.departure.isActive()).toBeFalse();
    expect(hurried.arrival.current().kind).toBe('done');
    expect(hurried.snapshot()).toEqual(watchedRun.snapshot());
  });

  test('hands the Arrival the same session whether the carousel waited or not', () => {
    const prompt = harness();
    prompt.departure.commit();
    watched(prompt);

    const dawdled = harness();
    for (let step = 0; step < 600; step += 1) {
      dawdled.departure.step(STEP);
    }
    dawdled.departure.commit();
    watched(dawdled);

    expect(dawdled.snapshot()).toEqual(prompt.snapshot());
  });

  test('defaults carry the ten-second journey in front of the minute-long Arrival', () => {
    const fresh = defaultSettings().departure;
    expect(fresh.journeySeconds).toBe(10);
    expect(fresh.reducedMotionJourneySeconds).toBe(4);
    expect(fresh.snapSeconds).toBe(0.32);
  });
});
