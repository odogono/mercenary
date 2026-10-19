import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import type { GameplaySession } from '../src/session/index.ts';
import {
  arrivalTunables,
  bensonTunables,
  type Settings
} from '../src/settings/index.ts';
import {
  ArrivalDirector,
  type ArrivalPacing,
  type ArrivalPacingChoice,
  type ArrivalSessionBridge
} from '../src/shell/arrival.ts';
import { ARRIVAL_NARRATION } from '../src/shell/arrivalNarration.ts';
import { OPENING_MILESTONES } from '../src/shell/arrivalScript.ts';
import { createWalkabout, requiredSettings } from '../src/shell/session.ts';
import { comparable } from './fixtures/save.ts';
import { loadPayload, repositoryRoot } from './replay/artifacts.ts';

const bundle = await loadPayload();
const settingsText = await Bun.file(
  join(repositoryRoot, 'settings.json')
).text();
const settings = requiredSettings(settingsText);
const milestones = OPENING_MILESTONES;

const STEP = 1 / 60;

const pacingOf = (from: Settings): ArrivalPacing => ({
  charactersPerSecond:
    from.arrival.charactersPerSecond * from.arrival.timeScale,
  holdSeconds: from.arrival.holdSeconds,
  timeScale: from.arrival.timeScale,
  titleCardSeconds: from.arrival.titleCardSeconds
});

interface Harness {
  readonly director: ArrivalDirector;
  readonly pacingChoices: readonly ArrivalPacingChoice[];
  readonly session: GameplaySession;
}

const harness = (from: Settings = settings): Harness => {
  const walkabout = createWalkabout(bundle, from);
  const session = walkabout.session;
  const pacingChoices: ArrivalPacingChoice[] = [];
  const bridge: ArrivalSessionBridge = {
    advance: seconds => {
      session.advance(seconds);
    },
    playingMessage: () => session.scripts?.activeMessageText,
    setPacing: choice => {
      pacingChoices.push(choice);
      session.scripts!.tunables =
        choice === 'arrival'
          ? arrivalTunables(from, 50)
          : bensonTunables(from, 50);
    }
  };
  return {
    director: new ArrivalDirector({
      bridge,
      entry: { kind: 'fresh' },
      milestones,
      pacing: pacingOf(from)
    }),
    pacingChoices,
    session
  };
};

/// Watch an Arrival through to the join, reporting how long it took and the phases it passed.
const watched = (
  from: Settings = settings
): {
  readonly harness: Harness;
  readonly phases: readonly string[];
  readonly seconds: number;
} => {
  const live = harness(from);
  const phases: string[] = [];
  let seconds = 0;
  for (let step = 0; step < 40_000 && live.director.isActive(); step += 1) {
    const phase = live.director.current().kind;
    if (phases.at(-1) !== phase) {
      phases.push(phase);
    }
    live.director.step(STEP);
    seconds += STEP;
  }
  return { harness: live, phases, seconds };
};

describe('the Arrival', () => {
  test('passes through every state, in order, and stops at the join', () => {
    const run = watched();

    expect(run.phases).toEqual([
      'titleCard',
      'space',
      'planetApproach',
      'descent',
      'blackout',
      'groundVerdict'
    ]);
    expect(run.harness.director.isActive()).toBeFalse();
    expect(run.harness.director.current().kind).toBe('done');
  });

  test('reaches touchdown in about the minute the original takes', () => {
    // The user's measurement of the original release is roughly sixty-five seconds from title
    // card to touchdown. This is a tuning assertion, not a decoded fact: it fails when the
    // settings drift far enough that the opening no longer has the original's rhythm.
    const run = watched();

    expect(run.seconds).toBeGreaterThan(55);
    expect(run.seconds).toBeLessThan(85);
  });

  test('holds the opening unadvanced until the handover', () => {
    // The opening is begun with the session, as it always was, and simply given no time. A
    // Save taken while the field is still up therefore restores a game that still has its
    // opening report to deliver.
    const live = harness();

    expect(live.session.talk!.replaces.has(0)).toBeTrue();
    expect(live.session.talk!.shown).toEqual([]);
    const idleDisplay = live.session.snapshot.bensonMessage;
    expect(idleDisplay?.displayText).toBe(' '.repeat(23));
    expect(idleDisplay?.completedText).toBeUndefined();
    for (let step = 0; step < 60; step += 1) {
      live.director.step(STEP);
    }
    expect(live.director.current().kind).toBe('titleCard');
    expect(live.session.snapshot.bensonMessage?.displayText).toBe(
      ' '.repeat(23)
    );
    expect(live.session.snapshot.bensonMessage?.occurrence).toBe(
      idleDisplay?.occurrence
    );
    expect(live.session.talk!.shown).toEqual([]);
  });

  test('runs the script tail at its own pace and hands the game back at the join', () => {
    const run = watched();

    expect(run.harness.pacingChoices).toEqual(['arrival', 'game']);
  });

  test('holds the player’s keys until the join, ground view included', () => {
    const live = harness();

    expect(live.director.gatesInput()).toBeTrue();
    while (live.director.isActive()) {
      expect(live.director.gatesInput()).toBeTrue();
      live.director.step(STEP);
    }
    expect(live.director.gatesInput()).toBeFalse();
  });

  test('owns the session for as long as it is presenting', () => {
    const live = harness();

    expect(live.director.ownsSession()).toBeTrue();
    live.director.skipToJoin();
    expect(live.director.ownsSession()).toBeFalse();
  });

  test('shows the title card, then the narration, then nothing of its own', () => {
    const live = harness();

    expect(live.director.narrationText()).toBe('M E R C E N A R Y');
    const seen = new Set<string>();
    while (live.director.isActive()) {
      const text = live.director.narrationText();
      if (text !== undefined && text.length > 0) {
        seen.add(text.trim());
      }
      live.director.step(STEP);
    }
    for (const item of ARRIVAL_NARRATION) {
      expect(seen).toContain(item.text);
    }
    expect(live.director.narrationText()).toBeUndefined();
  });

  test('scrolls Arrival Narration into the same 23 cells from the right', () => {
    const live = harness();

    while (live.director.current().kind === 'titleCard') {
      live.director.step(STEP);
    }

    expect(live.director.narrationText()).toBe(' '.repeat(23));
    live.director.step(6 / 50);
    expect(live.director.narrationText()).toBe(' '.repeat(21) + 'NO');
  });

  test('keeps the display cells between Arrival Narration lines', () => {
    const live = harness();
    let firstLineSeen = false;
    let carriedIntoNextLine = false;

    while (live.director.narrationText() !== undefined) {
      const visible = live.director.narrationText()!.trim();
      if (visible === 'NOVADRIVE COUNTDOWN') {
        firstLineSeen = true;
      } else if (firstLineSeen && visible !== '' && visible !== '3') {
        carriedIntoNextLine = true;
      }
      if (visible === '3') {
        break;
      }
      live.director.step(1 / 50);
    }

    expect(carriedIntoNextLine).toBeTrue();
  });

  test('reads asterisks in space and live values from the descent on', () => {
    const live = harness();
    const asterisked = new Set<string>();
    const live_ = new Set<string>();
    while (live.director.isActive()) {
      (live.director.readsAsterisks() ? asterisked : live_).add(
        live.director.current().kind
      );
      live.director.step(STEP);
    }

    expect([...asterisked].sort()).toEqual([
      'planetApproach',
      'space',
      'titleCard'
    ]);
    expect([...live_].sort()).toEqual(['blackout', 'descent', 'groundVerdict']);
  });

  test('falls without ever climbing, and touches down at the pad', () => {
    const live = harness();
    let previous = Number.POSITIVE_INFINITY;
    while (live.director.isActive()) {
      const altitude = live.director.pose().altitude;
      expect(altitude).toBeLessThanOrEqual(previous + 1e-9);
      previous = altitude;
      live.director.step(STEP);
    }

    expect(previous).toBe(0);
  });

  test('grows the planet only on the approach', () => {
    const live = harness();
    let largest = 0;
    while (live.director.isActive()) {
      const planet = live.director.fieldProgress().planet;
      if (live.director.current().kind !== 'planetApproach') {
        expect(planet).toBe(0);
      }
      largest = Math.max(largest, planet);
      live.director.step(STEP);
    }

    expect(largest).toBeGreaterThan(1);
  });

  test('is skipped to a game byte-identical to the one watching reaches', () => {
    // The whole claim behind the skip key. Both sessions are handed the opening script and then
    // the same run of fixed steps, so the state they stop in is the same state — the random
    // landing verdict included.
    const watchedRun = watched();
    const skipped = harness();
    skipped.director.skipToJoin();

    expect(skipped.session.captureSaveSnapshot()).toEqual(
      watchedRun.harness.session.captureSaveSnapshot()
    );
    expect(skipped.director.current().kind).toBe('done');
  });

  test('is skipped without replaying the opening script', () => {
    const skipped = harness();
    skipped.director.skipToJoin();

    expect(skipped.pacingChoices).toEqual(['arrival', 'game']);
  });

  test('leaves a skipped session standing where the game begins', () => {
    const skipped = harness();
    skipped.director.skipToJoin();
    const snapshot = skipped.session.snapshot;

    expect(snapshot.location).toEqual({ kind: 'surface' });
    expect(snapshot.occupancy).toEqual({ kind: 'onFoot' });
    expect(snapshot.player.position).toEqual({
      x: 559_104,
      y: 128,
      z: 559_104
    });
    expect(snapshot.credits).toBe(9000);
    // The status report has begun rather than been read: the join is the moment it starts.
    expect(skipped.session.scripts?.activeMessageText).toBe(
      milestones.statusReport
    );
  });

  test('skipping a finished Arrival does nothing', () => {
    const live = harness();
    live.director.skipToJoin();
    const settled = live.session.captureSaveSnapshot();
    live.director.skipToJoin();

    expect(comparable(live.session.captureSaveSnapshot())).toEqual(
      comparable(settled)
    );
  });

  test('tracks the pacing settings rather than a fixed duration', () => {
    const brisk: Settings = {
      ...settings,
      arrival: {
        ...settings.arrival,
        holdSeconds: settings.arrival.holdSeconds / 4,
        titleCardSeconds: 0.5
      }
    };

    expect(watched(brisk).seconds).toBeLessThan(watched().seconds);
  });
});

describe('an Arrival entered from a restored session', () => {
  test('is over for a game that is not in the opening script', () => {
    expect(
      ArrivalDirector.entryFor(milestones, 'CRASH LANDED ON TARG', true)
    ).toEqual({ kind: 'done' });
    expect(ArrivalDirector.entryFor(milestones, undefined, true)).toEqual({
      kind: 'done'
    });
  });

  test('is over once the status report has begun', () => {
    expect(
      ArrivalDirector.entryFor(milestones, milestones.statusReport, true)
    ).toEqual({ kind: 'done' });
  });

  test('is over for a beat spoken outside the opening script', () => {
    // A landing verdict is the one beat ordinary play could ever repeat, so the program counter
    // has the final say rather than the words.
    expect(
      ArrivalDirector.entryFor(milestones, milestones.verdicts[2], false)
    ).toEqual({ kind: 'done' });
  });

  test('resumes the descent at the beat the script had reached', () => {
    expect(
      ArrivalDirector.entryFor(milestones, milestones.manualControl, true)
    ).toEqual({ beat: 'manualControl', kind: 'resumed' });
  });

  test('resumes mid-tail without replaying the narration', () => {
    const walkabout = createWalkabout(bundle, settings);
    const session = walkabout.session;
    const director = new ArrivalDirector({
      bridge: {
        advance: seconds => {
          session.advance(seconds);
        },
        playingMessage: () => session.scripts?.activeMessageText,
        setPacing: () => {}
      },
      entry: { beat: 'crashImminent', kind: 'resumed' },
      milestones,
      pacing: pacingOf(settings)
    });

    expect(director.current().kind).toBe('descent');
    expect(director.narrationText()).toBeUndefined();
    expect(director.readsAsterisks()).toBeFalse();
    expect(director.pose().altitude).toBe(13_000);

    director.skipToJoin();

    expect(director.current().kind).toBe('done');
  });

  test('resumes a verdict already being read at the ground view', () => {
    const director = new ArrivalDirector({
      bridge: {
        advance: () => {},
        playingMessage: () => undefined,
        setPacing: () => {}
      },
      entry: { beat: 'verdict', kind: 'resumed' },
      milestones,
      pacing: pacingOf(settings)
    });

    expect(director.current().kind).toBe('groundVerdict');
    expect(director.pose().altitude).toBe(0);
  });
});
