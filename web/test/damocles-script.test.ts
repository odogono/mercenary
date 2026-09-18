import { describe, expect, test } from 'bun:test';

import {
  fireTrigger,
  initialScriptState,
  runFrame,
  type ScriptRules
} from '../src/damocles/script.ts';

const rules: ScriptRules = {
  messageFrames: 200,
  messageText: id =>
    id === 'system-string-50' ? ' '.repeat(48) : id.padEnd(48).slice(0, 48),
  waitFrames: 200
};

describe('Damocles Script slot 2', () => {
  test('runs from the one-shot trigger through the recovered 1000-frame response', () => {
    const fired = fireTrigger(initialScriptState(), 2, rules);
    expect(fired.state).toMatchObject({
      busy: true,
      execution: {
        returnStack: ['idle'],
        script: 'damocles.script.slot-2',
        step: 'announce-2'
      },
      message: { id: 'script2-inline-1', remainingFrames: 200 }
    });
    expect(
      fired.state.triggers.find(trigger => trigger.index === 2)?.armed
    ).toBe(false);

    let state = fired.state;
    for (let frame = 1; frame <= 1000; frame += 1) {
      state = runFrame(state, rules).state;
      if (frame === 200) {
        expect(state.message?.id).toBe('script2-inline-2');
      }
      if (frame === 400) {
        expect(state.message?.id).toBe('script2-inline-3');
      }
      if (frame === 600) {
        expect(state).toMatchObject({
          counter: 0,
          execution: { step: 'poll-wait' },
          message: null
        });
      }
      if (frame === 800) {
        expect(state.message?.id).toBe('system-string-50');
      }
    }
    expect(state).toMatchObject({
      busy: false,
      execution: null,
      message: null
    });
    expect(state.display).toEqual({ cells: ' '.repeat(48), kind: 'held' });
  });

  test('does not re-arm or restart trigger 2', () => {
    const fired = fireTrigger(initialScriptState(), 2, rules).state;
    expect(fireTrigger(fired, 2, rules).state).toEqual(fired);
  });
});
