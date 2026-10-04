import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';

import { loadTourcraftContent } from '../src/dion/tourcraftContent.ts';
import {
  TourcraftNarrative,
  tourcraftNarrativeContent
} from '../src/dion/tourcraftNarrative.ts';

const promoted = await loadTourcraftContent(async path => {
  const text = readFileSync(new URL(`../..${path}`, import.meta.url), 'utf8');
  return { text, value: JSON.parse(text) };
});
const content = tourcraftNarrativeContent(promoted);
const idle = () => {
  const vm = new TourcraftNarrative(content);
  for (let i = 0; i < 10_000; i++) {
    vm.tick();
    if (i % 11 === 10) {
      vm.frame();
    }
  }
  expect(vm.state.flags[6]).toBe(false);
  return vm;
};

test('preserves all 39 pilot requests with the frame-139 reentry', () => {
  const vm = idle();
  expect(vm.start(0x29)).toBe(true);
  const requests: number[] = [];
  let returned = 0;
  for (let frame = 2; frame <= 750; frame++) {
    for (let tick = 0; tick < 11; tick++) {
      vm.tick();
    }
    const serial = vm.state.message.serial;
    vm.frame();
    if (frame === 139) {
      vm.frame();
    }
    if (vm.state.message.serial !== serial) {
      requests.push(frame);
    }
    if (!vm.state.flags[6] && returned === 0) {
      returned = frame;
    }
  }
  expect(requests).toHaveLength(39);
  expect([requests[0], requests[7], requests.at(-2), requests.at(-1)]).toEqual([
    16, 152, 715, 737
  ]);
  expect(returned).toBe(744);
});

test('queues a threshold ahead of a signed direct continuation without resetting the return stack', () => {
  const vm = idle();
  vm.start(0x29);
  const stack = [...vm.state.stack];
  expect(vm.start(0x77)).toBe(false);
  expect(vm.state.queued).toBe(0x77);
  expect(new Map(vm.state.availabilityBytes).get(0x77)).toBe(160);
  expect(vm.state.stack).toEqual(stack);
  vm.state = { ...vm.state, timedTarget: 0x7_5a_16, timerBits: 0 };
  vm.tick();
  expect(vm.state.timerBits).toBe(65_535);
  vm.top(32_400);
  expect(vm.state.timedTarget).toBe(0x7_5a_16);
});
