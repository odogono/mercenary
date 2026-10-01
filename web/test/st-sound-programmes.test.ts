import { expect, test } from 'bun:test';

import { DamoclesPsgDriver } from '../src/damocles/psg.ts';
import { emptyNarrative } from '../src/dion/script.ts';
import { freshSound, requestSound, tickSound } from '../src/dion/sound.ts';
import { dionContent } from './dion-documents.ts';

test('Damocles and Dion share the reset registers, key click and running door programmes', async () => {
  const content = await dionContent();
  const driver = new DamoclesPsgDriver();
  const registers = Array<number>(14).fill(0);
  const sink = {
    write: (register: number, value: number) => {
      registers[register] = value;
    }
  };
  driver.powerOn(sink);
  let sound = freshSound();
  expect(sound.registers).toEqual(registers);
  const message = emptyNarrative().message;
  for (const [damocles, dion, ticks] of [
    ['take', 'key_click', 2],
    ['door-start', 'door_moving', 101],
    ['door-stop', 'door_stop', 2],
    ['door-start', 'door_moving', 7],
    ['door-stop', 'door_stop', 4]
  ] as const) {
    driver.request(damocles, sink);
    sound = requestSound(sound, dion);
    for (let tick = 0; tick < ticks; tick += 1) {
      driver.vbl(sink);
      sound = tickSound(content.sound, sound, 0, message);
      expect(sound.registers).toEqual(registers);
    }
  }
});

test('the engines and message pitch retain their recovered title differences', async () => {
  const content = await dionContent();
  const driver = new DamoclesPsgDriver();
  const registers = Array<number>(14).fill(0);
  const sink = {
    write: (register: number, value: number) => {
      registers[register] = value;
    }
  };
  driver.powerOn(sink);
  driver.request('restore', sink);
  driver.setSpeedExponent(4);
  driver.showMessage('A'.repeat(48));
  driver.vbl(sink);
  driver.vbl(sink);
  const sound = tickSound(
    content.sound,
    requestSound(freshSound(), 'engine'),
    0,
    { ...emptyNarrative().message, age: 1, busy: true, text: 'A'.repeat(48) }
  );
  expect(registers[10]).toBe(4);
  expect(sound.registers[10]).toBe(10);
  expect(registers[4]! + registers[5]! * 256).toBe(16);
  expect(sound.registers[4]! + sound.registers[5]! * 256).toBe(2044);
  expect(registers[0]).toBe('A'.charCodeAt(0) * 2);
  expect(sound.registers[0]! + sound.registers[1]! * 256).toBe(
    'A'.charCodeAt(0) * 4
  );
});
