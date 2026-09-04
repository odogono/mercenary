import { describe, expect, test } from 'bun:test';

import { BensonProgram } from '../src/benson/index.ts';
import {
  resolveScript00Milestones,
  script00BeatOf
} from '../src/shell/arrivalScript.ts';
import { TextTable } from '../src/text/index.ts';
import { loadPayload } from './replay/artifacts.ts';

const bundle = await loadPayload();
const program = BensonProgram.fromDocument(bundle.benson!);
const text = new TextTable(bundle.text!);
const milestones = resolveScript00Milestones(program, text);

describe("the opening script's beats, resolved from the payload", () => {
  test('are the commentary the decode notes record', () => {
    expect(milestones.crashImminent).toBe('CRASH IMMINENT,');
    expect(milestones.returningTo).toBe('RETURNING TO - - -');
    expect(milestones.manualControl).toBe('MANUAL CONTROL');
    expect(milestones.statusReport).toBe('STATUS REPORT');
  });

  test('retains the recovered leading display cells separately from transcript text', () => {
    const instruction = program.instructions.find(
      candidate =>
        candidate.op === 'msg' &&
        text.compose(candidate.tokens) === milestones.statusReport
    );
    expect(instruction?.op).toBe('msg');
    if (instruction?.op !== 'msg') {
      throw new Error('the status report instruction is missing');
    }
    expect(text.composeForDisplay(instruction.tokens)).toBe(
      '      STATUS REPORT'
    );
  });

  test('include all four landing verdicts in table order', () => {
    expect(milestones.verdicts).toEqual([
      'WHERE AM I',
      'YOU CRASHED',
      'GOOD LANDING,',
      'OUCH,'
    ]);
  });

  test('classify each beat, and nothing else', () => {
    expect(script00BeatOf(milestones, 'CRASH IMMINENT,')).toBe('crashImminent');
    expect(script00BeatOf(milestones, 'RETURNING TO - - -')).toBe(
      'returningTo'
    );
    expect(script00BeatOf(milestones, 'MANUAL CONTROL')).toBe('manualControl');
    expect(script00BeatOf(milestones, 'STATUS REPORT')).toBe('statusReport');
    for (const verdict of milestones.verdicts) {
      expect(script00BeatOf(milestones, verdict)).toBe('verdict');
    }
    expect(script00BeatOf(milestones, 'CRASH LANDED ON TARG')).toBeUndefined();
    expect(script00BeatOf(milestones, undefined)).toBeUndefined();
  });

  test('are the only messages in the payload that say what they say', () => {
    // A later script repeating a beat's wording would make a restored session enter the
    // Arrival by mistake, so the payload is asked rather than assumed.
    const beats = new Set([
      milestones.crashImminent,
      milestones.manualControl,
      milestones.returningTo,
      milestones.statusReport
    ]);
    const played = program.instructions.flatMap(instruction =>
      instruction.op === 'msg' ? [text.compose(instruction.tokens)] : []
    );
    for (const beat of beats) {
      expect(played.filter(spoken => spoken === beat)).toHaveLength(1);
    }
  });

  test('refuse a payload whose opening no longer has this shape', () => {
    const truncated = new BensonProgram(
      program.instructions.slice(0, 12),
      program.entries,
      program.decimalSeeds,
      program.framesPerTick
    );

    expect(() => resolveScript00Milestones(truncated, text)).toThrow(
      'the opening Benson Script'
    );
  });
});
