import { expect, test } from 'bun:test';

import { createDionBoardProgram } from '../src/soundboard/dionProgram.ts';
import { dionContent } from './dion-documents.ts';

const peak = (samples: Float32Array): number =>
  Math.max(...samples.map(Math.abs));

test('the board runs Dion lift-off into the engine, and reset stops the driver as well as the chip', async () => {
  const program = createDionBoardProgram((await dionContent()).sound, 48_000);
  program.apply({ cue: 'lift_off', kind: 'cue' });
  for (let tick = 0; tick < 70; tick += 1) {
    program.tick!.run();
    program.chip.render(960);
  }
  expect(peak(program.chip.render(960))).toBeGreaterThan(0.01);
  program.reset({ kind: 'reset' });
  for (let tick = 0; tick < 70; tick += 1) {
    program.tick!.run();
    expect(peak(program.chip.render(960))).toBe(0);
  }
});

test('the board expires set-down and message tones, and retriggers identical key clicks', async () => {
  const program = createDionBoardProgram((await dionContent()).sound, 48_000);
  for (const command of [
    { cue: 'taxi_set_down', kind: 'cue' },
    { kind: 'message', text: 'A'.repeat(48) }
  ] as const) {
    program.reset({ kind: 'reset' });
    program.apply(command);
    program.tick!.run();
    expect(peak(program.chip.render(960))).toBeGreaterThan(0.01);
    for (let tick = 0; tick < 100; tick += 1) {
      program.tick!.run();
      program.chip.render(960);
    }
    expect(peak(program.chip.render(960))).toBeLessThan(1e-4);
  }
  for (let click = 0; click < 2; click += 1) {
    program.apply({ cue: 'key_click', kind: 'cue' });
    program.tick!.run();
    expect(peak(program.chip.render(960))).toBeGreaterThan(0.01);
    for (let tick = 0; tick < 70; tick += 1) {
      program.tick!.run();
      program.chip.render(960);
    }
  }
});
