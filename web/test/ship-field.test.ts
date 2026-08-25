import { describe, expect, test } from 'bun:test';

import { InterstellarShipField } from '../src/session/shipField.ts';
import { loadPayload } from './replay/artifacts.ts';

/// The Interstellar Ship Field, stepped from the decode rather than from an
/// impression of what a starfield does.
///
/// `notes/decode/escape-starfield.md` is the authority for every number here.
/// The field is Session State rather than presentation because the phase-255
/// write comes out of its own colour sequence, and because a Save taken during
/// the terminal presentation has to continue it exactly.

const bundle = await loadPayload();
const rules = bundle.endgame.endingPresentation.interstellarShipField;

/// A seed of no significance: the field is never seeded by the Reference Build,
/// so any two bytes stand in for whatever random history preceded the Ending.
const SEED = { state: 0x9d, value: 0x2a } as const;

const begun = (): InterstellarShipField =>
  InterstellarShipField.begin(rules, SEED);

/// Step to just before a loop, so a test can watch the loop itself.
const stepTo = (field: InterstellarShipField, loops: number): void => {
  for (let loop = 0; loop < loops; loop++) {
    field.step(1);
  }
};

describe('the field as it comes up', () => {
  test('shows all 21 slots on the first visible loop', () => {
    const field = begun();

    // Entry primes a negative depth, so every slot fails the depth test on the
    // first update pass and respawns. Nothing partially primed is ever shown.
    expect(field.points).toHaveLength(rules.pointSlots.count);
    expect(field.points).toHaveLength(21);
  });

  test('projects every point inside the Reference Viewport', () => {
    const field = begun();
    stepTo(field, 40);

    for (const point of field.points) {
      expect(point.x).toBeGreaterThanOrEqual(
        rules.projection.horizontal.range[0]
      );
      expect(point.x).toBeLessThan(rules.projection.horizontal.range[1]);
      expect(point.y).toBeGreaterThanOrEqual(
        rules.projection.vertical.range[0]
      );
      expect(point.y).toBeLessThan(rules.projection.vertical.range[1]);
    }
  });

  test('applies the first colour pair on entry', () => {
    const first = rules.colours.events[0];
    expect(begun().colourPair).toEqual({
      line: first?.lineColour ?? -1,
      screen: first?.screenColour ?? -1
    });
  });

  test('keeps its slots stable rather than reordering them', () => {
    const field = begun();
    const before = field.points.length;
    stepTo(field, 200);
    expect(field.points).toHaveLength(before);
  });
});

describe('the colour sequence and the phase it writes', () => {
  test('holds the first pair for the entry delay, then steps every three', () => {
    const field = begun();
    const [first, second] = rules.colours.events;

    stepTo(field, rules.colours.entryDelayLoops - 1);
    expect(field.colourPair).toEqual({
      line: first?.lineColour ?? -1,
      screen: first?.screenColour ?? -1
    });

    field.step(1);
    expect(field.colourPair).toEqual({
      line: second?.lineColour ?? -1,
      screen: second?.screenColour ?? -1
    });
  });

  test('writes 255 on the loop the decode names, and not before', () => {
    const field = begun();
    let written: number | undefined;
    for (let loop = 1; loop < rules.colours.completedPhaseLoop; loop++) {
      written = field.step(1).phaseWrite ?? written;
    }
    expect(written).toBeUndefined();

    expect(field.step(1).phaseWrite).toBe(255);
  });

  test('stays on the last pair and rewrites 255 every three loops', () => {
    const field = begun();
    stepTo(field, rules.colours.completedPhaseLoop);
    const last = rules.colours.events.at(-1);
    const settled = {
      line: last?.lineColour ?? -1,
      screen: last?.screenColour ?? -1
    };
    expect(field.colourPair).toEqual(settled);

    // The index has nowhere left to go, so every later expiry reapplies the
    // same pair and writes the same phase.
    const writes: number[] = [];
    for (let loop = 0; loop < rules.colours.repeatFinalEveryLoops * 4; loop++) {
      const written = field.step(255).phaseWrite;
      if (written !== undefined) {
        writes.push(written);
      }
      expect(field.colourPair).toEqual(settled);
    }
    expect(writes).toEqual([255, 255, 255, 255]);
  });
});

describe('how the points move', () => {
  test('closes the scripted phase at the decoded depth delta', () => {
    const field = begun();
    const slots = Array.from({ length: rules.pointSlots.count }, (_, slot) =>
      field.depthOf(slot)
    );
    field.step(1);

    // A slot that respawned this loop has a new depth entirely; every slot that
    // did not has closed by exactly the decoded delta.
    const closed = slots
      .map((before, slot) => field.depthOf(slot) - before)
      .filter(moved => moved === rules.motion.scriptedPhaseDepthDelta);
    expect(closed.length).toBeGreaterThan(0);
    expect(field.depthDelta).toBe(rules.motion.scriptedPhaseDepthDelta);
  });

  test('accelerates once the phase has matured, then stops climbing', () => {
    const field = begun();
    expect(field.depthDelta).toBe(rules.motion.scriptedPhaseDepthDelta);

    field.step(255);
    expect(field.depthDelta).toBeCloseTo(
      rules.motion.scriptedPhaseDepthDelta *
        rules.motion.maturePhaseFirstMultiplier,
      6
    );

    field.step(255);
    expect(field.depthDelta).toBeCloseTo(
      rules.motion.scriptedPhaseDepthDelta *
        rules.motion.maturePhaseFirstMultiplier *
        rules.motion.maturePhaseLaterMultiplier,
      6
    );

    // It climbs until the delta's own exponent byte reaches the decoded stop,
    // and then holds there however long the loop runs.
    for (let loop = 0; loop < 400; loop++) {
      field.step(255);
    }
    const settled = field.depthDelta;
    field.step(255);
    expect(field.depthDelta).toBe(settled);
    expect(Math.abs(settled)).toBeGreaterThanOrEqual(512);
    expect(Math.abs(settled)).toBeLessThan(1024);
  });

  test('respawns a point rather than letting it pass behind the eye', () => {
    const field = begun();
    // Long enough that every slot has been through the depth test many times.
    for (let loop = 0; loop < 600; loop++) {
      field.step(255);
      for (const point of field.points) {
        expect(Number.isInteger(point.x)).toBeTrue();
        expect(Number.isInteger(point.y)).toBeTrue();
      }
    }
  });

  test('spends seven draws on a respawn and couples X to Y', () => {
    const field = begun();
    const drawn = field.respawnedFrom({ carryIn: 1, ...SEED });
    expect(drawn.draws).toBe(rules.respawn.randomDraws);
    expect(drawn.draws).toBe(7);

    // Z is the seventh draw on the decoded grid.
    expect(drawn.z).toBeGreaterThanOrEqual(rules.respawn.z.range[0]);
    expect(drawn.z).toBeLessThanOrEqual(rules.respawn.z.range[1]);
    expect((drawn.z - rules.respawn.z.range[0]) % rules.respawn.z.step).toBe(0);

    // X and Y span the same signed range.
    for (const axis of [drawn.x, drawn.y]) {
      expect(axis).toBeGreaterThanOrEqual(rules.respawn.x.range[0]);
      expect(axis).toBeLessThanOrEqual(rules.respawn.x.range[1]);
    }

    // The coupling: Y's low byte is the residue X's first draw left behind, so
    // the two coordinates are not independent.
    expect(drawn.x & 0xff).toBe(drawn.y & 0xff);
  });
});

describe('continuing a field that was interrupted', () => {
  test('restores mid-sequence and steps on identically', () => {
    const original = begun();
    stepTo(original, 137);

    const revived = InterstellarShipField.restore(
      rules,
      original.captureSaveSnapshot()
    );
    expect(revived.points).toEqual(original.points);
    expect(revived.colourPair).toEqual(original.colourPair);
    expect(revived.depthDelta).toBe(original.depthDelta);

    for (let loop = 0; loop < 50; loop++) {
      expect(revived.step(255)).toEqual(original.step(255));
      expect(revived.points).toEqual(original.points);
      expect(revived.colourPair).toEqual(original.colourPair);
    }
  });

  test('two fields begun from one seed are the same field', () => {
    const left = begun();
    const right = begun();
    for (let loop = 0; loop < 120; loop++) {
      left.step(1);
      right.step(1);
    }
    expect(right.points).toEqual(left.points);
    expect(right.captureSaveSnapshot()).toEqual(left.captureSaveSnapshot());
  });

  test('a different random history is a different field', () => {
    const other = InterstellarShipField.begin(rules, {
      state: 0x9d,
      value: 0x2b
    });
    const first = begun();
    stepTo(first, 20);
    stepTo(other, 20);
    expect(other.points).not.toEqual(first.points);
  });
});
