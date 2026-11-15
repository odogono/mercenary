import { describe, expect, test } from 'bun:test';

import { readFlyoverPresentation } from '../src/flyover/documents.ts';
import {
  AS_TUNED,
  flyoverStrokesOf,
  targFlyoverMenuRows,
  type FlyoverStrokeChoices
} from '../src/flyover/menu.ts';
import { TargFlyoverClock, composeTargSystem } from '../src/flyover/system.ts';
import { defaultSettings } from '../src/settings/index.ts';
import { skyStateAt } from '../src/sky/index.ts';
import { TARG_SYSTEM } from './fixtures/targSystem.ts';

const rowsFor = () => {
  const clock = new TargFlyoverClock(24, () => 0);
  let choices: FlyoverStrokeChoices = {};
  const rows = targFlyoverMenuRows(clock, {
    current: () => choices,
    set: next => {
      choices = next;
    }
  });
  const row = (name: string) =>
    rows.find(candidate => candidate.name === name)!;
  return {
    choices: () => choices,
    clock,
    row,
    rows
  };
};

describe('the Flyover System Menu', () => {
  test('offers Targ’s day length and the surface frame’s strokes, all as tuned at first', () => {
    const { rows } = rowsFor();
    expect(rows.map(row => row.name)).toEqual([
      'day-length',
      'weight',
      'glow',
      'road-weight',
      'road-glow'
    ]);
    for (const row of rows) {
      expect(row.current()).toBe(AS_TUNED);
    }
    expect(rows[0]!.options.map(option => option.label)).toEqual([
      'AS TUNED (24 MIN)',
      '2 MIN',
      '6 MIN',
      '96 MIN'
    ]);
  });

  test('keeps stroke choices until they return to as tuned', () => {
    const { choices, row } = rowsFor();
    row('weight').apply('heavy');
    row('road-glow').apply('bright');
    expect(choices()).toEqual({ roadGlow: 'bright', wireframeWeight: 'heavy' });
    expect(row('weight').current()).toBe('heavy');
    expect(flyoverStrokesOf(choices())).toEqual({
      lines: { glow: 0, weight: 3 },
      roads: { glow: 0.7, weight: 1 }
    });
    row('weight').apply(AS_TUNED);
    expect(choices()).toEqual({ roadGlow: 'bright' });
    expect(flyoverStrokesOf({})).toEqual({
      lines: { glow: 0, weight: 1 },
      roads: { glow: 0, weight: 1 }
    });
  });

  test('sets the day length on the clock and back to the tuned one', () => {
    const { clock, row } = rowsFor();
    row('day-length').apply('2');
    expect(clock.dayLengthMinutes()).toBe(2);
    expect(row('day-length').current()).toBe('2');
    row('day-length').apply(AS_TUNED);
    expect(clock.dayLengthMinutes()).toBe(24);
    expect(row('day-length').current()).toBe(AS_TUNED);
  });

  test('turns the Targ sky at the chosen day length', async () => {
    const sky = defaultSettings().presentation.sky;
    const clock = new TargFlyoverClock(sky.dayLengthMinutes, () => 0);
    const system = composeTargSystem(
      TARG_SYSTEM,
      readFlyoverPresentation(
        await Bun.file('flyover/targ.json').json(),
        'targ',
        ['targ', 'sun', 'inner-moon', 'outer-moon']
      ),
      sky,
      clock
    );
    const tuned = system.orrery();
    expect(system.orrery()).toBe(tuned);
    clock.setDayLength(2);
    const fast = system.orrery();
    expect(fast.settings.dayLengthMinutes).toBe(2);
    // A quarter of a two-minute day is a quarter of a tuned day.
    const sun = system.bodiesAt(30).find(body => body.id === 'sun')!.position;
    const length = Math.hypot(sun.x, sun.y, sun.z);
    const expected = skyStateAt(tuned, (sky.dayLengthMinutes * 60) / 4).sun
      .direction;
    expect(sun.x / length).toBeCloseTo(expected.x, 9);
    expect(sun.y / length).toBeCloseTo(expected.y, 9);
    expect(sun.z / length).toBeCloseTo(expected.z, 9);
  });
});
