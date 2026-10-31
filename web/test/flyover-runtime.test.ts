import { describe, expect, test } from 'bun:test';

import { readFlyoverPresentation } from '../src/flyover/documents.ts';
import { resetFlyover } from '../src/flyover/runtime.ts';
import { TargFlyoverClock, composeTargSystem } from '../src/flyover/system.ts';
import { defaultSettings } from '../src/settings/index.ts';
import { TARG_SYSTEM } from './fixtures/targSystem.ts';

describe('the operational Flyover reset', () => {
  test('atomically restores the Targ epoch Bodies and stopped overview Camera', async () => {
    let now = 100;
    const presentation = readFlyoverPresentation(
      await Bun.file('flyover/targ.json').json(),
      'targ',
      ['targ', 'sun', 'inner-moon', 'outer-moon']
    );
    const system = composeTargSystem(
      TARG_SYSTEM,
      presentation,
      defaultSettings().presentation.sky,
      new TargFlyoverClock(24, () => now)
    );
    now = 200;
    expect(system.clock.elapsedSeconds()).toBe(100);

    const reset = resetFlyover(system, { height: 800, width: 1280 });

    expect(system.clock.elapsedSeconds()).toBe(0);
    expect(reset.bodies).toEqual(system.bodiesAt(0));
    expect(reset.camera.speedNotch).toBe(0);
    expect(reset.camera.pose.roll).toBe(0);
  });
});
