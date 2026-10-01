import { expect, test } from 'bun:test';

import { emptyNarrative } from '../src/dion/script.ts';
import { freshSound, requestSound, tickSound } from '../src/dion/sound.ts';
import { dionContent } from './dion-documents.ts';

const peak = (samples: Float32Array): number =>
  Math.max(...samples.map(Math.abs));

test('runs the recovered level streams and continuation on channel C, key click on B', async () => {
  const content = await dionContent();
  const message = emptyNarrative().message;
  let sound = requestSound(freshSound(), 'key_click');
  sound = tickSound(content.sound, sound, 0, message);
  expect(sound.registers[2]).toBe(96);
  expect(sound.registers[9]).toBe(31);
  expect(sound.registers[13]).toBe(9);
  sound = requestSound(sound, 'lift_off');
  for (let tick = 0; tick < 41; tick += 1) {
    sound = tickSound(content.sound, sound, 0, message);
  }
  expect(sound.c).toBe('lift_off');
  sound = tickSound(content.sound, sound, 0, message);
  expect(sound.c).toBe('engine');
  sound = tickSound(content.sound, sound, 0, message);
  expect(sound.registers[10]).toBe(10);
  sound = requestSound(sound, 'taxi_set_down');
  for (let tick = 0; tick < 56; tick += 1) {
    sound = tickSound(content.sound, sound, 0, message);
  }
  expect(sound.c).toBeNull();
  expect(sound.registers[10]).toBe(0);
});
test('message tone reads 0,2,3,4,6,7… as eight columns consume six-pixel glyphs', async () => {
  const content = await dionContent();
  let sound = freshSound();
  const periods: number[] = [];
  for (let age = 1; age <= 6; age += 1) {
    sound = tickSound(content.sound, sound, 0, {
      ...emptyNarrative().message,
      age,
      busy: true,
      text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUV'
    });
    periods.push(sound.registers[0]! + sound.registers[1]! * 256);
  }
  expect(periods).toEqual(
    ['A', 'C', 'D', 'E', 'G', 'H'].map(c => c.charCodeAt(0) * 4)
  );
});

test('runs the door loop at long elapsed times and continues to silent METIS ambient', async () => {
  const content = await dionContent();
  const message = emptyNarrative().message;
  let sound = requestSound(freshSound(), 'door_moving');
  sound = tickSound(content.sound, sound, 0, message);
  sound = tickSound(
    content.sound,
    { ...sound, elapsed: 1_000_000_000 },
    0,
    message
  );
  expect(sound.registers[10]).toBeGreaterThan(0);
  sound = requestSound(sound, 'door_stop');
  for (let i = 0; i < 5; i += 1) {
    sound = tickSound(content.sound, sound, 0, message);
  }
  expect(sound.c).toBe('ambient');
  sound = tickSound(content.sound, sound, 0, message);
  expect(sound.registers[10]).toBe(0);
});

test('restores audible continuous registers without replaying an expired B click', async () => {
  const { createDionChip } = await import('../src/dion/soundChip.ts');
  const content = await dionContent();
  const message = emptyNarrative().message;
  const click = tickSound(
    content.sound,
    requestSound(freshSound(), 'key_click'),
    0,
    message
  );
  const program = createDionChip(48_000);
  program.reset({ kind: 'reset', state: { ...click, clickAge: 255 } });
  expect(peak(program.chip.render(960))).toBe(0);
  program.apply({ kind: 'registers', registers: [[13, 9]] });
  expect(peak(program.chip.render(960))).toBeGreaterThan(0);
  let engine = requestSound(freshSound(), 'engine');
  engine = tickSound(content.sound, engine, 0, message);
  program.reset({ kind: 'reset', state: engine });
  expect(peak(program.chip.render(960))).toBeGreaterThan(0);
});
