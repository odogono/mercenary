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

for (const [id, entry] of [
  [0x1c, 0x7_54_67],
  [0x73, 0x7_46_8b],
  [0x18, 0x7_62_43]
] as const) {
  test(`pickup script $${id.toString(16)} launches and consumes its availability`, () => {
    const vm = idle();
    expect(vm.start(id)).toBe(true);
    expect(vm.state.pc).toBe(entry);
    expect(new Map(vm.state.availabilityBytes).get(id)).toBe(0x20);
    vm.frame();
  });
}

const run = (vm: TourcraftNarrative, count: number) => {
  for (let frame = 0; frame < count; frame++) {
    for (let tick = 0; tick < 11; tick++) {
      vm.tick();
    }
    vm.top(0);
    vm.frame();
  }
};

test('CHILD without candidacy closes without changing the poll or arming a timer', () => {
  const vm = idle();
  vm.start(0x1c);
  run(vm, 30);
  expect(vm.state.flags[6]).toBe(false);
  expect(vm.state.poll).toEqual([0x27, 0x73]);
  expect(vm.state.timedTarget).toBeNull();
});

test('CHILD candidacy runs both native BCD adjustments and its timed continuations', () => {
  const vm = new TourcraftNarrative(content, undefined, slot => slot === 216);
  run(vm, 900);
  const flags = [...vm.state.flags];
  flags[10] = true;
  vm.state = { ...vm.state, flags };
  vm.start(0x1c);
  run(vm, 200);
  expect(vm.state.poll).toEqual([0x31, 0x69]);
  expect(vm.state.timedTarget).toBe(0x7_54_9e);
  run(vm, 450);
  expect(vm.state.poll).toEqual([0x16, 0x84]);
  expect(vm.state.timedTarget).toBeNull();
  expect(vm.state.flags[6]).toBe(false);
});

test('PCB continues and repeats while held, then its due continuation stops after Drop', () => {
  let held = true;
  const vm = new TourcraftNarrative(
    content,
    undefined,
    slot => slot === 218 && held
  );
  run(vm, 900);
  vm.start(0x73);
  run(vm, 700);
  expect(vm.state.timedTarget).toBe(0x7_47_01);
  const serial = vm.state.message.serial;
  run(vm, 300);
  expect(vm.state.message.serial).toBeGreaterThan(serial);
  expect(vm.state.timedTarget).toBe(0x7_47_01);
  held = false;
  run(vm, 350);
  expect(vm.state.timedTarget).toBeNull();
  expect(vm.state.flags[6]).toBe(false);
});

for (const president of [false, true]) {
  test(`ORE completes the ${president ? 'president' : 'default'} departure branch and admits mining's changed future`, () => {
    const vm = idle();
    const flags = [...vm.state.flags];
    flags[23] = president;
    vm.state = { ...vm.state, flags };
    vm.start(0x18);
    run(vm, 400);
    expect(vm.state.flags[6]).toBe(false);
    expect(vm.state.flags[21]).toBe(true);
    expect(vm.state.flags[22]).toBe(true);
    expect(new Map(vm.state.availabilityBytes).get(5)).toBe(0);
    expect(new Map(vm.state.availabilityBytes).get(6)).toBe(0);
    expect(vm.drainEffects()).toEqual([{ kind: 'modelSwapB' }]);
    vm.start(0x13);
    run(vm, 600);
    expect(vm.state.flags[6]).toBe(false);
  });
}

test('pickup queue replaces an earlier request, and unavailable pickups never queue', () => {
  const vm = idle();
  vm.start(0x29);
  expect(vm.start(0x1c)).toBe(false);
  expect(vm.state.queued).toBe(0x1c);
  expect(vm.start(0x18)).toBe(false);
  expect(vm.state.queued).toBe(0x18);
  const bytes = new Map(vm.state.availabilityBytes);
  bytes.set(0x73, 0x20);
  vm.state = { ...vm.state, availabilityBytes: [...bytes] };
  vm.start(0x73);
  expect(vm.state.queued).toBe(0x18);
  run(vm, 1200);
  expect(new Map(vm.state.availabilityBytes).get(0x1c)).toBe(0xa0);
  expect(new Map(vm.state.availabilityBytes).get(0x18)).toBe(0x20);
  expect(vm.state.flags[22]).toBe(true);
});

test('poll messages read the adjusted BCD bytes, including native upper and lower clamps', () => {
  const vm = idle();
  vm.state = { ...vm.state, pc: 0x7_54_92, poll: [0x98, 0x02] };
  vm.frame();
  expect(vm.state.poll).toEqual([0x99, 0x01]);
  vm.frame();
  expect(vm.state.message.text).toContain('P C BIL 1%');
  expect(vm.state.message.text).toContain('99%');
  vm.state = {
    ...vm.state,
    message: { ...vm.state.message, busy: false },
    pc: 0x7_54_bf,
    poll: [0x10, 0x90]
  };
  vm.frame();
  expect(vm.state.poll).toEqual([0x01, 0x99]);
});
