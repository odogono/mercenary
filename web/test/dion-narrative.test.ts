import { expect, test } from 'bun:test';

import { DionNarrative } from '../src/dion/script.ts';
import { dionContent } from './dion-documents.ts';

for (const [script, ticks, accepted] of [
  [0x34, 1232, true],
  [0x33, 5577, false]
] as const) {
  test(`script ${script} gives the confirmed arrival gate at tick ${ticks}`, async () => {
    const vm = new DionNarrative(await dionContent());
    vm.start(script);
    vm.frame();
    const requests: number[] = [];
    let previous = vm.state.message.serial;
    for (let tick = 1; tick <= ticks; tick += 1) {
      vm.tick();
      if (tick % 11 === 0) {
        vm.frame();
      }
      if (vm.state.message.serial !== previous) {
        requests.push(tick);
        previous = vm.state.message.serial;
      }
    }
    expect(vm.idMessage(0x25)).toBe(accepted);
    if (script === 0x34) {
      expect(requests).toEqual([154, 396, 869, 1111]);
    }
  });
}

test('preserves tick-paced timed and queued scripts through a serialized continuation', async () => {
  const content = await dionContent();
  for (const timed of [true, false]) {
    const narrative = new DionNarrative(content);
    narrative.state = {
      ...narrative.state,
      queued: timed ? null : 0x33,
      timed: timed ? { remaining: 23, script: 0x33 } : null
    };
    const encoded = JSON.stringify(narrative.state);
    const restored = new DionNarrative(content, JSON.parse(encoded));
    for (let tick = 1; tick <= 100; tick += 1) {
      for (const vm of [narrative, restored]) {
        vm.tick();
        if (tick % 11 === 0) {
          vm.frame();
        }
      }
      expect(restored.state).toEqual(narrative.state);
      if (tick === 22 && timed) {
        expect(narrative.state.flags[6]).toBe(false);
      }
      if (tick === 33) {
        expect(narrative.state.flags[6]).toBe(true);
      }
    }
  }
});
