import { expect, test } from 'bun:test';

import { emptyNarrative } from '../src/dion/script.ts';
import { freshSound, tickSound } from '../src/dion/sound.ts';

test('flight ambient reads the packed exponent and keeps its routine after silence', () => {
  const writes: (readonly [number, number])[] = [];
  const options = {
    onWrite: (r: number, v: number) => writes.push([r, v]),
    speed: 0x12_18_fc
  };
  const sound = tickSound(
    [],
    { ...freshSound(), c: 'ambient' },
    0,
    emptyNarrative().message,
    options
  );
  expect(sound.registers.slice(4, 7)).toEqual([16, 0, 31]);
  expect(sound.registers[10]).toBe(15);
  expect(sound.cLevelLatch).toBe(65_535);
  writes.length = 0;
  const quiet = tickSound([], sound, 0, emptyNarrative().message, {
    ...options,
    speed: 0xff_00_10_00
  });
  expect(quiet.c).toBe('ambient');
  expect(quiet.cLevelLatch).toBe(0);
  expect(writes.filter(([r]) => r === 10)).toEqual([[10, 0]]);
  writes.length = 0;
  tickSound([], quiet, 0, emptyNarrative().message, {
    ...options,
    speed: 0xff_00_10_00
  });
  expect(writes.filter(([r]) => r === 10)).toEqual([]);
});
